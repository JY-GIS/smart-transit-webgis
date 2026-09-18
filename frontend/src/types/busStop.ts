// 公交站点记录。
// 注意：这里的 stop_id 表示线路站点记录，不是物理公交站唯一编号。
export interface BusStopRecord {
    stop_id: string

    stop_name: string

    longitude: number

    latitude: number
}

// 线路与站点之间的关系记录。
export interface BusRouteStopRelation {
    route_id: string

    stop_id: string

    // 当前线路中的站序，必须是数字
    stop_sequence: number
}

// 专门提供给车辆站点进度计算使用
export interface OrderedBusStop {
    routeId: string

    stopId: string
    stopName: string

    longitude: number
    latitude: number

    stopSequence: number
}

// 后端附近公交站查询结果
export interface NearbyBusStopRecord {
    stopId: string
    stopName: string

    longitude: number
    latitude: number

    distanceMeters: number
}

// 附近公交站 Cesium 地图上的查询中心
export interface NearbyQueryCenter {
    longitude: number
    latitude: number
}

// 附近查询的状态
export type NearbyQueryStatus =
    | 'idle'
    | 'loading'
    | 'success'
    | 'empty'
    | 'error'