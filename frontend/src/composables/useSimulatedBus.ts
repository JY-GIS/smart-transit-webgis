import * as Cesium from 'cesium'
import { ref } from 'vue'

import type {
    SimulatedBusConfig,
    SimulatedBusPath,
    SimulatedBusState,
    SimulatedBusStatus,
} from '@/types/simulatedBus'

// 使用 M103 的路线测试
const M103_SIMULATED_BUS_CONFIG: SimulatedBusConfig = {
    id: 'simulated-bus-m103-001',
    routeFid: 185,
    speedMetersPerSecond: 12,
    loop: true,
}

// 创建初始状态
function createInitialState(): SimulatedBusState {
    return {
        id: M103_SIMULATED_BUS_CONFIG.id,
        routeFid: M103_SIMULATED_BUS_CONFIG.routeFid,
        status: 'idle',
        distanceMeters: 0,
        position: undefined,
    }
}

export function useSimulatedBus() {
    const busState = ref<SimulatedBusState>(createInitialState())

    let viewer: Cesium.Viewer | undefined
    let busDataSource: Cesium.CustomDataSource | undefined
    let busEntity: Cesium.Entity | undefined
    let routePath: SimulatedBusPath | undefined
    let currentPosition: Cesium.Cartesian3 | undefined
    let removeClockTickListener:
        | (() => void)
        | undefined
    let lastTickTime: Cesium.JulianDate | undefined

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

    // 计算每一段线路长度以及累计长度
    function buildRoutePath(positions: Cesium.Cartesian3[]): SimulatedBusPath {
        if (positions.length < 2) {
            throw new Error('模拟车辆线路至少需要两个坐标点')
        }

        const segmentLengths: number[] = []
        const cumulativeDistances: number[] = [0]

        for (let index = 0; index < positions.length - 1; index++) {
            const start = positions[index]
            const end = positions[index + 1]

            const segmentLength = Cesium.Cartesian3.distance(start, end)

            segmentLengths.push(segmentLength)

            const previousDistance = cumulativeDistances[cumulativeDistances.length - 1]

            cumulativeDistances.push(previousDistance + segmentLength)
        }

        const totalDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0

        return {
            positions,
            segmentLengths,
            cumulativeDistances,
            totalDistance,
        }
    }

    // 根据已经行驶的距离，计算车辆在 Polyline 上的位置
    function getPositionAtDistance(path: SimulatedBusPath, distanceMeters: number): Cesium.Cartesian3 {
        const distance = Math.max(
            0,
            Math.min(
                distanceMeters,
                path.totalDistance,
            )
        )

        let segmentIndex = path.segmentLengths.length - 1

        for (let i = 0; i < path.segmentLengths.length; i++) {
            const segmentEnd = path.cumulativeDistances[i + 1]

            if (distance <= segmentEnd) {
                segmentIndex = i
                break
            }
        }

        const segmentStartDistance = path.cumulativeDistances[segmentIndex] ?? 0

        const segmentLength = path.segmentLengths[segmentIndex] ?? 0

        const segmentProgress = segmentLength === 0 ? 0 : (distance - segmentStartDistance) / segmentLength

        const start = path.positions[segmentIndex]

        const end = path.positions[segmentIndex + 1]

        // Cartesian3.lerp 在两个三维坐标之间做线性插值
        return Cesium.Cartesian3.lerp(
            start,
            end,
            segmentProgress,
            new Cesium.Cartesian3(),
        )
    }

    function updateBusState(status: SimulatedBusStatus, distanceMeters: number, position: Cesium.Cartesian3 | undefined) {
        busState.value = {
            id: M103_SIMULATED_BUS_CONFIG.id,
            routeFid: M103_SIMULATED_BUS_CONFIG.routeFid,
            status,
            distanceMeters,
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

        busEntity = busDataSource.entities.add({
            id: M103_SIMULATED_BUS_CONFIG.id,
            name: 'M103 模拟车辆',
            position: positionProperty,
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
    function load(viewerInstance: Cesium.Viewer, routeEntitiesByFid: Map<number, Cesium.Entity[]>) {
        clear()

        viewer = viewerInstance

        const positions = extractRoutePositions(
            routeEntitiesByFid,
            M103_SIMULATED_BUS_CONFIG.routeFid,
            viewer.clock.currentTime, // 场景的“模拟时间”
        )

        routePath = buildRoutePath(positions)

        if (routePath.totalDistance <= 0) {
            throw new Error('M103 线路长度无效，无法创建模拟车辆')
        }

        currentPosition = getPositionAtDistance(routePath, 0)

        ensureBusEntity()

        updateBusState('idle', 0, currentPosition)
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
        if (!viewer || !routePath || !busEntity) {
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
        currentPosition = undefined
        lastTickTime = undefined

        busState.value = createInitialState()
    }

    // 页面卸载时由 TransitMapView 调用
    function cleanup() {
        clear()
        viewer = undefined
    }

    return {
        busState,
        load,
        start,
        stop,
        clear,
        cleanup,
    }
}