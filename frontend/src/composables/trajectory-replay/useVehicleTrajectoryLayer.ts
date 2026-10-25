import { ref } from 'vue'
import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import { REALTIME_VEHICLE_STATUS_STYLES } from '@/config/realtimeVehicleStatus.config'
import { createTransitPolylineHighlightMaterial, TRANSIT_POLYLINE_HIGHLIGHT_WIDTH } from '@/utils/transitPolylineHighlight'
import type {
    VehicleTrajectory,
    VehicleTrajectoryPoint,
} from '@/types/vehicleTrajectory'
import type { RealtimeVehicleMotionStatus } from '@/types/realtimeVehicle'

/**
 * 进入历史回放前的Cesium时钟状态,退出历史模式时需要完整恢复
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

/**
 * 一段时间和里程都连续的轨迹。
 *
 * 如果中间缺少数据，或者车辆完成一圈回到起点，就会拆成新的数组。
 */
type TrajectorySegment = VehicleTrajectoryPoint[]

const HISTORY_VEHICLE_CESIUM_COLORS: Record<RealtimeVehicleMotionStatus, Cesium.Color> = {
    CRUISING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.CRUISING.color,),
    APPROACHING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.APPROACHING.color,),
    DWELLING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.DWELLING.color,),
}


/*
 * 线路回绕或数据中断时，在下一条记录前保留1毫秒用于完成瞬间跳转
 */
const DISCONTINUITY_JUMP_DURATION_SECONDS = 0.001

/**
 * 管理Cesium历史轨迹图层和回放时钟。
 */
