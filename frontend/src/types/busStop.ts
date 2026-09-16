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