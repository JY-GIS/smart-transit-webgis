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

    // POI 服务范围分析配置。
    poiAnalysis: {
        summaryUrl: '/api/pois/summary',

        // 指定范围内的完整POI点位接口。
        nearbyUrl: '/api/pois/nearby',

        // 默认分析公交站点周边500米。
        defaultRadiusMeters: 500,

        // 0米只用于前端清空当前结果，不会请求后端。
        minRadiusMeters: 0,

        // 与后端PoiController的最大半径保持一致。
        maxRadiusMeters: 1000,

        // 滑动条每次最小变化1米。
        radiusStepMeters: 1,

        // 滑动条下方提供常用半径快捷值。
        radiusPresets: [300, 500, 800],
    },

    // 线路—站点关系数据。
    routeStopsUrl: '/api/route-stops',

    // 指定线路、指定站点的到站查询。
    stopArrivals: {
        // 最终请求格式：/api/stops/{stopId}/arrivals?routeId=xxx&limit=3
        baseUrl: '/api/stops',
        defaultLimit: 3,
        maximumLimit: 10,
        // 到站面板自动刷新间隔
        refreshIntervalMilliseconds: 2000,
    },

    // 车辆历史轨迹查询配置
    vehicleHistory: {
        // 后端历史轨迹接口统一前缀
        baseUrl: '/api/vehicles/history',

        // 打开面板时默认查询最近30分钟
        defaultQueryRangeMinutes: 30,

        // 前端先限制一次，方便立即提示用户。后端仍然会再次校验，后端限制才是最终安全边界。
        maximumQueryRangeMinutes: 120,

        // 相邻轨迹点超过15秒时，认为中间发生了数据中断
        maximumContinuousGapSeconds: 15,

        // 历史回放支持的播放倍速
        playbackSpeeds: [1, 2, 5, 10],
    },

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

        // 两次服务端位置快照之间的客户端插值时间。
        interpolationDurationMilliseconds: 1000,

        // 实时车辆三维模型配置。
        model: {
            uri: '/models/city_bus.glb',

            // 模型原始尺寸的缩放倍数，后续根据实际画面调整。
            scale: 0.01,

            // 模型距离较远时仍至少保持一定的屏幕像素尺寸。
            minimumPixelSize: 0,

            // 限制 minimumPixelSize 可以把模型放大的最大倍数。
            maximumScale: 0.01,

            // 模型相对地面的高度，车轮陷入地面时再向上调整。
            heightOffsetMeters: 0,

            // 模型车头朝向
            headingOffsetDegrees: 90,

            // 把模型原点移动到车底中心
            originCorrection: {
                nodeName: 'cityBus',
                x: -2661.124,
                y: -7.355,
                z: -290.282,
            },
        },
    },

} as const
