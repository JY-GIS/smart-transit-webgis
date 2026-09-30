import { ref } from 'vue'
import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import { REALTIME_VEHICLE_STATUS_STYLES } from '@/config/realtimeVehicleStatus.config'
import type { RouteTrajectoryReplay, VehicleTrajectoryPoint } from '@/types/vehicleTrajectory'
import type { RealtimeVehicleMotionStatus } from '@/types/realtimeVehicle'

interface SavedClockState {
    startTime: Cesium.JulianDate
    stopTime: Cesium.JulianDate
    currentTime: Cesium.JulianDate
    clockRange: Cesium.ClockRange
    clockStep: Cesium.ClockStep
    multiplier: number
    shouldAnimate: boolean
    trackedEntity: Cesium.Entity | undefined
}

const HISTORY_VEHICLE_CESIUM_COLORS: Record<RealtimeVehicleMotionStatus, Cesium.Color> = {
    CRUISING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.CRUISING.color),
    APPROACHING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.APPROACHING.color),
    DWELLING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.DWELLING.color),
}

const DISCONTINUITY_JUMP_DURATION_SECONDS = 0.001

function hasWrappedToRouteStart(previousPoint: VehicleTrajectoryPoint, currentPoint: VehicleTrajectoryPoint): boolean {
    return (
        previousPoint.totalDistanceMeters > 0 &&
        previousPoint.distanceMeters - currentPoint.distanceMeters > previousPoint.totalDistanceMeters / 2
    )
}

function hasTimeGap(previousPoint: VehicleTrajectoryPoint, currentPoint: VehicleTrajectoryPoint): boolean {
    const gapSeconds = (Date.parse(currentPoint.recordedAt) - Date.parse(previousPoint.recordedAt)) / 1000

    return gapSeconds > TRANSIT_CONFIG.vehicleHistory.maximumContinuousGapSeconds
}

function toCartesianPosition(point: VehicleTrajectoryPoint): Cesium.Cartesian3 {
    return Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude)
}

function createPositionProperty(points: VehicleTrajectoryPoint[]): Cesium.SampledPositionProperty {
    const positionProperty = new Cesium.SampledPositionProperty()
    const firstPoint = points[0]
    let previousPoint = firstPoint
    let previousTime = Cesium.JulianDate.fromIso8601(firstPoint.recordedAt)
    let previousPosition = toCartesianPosition(firstPoint)

    positionProperty.addSample(previousTime, previousPosition)

    for (let index = 1; index < points.length; index += 1) {
        const currentPoint = points[index]
        const currentTime = Cesium.JulianDate.fromIso8601(currentPoint.recordedAt)
        const currentPosition = toCartesianPosition(currentPoint)
        const hasDiscontinuity = hasTimeGap(previousPoint, currentPoint) || hasWrappedToRouteStart(previousPoint, currentPoint)

        if (hasDiscontinuity) {
            const intervalSeconds = Cesium.JulianDate.secondsDifference(currentTime, previousTime)

            if (intervalSeconds > DISCONTINUITY_JUMP_DURATION_SECONDS) {
                const holdUntilTime = Cesium.JulianDate.addSeconds(
                    currentTime,
                    -DISCONTINUITY_JUMP_DURATION_SECONDS,
                    new Cesium.JulianDate(),
                )

                positionProperty.addSample(holdUntilTime, previousPosition)
            }
        }

        positionProperty.addSample(currentTime, currentPosition)
        previousPoint = currentPoint
        previousTime = currentTime
        previousPosition = currentPosition
    }

    positionProperty.setInterpolationOptions({
        interpolationAlgorithm: Cesium.LinearApproximation,
        interpolationDegree: 1,
    })

    return positionProperty
}

function createMotionStatusColorProperty(points: VehicleTrajectoryPoint[]): Cesium.TimeIntervalCollectionProperty {
    const colorProperty = new Cesium.TimeIntervalCollectionProperty()

    for (let index = 0; index < points.length; index += 1) {
        const point = points[index]
        const start = Cesium.JulianDate.fromIso8601(point.recordedAt)
        const isLastPoint = index === points.length - 1
        const stop = isLastPoint
            ? Cesium.JulianDate.addSeconds(start, 1, new Cesium.JulianDate())
            : Cesium.JulianDate.fromIso8601(points[index + 1].recordedAt)

        colorProperty.intervals.addInterval(new Cesium.TimeInterval({
            start,
            stop,
            isStartIncluded: true,
            isStopIncluded: isLastPoint,
            data: HISTORY_VEHICLE_CESIUM_COLORS[point.motionStatus],
        }))
    }

    return colorProperty
}

