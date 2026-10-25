import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type { RealtimeVehicleGridCell } from '@/types/realtimeVehicle'

interface RealtimeVehicleGridVisual {
    entity: Cesium.Entity
    rectangle: Cesium.RectangleGraphics
    label: Cesium.LabelGraphics
}

/**
 * 把实时车辆聚合网格绘制成彩色矩形和数量标签。
 */
export function useRealtimeVehicleGridLayer() {
    let gridDataSource: Cesium.CustomDataSource | undefined

    const gridVisuals = new Map<string, RealtimeVehicleGridVisual>()

    let gridsVisible = true

    // 创建并复用网格专用数据源
    function ensureDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource | undefined {
        if (viewer.isDestroyed()) {
            return undefined
        }

        if (gridDataSource) {
            return gridDataSource
        }

        gridDataSource = new Cesium.CustomDataSource('realtime-vehicle-grid-layer')

        gridDataSource.show = gridsVisible
        viewer.dataSources.add(gridDataSource)

        return gridDataSource
    }

    // 根据网格内车辆数量选择填充颜色
    function getGridColor(vehicleCount: number): Cesium.Color {
        const style = TRANSIT_CONFIG.realtimeVehicles.lod.aggregationStyle

        let color: string = style.lowColor

        if (vehicleCount >= style.criticalVehicleCount) {
            color = style.criticalColor
        } else if (vehicleCount >= style.highVehicleCount) {
            color = style.highColor
        } else if (vehicleCount >= style.busyVehicleCount) {
            color = style.busyColor
        } else if (vehicleCount >= style.mediumVehicleCount) {
            color = style.mediumColor
        }

        return Cesium.Color.fromCssColorString(color).withAlpha(style.fillAlpha)
    }

    // 根据网格边界创建Cesium矩形
    function createRectangle(cell: RealtimeVehicleGridCell): Cesium.Rectangle {
        return Cesium.Rectangle.fromDegrees(
            cell.westLongitude,
            cell.southLatitude,
            cell.eastLongitude,
            cell.northLatitude,
        )
    }

    // 根据网格中心创建数量标签位置
    function createLabelPosition(cell: RealtimeVehicleGridCell): Cesium.Cartesian3 {
        return Cesium.Cartesian3.fromDegrees(
            cell.centerLongitude,
            cell.centerLatitude,
            5,
        )
    }

    // 第一次出现某个网格时创建矩形和数量标签
    function createGridVisual(
        dataSource: Cesium.CustomDataSource,
        cell: RealtimeVehicleGridCell,
    ): RealtimeVehicleGridVisual {
        const rectangle = new Cesium.RectangleGraphics({
            coordinates: createRectangle(cell),
            material: getGridColor(cell.vehicleCount),
            outline: true,
            outlineColor: Cesium.Color.WHITE.withAlpha(0.7),
            height: 2,
        })

        const label = new Cesium.LabelGraphics({
            text: String(cell.vehicleCount),
            font: 'bold 16px sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1000, 1.2, 20000, 0.7),
        })

        const entity = dataSource.entities.add({
            id: `realtime-vehicle-grid:${cell.gridKey}`,
            name: `实时车辆聚合网格 ${cell.gridKey}`,
            position: createLabelPosition(cell),
            properties: {
                entityType: 'realtime-vehicle-grid',
                gridKey: cell.gridKey,
                westLongitude: cell.westLongitude,
                southLatitude: cell.southLatitude,
                eastLongitude: cell.eastLongitude,
                northLatitude: cell.northLatitude,
            },
            rectangle,
            label,
        })

        return {
            entity,
            rectangle,
            label,
        }
    }

    // 使用最新统计结果更新已有矩形和标签
    function updateGridVisual(
        visual: RealtimeVehicleGridVisual,
        cell: RealtimeVehicleGridCell,
    ) {
        visual.entity.position = new Cesium.ConstantPositionProperty(createLabelPosition(cell))
        visual.rectangle.coordinates = new Cesium.ConstantProperty(createRectangle(cell))
        visual.rectangle.material = new Cesium.ColorMaterialProperty(getGridColor(cell.vehicleCount))
        visual.label.text = new Cesium.ConstantProperty(String(cell.vehicleCount))
    }

    // 使用最新网格统计结果更新整个图层
    function renderGridCells(
        viewer: Cesium.Viewer,
        gridCells: RealtimeVehicleGridCell[],
    ) {
        const dataSource = ensureDataSource(viewer)

        if (!dataSource) {
            return
        }

        const activeGridKeys = new Set<string>()

        for (const cell of gridCells) {
            activeGridKeys.add(cell.gridKey)

            const existingVisual = gridVisuals.get(cell.gridKey)

            if (existingVisual) {
                updateGridVisual(existingVisual, cell)
                continue
            }

            gridVisuals.set(
                cell.gridKey,
                createGridVisual(dataSource, cell),
            )
        }

        for (const [gridKey, visual] of gridVisuals) {
            if (activeGridKeys.has(gridKey)) {
                continue
            }

            dataSource.entities.remove(visual.entity)
            gridVisuals.delete(gridKey)
        }

        viewer.scene.requestRender()
    }

    // 清除当前所有网格对象
    function clearGridCells() {
        gridDataSource?.entities.removeAll()
        gridVisuals.clear()
    }

    // 显示或隐藏整个网格图层
    function setGridsVisible(visible: boolean) {
        gridsVisible = visible

        if (gridDataSource) {
            gridDataSource.show = visible
        }
    }

    // 页面卸载时释放网格图层
    function cleanup(viewer?: Cesium.Viewer) {
        gridVisuals.clear()

        if (gridDataSource && viewer && !viewer.isDestroyed()) {
            viewer.dataSources.remove(gridDataSource, true)
        }

        gridDataSource = undefined
        gridsVisible = true
    }

    return {
        renderGridCells,
        clearGridCells,
        setGridsVisible,
        cleanup,
    }
}