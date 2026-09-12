// 公交业务配置集中管理，后续更换数据源或调整线路样式时只改这里。
export const TRANSIT_CONFIG = {
    // Vite public 目录下的公交线路 GeoJSON。
    routesUrl: 'test-data/futian-bus-routes.geojson',

    // 公交站点记录数据。
    stopsUrl: 'data/transit/stops.json',

    // 线路—站点关系数据。
    routeStopsUrl: 'data/transit/route_stops.json',

    // 原始线路样式；选中线路的临时高亮样式在 useBusRouteSelection 中处理。
    routeStyle: {
        strokeWidth: 2,
        strokeAlpha: 0.95,
        clampToGround: false,
    },
} as const