function formatVehicleLabel(vehicleId: string): string {
    return vehicleId.replace(/^simulated-bus-/i, '').toUpperCase()
}

export function useRouteTrajectoryReplayLayer() {
    const routeReplayLoaded = ref(false)
    const isPlaying = ref(false)
    const playbackSpeed = ref(1)
    const trackedVehicleId = ref<string | null>(null)

    let activeViewer: Cesium.Viewer | undefined
    let routeReplayDataSource: Cesium.CustomDataSource | undefined
    let savedClockState: SavedClockState | undefined
    let removeClockTickListener: (() => void) | undefined
    const playbackEntities = new Map<string, Cesium.Entity>()

    function saveClockState(viewer: Cesium.Viewer) {
        if (savedClockState) {
            return
        }

        savedClockState = {
            startTime: Cesium.JulianDate.clone(viewer.clock.startTime),
            stopTime: Cesium.JulianDate.clone(viewer.clock.stopTime),
            currentTime: Cesium.JulianDate.clone(viewer.clock.currentTime),
            clockRange: viewer.clock.clockRange,
            clockStep: viewer.clock.clockStep,
            multiplier: viewer.clock.multiplier,
            shouldAnimate: viewer.clock.shouldAnimate,
            trackedEntity: viewer.trackedEntity,
        }
    }

    function restoreClockState(viewer: Cesium.Viewer) {
        if (!savedClockState || viewer.isDestroyed()) {
            return
        }

        viewer.clock.startTime = Cesium.JulianDate.clone(savedClockState.startTime)
        viewer.clock.stopTime = Cesium.JulianDate.clone(savedClockState.stopTime)
        viewer.clock.currentTime = Cesium.JulianDate.clone(savedClockState.currentTime)
        viewer.clock.clockRange = savedClockState.clockRange
        viewer.clock.clockStep = savedClockState.clockStep
        viewer.clock.multiplier = savedClockState.multiplier
        viewer.clock.shouldAnimate = savedClockState.shouldAnimate
        viewer.trackedEntity = savedClockState.trackedEntity
        viewer.timeline.zoomTo(savedClockState.startTime, savedClockState.stopTime)
        savedClockState = undefined
    }

    function ensureDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource | undefined {
        if (viewer.isDestroyed()) {
            return undefined
        }

        if (!routeReplayDataSource) {
            routeReplayDataSource = new Cesium.CustomDataSource('route-trajectory-replay-layer')
            viewer.dataSources.add(routeReplayDataSource)
        }

        return routeReplayDataSource
    }

    function addPlaybackVehicle(
        dataSource: Cesium.CustomDataSource,
        vehicleId: string,
        points: VehicleTrajectoryPoint[],
    ): Cesium.Entity {
        return dataSource.entities.add({
            id: `route-history-vehicle:${vehicleId}`,
            name: `线路历史车辆 ${vehicleId}`,
            position: createPositionProperty(points),
            properties: {
                entityType: 'route-history-vehicle',
                vehicleId,
            },
            point: {
                pixelSize: 18,
                scaleByDistance: new Cesium.NearFarScalar(1000, 1, 8000, 0.6),
                color: createMotionStatusColorProperty(points),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
                text: formatVehicleLabel(vehicleId),
                font: '13px sans-serif',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                pixelOffset: new Cesium.Cartesian2(0, -25),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        })
    }

    function configurePlaybackClock(viewer: Cesium.Viewer, replay: RouteTrajectoryReplay) {
        const startTime = Cesium.JulianDate.fromIso8601(replay.startTime)
        const stopTime = Cesium.JulianDate.fromIso8601(replay.endTime)

        viewer.clock.startTime = Cesium.JulianDate.clone(startTime)
        viewer.clock.stopTime = Cesium.JulianDate.clone(stopTime)
        viewer.clock.currentTime = Cesium.JulianDate.clone(startTime)
        viewer.clock.clockRange = Cesium.ClockRange.CLAMPED
        viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER
        viewer.clock.multiplier = playbackSpeed.value
        viewer.clock.shouldAnimate = false
        viewer.timeline.zoomTo(startTime, stopTime)
    }

    function bindClockTick(viewer: Cesium.Viewer) {
        removeClockTickListener?.()
        removeClockTickListener = viewer.clock.onTick.addEventListener((clock: Cesium.Clock) => {
            isPlaying.value = clock.shouldAnimate

            if (Cesium.JulianDate.compare(clock.currentTime, clock.stopTime) >= 0) {
                clock.shouldAnimate = false
                isPlaying.value = false
            }
        })
    }

    function clearRouteReplayLayer() {
        const viewer = activeViewer

        if (viewer && !viewer.isDestroyed()) {
            viewer.clock.shouldAnimate = false
            viewer.trackedEntity = undefined
            viewer.scene.requestRender()
        }

        routeReplayDataSource?.entities.removeAll()
        playbackEntities.clear()
        routeReplayLoaded.value = false
        isPlaying.value = false
        trackedVehicleId.value = null
    }

    async function loadRouteReplayLayer(viewer: Cesium.Viewer, replay: RouteTrajectoryReplay): Promise<void> {
        if (viewer.isDestroyed() || replay.trajectories.length === 0) {
            return
        }

        activeViewer = viewer
        saveClockState(viewer)
        clearRouteReplayLayer()

        const dataSource = ensureDataSource(viewer)

        if (!dataSource) {
            return
        }

        for (const trajectory of replay.trajectories) {
            const entity = addPlaybackVehicle(dataSource, trajectory.vehicleId, trajectory.points)
            playbackEntities.set(trajectory.vehicleId, entity)
        }

        configurePlaybackClock(viewer, replay)
        bindClockTick(viewer)
        routeReplayLoaded.value = true
        await viewer.flyTo(dataSource)
    }

    function play() {
        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed() || playbackEntities.size === 0) {
            return
        }

        if (Cesium.JulianDate.compare(viewer.clock.currentTime, viewer.clock.stopTime) >= 0) {
            viewer.clock.currentTime = Cesium.JulianDate.clone(viewer.clock.startTime)
        }

        viewer.clock.shouldAnimate = true
        isPlaying.value = true
    }

    function pause() {
        if (!activeViewer || activeViewer.isDestroyed()) {
            return
        }

        activeViewer.clock.shouldAnimate = false
        isPlaying.value = false
    }

    function reset() {
        if (!activeViewer || activeViewer.isDestroyed()) {
            return
        }

        activeViewer.clock.shouldAnimate = false
        activeViewer.clock.currentTime = Cesium.JulianDate.clone(activeViewer.clock.startTime)
        isPlaying.value = false
        activeViewer.scene.requestRender()
    }

    function setPlaybackSpeed(speed: number) {
        if (!Number.isFinite(speed) || speed <= 0) {
            throw new Error('历史回放倍速必须大于0')
        }

        playbackSpeed.value = speed

        if (activeViewer && !activeViewer.isDestroyed()) {
            activeViewer.clock.multiplier = speed
        }
    }

    function setTrackedVehicle(vehicleId: string | null) {
        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed()) {
            return
        }

        if (!vehicleId) {
            viewer.trackedEntity = undefined
            trackedVehicleId.value = null

            if (routeReplayDataSource) {
                void viewer.flyTo(routeReplayDataSource)
            }
            return
        }

        const entity = playbackEntities.get(vehicleId)

        if (!entity) {
            return
        }

        viewer.trackedEntity = entity
        trackedVehicleId.value = vehicleId
    }

    function cleanup(viewer?: Cesium.Viewer) {
        const currentViewer = viewer ?? activeViewer

        removeClockTickListener?.()
        removeClockTickListener = undefined

        if (currentViewer && !currentViewer.isDestroyed()) {
            currentViewer.clock.shouldAnimate = false
            currentViewer.trackedEntity = undefined

            if (routeReplayDataSource) {
                currentViewer.dataSources.remove(routeReplayDataSource, true)
            }

            restoreClockState(currentViewer)
            currentViewer.scene.requestRender()
        }

        routeReplayDataSource = undefined
        playbackEntities.clear()
        activeViewer = undefined
        routeReplayLoaded.value = false
        isPlaying.value = false
        playbackSpeed.value = 1
        trackedVehicleId.value = null
        savedClockState = undefined
    }

    return {
        routeReplayLoaded,
        isPlaying,
        playbackSpeed,
        trackedVehicleId,
        loadRouteReplayLayer,
        clearRouteReplayLayer,
        play,
        pause,
        reset,
        setPlaybackSpeed,
        setTrackedVehicle,
        cleanup,
    }
}
