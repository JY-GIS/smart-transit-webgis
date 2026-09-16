import * as Cesium from 'cesium'
import { ref } from 'vue'

import type { OrderedBusStop } from '@/types/busStop'
import type {
    SimulatedBusConfig,
    SimulatedBusEntityProperties,
    SimulatedBusPath,
    SimulatedBusRouteStop,
    SimulatedBusState,
    SimulatedBusStatus,
} from '@/types/simulatedBus'

import {
    buildRoutePath,
    getPositionAtDistance,
    getRouteProgress,
    mapStopsToRoute,
} from '@/utils/simulatedBusRoute'

// 使用 M103 的路线测试
const M103_SIMULATED_BUS_CONFIG: SimulatedBusConfig = {
    id: 'simulated-bus-m103-001',
    routeFid: 185,
    routeId: 'route_000185',
    speedMetersPerSecond: 12,
    loop: true,
}

// 创建初始状态
function createInitialState(): SimulatedBusState {
    return {
        id: M103_SIMULATED_BUS_CONFIG.id,
        routeFid: M103_SIMULATED_BUS_CONFIG.routeFid,
        routeId: M103_SIMULATED_BUS_CONFIG.routeId,
        status: 'idle',
        distanceMeters: 0,
        totalDistanceMeters: 0,
        previousStop: null,
        nextStop: null,
        distanceToNextStopMeters: null,
        routeProgressPercent: 0,
        position: undefined,
    }
}

