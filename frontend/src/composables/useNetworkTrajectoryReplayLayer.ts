import { ref } from 'vue'
import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import { REALTIME_VEHICLE_STATUS_STYLES } from '@/config/realtimeVehicleStatus.config'
import type {
    NetworkTrajectoryReplay,
    NetworkVehicleTrajectory,
    VehicleTrajectoryPoint,
} from '@/types/vehicleTrajectory'
import type { RealtimeVehicleMotionStatus } from '@/types/realtimeVehicle'

/**
 * 保存进入历史回放前的Cesium时钟和镜头跟随状态。
 */
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

/**
 * 判断车辆是否从线路终点重新回到起点。
 */
function hasWrappedToRouteStart(previousPoint: VehicleTrajectoryPoint, currentPoint: VehicleTrajectoryPoint): boolean {
    return (
        previousPoint.totalDistanceMeters > 0 &&
        previousPoint.distanceMeters - currentPoint.distanceMeters > previousPoint.totalDistanceMeters / 2
    )
}

/**
 * 判断两个轨迹点之间是否缺失了较长时间的数据。
 */
function hasTimeGap(previousPoint: VehicleTrajectoryPoint, currentPoint: VehicleTrajectoryPoint): boolean {
    const gapSeconds = (Date.parse(currentPoint.recordedAt) - Date.parse(previousPoint.recordedAt)) / 1000

    return gapSeconds > TRANSIT_CONFIG.vehicleHistory.maximumContinuousGapSeconds
}

function toCartesianPosition(point: VehicleTrajectoryPoint): Cesium.Cartesian3 {
    return Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude)
}

/**
 * 根据一辆车的历史点创建随时间变化的位置属性。
 */
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

        const hasDiscontinuity =
            hasTimeGap(previousPoint, currentPoint) ||
            hasWrappedToRouteStart(previousPoint, currentPoint)

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

/**
 * 根据车辆每个时刻的运行状态创建动态颜色。
 */
function createMotionStatusColorProperty(points: VehicleTrajectoryPoint[]): Cesium.TimeIntervalCollectionProperty {
    const colorProperty = new Cesium.TimeIntervalCollectionProperty()

    for (let index = 0; index < points.length; index += 1) {
        const point = points[index]
        const start = Cesium.JulianDate.fromIso8601(point.recordedAt)
        const isLastPoint = index === points.length - 1

        const stop = isLastPoint
            ? Cesium.JulianDate.addSeconds(start, 1, new Cesium.JulianDate())
            : Cesium.JulianDate.fromIso8601(points[index + 1].recordedAt)

        colorProperty.intervals.addInterval(
            new Cesium.TimeInterval({
                start,
                stop,
                isStartIncluded: true,
                isStopIncluded: isLastPoint,
                data: HISTORY_VEHICLE_CESIUM_COLORS[point.motionStatus],
            }),
        )
    }

    return colorProperty
}

/**
 * 限制一辆车只在自己的实际轨迹时间范围内显示。
 */
function createAvailability(replayVehicle: NetworkVehicleTrajectory): Cesium.TimeIntervalCollection {
    const trajectory = replayVehicle.trajectory

    return new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({
            start: Cesium.JulianDate.fromIso8601(trajectory.startTime),
            stop: Cesium.JulianDate.fromIso8601(trajectory.endTime),
            isStartIncluded: true,
            isStopIncluded: true,
        }),
    ])
}

/**
 * 生成地图上显示的线路和车辆标签。
 */
function formatVehicleLabel(replayVehicle: NetworkVehicleTrajectory): string {
    const vehicleId = replayVehicle.trajectory.vehicleId
        .replace(/^simulated-bus-/i, '')
        .toUpperCase()

    return `${replayVehicle.routeName} · ${vehicleId}`
}

/**
 * 根据全部轨迹点计算全网回放的镜头范围。
 */
function createReplayBoundingSphere(replay: NetworkTrajectoryReplay): Cesium.BoundingSphere {
    const positions: Cesium.Cartesian3[] = []

    for (const replayVehicle of replay.trajectories) {
        for (const point of replayVehicle.trajectory.points) {
            positions.push(toCartesianPosition(point))
        }
    }

    return Cesium.BoundingSphere.fromPoints(positions)
}

