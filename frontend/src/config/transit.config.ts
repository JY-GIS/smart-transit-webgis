// 公交业务配置集中管理，后续更换数据源或调整线路样式时只改这里。
export const TRANSIT_CONFIG = {
    routesUrl: '/api/routes/geojson',

    // 公交站点记录数据。
    stopsUrl: '/api/stops',

    // 附近公交站查询接口。
    nearbyStopsUrl: '/api/stops/nearby',

    // 附近查询参数配置。
    nearbyQuery: {
        defaultRadiusMeters: 500,

        // 限制请求范围
        maxRadiusMeters: 5000,
    },

    // 线路—站点关系数据。
    routeStopsUrl: '/api/route-stops',

    // 原始线路样式；选中线路的临时高亮样式在 useBusRouteSelection 中处理。
    routeStyle: {
        strokeWidth: 2,
        strokeAlpha: 0.95,
        clampToGround: false,
    },

    // 后端实时车辆 STOMP 配置
    realtimeVehicles: {
        // WebSocket 最初建立连接时使用的握手路径。
        webSocketPath: '/ws',

        // 连接成功后订阅的车辆位置主题。
        topic: '/topic/vehicles',

        // 连接意外断开后等待 5 秒重连。
        reconnectDelayMilliseconds: 5000,
    },

} as const
