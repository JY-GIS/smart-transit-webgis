import { ref } from 'vue'
import * as Cesium from 'cesium'
import type { BusRouteProperties } from '@/types/busRoute'
import { readBusRouteProperties } from './useBusRouteLayer'

// 公交线路选择交互：监听 Cesium 选中 Entity，读取属性并高亮同一 fid 的全部片段。
// 高亮前保存原样式，关闭面板或切换线路时恢复，避免永久污染原始图层样式。
type RouteStyleSnapshot = {
    entity: Cesium.Entity
    material: Cesium.MaterialProperty
    width: Cesium.Property | undefined
    depthFailMaterial: Cesium.MaterialProperty
}

export function useBusRouteSelection() {
    // 面板只关心当前业务线路属性，不直接暴露 Cesium Entity。
    const selectedRoute = ref<BusRouteProperties | null>(null)

    // key 使用 Entity.id，允许一条 fid 线路包含多个独立片段。
    const highlightedRouteStyles =
        new Map<string, RouteStyleSnapshot>()

    // 保存监听器移除函数，组件卸载时释放 Cesium 事件。
    let removeRouteSelectionListener:
        | (() => void)
        | undefined

    function clearRouteHighlight() {
        // 恢复每个片段高亮前保存的 material、width 和 depthFailMaterial。
        for (const snapshot of highlightedRouteStyles.values()) {
            const polyline = snapshot.entity.polyline

            if (!polyline) {
                continue
            }

            polyline.material = snapshot.material
            polyline.width = snapshot.width
            polyline.depthFailMaterial =
                snapshot.depthFailMaterial
        }

        highlightedRouteStyles.clear()
    }

    function highlightRoute(
        fid: number,
        routeEntitiesByFid: Map<number, Cesium.Entity[]>,
    ) {
        clearRouteHighlight()

        // 通过业务 fid 找到整条线路，而不是只高亮被点击的一个片段。
        const entities = routeEntitiesByFid.get(fid) ?? []

        // 使用发光材质 + 加粗线宽提升选中线路的可见性；不隐藏原线。
        const highlightMaterial =
            new Cesium.PolylineGlowMaterialProperty({
                color: Cesium.Color.CYAN,
                glowPower: 0.35,
                taperPower: 1.0,
            })

        const depthFailHighlightMaterial =
            new Cesium.PolylineGlowMaterialProperty({
                color: Cesium.Color.CYAN.withAlpha(0.65),
                glowPower: 0.25,
                taperPower: 1.0,
            })

        const highlightWidth =
            new Cesium.ConstantProperty(12)

        for (const entity of entities) {
            const polyline = entity.polyline

            if (!polyline) {
                continue
            }

            highlightedRouteStyles.set(entity.id, {
                entity,
                material: polyline.material,
                width: polyline.width,
                depthFailMaterial:
                    polyline.depthFailMaterial,
            })

            polyline.material = highlightMaterial
            polyline.width = highlightWidth
            polyline.depthFailMaterial =
                depthFailHighlightMaterial
        }
    }

    function bindRouteSelection(
        viewer: Cesium.Viewer,
        dataSource: Cesium.GeoJsonDataSource,
        routeEntitiesByFid: Map<number, Cesium.Entity[]>,
    ) {
        removeRouteSelectionListener?.()

        // 使用 selectedEntityChanged，避免与 Cesium 内部默认点击选择机制冲突。
        removeRouteSelectionListener =
            viewer.selectedEntityChanged.addEventListener(
                (entity) => {
                    if (
                        !entity ||
                        !dataSource.entities.contains(entity) ||
                        !entity.polyline
                    ) {
                        selectedRoute.value = null
                        clearRouteHighlight()
                        return
                    }

                    const properties =
                        readBusRouteProperties(
                            entity,
                            viewer.clock.currentTime,
                        )

                    if (!properties) {
                        selectedRoute.value = null
                        clearRouteHighlight()
                        return
                    }

                    selectedRoute.value = properties

                    highlightRoute(
                        properties.fid,
                        routeEntitiesByFid,
                    )

                    console.info(
                        '公交线路点击查询：',
                        properties,
                    )
                },
            )
    }

    function closeRoutePanel(
        viewer: Cesium.Viewer | undefined,
    ) {
        // 同步清除 Cesium 选择状态、面板状态和线路高亮。
        if (
            viewer &&
            !viewer.isDestroyed()
        ) {
            viewer.selectedEntity = undefined
        }

        selectedRoute.value = null
        clearRouteHighlight()
    }

    function cleanup() {
        // 页面卸载时只清理本 composable 创建的监听和样式状态。
        removeRouteSelectionListener?.()
        removeRouteSelectionListener = undefined

        selectedRoute.value = null
        clearRouteHighlight()
    }

    return {
        selectedRoute,
        bindRouteSelection,
        closeRoutePanel,
        cleanup,
    }
}
