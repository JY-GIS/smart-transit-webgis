import * as Cesium from 'cesium'
import type { Ref } from 'vue'

import { useRealtimeVehicleGridAggregation } from '@/composables/realtime-vehicle/useRealtimeVehicleGridAggregation'
import { useRealtimeVehicleGridLayer } from '@/composables/realtime-vehicle/useRealtimeVehicleGridLayer'
import { useRealtimeVehicleLod } from '@/composables/realtime-vehicle/useRealtimeVehicleLod'
import { useRealtimeVehicleModelLayer } from '@/composables/realtime-vehicle/useRealtimeVehicleModelLayer'
import { useRealtimeVehiclePointLayer } from '@/composables/realtime-vehicle/useRealtimeVehiclePointLayer'
import { useRealtimeVehicleViewportCulling } from '@/composables/realtime-vehicle/useRealtimeVehicleViewportCulling'

import type {
    RealtimeVehiclePositionSnapshot,
    RealtimeVehicleRenderMode,
} from '@/types/realtimeVehicle'

interface UseRealtimeVehiclePresentationOptions {
    renderMode: Ref<RealtimeVehicleRenderMode>
    selectedVehicleId: Ref<string | null>
}

// 组合实时车辆点、模型、聚合网格和LOD，统一决定车辆应该怎样显示
export function useRealtimeVehiclePresentation(
    options: UseRealtimeVehiclePresentationOptions,
) {
    const {
        renderMode,
        selectedVehicleId,
    } = options

    const {
        getVehiclePosition: getPointPosition,
        updateVehicles: updatePointVehicles,
        setVehiclesVisible: setPointVehiclesVisible,
        cleanup: cleanupPointLayer,
    } = useRealtimeVehiclePointLayer()

    const {
        getVehicleEntity: getModelEntity,
        getVehiclePosition: getModelPosition,
        updateVehicles: updateModelVehicles,
        setVehiclesVisible: setModelVehiclesVisible,
        cleanup: cleanupModelLayer,
    } = useRealtimeVehicleModelLayer()

    const {
        groupVehiclesByDistance,
        getVehicleRepresentation,
        cleanup: cleanupLod,
    } = useRealtimeVehicleLod()

    const {
        resolveAggregationActive,
        aggregateVehicles,
        cleanup: cleanupGridAggregation,
    } = useRealtimeVehicleGridAggregation()

    const {
        renderGridCells,
        clearGridCells,
        setGridsVisible,
        cleanup: cleanupGridLayer,
    } = useRealtimeVehicleGridLayer()

    const {
        filterVehiclesInView,
    } = useRealtimeVehicleViewportCulling()

    // 根据实时车辆整体状态统一显示或隐藏点、模型和聚合网格
    function setVisible(visible: boolean) {
        const autoModeEnabled = renderMode.value === 'auto'

        setPointVehiclesVisible(visible)
        setModelVehiclesVisible(visible && autoModeEnabled)
        setGridsVisible(visible && autoModeEnabled)
    }

    // 根据手动点模式或自动LOD模式更新实时车辆显示
    function updateVehicles(
        viewer: Cesium.Viewer,
        snapshots: RealtimeVehiclePositionSnapshot[],
    ) {
        if (renderMode.value === 'point') {
            clearGridCells()
            updatePointVehicles(viewer, snapshots)
            updateModelVehicles(viewer, [])
            return
        }

        const aggregationActive = resolveAggregationActive(viewer)

        if (aggregationActive) {
            const gridCells = aggregateVehicles(snapshots)

            renderGridCells(viewer, gridCells)
            updatePointVehicles(viewer, [])
            updateModelVehicles(viewer, [])
            return
        }

        clearGridCells()

        const visibleSnapshots = filterVehiclesInView(
            viewer,
            snapshots,
            selectedVehicleId.value,
        )

        const {
            pointSnapshots,
            modelSnapshots,
        } = groupVehiclesByDistance(viewer, visibleSnapshots)

        updatePointVehicles(viewer, pointSnapshots)
        updateModelVehicles(viewer, modelSnapshots)
    }

    // 返回当前使用模型显示的车辆Entity，供地图恢复选中状态
    function getVehicleEntity(vehicleId: string): Cesium.Entity | undefined {
        if (
            renderMode.value === 'auto' &&
            getVehicleRepresentation(vehicleId) === 'model'
        ) {
            return getModelEntity(vehicleId)
        }

        return undefined
    }

    // 页面卸载时统一释放实时车辆显示资源
    function cleanup(viewer?: Cesium.Viewer) {
        cleanupPointLayer(viewer)
        cleanupModelLayer(viewer)
        cleanupLod()
        cleanupGridAggregation()
        cleanupGridLayer(viewer)
    }

    return {
        getPointPosition,
        getModelPosition,
        getVehicleEntity,
        setVisible,
        updateVehicles,
        cleanup,
    }
}
