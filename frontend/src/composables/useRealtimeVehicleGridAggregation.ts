import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type {
    RealtimeVehicleGridCell,
    RealtimeVehiclePositionSnapshot,
} from '@/types/realtimeVehicle'

interface RealtimeVehicleGridCounter {
    column: number
    row: number
    vehicleCount: number
}

/**
 * 把实时车辆划分到固定的米制地理网格。
 */
export function useRealtimeVehicleGridAggregation() {
    // WebMercatorProjection 可以在两种坐标之间转换：经纬度坐标 ⇄ Web Mercator 米制坐标
    const projection = new Cesium.WebMercatorProjection()

    let aggregationActive = false

    // 根据相机高度和上一状态决定是否启用网格聚合
    function resolveAggregationActive(viewer: Cesium.Viewer): boolean {
        const cameraHeightMeters = viewer.camera.positionCartographic.height

        const lodConfig = TRANSIT_CONFIG.realtimeVehicles.lod

        if (!aggregationActive && cameraHeightMeters >= lodConfig.aggregationEnterHeightMeters) {
            aggregationActive = true
        } else if (aggregationActive && cameraHeightMeters <= lodConfig.aggregationExitHeightMeters) {
            aggregationActive = false
        }

        return aggregationActive
    }

    // 把一个米制网格转换成包含经纬度边界的业务对象
    function createGridCell(
        counter: RealtimeVehicleGridCounter,
        gridSizeMeters: number,
    ): RealtimeVehicleGridCell {
        const westMeters = counter.column * gridSizeMeters
        const southMeters = counter.row * gridSizeMeters
        const eastMeters = westMeters + gridSizeMeters
        const northMeters = southMeters + gridSizeMeters

        const centerX = westMeters + gridSizeMeters / 2
        const centerY = southMeters + gridSizeMeters / 2

        const southwest = projection.unproject(new Cesium.Cartesian3(westMeters, southMeters, 0))
        const northeast = projection.unproject(new Cesium.Cartesian3(eastMeters, northMeters, 0))
        const center = projection.unproject(new Cesium.Cartesian3(centerX, centerY, 0))

        return {
            gridKey: `${counter.column}:${counter.row}`,
            column: counter.column,
            row: counter.row,
            vehicleCount: counter.vehicleCount,
            westLongitude: Cesium.Math.toDegrees(southwest.longitude),
            southLatitude: Cesium.Math.toDegrees(southwest.latitude),
            eastLongitude: Cesium.Math.toDegrees(northeast.longitude),
            northLatitude: Cesium.Math.toDegrees(northeast.latitude),
            centerLongitude: Cesium.Math.toDegrees(center.longitude),
            centerLatitude: Cesium.Math.toDegrees(center.latitude),
        }
    }

    // 统计每个固定地理网格内的车辆数量
    function aggregateVehicles(snapshots: RealtimeVehiclePositionSnapshot[]): RealtimeVehicleGridCell[] {
        const gridSizeMeters = TRANSIT_CONFIG.realtimeVehicles.lod.aggregationGridSizeMeters

        const counters = new Map<string, RealtimeVehicleGridCounter>()

        for (const snapshot of snapshots) {
            const cartographic = Cesium.Cartographic.fromDegrees(
                snapshot.longitude,
                snapshot.latitude,
            )

            const projectedPosition = projection.project(cartographic)

            // projectedPosition.x = 距本初子午线的米数 ; projectedPosition.y = 距赤道的米数
            const column = Math.floor(projectedPosition.x / gridSizeMeters)
            const row = Math.floor(projectedPosition.y / gridSizeMeters)

            const gridKey = `${column}:${row}`
            const counter = counters.get(gridKey)

            if (counter) {
                counter.vehicleCount += 1
                continue
            }

            counters.set(gridKey, {
                column,
                row,
                vehicleCount: 1,
            })
        }

        const gridCells: RealtimeVehicleGridCell[] = []

        for (const counter of counters.values()) {
            gridCells.push(createGridCell(counter, gridSizeMeters))
        }

        return gridCells
    }

    // 页面卸载时恢复聚合状态
    function cleanup() {
        aggregationActive = false
    }

    return {
        resolveAggregationActive,
        aggregateVehicles,
        cleanup,
    }
}