export function useVehicleTrajectoryLayer() {
    const trajectoryLoaded = ref(false)

    const isPlaying = ref(false)

    const playbackSpeed = ref(1)

    const cameraTrackingEnabled = ref(false)

    let activeViewer: Cesium.Viewer | undefined

    let trajectoryDataSource:
        | Cesium.CustomDataSource
        | undefined

    let playbackEntity:
        | Cesium.Entity
        | undefined

    let savedClockState:
        | SavedClockState
        | undefined

    let removeClockTickListener:
        | (() => void)
        | undefined

    /**
     * 保存进入历史模式前的时钟。
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
     * 恢复进入历史模式前的时钟。
     */
    function restoreClockState(viewer: Cesium.Viewer) {
        const state = savedClockState

        if (!state || viewer.isDestroyed()) {
            return
        }

        viewer.clock.startTime = Cesium.JulianDate.clone(state.startTime)
        viewer.clock.stopTime = Cesium.JulianDate.clone(state.stopTime)
        viewer.clock.currentTime = Cesium.JulianDate.clone(state.currentTime)

        viewer.clock.clockRange = state.clockRange
        viewer.clock.clockStep = state.clockStep
        viewer.clock.multiplier = state.multiplier
        viewer.clock.shouldAnimate = state.shouldAnimate

        viewer.trackedEntity = state.trackedEntity

        // Timeline.zoomTo：让底部时间轴重新显示原来的时间范围
        viewer.timeline.zoomTo(
            state.startTime,
            state.stopTime,
        )

        savedClockState = undefined
    }

    /**
     * 创建或复用历史轨迹DataSource。
     */
    function ensureDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource | undefined {
        if (viewer.isDestroyed()) {
            return undefined
        }

        if (trajectoryDataSource) {
            return trajectoryDataSource
        }

        trajectoryDataSource = new Cesium.CustomDataSource('vehicle-trajectory-layer')

        viewer.dataSources.add(trajectoryDataSource)

        return trajectoryDataSource
    }

    /**
     * 判断两个相邻点之间是否发生线路回绕。表示车辆完成一圈后回到线路起点。
     */
    function hasWrappedToRouteStart(
        previousPoint: VehicleTrajectoryPoint,
        currentPoint: VehicleTrajectoryPoint,
    ): boolean {
        return (
            previousPoint.totalDistanceMeters > 0 &&
            previousPoint.distanceMeters - currentPoint.distanceMeters
            > previousPoint.totalDistanceMeters / 2
        )
    }

    /**
     * 判断两个点之间是否缺少了较长时间的数据。
     */
    function hasTimeGap(
        previousPoint: VehicleTrajectoryPoint,
        currentPoint: VehicleTrajectoryPoint,
    ): boolean {
        const previousTime = Date.parse(previousPoint.recordedAt)
        const currentTime = Date.parse(currentPoint.recordedAt)
        const gapSeconds = (currentTime - previousTime) / 1000

        return (
            gapSeconds > TRANSIT_CONFIG.vehicleHistory.maximumContinuousGapSeconds
        )
    }

    /**
     * 将完整轨迹拆成多段连续轨迹。
     * 不能把所有点直接连接成一条线。
     *
     * 以下情况必须断开：
     * 1. 相邻记录时间间隔过长；
     * 2. 车辆完成一圈，里程从接近总长回到0；
     */
    function splitIntoSegments(points: VehicleTrajectoryPoint[]): TrajectorySegment[] {
        if (points.length === 0) {
            return []
        }

        const segments: TrajectorySegment[] = [
            [points[0]],
        ]

        for (let index = 1; index < points.length; index += 1) {
            const previousPoint = points[index - 1]
            const currentPoint = points[index]

            const shouldStartNewSegment =
                hasTimeGap(previousPoint, currentPoint) ||
                hasWrappedToRouteStart(previousPoint, currentPoint)

            if (shouldStartNewSegment) {
                segments.push([currentPoint])
                continue
            }

            segments[segments.length - 1].push(currentPoint)
        }

        return segments
    }

    function toCartesianPosition(point: VehicleTrajectoryPoint): Cesium.Cartesian3 {
        return Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude)
    }

    /**
     * 为全部历史点建立随时间变化的位置属性。
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
                    const holdUntilTime =
                        Cesium.JulianDate.addSeconds(
                            currentTime,
                            -DISCONTINUITY_JUMP_DURATION_SECONDS,
                            new Cesium.JulianDate(),
                        )

                    positionProperty.addSample(
                        holdUntilTime,
                        previousPosition,
                    )
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
     * 创建随回放时间变化的车辆状态颜色。
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

            // TimeIntervalCollectionProperty：根据当前Cesium时钟，从不同时间段中读取不同值
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
     * 绘制完整的静态历史轨迹线。
     */
    function addStaticTrajectorySegments(
        dataSource: Cesium.CustomDataSource,
        segments: TrajectorySegment[],
    ) {
        let visibleSegmentIndex = 0

        for (const segment of segments) {
            if (segment.length < 2) {
                continue
            }

            const positions = segment.map(toCartesianPosition)

            dataSource.entities.add({
                id: `vehicle-trajectory-segment-` + visibleSegmentIndex,
                name: `历史轨迹第` + `${visibleSegmentIndex + 1}段`,

                polyline: {
                    positions,
                    width: TRANSIT_POLYLINE_HIGHLIGHT_WIDTH,
                    clampToGround: TRANSIT_CONFIG.routeStyle.clampToGround,
                    material: createTransitPolylineHighlightMaterial(1, 0.35),
                    depthFailMaterial: createTransitPolylineHighlightMaterial(0.65, 0.25),
                },
            })

            visibleSegmentIndex += 1
        }
    }

    /**
     * 创建按时间移动的历史车辆。
     */
    function addPlaybackVehicle(
        dataSource: Cesium.CustomDataSource,
        trajectory: VehicleTrajectory,
        positionProperty: Cesium.SampledPositionProperty,
    ): Cesium.Entity {
        const colorProperty = createMotionStatusColorProperty(trajectory.points)

        return dataSource.entities.add({
            id: `history-vehicle:` + trajectory.vehicleId,
            name: `历史车辆 ${trajectory.vehicleId}`,
            position: positionProperty,
            properties: {
                entityType: 'history-vehicle',
                vehicleId: trajectory.vehicleId,
            },

            point: {
                pixelSize: 18,
                scaleByDistance: new Cesium.NearFarScalar(1000, 1, 8000, 0.6),

                color: colorProperty,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,

                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        })
    }

    /**
     * 配置Cesium历史回放时间范围。
     */
    function configurePlaybackClock(
        viewer: Cesium.Viewer,
        trajectory: VehicleTrajectory,
    ) {
        const startTime = Cesium.JulianDate.fromIso8601(trajectory.startTime)
        const stopTime = Cesium.JulianDate.fromIso8601(trajectory.endTime)

        viewer.clock.startTime = Cesium.JulianDate.clone(startTime)
        viewer.clock.stopTime = Cesium.JulianDate.clone(stopTime)
        viewer.clock.currentTime = Cesium.JulianDate.clone(startTime)

        // ClockRange.CLAMPED：到达结束时间后停在终点，不自动跳回起点循环
        viewer.clock.clockRange = Cesium.ClockRange.CLAMPED

        // SYSTEM_CLOCK_MULTIPLIER：按真实经过时间推进历史时钟，再乘以multiplier播放倍速
        viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER

        viewer.clock.multiplier = playbackSpeed.value

        viewer.clock.shouldAnimate = false

        viewer.timeline.zoomTo(startTime, stopTime,)
    }

    /**
     * 监听时钟到达终点。
     */
    function bindClockTick(viewer: Cesium.Viewer) {
        removeClockTickListener?.()

        removeClockTickListener =
            viewer.clock.onTick.addEventListener(
                (clock: Cesium.Clock) => {
                    isPlaying.value = clock.shouldAnimate

                    if (
                        Cesium.JulianDate.compare(
                            clock.currentTime, clock.stopTime
                        ) >= 0
                    ) {
                        clock.shouldAnimate = false
                        isPlaying.value = false
                    }
                },
            )
    }

    // 清除当前轨迹内容，但不退出历史模式。用于切换车辆或重新查询
    function clearTrajectoryLayer() {
        const viewer = activeViewer

        if (viewer && !viewer.isDestroyed()) {
            viewer.clock.shouldAnimate = false

            if (viewer.trackedEntity === playbackEntity) {
                viewer.trackedEntity = undefined
            }

            viewer.scene.requestRender()
        }

        trajectoryDataSource?.entities.removeAll()

        playbackEntity = undefined

        trajectoryLoaded.value = false
        isPlaying.value = false
        cameraTrackingEnabled.value = false
    }

    // 将一条后端轨迹加载到Cesium
    async function loadTrajectoryLayer(
        viewer: Cesium.Viewer,
        trajectory: VehicleTrajectory,
    ): Promise<void> {
        if (viewer.isDestroyed() || trajectory.points.length < 2) {
            return
        }

        activeViewer = viewer

        saveClockState(viewer)

        clearTrajectoryLayer()

        const dataSource = ensureDataSource(viewer)

        if (!dataSource) {
            return
        }

        const segments = splitIntoSegments(trajectory.points)

        addStaticTrajectorySegments(dataSource, segments)

        const positionProperty = createPositionProperty(trajectory.points)

        playbackEntity =
            addPlaybackVehicle(
                dataSource,
                trajectory,
                positionProperty,
            )

        configurePlaybackClock(viewer, trajectory)

        bindClockTick(viewer)

        trajectoryLoaded.value = true
        isPlaying.value = false
        cameraTrackingEnabled.value = false

        // 加载完成后将镜头移动到完整轨迹范围
        await viewer.flyTo(dataSource)
    }

    /**
     * 从当前位置开始播放。
     */
    function play() {
        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed() || !playbackEntity) {
            return
        }

        /*
         * 已经在终点时再次播放，
         * 自动从起点重新开始。
         */
        if (
            Cesium.JulianDate.compare(
                viewer.clock.currentTime, viewer.clock.stopTime
            ) >= 0
        ) {
            viewer.clock.currentTime = Cesium.JulianDate.clone(viewer.clock.startTime)
        }

        viewer.clock.shouldAnimate = true
        isPlaying.value = true
    }

    function pause() {
        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed()) {
            return
        }

        viewer.clock.shouldAnimate = false
        isPlaying.value = false
    }

    /**
     * 回到轨迹开始时间并暂停。
     */
    function reset() {
        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed()) {
            return
        }

        viewer.clock.shouldAnimate = false

        viewer.clock.currentTime = Cesium.JulianDate.clone(viewer.clock.startTime)

        isPlaying.value = false

        viewer.scene.requestRender()
    }

    /**
     * 调整历史回放倍速。
     */
    function setPlaybackSpeed(speed: number) {
        if (!Number.isFinite(speed) || speed <= 0) {
            throw new Error('历史回放倍速必须大于0')
        }

        playbackSpeed.value = speed

        const viewer = activeViewer

        if (viewer && !viewer.isDestroyed()) {
            viewer.clock.multiplier = speed
        }
    }

    /**
     * 开启或关闭相机跟随。
     */
    function setCameraTracking(enabled: boolean) {
        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed() || !playbackEntity) {
            return
        }

        if (enabled) {
            viewer.trackedEntity = playbackEntity
        } else if (viewer.trackedEntity === playbackEntity) {
            viewer.trackedEntity = undefined
        }

        cameraTrackingEnabled.value = enabled
    }

    /**
     * 退出历史模式并恢复原来的Cesium时钟。
     */
    function cleanup(viewer?: Cesium.Viewer) {
        const currentViewer = viewer ?? activeViewer

        removeClockTickListener?.()
        removeClockTickListener = undefined

        if (currentViewer && !currentViewer.isDestroyed()) {
            currentViewer.clock.shouldAnimate = false

            if (currentViewer.trackedEntity === playbackEntity) {
                currentViewer.trackedEntity = undefined
            }

            if (trajectoryDataSource) {
                currentViewer.dataSources.remove(trajectoryDataSource, true)
            }

            restoreClockState(currentViewer)

            currentViewer.scene.requestRender()
        }

        trajectoryDataSource = undefined
        playbackEntity = undefined
        activeViewer = undefined

        trajectoryLoaded.value = false
        isPlaying.value = false
        playbackSpeed.value = 1
        cameraTrackingEnabled.value = false

        /*
         * Viewer已销毁时无法恢复Clock，
         * 但仍然必须丢弃旧快照。
         */
        savedClockState = undefined
    }

    return {
        trajectoryLoaded,
        isPlaying,
        playbackSpeed,
        cameraTrackingEnabled,

        loadTrajectoryLayer,
        clearTrajectoryLayer,

        play,
        pause,
        reset,
        setPlaybackSpeed,
        setCameraTracking,

        cleanup,
    }
}