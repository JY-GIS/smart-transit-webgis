// Cesium 场景配置集中管理，页面和 composable 不直接散落服务地址与渲染参数。
export const CESIUM_CONFIG = {
    // 地形服务：开启法线后，白膜和线路的光照表现更稳定。
    terrain: {
        url: 'https://terrain.reearth.land/cesium-mesh/ellipsoid',
        requestVertexNormals: true,
    },

    // Viewer 基础选项：业务使用自定义线路信息面板，因此关闭默认 InfoBox。
    viewer: {
        infoBox: false,
        selectionIndicator: false,
    },

    // 开发调试开关，发布前可改为 false。
    debugShowFramesPerSecond: true,

    // Re:Earth 城市白膜 3D Tiles 配置。
    whiteModel: {
        url: 'https://buildings.reearth.land/tileset.json',
        maximumScreenSpaceError: 16,
    },

    // 福田行政区 GeoJSON 及边界视觉样式。
    futianBoundary: {
        url: 'test-data/futian-boundary.geojson',
        fillAlpha: 0.07,
        outlineWidth: 8,
        outlineGlowPower: 0.2,
    },

} as const
