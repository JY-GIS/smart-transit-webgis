import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type {
    RealtimeVehicleLodRepresentation,
    RealtimeVehiclePositionSnapshot,
} from '@/types/realtimeVehicle'

interface RealtimeVehicleLodGroups {
    pointSnapshots: RealtimeVehiclePositionSnapshot[]
    modelSnapshots: RealtimeVehiclePositionSnapshot[]
}

/**
 * 根据相机到每辆车的距离管理实时车辆LOD
 */
export function useRealtimeVehicleLod() {
    const vehicleRepresentations = new Map<string, RealtimeVehicleLodRepresentation>()

    // 根据距离和上一帧状态决定一辆车使用点还是模型
    function resolveRepresentation(
        currentRepresentation: RealtimeVehicleLodRepresentation,
        distanceToCameraMeters: number,
    ): RealtimeVehicleLodRepresentation {
        const lodConfig = TRANSIT_CONFIG.realtimeVehicles.lod

        if (currentRepresentation === 'model' && distanceToCameraMeters >= lodConfig.modelExitDistanceMeters) {
            return 'point'
        }

        if (currentRepresentation === 'point' && distanceToCameraMeters <= lodConfig.modelEnterDistanceMeters) {
            return 'model'
        }

        return currentRepresentation
    }

    // 按逐车距离把同一批快照分给点图层和模型图层
    function groupVehiclesByDistance(
        viewer: Cesium.Viewer,
        snapshots: RealtimeVehiclePositionSnapshot[],
    ): RealtimeVehicleLodGroups {
        const pointSnapshots: RealtimeVehiclePositionSnapshot[] = []
        const modelSnapshots: RealtimeVehiclePositionSnapshot[] = []
        const activeVehicleIds = new Set<string>()

        for (const snapshot of snapshots) {
            activeVehicleIds.add(snapshot.vehicleId)

            const vehiclePosition = Cesium.Cartesian3.fromDegrees(
                snapshot.longitude,
                snapshot.latitude,
            )

            const distanceToCameraMeters = Cesium.Cartesian3.distance(
                viewer.camera.positionWC,
                vehiclePosition,
            )

            const currentRepresentation = vehicleRepresentations.get(snapshot.vehicleId) ?? 'point'

            const nextRepresentation = resolveRepresentation(
                currentRepresentation,
                distanceToCameraMeters,
            )

            vehicleRepresentations.set(
                snapshot.vehicleId,
                nextRepresentation,
            )

            if (nextRepresentation === 'model') {
                modelSnapshots.push(snapshot)
                continue
            }

            pointSnapshots.push(snapshot)
        }

        for (const vehicleId of vehicleRepresentations.keys()) {
            if (!activeVehicleIds.has(vehicleId)) {
                vehicleRepresentations.delete(vehicleId)
            }
        }

        return {
            pointSnapshots,
            modelSnapshots,
        }
    }

    // 查询指定车辆当前使用的表现形式
    function getVehicleRepresentation(vehicleId: string): RealtimeVehicleLodRepresentation | undefined {
        return vehicleRepresentations.get(vehicleId)
    }

    // 页面卸载时清除逐车LOD状态
    function cleanup() {
        vehicleRepresentations.clear()
    }

    return {
        groupVehiclesByDistance,
        getVehicleRepresentation,
        cleanup,
    }
}