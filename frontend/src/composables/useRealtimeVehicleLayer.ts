import * as Cesium from 'cesium'

import type {
    RealtimeVehicleEntityProperties,
    RealtimeVehiclePositionSnapshot,
} from '@/types/realtimeVehicle'

// 一辆实时车辆在 Cesium 中对应的可视对象
interface RealtimeVehicleVisual {
    entity: Cesium.Entity
    positionProperty: Cesium.ConstantPositionProperty
}

const REALTIME_VEHICLE_COLOR = Cesium.Color.ORANGE

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

    // 首次收到某辆车时创建 Cesium Entity
    function createVehicleVisual(
        dataSource: Cesium.CustomDataSource,
        snapshot: RealtimeVehiclePositionSnapshot,
    ): RealtimeVehicleVisual {
        const position = Cesium.Cartesian3.fromDegrees(snapshot.longitude, snapshot.latitude)

        // 保存当前固定位置，并允许后续调用 setValue 更新；而不是每秒删除并重新创建
        const positionProperty = new Cesium.ConstantPositionProperty(position)

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
                color: REALTIME_VEHICLE_COLOR,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
        })

        return {
            entity,
            positionProperty,
        }
    }

    // 使用后端最新快照同步整个车辆图层
    function updateVehicles(viewer: Cesium.Viewer, snapshots: RealtimeVehiclePositionSnapshot[]) {
        const dataSource = ensureDataSource(viewer)

        if (!dataSource) {
            return
        }

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
                // 已存在的车辆只更新位置 Property，不重新创建 Entity
                existingVisual.positionProperty.setValue(nextPosition)

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

        // 如果 Viewer 启用了 requestRenderMode，主动请求一帧以立即显示最新位置
        viewer.scene.requestRender()
    }

    // 清理实时车辆图层
    function cleanup(viewer?: Cesium.Viewer) {
        vehicleVisuals.clear()

        if (vehicleDataSource && viewer && !viewer.isDestroyed()) {
            viewer.dataSources.remove(vehicleDataSource, true)
        }

        vehicleDataSource = undefined
    }

    return {
        updateVehicles,
        cleanup,
    }
}