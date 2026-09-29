import { ref } from 'vue'
import * as Cesium from 'cesium'
import type { BusRouteProperties } from '@/types/busRoute'
import type { RealtimeVehicleEntityProperties } from '@/types/realtimeVehicle'
import type { RouteBusStopEntityProperties } from '@/types/busStop'
import { createTransitPolylineHighlightMaterial, TRANSIT_POLYLINE_HIGHLIGHT_WIDTH } from '@/utils/transitPolylineHighlight'
import { readRouteBusStopProperties } from './useBusStopLayer'
import { readBusRouteProperties } from './useBusRouteLayer'

// 公交线路选择交互：监听 Cesium 选中 Entity，读取属性并高亮同一 fid 的全部片段。
// 高亮前保存原样式，关闭面板或切换线路时恢复，避免永久污染原始图层样式。
type RouteStyleSnapshot = {
    entity: Cesium.Entity
    material: Cesium.MaterialProperty
    width: Cesium.Property | undefined
    depthFailMaterial: Cesium.MaterialProperty
}

// 被选中站点高亮前的样式快照
type RouteStopStyleSnapshot = {
    entity: Cesium.Entity
    color: Cesium.Property | undefined
    pixelSize: Cesium.Property | undefined
    outlineColor: Cesium.Property | undefined
    outlineWidth: Cesium.Property | undefined
    disableDepthTestDistance: Cesium.Property | undefined
}

// 通过回调复用已有点击事件，避免重复注册
type MapClickHandler = (
    position: Cesium.Cartesian2,
) => void

// 读取实时车辆 Entity 上的业务元数据
function readRealtimeVehicleProperties(entity: Cesium.Entity, time: Cesium.JulianDate): RealtimeVehicleEntityProperties | null {
    const values = entity.properties?.getValue(time) as
        | Record<string, unknown>
        | undefined

    if (!values || values.entityType !== 'realtime-vehicle') {
        return null
    }

    const vehicleId = String(values.vehicleId ?? '')
    const routeFid = Number(values.routeFid)

    if (!vehicleId || !Number.isFinite(routeFid)) {
        return null
    }

    return {
        entityType: 'realtime-vehicle',
        vehicleId,
        routeFid,
    }
}

function getPickedEntity(pickedObject: unknown): Cesium.Entity | undefined {
    if (!pickedObject || typeof pickedObject !== 'object') {
        return undefined
    }

    const candidate = (pickedObject as { id?: unknown }).id

    return candidate instanceof Cesium.Entity ? candidate : undefined
}

// 将拾取到的 Entity 加入数组，并按 Entity.id 去重
function appendPickedEntity(pickedEntities: Cesium.Entity[], pickedObject: unknown) {
    const entity = getPickedEntity(pickedObject)

    if (!entity) {
        return
    }

    if (
        pickedEntities.some(
            (item) => item.id === entity.id
        )
    ) {
        return
    }

    pickedEntities.push(entity)
}

