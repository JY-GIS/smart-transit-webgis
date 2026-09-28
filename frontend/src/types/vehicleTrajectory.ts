import type {
    RealtimeVehicleMotionStatus,
    RealtimeVehicleOperationalStatus,
} from '@/types/realtimeVehicle'

/**
 * 历史数据请求当前所处的阶段。
 */
export type VehicleHistoryQueryStatus =
    | 'idle'
    | 'loading'
    | 'success'
    | 'empty'
    | 'error'

/**
 * 一辆拥有历史数据、可以进行回放的车辆。
 *
 * 字段与后端VehicleHistoryAvailability对应。
 */
export interface VehicleHistoryAvailability {
    vehicleId: string
    routeId: string
    routeFid: number
    routeName: string
    firstRecordedAt: string
    lastRecordedAt: string
    pointCount: number
}

/**
 * 历史轨迹中的一个位置点。
 */
export interface VehicleTrajectoryPoint {
    recordedAt: string

    longitude: number
    latitude: number

    distanceMeters: number
    totalDistanceMeters: number
    routeProgressPercent: number

    speedMetersPerSecond: number

    motionStatus: RealtimeVehicleMotionStatus
    operationalStatus: RealtimeVehicleOperationalStatus
}

/**
 * 一次完整的单车轨迹查询结果。
 *
 * 字段与后端VehicleTrajectory对应。
 */
export interface VehicleTrajectory {
    vehicleId: string

    startTime: string
    endTime: string

    pointCount: number

    averageSpeedMetersPerSecond: number
    maximumSpeedMetersPerSecond: number

    points: VehicleTrajectoryPoint[]
}

/**
 * 前端发起一次轨迹查询时需要的参数。
 */
export interface VehicleTrajectoryQuery {
    vehicleId: string
    startTime: Date
    endTime: Date
}