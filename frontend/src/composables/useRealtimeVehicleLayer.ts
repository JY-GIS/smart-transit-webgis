import * as Cesium from 'cesium'
import { TRANSIT_CONFIG } from '@/config/transit.config'
import { REALTIME_VEHICLE_STATUS_STYLES } from '@/config/realtimeVehicleStatus.config'

import type {
    RealtimeVehicleEntityProperties,
    RealtimeVehicleMotionStatus,
    RealtimeVehiclePositionSnapshot,
} from '@/types/realtimeVehicle'

// 一辆实时车辆在 Cesium 中对应的可视对象
interface RealtimeVehicleVisual {
    entity: Cesium.Entity

    positionProperty: Cesium.ConstantPositionProperty

    // 当前车辆颜色
    colorProperty: Cesium.ConstantProperty

    // 当前实际显示在地图上的位置
    displayedPosition: Cesium.Cartesian3

    // 本轮插值的起点
    interpolationStartPosition: Cesium.Cartesian3

    // 本轮插值需要到达的服务端目标位置
    interpolationTargetPosition: Cesium.Cartesian3

    // 本轮插值开始时的单调时间，单位为毫秒
    interpolationStartedAtMilliseconds: number
}
// 将统一的 CSS 状态颜色转换成 Cesium.Color
const REALTIME_VEHICLE_CESIUM_COLORS: Record<RealtimeVehicleMotionStatus, Cesium.Color> = {
    CRUISING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.CRUISING.color,),
    APPROACHING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.APPROACHING.color,),
    DWELLING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.DWELLING.color,),
}
// 取得某个车辆状态对应的 Cesium 颜色
function getRealtimeVehicleColor(motionStatus: RealtimeVehicleMotionStatus,): Cesium.Color {
    return REALTIME_VEHICLE_CESIUM_COLORS[motionStatus]
}

/**
 * Cesium 实时车辆图层。
 *
 * 职责：
 * - 为首次出现的 vehicleId 创建 Entity；
 * - 更新已存在车辆的位置；
 * - 删除后端快照中已经不存在的车辆；
 * - 页面卸载时释放 DataSource。
 *
 * 数据流：
 * WebSocket 快照数组
 * -> updateVehicles
 * -> vehicleId 索引
 * -> Cesium Entity
 */