export function useSimulatedBus() {
    const busState = ref<SimulatedBusState>(createInitialState())

    const isBusLoaded = ref(false)

    let viewer: Cesium.Viewer | undefined
    let busDataSource: Cesium.CustomDataSource | undefined
    let busEntity: Cesium.Entity | undefined
    let routePath: SimulatedBusPath | undefined
    let mappedRouteStops:
        | SimulatedBusRouteStop[]
        | undefined
    let currentPosition: Cesium.Cartesian3 | undefined
    let removeClockTickListener:
        | (() => void)
        | undefined
    let lastTickTime: Cesium.JulianDate | undefined

    // 清理车辆时不清理线路索引，重新加载时可以复用这份已经加载好的线路数据
    let loadedRouteEntitiesByFid:
        | Map<number, Cesium.Entity[]>
        | undefined

    // 清理车辆时保留原始有序站点
    let loadedRouteStops:
        | OrderedBusStop[]
        | undefined

    // 从现有公交线路 Entity 中读取 Polyline 坐标
    function extractRoutePositions(
        routeEntitiesByFid: Map<number, Cesium.Entity[]>,
        routeFid: number,
        time: Cesium.JulianDate,
    ): Cesium.Cartesian3[] {
        const positions: Cesium.Cartesian3[] = []

        const entities = routeEntitiesByFid.get(routeFid) ?? []

        for (const entity of entities) {
            const entityPositions = entity.polyline?.positions?.getValue(time)

            if (!entityPositions || entityPositions.length < 2) continue

            positions.push(...entityPositions)
        }

        return positions
    }

    function updateBusState(status: SimulatedBusStatus, distanceMeters: number, position: Cesium.Cartesian3 | undefined) {
        const routeProgress =
            routePath && mappedRouteStops
                ? getRouteProgress(
                    routePath,
                    mappedRouteStops,
                    distanceMeters,
                )
                : {
                    previousStop: busState.value.previousStop,

                    nextStop: busState.value.nextStop,

                    distanceToNextStopMeters: busState.value.distanceToNextStopMeters,

                    routeProgressPercent: busState.value.routeProgressPercent,
                }

        busState.value = {
            id: M103_SIMULATED_BUS_CONFIG.id,

            routeFid: M103_SIMULATED_BUS_CONFIG.routeFid,

            routeId: M103_SIMULATED_BUS_CONFIG.routeId,

            status,

            distanceMeters,

            totalDistanceMeters: routePath?.totalDistance ?? busState.value.totalDistanceMeters,

            previousStop: routeProgress.previousStop,

            nextStop: routeProgress.nextStop,

            distanceToNextStopMeters: routeProgress.distanceToNextStopMeters,

            routeProgressPercent: routeProgress.routeProgressPercent,

            position: position ? Cesium.Cartesian3.clone(position) : undefined,
        }
    }

    function ensureBusEntity() {
        if (!viewer || !routePath || !currentPosition) {
            throw new Error('Viewer 或公交线路尚未准备完成')
        }

        if (!busDataSource) {
            busDataSource = new Cesium.CustomDataSource('simulated-bus-layer')

            viewer.dataSources.add(busDataSource)
        }

        const initialPosition = currentPosition

        // CallbackPositionProperty 让 Entity 每次渲染时,都能取得最新位置
        const positionProperty = new Cesium.CallbackPositionProperty(
            (_time, result) => {
                return Cesium.Cartesian3.clone(
                    currentPosition ?? initialPosition,
                    result
                )
            },
            false
        )

        const entityProperties: SimulatedBusEntityProperties = {
            entityType: 'simulated-bus',
            busId: M103_SIMULATED_BUS_CONFIG.id,
            routeFid: M103_SIMULATED_BUS_CONFIG.routeFid,
        }

        busEntity = busDataSource.entities.add({
            id: M103_SIMULATED_BUS_CONFIG.id,
            name: 'M103 模拟车辆',
            position: positionProperty,
            // 将车辆业务元数据挂到 Cesium Entity
            properties: entityProperties,

            point: {
                pixelSize: 18,
                color: Cesium.Color.RED,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        })
    }

    // 读取现有线路并创建一辆模拟车辆
    function load(
        viewerInstance: Cesium.Viewer,
        routeEntitiesByFid: Map<number, Cesium.Entity[]>,
        orderedStops: OrderedBusStop[] = [],
    ) {
        clear()

        viewer = viewerInstance

        loadedRouteEntitiesByFid = routeEntitiesByFid

        loadedRouteStops = orderedStops

        const positions = extractRoutePositions(
            routeEntitiesByFid,
            M103_SIMULATED_BUS_CONFIG.routeFid,
            viewer.clock.currentTime, // 场景的“模拟时间”
        )

        routePath = buildRoutePath(positions)

        if (routePath.totalDistance <= 0) {
            throw new Error('M103 线路长度无效，无法创建模拟车辆')
        }

        mappedRouteStops = mapStopsToRoute(
            routePath,
            orderedStops,
        )

        currentPosition = getPositionAtDistance(routePath, 0)

        ensureBusEntity()

        updateBusState('idle', 0, currentPosition)

        isBusLoaded.value = true
    }

    // 每次 Cesium 时钟跳动时，更新车辆位置
    function handleClockTick(clock: Cesium.Clock) {
        if (!routePath || !currentPosition) return

        const currentTime = clock.currentTime

        if (!lastTickTime) {
            lastTickTime = Cesium.JulianDate.clone(currentTime)

            return
        }

        // JulianDate.secondsDifference 计算两个 Cesium 时间之间的秒数
        // 使用 Cesium 时钟，可以和 Viewer 的时间倍率保持一致
        const deltaSeconds = Cesium.JulianDate.secondsDifference(
            currentTime,
            lastTickTime,
        )

        lastTickTime = Cesium.JulianDate.clone(currentTime)

        if (deltaSeconds <= 0) return

        let nextDistance =
            busState.value.distanceMeters +
            M103_SIMULATED_BUS_CONFIG.speedMetersPerSecond * deltaSeconds

        if (nextDistance >= routePath.totalDistance) {
            if (M103_SIMULATED_BUS_CONFIG.loop) {
                nextDistance = nextDistance % routePath.totalDistance
            } else {
                nextDistance = routePath.totalDistance
                stop()
            }
        }

        currentPosition = getPositionAtDistance(routePath, nextDistance)

        updateBusState(busState.value.status, nextDistance, currentPosition)
    }

    function start() {
        if (!isBusLoaded.value || !viewer || !routePath || !busEntity) {
            return
        }

        // 防止重复点击“开始”后注册多个时钟监听器。
        if (removeClockTickListener) {
            return
        }

        lastTickTime = Cesium.JulianDate.clone(viewer.clock.currentTime)

        updateBusState('running', busState.value.distanceMeters, currentPosition)

        // onTick 会在 Cesium 时钟更新时触发。
        // 车辆动画必须使用它来同步 Cesium 的渲染时间。
        // addEventListener 返回移除监听器的函数。
        removeClockTickListener = viewer.clock.onTick.addEventListener(handleClockTick)
    }

    function stop() {
        // 移除监听器后，车辆会保持在最后一个位置
        removeClockTickListener?.()
        removeClockTickListener = undefined
        lastTickTime = undefined

        if (busState.value.status === 'running') {
            updateBusState('stopped', busState.value.distanceMeters, currentPosition)
        }
    }

    function clear() {
        stop()

        if (busDataSource && viewer && !viewer.isDestroyed()) {
            viewer.dataSources.remove(busDataSource, true)
        }

        busDataSource = undefined
        busEntity = undefined
        routePath = undefined
        mappedRouteStops = undefined
        currentPosition = undefined
        lastTickTime = undefined

        busState.value = createInitialState()

        isBusLoaded.value = false
    }

    // 重新加载车辆，复用已经读取过的线路数据
    function reload() {
        if (
            !viewer ||
            !loadedRouteEntitiesByFid ||
            !loadedRouteStops
        ) {
            return
        }

        load(
            viewer,
            loadedRouteEntitiesByFid,
            loadedRouteStops,
        )
    }

    // 页面卸载时由 TransitMapView 调用
    function cleanup() {
        clear()
        viewer = undefined
        loadedRouteEntitiesByFid = undefined
        loadedRouteStops = undefined
    }

    return {
        busState,
        isBusLoaded,
        load,
        reload,
        start,
        stop,
        clear,
        cleanup,
    }
}
