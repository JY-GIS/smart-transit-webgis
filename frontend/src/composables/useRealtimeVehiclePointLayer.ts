import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import { REALTIME_VEHICLE_STATUS_STYLES } from '@/config/realtimeVehicleStatus.config'

import type {
    RealtimeVehicleMotionStatus,
    RealtimeVehiclePickProperties,
    RealtimeVehiclePositionSnapshot,
} from '@/types/realtimeVehicle'

// 一辆车辆在 PointPrimitive 图层中的渲染状态
interface RealtimeVehiclePointVisual {
    point: Cesium.PointPrimitive

    // 当前实际显示的位置
    displayedPosition: Cesium.Cartesian3

    // 本轮平滑移动的起点
    interpolationStartPosition: Cesium.Cartesian3

    // 本轮需要到达的服务端位置
    interpolationTargetPosition: Cesium.Cartesian3

    // 本轮平滑移动开始时间
    interpolationStartedAtMilliseconds: number

    // 上一轮单圈里程，用于识别车辆回到线路起点
    lastRouteDistanceMeters: number
}

// 将车辆运行状态转换成 Cesium 颜色
const REALTIME_VEHICLE_POINT_COLORS:
    Record<RealtimeVehicleMotionStatus, Cesium.Color> = {
    CRUISING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.CRUISING.color),
    APPROACHING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.APPROACHING.color),
    DWELLING: Cesium.Color.fromCssColorString(REALTIME_VEHICLE_STATUS_STYLES.DWELLING.color),
}

// 取得车辆状态对应的点颜色
function getRealtimeVehiclePointColor(motionStatus: RealtimeVehicleMotionStatus): Cesium.Color {
    return REALTIME_VEHICLE_POINT_COLORS[motionStatus]
}

