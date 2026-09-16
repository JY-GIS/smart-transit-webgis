import type * as Cesium from 'cesium'

// 限制状态只能是这三个字符串 (TypeScript)
export type SimulatedBusStatus =
    | 'idle'
    | 'running'
    | 'stopped'

// 模拟车辆位置
export interface SimulatedBusConfig {
    id: string

    routeFid: number

    /**
     * 线路站点关系数据中的线路编号。
     *
     * routeFid 用于线路 GeoJSON
     * routeId 用于 route_stops.json
     */
    routeId: string

    speedMetersPerSecond: number

    // 是否到达终点后重新从起点开始。
    loop: boolean
}

// 车辆实时状态中使用的站点快照和业务状态需要的信息
export interface SimulatedBusStopSnapshot {
    stopId: string
    stopName: string
    stopSequence: number

    // 该站点在线路起点方向上的累计里程
    distanceAlongRouteMeters: number
}

/**
 * 线路加载阶段生成的站点映射结果
 *
 * 它比 SimulatedBusStopSnapshot 多出：
 * - 原始经纬度
 * - 投影到的路径线段
 * - 投影误差
 */
export interface SimulatedBusRouteStop extends SimulatedBusStopSnapshot {
    longitude: number
    latitude: number

    // 站点投影到线路后的偏移距离
    snapOffsetMeters: number

    // 站点落在哪一条路径线段上
    pathSegmentIndex: number

    // 站点在线段内部的比例，范围通常为 0 到 1
    segmentFraction: number
}

// 模拟车辆当前状态
export interface SimulatedBusState {
    id: string

    routeFid: number

    routeId: string

    // 当前车辆状态：未开始、运行中、已停止
    status: SimulatedBusStatus

    // 当前已经走过的路径距离
    distanceMeters: number

    // 当前线路的总长度
    totalDistanceMeters: number

    // 最近已经经过的站点
    previousStop: SimulatedBusStopSnapshot | null

    // 沿当前运行方向即将到达的站点
    nextStop: SimulatedBusStopSnapshot | null

    // 距离下一站的线路距离
    distanceToNextStopMeters: number | null

    // 当前线路运行进度，范围为 0 到 100
    routeProgressPercent: number

    position: Cesium.Cartesian3 | undefined
}

// 预处理后的线路路径
export interface SimulatedBusPath {
    // Polyline 中的所有 Cesium 三维坐标点
    positions: Cesium.Cartesian3[]

    // 每两个相邻坐标点之间的距离
    segmentLengths: number[]

    // 从起点到每个坐标点的累计距离
    cumulativeDistances: number[]

    // 整条线路的总长度
    totalDistance: number
}

// Entity 被点击后，使用 entityType 区分“模拟车辆”和“公交线路”
export interface SimulatedBusEntityProperties {
    // 固定字符串用于区分不同类型的 Cesium 业务对象
    entityType: 'simulated-bus'

    // 车辆业务唯一标识
    busId: string

    // 车辆所属的具体公交线路，与 routeEntitiesByFid 的 key 对应
    routeFid: number
}