export function useBusRouteSelection() {
    // 面板只关心当前业务线路属性，不直接暴露 Cesium Entity。
    const selectedRoute = ref<BusRouteProperties | null>(null)

    // 当前选中的实时车辆业务编号
    const selectedVehicleId = ref<string | null>(null)

    // 当前选中的“线路站点”
    const selectedRouteStop = ref<RouteBusStopEntityProperties | null>(null)

    // 当前被高亮站点的原始样式
    let highlightedRouteStopStyle:
        | RouteStopStyleSnapshot
        | undefined

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

        const highlightMaterial = createTransitPolylineHighlightMaterial(1, 0.35)

        const depthFailHighlightMaterial = createTransitPolylineHighlightMaterial(0.65, 0.25)

        const highlightWidth = new Cesium.ConstantProperty(TRANSIT_POLYLINE_HIGHLIGHT_WIDTH)

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

    /**
 * 恢复上一个选中站点的原始样式。
 */
    function clearRouteStopHighlight() {
        const snapshot = highlightedRouteStopStyle

        if (!snapshot) {
            return
        }

        const point = snapshot.entity.point

        if (point) {
            point.color = snapshot.color
            point.pixelSize = snapshot.pixelSize

            point.outlineColor =
                snapshot.outlineColor

            point.outlineWidth =
                snapshot.outlineWidth

            point.disableDepthTestDistance =
                snapshot.disableDepthTestDistance
        }

        highlightedRouteStopStyle = undefined
    }

    /**
     * 只清除线路站点选择，不取消当前线路。关闭到站面板时使用这个函数。
     */
    function clearRouteStopSelection() {
        selectedRouteStop.value = null
        clearRouteStopHighlight()
    }

    /**
     * 高亮用户点击的线路站点。
     */
    function highlightRouteStop(entity: Cesium.Entity) {
        clearRouteStopHighlight()

        const point = entity.point

        if (!point) return

        /*
         * 先保存原样式，再覆盖为选中样式。
         * 如果不保存，切换站点后无法恢复原来的紫色。
         */
        highlightedRouteStopStyle = {
            entity,
            color: point.color,
            pixelSize: point.pixelSize,
            outlineColor: point.outlineColor,
            outlineWidth: point.outlineWidth,
            disableDepthTestDistance: point.disableDepthTestDistance,
        }

        // 当前选中样式不需要时间动画，因此 ConstantProperty 比 CallbackProperty 更合适
        point.color = new Cesium.ConstantProperty(Cesium.Color.WHITE)
        point.outlineColor = new Cesium.ConstantProperty(Cesium.Color.GOLD)
        point.outlineWidth = new Cesium.ConstantProperty(3)

        point.disableDepthTestDistance = new Cesium.ConstantProperty(Number.POSITIVE_INFINITY)
    }

    function clearRouteSelection() {
        selectedVehicleId.value = null
        clearRouteStopSelection()
        selectedRoute.value = null
        clearRouteHighlight()
    }

    // 车辆点击和线路点击都通过 fid 进入同一个选择流程
    function selectRouteByFid(
        fid: number,
        routeEntitiesByFid: Map<number, Cesium.Entity[]>,
        time: Cesium.JulianDate
    ) {
        clearRouteStopSelection()

        const routeEntity = routeEntitiesByFid.get(fid)?.[0]

        const properties = routeEntity ? readBusRouteProperties(routeEntity, time) : null

        if (!properties) {
            clearRouteSelection()
            return
        }

        selectedRoute.value = properties

        // 复用现有的整条线路高亮逻辑。
        highlightRoute(
            properties.fid,
            routeEntitiesByFid,
        )

        console.log('公交线路选择：', properties)
    }

    /**
     * 根据车辆业务信息选择实时车辆。
     */
    function selectRealtimeVehicle(
        vehicleId: string,
        routeFid: number,
        routeEntitiesByFid: Map<number, Cesium.Entity[]>,
        time: Cesium.JulianDate,
    ) {
        selectedVehicleId.value = vehicleId

        selectRouteByFid(
            routeFid,
            routeEntitiesByFid,
            time,
        )
    }

    function bindRouteSelection(
        viewer: Cesium.Viewer,
        dataSource: Cesium.GeoJsonDataSource,
        routeEntitiesByFid: Map<number, Cesium.Entity[]>,
        onMapClick?: MapClickHandler,
    ) {
        removeRouteSelectionListener?.()

        const screenSpaceEventHandler = viewer.screenSpaceEventHandler

        const previousLeftClickAction = screenSpaceEventHandler.getInputAction(
            Cesium.ScreenSpaceEventType.LEFT_CLICK,
        ) as
            | Cesium.ScreenSpaceEventHandler.PositionedEventCallback
            | undefined

        const handleLeftClick = (
            click: Cesium.ScreenSpaceEventHandler.PositionedEvent,
        ) => {
            const currentTime = viewer.clock.currentTime

            const pickedEntities: Cesium.Entity[] = []

            // scene.pick 获取点击位置最上层的对象
            appendPickedEntity(pickedEntities, viewer.scene.pick(click.position))

            const topEntity = pickedEntities[0]

            const topBusProperties = topEntity
                ? readRealtimeVehicleProperties(
                    topEntity,
                    currentTime,
                )
                : null

            // 如果最上层不是车辆，再检查点击位置下的全部对象
            if (!topBusProperties) {
                const drilledObjects = viewer.scene.drillPick(click.position)

                for (const pickedObject of drilledObjects) {
                    appendPickedEntity(pickedEntities, pickedObject)
                }
            }

            // 车辆优先级最高
            const busEntity = pickedEntities.find(
                (entity) => readRealtimeVehicleProperties(
                    entity,
                    currentTime,
                ) !== null
            )

            if (busEntity) {
                const busProperties = readRealtimeVehicleProperties(
                    busEntity,
                    currentTime,
                )

                if (!busProperties) {
                    clearRouteSelection()
                    return
                }

                viewer.selectedEntity = busEntity

                selectRealtimeVehicle(
                    busProperties.vehicleId,
                    busProperties.routeFid,
                    routeEntitiesByFid,
                    currentTime,
                )

                return
            }

            /*
             * 车辆之后检查线路站点
             */
            const routeStopEntity =
                pickedEntities.find(
                    (entity) => readRouteBusStopProperties(entity, currentTime) !== null
                )

            if (routeStopEntity) {
                const routeStopProperties =
                    readRouteBusStopProperties(routeStopEntity, currentTime)

                if (!routeStopProperties) {
                    viewer.selectedEntity = undefined
                    clearRouteSelection()
                    return
                }

                viewer.selectedEntity = routeStopEntity

                /*
                 * 点击来源切换为站点：
                 * - 关闭车辆详情；
                 * - 保留当前线路及线路高亮；
                 * - 保存线路站点；
                 * - 高亮当前站点。
                 */
                selectedVehicleId.value = null

                selectedRouteStop.value = routeStopProperties

                highlightRouteStop(routeStopEntity)

                console.log('线路站点选择：', routeStopProperties,)

                return
            }

            // 没有车辆和线路站点时，再查找公交线路 Entity
            const routeEntity = pickedEntities.find((entity) => {
                if (!dataSource.entities.contains(entity) || !entity.polyline) {
                    return false
                }

                return (
                    readBusRouteProperties(
                        entity,
                        currentTime
                    ) !== null
                )
            })

            if (routeEntity) {
                const routeProperties = readBusRouteProperties(
                    routeEntity,
                    currentTime
                )

                if (!routeProperties) {
                    viewer.selectedEntity = undefined
                    clearRouteSelection()
                    return
                }

                viewer.selectedEntity = routeEntity

                // 选择来源已经切换为线路，关闭车辆详情面板
                selectedVehicleId.value = null

                selectRouteByFid(
                    routeProperties.fid,
                    routeEntitiesByFid,
                    currentTime
                )

                return
            }

            // 点击空白、普通道路或其他图层时，清除公交线路选择
            viewer.selectedEntity = undefined
            clearRouteSelection()

            // 将地图点击位置交给附近公交站查询功能
            onMapClick?.(click.position)
        }

        // 统一接管左键点击
        screenSpaceEventHandler.setInputAction(
            handleLeftClick,
            Cesium.ScreenSpaceEventType.LEFT_CLICK
        )

        removeRouteSelectionListener = () => {
            if (viewer.isDestroyed()) {
                return
            }

            if (previousLeftClickAction) {
                screenSpaceEventHandler.setInputAction(
                    previousLeftClickAction,
                    Cesium.ScreenSpaceEventType.LEFT_CLICK
                )
            } else {
                screenSpaceEventHandler.removeInputAction(
                    Cesium.ScreenSpaceEventType.LEFT_CLICK
                )
            }
        }
    }

    // 关闭站点到站面板时，只清除站点，不取消线路
    function closeRouteStopPanel(viewer: Cesium.Viewer | undefined,) {
        if (viewer && !viewer.isDestroyed()) {
            viewer.selectedEntity = undefined
        }

        clearRouteStopSelection()
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

        clearRouteSelection()
    }

    function cleanup() {
        // 页面卸载时只清理本 composable 创建的监听和样式状态。
        removeRouteSelectionListener?.()
        removeRouteSelectionListener = undefined

        clearRouteSelection()
    }

    return {
        selectedRoute,
        selectedVehicleId,
        selectedRouteStop,

        selectRealtimeVehicle,

        bindRouteSelection,

        closeRoutePanel,
        closeRouteStopPanel,

        cleanup,
    }
}