// 使用 PointPrimitiveCollection 管理实时车辆点
export function useRealtimeVehiclePointLayer() {
    let pointCollection:
        | Cesium.PointPrimitiveCollection
        | undefined

    const vehiclePoints = new Map<string, RealtimeVehiclePointVisual>()

    let activeViewer: Cesium.Viewer | undefined

    let animationFrameId: number | undefined

    let pointsVisible = true

    // 创建并复用整个车辆点集合。所有车辆共用一个集合
    function ensurePointCollection(viewer: Cesium.Viewer): Cesium.PointPrimitiveCollection | undefined {
        if (viewer.isDestroyed()) {
            return undefined
        }

        if (pointCollection) {
            return pointCollection
        }

        const collection = viewer.scene.primitives.add(
            new Cesium.PointPrimitiveCollection(),
        )

        collection.show = pointsVisible

        pointCollection = collection

        return collection
    }

    // 检查车辆经纬度是否处于合法范围
    function hasValidCoordinate(snapshot: RealtimeVehiclePositionSnapshot): boolean {
        return (snapshot.longitude >= -180 && snapshot.longitude <= 180 && snapshot.latitude >= -90 && snapshot.latitude <= 90)
    }

    // 计算一辆车辆当前帧应该显示的位置
    function applyInterpolatedPosition(
        visual: RealtimeVehiclePointVisual,
        currentTimeMilliseconds: number,
    ): boolean {
        const durationMilliseconds = TRANSIT_CONFIG.realtimeVehicles.interpolationDurationMilliseconds
        const elapsedMilliseconds = currentTimeMilliseconds - visual.interpolationStartedAtMilliseconds

        const progress = Cesium.Math.clamp(
            elapsedMilliseconds / durationMilliseconds,
            0,
            1,
        )

        Cesium.Cartesian3.lerp(
            visual.interpolationStartPosition,
            visual.interpolationTargetPosition,
            progress,
            visual.displayedPosition,
        )

        // PointPrimitive不使用ConstantPositionProperty。每一帧直接修改point.position即可。
        visual.point.position = visual.displayedPosition

        return progress < 1
    }

    // 在一个动画帧中统一更新全部车辆点
    function animateVehicles(currentTimeMilliseconds: number,) {
        animationFrameId = undefined

        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed() || !pointsVisible) {
            return
        }

        let hasMovingVehicle = false

        for (const visual of vehiclePoints.values()) {
            const isStillMoving = applyInterpolatedPosition(visual, currentTimeMilliseconds)

            if (isStillMoving) {
                hasMovingVehicle = true
            }
        }

        viewer.scene.requestRender()

        if (hasMovingVehicle) {
            animationFrameId = window.requestAnimationFrame(animateVehicles)
        }
    }

    // 保证当前图层最多只有一个动画循环
    function ensureAnimationRunning(viewer: Cesium.Viewer) {
        activeViewer = viewer

        if (animationFrameId !== undefined || !pointsVisible) {
            return
        }

        animationFrameId = window.requestAnimationFrame(animateVehicles)
    }

    /// 为已有车辆设置下一次服务端目标位置
    function setInterpolationTarget(
        visual: RealtimeVehiclePointVisual,
        nextPosition: Cesium.Cartesian3,
        currentTimeMilliseconds: number,
    ) {
        applyInterpolatedPosition(visual, currentTimeMilliseconds)

        Cesium.Cartesian3.clone(visual.displayedPosition, visual.interpolationStartPosition)

        Cesium.Cartesian3.clone(nextPosition, visual.interpolationTargetPosition)

        visual.interpolationStartedAtMilliseconds = currentTimeMilliseconds
    }

    // 车辆完成一圈时直接回到线路起点
    function setPositionImmediately(
        visual: RealtimeVehiclePointVisual,
        nextPosition: Cesium.Cartesian3,
        currentTimeMilliseconds: number,
    ) {
        Cesium.Cartesian3.clone(nextPosition, visual.displayedPosition)

        Cesium.Cartesian3.clone(nextPosition, visual.interpolationStartPosition)
        Cesium.Cartesian3.clone(nextPosition, visual.interpolationTargetPosition)

        visual.interpolationStartedAtMilliseconds = currentTimeMilliseconds

        visual.point.position = visual.displayedPosition
    }

    // 第一次收到车辆时创建一个PointPrimitive
    function createVehiclePoint(
        collection: Cesium.PointPrimitiveCollection,
        snapshot: RealtimeVehiclePositionSnapshot,
    ): RealtimeVehiclePointVisual {
        const position = Cesium.Cartesian3.fromDegrees(snapshot.longitude, snapshot.latitude)

        const pickProperties: RealtimeVehiclePickProperties = {
            entityType: 'realtime-vehicle',
            vehicleId: snapshot.vehicleId,
            routeFid: snapshot.routeFid,
        }

        const point = collection.add({
            id: pickProperties,
            position,
            pixelSize: 18,
            color: getRealtimeVehiclePointColor(snapshot.motionStatus),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3,
            scaleByDistance: new Cesium.NearFarScalar(1000, 1, 8000, 0.6),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        })

        return {
            point,
            displayedPosition: Cesium.Cartesian3.clone(position),
            interpolationStartPosition: Cesium.Cartesian3.clone(position),
            interpolationTargetPosition: Cesium.Cartesian3.clone(position),
            interpolationStartedAtMilliseconds: performance.now(),
            lastRouteDistanceMeters: snapshot.distanceMeters,
        }
    }

    // 使用最新完整快照更新车辆点
    function updateVehicles(
        viewer: Cesium.Viewer,
        snapshots: RealtimeVehiclePositionSnapshot[],
    ) {
        const collection = ensurePointCollection(viewer)

        if (!collection) {
            return
        }

        const currentTimeMilliseconds = performance.now()

        const activeVehicleIds = new Set<string>()

        for (const snapshot of snapshots) {
            if (!hasValidCoordinate(snapshot)) {
                continue
            }

            activeVehicleIds.add(snapshot.vehicleId)

            const nextPosition = Cesium.Cartesian3.fromDegrees(snapshot.longitude, snapshot.latitude)

            const existingVisual = vehiclePoints.get(snapshot.vehicleId)

            if (existingVisual) {
                existingVisual.point.color = getRealtimeVehiclePointColor(snapshot.motionStatus)

                const hasWrappedToRouteStart =
                    snapshot.totalDistanceMeters > 0 &&
                    existingVisual.lastRouteDistanceMeters - snapshot.distanceMeters >
                    snapshot.totalDistanceMeters / 2

                if (hasWrappedToRouteStart) {
                    setPositionImmediately(
                        existingVisual,
                        nextPosition,
                        currentTimeMilliseconds,
                    )
                } else {
                    setInterpolationTarget(
                        existingVisual,
                        nextPosition,
                        currentTimeMilliseconds,
                    )
                }

                existingVisual.lastRouteDistanceMeters = snapshot.distanceMeters

                continue
            }

            const newVisual = createVehiclePoint(collection, snapshot)

            vehiclePoints.set(snapshot.vehicleId, newVisual)
        }

        for (const [vehicleId, visual] of vehiclePoints) {
            if (activeVehicleIds.has(vehicleId)) {
                continue
            }

            collection.remove(visual.point)
            vehiclePoints.delete(vehicleId)
        }

        ensureAnimationRunning(viewer)
    }

    // 根据车辆编号取得对应的PointPrimitive
    function getVehiclePoint(vehicleId: string): Cesium.PointPrimitive | undefined {
        return vehiclePoints.get(vehicleId)?.point
    }

    // 返回车辆当前实际显示的位置
    function getVehiclePosition(vehicleId: string): Cesium.Cartesian3 | undefined {
        const visual = vehiclePoints.get(vehicleId)

        if (!visual) {
            return undefined
        }

        return Cesium.Cartesian3.clone(visual.displayedPosition)
    }

    // 显示或隐藏整个车辆点集合
    function setVehiclesVisible(visible: boolean) {
        pointsVisible = visible

        if (pointCollection) {
            pointCollection.show = visible
        }

        const viewer = activeViewer

        if (visible && viewer && !viewer.isDestroyed()) {
            ensureAnimationRunning(viewer)
            viewer.scene.requestRender()
        }
    }

    // 页面卸载时清理动画和WebGL对象
    function cleanup(viewer?: Cesium.Viewer) {
        if (animationFrameId !== undefined) {
            window.cancelAnimationFrame(animationFrameId)
            animationFrameId = undefined
        }

        vehiclePoints.clear()
        activeViewer = undefined

        if (pointCollection && viewer && !viewer.isDestroyed()) {
            viewer.scene.primitives.remove(pointCollection)
        }

        pointCollection = undefined
        pointsVisible = true
    }

    return {
        getVehiclePoint,
        getVehiclePosition,
        updateVehicles,
        setVehiclesVisible,
        cleanup,
    }
}