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

    speedMetersPerSecond: number

    // 是否到达终点后重新从起点开始。
    loop: boolean
}

// 模拟车辆当前状态
export interface SimulatedBusState {
    id: string

    routeFid: number

    // 当前车辆状态：未开始、运行中、已停止
    status: SimulatedBusStatus

    // 当前已经走过的路径距离
    distanceMeters: number

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