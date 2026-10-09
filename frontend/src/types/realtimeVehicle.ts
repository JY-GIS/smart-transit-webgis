/**
 * 实时车辆在地图上的渲染方式。
 */
export type RealtimeVehicleRenderMode =
    | 'point'
    | 'model'
    | 'auto'

/**
 * 自动LOD模式下一辆车当前采用的表现形式。
 */
export type RealtimeVehicleLodRepresentation =
    | 'point'
    | 'model'

/**
 * 一个实时车辆地理聚合网格。
 */
export interface RealtimeVehicleGridCell {
    // 网格身份
    gridKey: string
    column: number
    row: number

    vehicleCount: number

    westLongitude: number
    southLatitude: number
    eastLongitude: number
    northLatitude: number
    centerLongitude: number
    centerLatitude: number
}

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
 * 后端模拟车辆运动状态。
 */
export type RealtimeVehicleMotionStatus =
    | 'CRUISING'
    | 'APPROACHING'
    | 'DWELLING'

/**
 * 后端计算出的公交运营间隔状态。
 */
export type RealtimeVehicleOperationalStatus =
    | 'NORMAL'
    | 'BUNCHING'
    | 'LARGE_GAP'

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

    motionStatus: RealtimeVehicleMotionStatus

    currentSpeedMetersPerSecond: number

    frontVehicleId: string | null

    distanceToFrontVehicleMeters: number | null

    referenceHeadwayMeters: number

    operationalStatus: RealtimeVehicleOperationalStatus

    previousStop: RealtimeVehicleStopSnapshot | null

    nextStop: RealtimeVehicleStopSnapshot | null

    distanceToNextStopMeters: number | null
}

/**
 * 挂载到实时车辆可视对象上的拾取属性。
 */
export interface RealtimeVehiclePickProperties {
    entityType: 'realtime-vehicle'

    vehicleId: string

    routeFid: number
}

/**
 * 兼容现有 Entity 车辆图层的旧类型名称。
 */
export type RealtimeVehicleEntityProperties = RealtimeVehiclePickProperties