/**
 * 管理全网历史车辆图层和回放时钟。
 */
export function useNetworkTrajectoryReplayLayer() {
    const networkReplayLoaded = ref(false)
    const isPlaying = ref(false)
    const playbackSpeed = ref(1)
    const trackedVehicleId = ref<string | null>(null)

    let activeViewer: Cesium.Viewer | undefined
    let networkReplayDataSource: Cesium.CustomDataSource | undefined
    let savedClockState: SavedClockState | undefined
    let replayBoundingSphere: Cesium.BoundingSphere | undefined
    let removeClockTickListener: (() => void) | undefined

    const playbackEntities = new Map<string, Cesium.Entity>()

    /**
     * 保存进入历史回放前的时钟状态，只保存一次。
     */
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

    /**
     * 退出全网回放时恢复原来的时钟和镜头跟随状态。
     */
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

    /**
     * 创建或复用全网历史回放的数据源。
     */
    function ensureDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource | undefined {
        if (viewer.isDestroyed()) {
            return undefined
        }

        if (!networkReplayDataSource) {
            networkReplayDataSource = new Cesium.CustomDataSource('network-trajectory-replay-layer')
            viewer.dataSources.add(networkReplayDataSource)
        }

        return networkReplayDataSource
    }

    /**
     * 将一辆全网历史车辆添加到Cesium数据源。
     */
    function addPlaybackVehicle(
        dataSource: Cesium.CustomDataSource,
        replayVehicle: NetworkVehicleTrajectory,
    ): Cesium.Entity {
        const trajectory = replayVehicle.trajectory

        return dataSource.entities.add({
            id: `network-history-vehicle:${trajectory.vehicleId}`,
            name: `全网历史车辆 ${trajectory.vehicleId}`,

            availability: createAvailability(replayVehicle),
            position: createPositionProperty(trajectory.points),

            properties: {
                entityType: 'network-history-vehicle',
                vehicleId: trajectory.vehicleId,
                routeId: replayVehicle.routeId,
                routeFid: replayVehicle.routeFid,
                routeName: replayVehicle.routeName,
            },

            point: {
                pixelSize: 18,
                scaleByDistance: new Cesium.NearFarScalar(1000, 1, 8000, 0.6),
                color: createMotionStatusColorProperty(trajectory.points),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },

            label: {
                text: formatVehicleLabel(replayVehicle),
                font: '13px sans-serif',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString('#0b1728').withAlpha(0.85),
                backgroundPadding: new Cesium.Cartesian2(8, 5),
                pixelOffset: new Cesium.Cartesian2(0, -25),
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        })
    }

    /**
     * 使用全网查询时间配置Cesium统一回放时钟。
     */
    function configurePlaybackClock(viewer: Cesium.Viewer, replay: NetworkTrajectoryReplay) {
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

    /**
     * 监听回放时钟，在到达结束时间后自动暂停。
     */
    function bindClockTick(viewer: Cesium.Viewer) {
        removeClockTickListener?.()

        removeClockTickListener =
            viewer.clock.onTick.addEventListener(
                (clock: Cesium.Clock) => {
                    isPlaying.value = clock.shouldAnimate

                    if (Cesium.JulianDate.compare(clock.currentTime, clock.stopTime) >= 0) {
                        clock.shouldAnimate = false
                        isPlaying.value = false
                    }
                },
            )
    }

    /**
     * 将镜头移动到全部历史轨迹所在的范围。
     */
    function flyToNetworkReplay() {
        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed() || !replayBoundingSphere) {
            return
        }

        viewer.camera.flyToBoundingSphere(
            replayBoundingSphere,
            {
                duration: 1.2,
            },
        )
    }

    /**
     * 清除当前全网轨迹，但保留图层和历史模式。
     */
    function clearNetworkReplayLayer() {
        const viewer = activeViewer

        if (viewer && !viewer.isDestroyed()) {
            viewer.clock.shouldAnimate = false
            viewer.trackedEntity = undefined
            viewer.scene.requestRender()
        }

        networkReplayDataSource?.entities.removeAll()
        playbackEntities.clear()

        replayBoundingSphere = undefined
        networkReplayLoaded.value = false
        isPlaying.value = false
        trackedVehicleId.value = null
    }

    /**
     * 将后端返回的全部车辆加载到Cesium并配置统一时间轴。
     */
    function loadNetworkReplayLayer(viewer: Cesium.Viewer, replay: NetworkTrajectoryReplay) {
        if (viewer.isDestroyed() || replay.trajectories.length === 0) {
            return
        }

        activeViewer = viewer
        saveClockState(viewer)
        clearNetworkReplayLayer()

        const dataSource = ensureDataSource(viewer)

        if (!dataSource) {
            return
        }

        for (const replayVehicle of replay.trajectories) {
            const entity = addPlaybackVehicle(dataSource, replayVehicle)
            const vehicleId = replayVehicle.trajectory.vehicleId

            playbackEntities.set(vehicleId, entity)
        }

        replayBoundingSphere = createReplayBoundingSphere(replay)

        configurePlaybackClock(viewer, replay)
        bindClockTick(viewer)

        networkReplayLoaded.value = true

        flyToNetworkReplay()
    }

    /**
     * 从当前时间开始播放，到达终点后再次播放会回到起点。
     */
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

    /**
     * 暂停当前全网轨迹回放。
     */
    function pause() {
        if (!activeViewer || activeViewer.isDestroyed()) {
            return
        }

        activeViewer.clock.shouldAnimate = false
        isPlaying.value = false
    }

    /**
     * 将全网回放恢复到开始时间并暂停。
     */
    function reset() {
        if (!activeViewer || activeViewer.isDestroyed()) {
            return
        }

        activeViewer.clock.shouldAnimate = false
        activeViewer.clock.currentTime = Cesium.JulianDate.clone(activeViewer.clock.startTime)
        isPlaying.value = false
        activeViewer.scene.requestRender()
    }

    /**
     * 修改全网历史回放倍速。
     */
    function setPlaybackSpeed(speed: number) {
        if (!Number.isFinite(speed) || speed <= 0) {
            throw new Error('历史回放倍速必须大于0')
        }

        playbackSpeed.value = speed

        if (activeViewer && !activeViewer.isDestroyed()) {
            activeViewer.clock.multiplier = speed
        }
    }

    /**
     * 跟随指定车辆，传入null时恢复全网视角。
     */
    function setTrackedVehicle(vehicleId: string | null) {
        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed()) {
            return
        }

        if (!vehicleId) {
            viewer.trackedEntity = undefined
            trackedVehicleId.value = null
            flyToNetworkReplay()
            return
        }

        const entity = playbackEntities.get(vehicleId)

        if (!entity) {
            return
        }

        viewer.trackedEntity = entity
        trackedVehicleId.value = vehicleId
    }

    /**
     * 退出全网回放并释放图层、监听器和时钟状态。
     */
    function cleanup(viewer?: Cesium.Viewer) {
        const currentViewer = viewer ?? activeViewer

        removeClockTickListener?.()
        removeClockTickListener = undefined

        if (currentViewer && !currentViewer.isDestroyed()) {
            currentViewer.clock.shouldAnimate = false
            currentViewer.trackedEntity = undefined

            if (networkReplayDataSource) {
                currentViewer.dataSources.remove(networkReplayDataSource, true)
            }

            restoreClockState(currentViewer)
            currentViewer.scene.requestRender()
        }

        networkReplayDataSource = undefined
        replayBoundingSphere = undefined
        playbackEntities.clear()
        activeViewer = undefined

        networkReplayLoaded.value = false
        isPlaying.value = false
        playbackSpeed.value = 1
        trackedVehicleId.value = null
        savedClockState = undefined
    }

    return {
        networkReplayLoaded,
        isPlaying,
        playbackSpeed,
        trackedVehicleId,

        loadNetworkReplayLayer,
        clearNetworkReplayLayer,

        play,
        pause,
        reset,
        setPlaybackSpeed,
        setTrackedVehicle,

        cleanup,
    }
}
