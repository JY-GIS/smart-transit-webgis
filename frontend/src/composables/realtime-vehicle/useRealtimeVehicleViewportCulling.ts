import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type { RealtimeVehiclePositionSnapshot } from '@/types/realtimeVehicle'

/**
 * 根据相机当前可见的地理范围过滤实时车辆。
 */
export function useRealtimeVehicleViewportCulling() {
    // 在相机可见范围四周增加缓冲区域
    function createPaddedViewRectangle(viewRectangle: Cesium.Rectangle): Cesium.Rectangle {
        const paddingRatio = TRANSIT_CONFIG.realtimeVehicles.lod.viewportPaddingRatio

        const longitudePadding = (viewRectangle.east - viewRectangle.west) * paddingRatio
        const latitudePadding = (viewRectangle.north - viewRectangle.south) * paddingRatio

        return new Cesium.Rectangle(
            viewRectangle.west - longitudePadding,
            Cesium.Math.clamp(
                viewRectangle.south - latitudePadding,
                -Cesium.Math.PI_OVER_TWO,
                Cesium.Math.PI_OVER_TWO,
            ),
            viewRectangle.east + longitudePadding,
            Cesium.Math.clamp(
                viewRectangle.north + latitudePadding,
                -Cesium.Math.PI_OVER_TWO,
                Cesium.Math.PI_OVER_TWO,
            ),
        )
    }

    // 只保留当前视野、缓冲区域和当前选中的车辆
    function filterVehiclesInView(
        viewer: Cesium.Viewer,
        snapshots: RealtimeVehiclePositionSnapshot[],
        retainedVehicleId: string | null,
    ): RealtimeVehiclePositionSnapshot[] {
        const viewRectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid)

        if (!viewRectangle) {
            return snapshots
        }

        const paddedRectangle = createPaddedViewRectangle(viewRectangle)

        return snapshots.filter((snapshot) => {
            if (snapshot.vehicleId === retainedVehicleId) {
                return true
            }

            const longitude = Cesium.Math.toRadians(snapshot.longitude)
            const latitude = Cesium.Math.toRadians(snapshot.latitude)

            return (
                longitude >= paddedRectangle.west &&
                longitude <= paddedRectangle.east &&
                latitude >= paddedRectangle.south &&
                latitude <= paddedRectangle.north
            )
        })
    }

    return {
        filterVehiclesInView,
    }
}