export function useRealtimeVehicleLayer() {
    let vehicleDataSource: Cesium.CustomDataSource | undefined

    const vehicleVisuals = new Map<string, RealtimeVehicleVisual>()

    // 当前正在等待执行的浏览器动画帧编号。undefined 表示当前没有动画循环。
    let animationFrameId: number | undefined

    // 当前实时车辆图层所属的 Viewer
    let activeViewer: Cesium.Viewer | undefined

    // 确保实时车辆 DataSource 已经加入 Viewe
    function ensureDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource | undefined {
        if (viewer.isDestroyed()) {
            return undefined
        }

        if (vehicleDataSource) {
            return vehicleDataSource
        }

        // 单独使用 CustomDataSource 管理实时车辆，避免清理车辆时误删线路、站点或行政区 Entity
        vehicleDataSource = new Cesium.CustomDataSource('realtime-vehicle-layer')

        viewer.dataSources.add(vehicleDataSource)

        return vehicleDataSource
    }

    // 检查后端坐标是否在合法经纬度范围内
    function hasValidCoordinate(snapshot: RealtimeVehiclePositionSnapshot): boolean {
        return (
            snapshot.longitude >= -180 &&
            snapshot.longitude <= 180 &&
            snapshot.latitude >= -90 &&
            snapshot.latitude <= 90
        )
    }

    /**
     * 计算并应用某辆车在当前动画时刻的位置。
     *（返回 true 表示这辆车尚未到达目标点，后续仍需要请求下一帧）
     */
    function applyInterpolatedPosition(
        visual: RealtimeVehicleVisual,
        currentTimeMilliseconds: number,
    ): boolean {
        const durationMilliseconds = TRANSIT_CONFIG.realtimeVehicles.interpolationDurationMilliseconds

        const elapsedMilliseconds =
            currentTimeMilliseconds - visual.interpolationStartedAtMilliseconds
        /*
         * 插值比例：progress = 已经过时间 / 总插值时间  
         * ( Cesium.Math.clamp 将结果限制在 0～1 )
         */
        const progress = Cesium.Math.clamp(
            elapsedMilliseconds / durationMilliseconds,
            0,
            1
        )

        // 两个坐标之间做线性插值
        Cesium.Cartesian3.lerp(
            visual.interpolationStartPosition,
            visual.interpolationTargetPosition,
            progress,
            visual.displayedPosition
        )

        visual.positionProperty.setValue(visual.displayedPosition)

        return progress < 1
    }

    // 执行一帧全部车辆的位置插值
    function animateVehicles(currentTimeMilliseconds: number) {
        // 当前回调已经开始执行，原 animationFrameId 不再代表待执行任务
        animationFrameId = undefined

        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed()) {
            return
        }

        let hasMovingVehicle = false

        for (const visual of vehicleVisuals.values()) {
            const isStillMoving = applyInterpolatedPosition(visual, currentTimeMilliseconds)

            if (isStillMoving) {
                hasMovingVehicle = true
            }
        }

        // 每帧位置变化后通知 Cesium 重绘
        viewer.scene.requestRender()

        if (hasMovingVehicle) {
            animationFrameId = window.requestAnimationFrame(animateVehicles)
        }
    }

    // 确保平滑动画循环已经启动
    function ensureAnimationRunning(viewer: Cesium.Viewer) {
        activeViewer = viewer

        if (animationFrameId !== undefined) {
            return
        }

        animationFrameId = window.requestAnimationFrame(animateVehicles)
    }

    // 为已经存在的车辆设置新的服务端目标位置
    function setInterpolationTarget(
        visual: RealtimeVehicleVisual,
        nextPosition: Cesium.Cartesian3,
        currentTimeMilliseconds: number
    ) {
        applyInterpolatedPosition(visual, currentTimeMilliseconds)

        Cesium.Cartesian3.clone(visual.displayedPosition, visual.interpolationStartPosition)

        Cesium.Cartesian3.clone(nextPosition, visual.interpolationTargetPosition)

        visual.interpolationStartedAtMilliseconds = currentTimeMilliseconds
    }

    // 首次收到某辆车时创建 Cesium Entity
    function createVehicleVisual(
        dataSource: Cesium.CustomDataSource,
        snapshot: RealtimeVehiclePositionSnapshot,
    ): RealtimeVehicleVisual {
        const position = Cesium.Cartesian3.fromDegrees(snapshot.longitude, snapshot.latitude)

        // 保存当前固定位置，并允许后续调用 setValue 更新；而不是每秒删除并重新创建
        const positionProperty = new Cesium.ConstantPositionProperty(position)

        const colorProperty = new Cesium.ConstantProperty(
            getRealtimeVehicleColor(snapshot.motionStatus),
        )

        const entityProperties: RealtimeVehicleEntityProperties = {
            entityType: 'realtime-vehicle',
            vehicleId: snapshot.vehicleId,
            routeFid: snapshot.routeFid,
        }

        const entity = dataSource.entities.add({
            id: `realtime-vehicle:${snapshot.vehicleId}`,
            name: `实时车辆 ${snapshot.vehicleId}`,
            position: positionProperty,
            properties: entityProperties,
            point: {
                pixelSize: 18,
                color: colorProperty,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
        })

        return {
            entity,
            positionProperty,
            colorProperty,

            displayedPosition: Cesium.Cartesian3.clone(position),

            interpolationStartPosition: Cesium.Cartesian3.clone(position),

            interpolationTargetPosition: Cesium.Cartesian3.clone(position),

            interpolationStartedAtMilliseconds: performance.now(),
        }
    }

    // 使用后端最新快照同步整个车辆图层
    function updateVehicles(viewer: Cesium.Viewer, snapshots: RealtimeVehiclePositionSnapshot[]) {
        const dataSource = ensureDataSource(viewer)

        if (!dataSource) {
            return
        }

        // 一批车辆共用同一个时间基准，避免三辆车产生微小的动画起点差异
        const currentTimeMilliseconds = performance.now()

        // 保存这一批消息中仍然存在的 vehicleId，后面用来清理已经消失的车辆
        const activeVehicleIds = new Set<string>()

        for (const snapshot of snapshots) {
            if (!hasValidCoordinate(snapshot)) {
                continue
            }

            activeVehicleIds.add(snapshot.vehicleId)

            const nextPosition = Cesium.Cartesian3.fromDegrees(snapshot.longitude, snapshot.latitude)

            const existingVisual = vehicleVisuals.get(snapshot.vehicleId)

            if (existingVisual) {
                existingVisual.colorProperty.setValue(getRealtimeVehicleColor(snapshot.motionStatus))

                setInterpolationTarget(
                    existingVisual,
                    nextPosition,
                    currentTimeMilliseconds,
                )

                continue
            }

            const newVisual = createVehicleVisual(dataSource, snapshot)

            vehicleVisuals.set(snapshot.vehicleId, newVisual)
        }

        // 删除本次完整快照中已经不存在的车辆
        for (const [vehicleId, visual] of vehicleVisuals) {
            if (activeVehicleIds.has(vehicleId)) {
                continue
            }

            dataSource.entities.remove(visual.entity)
            vehicleVisuals.delete(vehicleId)
        }

        // 所有车辆共用一套动画循环，每一帧统一更新位置
        ensureAnimationRunning(viewer)
    }

    // 根据车辆编号取得其 Cesium Entity
    function getVehicleEntity(vehicleId: string): Cesium.Entity | undefined {
        return vehicleVisuals.get(vehicleId)?.entity
    }

    // 清理实时车辆图层
    function cleanup(viewer?: Cesium.Viewer) {
        // 页面卸载时取消仍在等待执行的动画帧
        if (animationFrameId !== undefined) {
            window.cancelAnimationFrame(animationFrameId)

            animationFrameId = undefined
        }

        activeViewer = undefined

        vehicleVisuals.clear()

        if (vehicleDataSource && viewer && !viewer.isDestroyed()) {
            viewer.dataSources.remove(vehicleDataSource, true)
        }

        vehicleDataSource = undefined
    }

    return {
        getVehicleEntity,
        updateVehicles,
        cleanup,
    }
}