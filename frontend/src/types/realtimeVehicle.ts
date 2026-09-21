/**
 * 后端车辆实时连接状态。
 */
export type RealtimeVehicleConnectionStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'disconnected'
    | 'error'

/**
 * 车辆已经经过或即将到达的站点快照。
 *（字段与后端 VehicleStopSnapshot record 对应）
 */
export interface RealtimeVehicleStopSnapshot {
    stopId: string

    stopName: string

    stopSequence: number

    distanceAlongRouteMeters: number
}

/**
 * 后端推送的一辆车辆位置快照。
 *（字段与后端 VehiclePositionSnapshot record 对应）
 */
export interface RealtimeVehiclePositionSnapshot {
    vehicleId: string

    routeId: string

    routeFid: number

    longitude: number

    latitude: number

    distanceMeters: number

    totalDistanceMeters: number

    routeProgressPercent: number

    previousStop: RealtimeVehicleStopSnapshot | null

    nextStop: RealtimeVehicleStopSnapshot | null

    distanceToNextStopMeters: number | null
}
