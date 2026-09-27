import type { RealtimeVehicleMotionStatus } from '@/types/realtimeVehicle'

/**
 * 一辆车辆相对于用户所查询站点的到站状态。
 *（ 与后端 StopArrivalStatus 枚举值一致 ）
 */
export type StopArrivalStatus =
    | 'AT_STOP'
    | 'APPROACHING'
    | 'IN_TRANSIT'

/**
 * 到站接口当前所处的查询阶段。
 */
export type StopArrivalQueryStatus =
    | 'idle'    // 尚未选择站点
    | 'loading' // 正在请求
    | 'success' // 请求成功并且存在车辆
    | 'empty'   // 请求成功，但没有车辆
    | 'error'   // 请求或后端业务校验失败

/**
 * 一辆车辆到达目标站点的预测结果。
 */
export interface StopArrivalPrediction {
    vehicleId: string
    etaSeconds: number
    predictedArrivalAt: string
    distanceToStopMeters: number
    stopsAway: number
    arrivalStatus: StopArrivalStatus
    motionStatus: RealtimeVehicleMotionStatus
    snapshotUpdatedAt: string
}

/**
 * 一个“线路站点”的完整到站牌。
 */
export interface StopArrivalBoard {
    routeId: string
    routeName: string
    stopId: string
    stopName: string
    stopSequence: number
    generatedAt: string
    arrivals: StopArrivalPrediction[]
}

/**
 * 前端发起一次到站查询时需要的参数。
 */
export interface StopArrivalQuery {
    routeId: string
    stopId: string
    limit?: number
}