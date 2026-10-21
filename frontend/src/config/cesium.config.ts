// Cesium 场景配置集中管理，页面和 composable 不直接散落服务地址与渲染参数。
export const CESIUM_CONFIG = {
    // 地形服务：开启法线后，白膜和线路的光照表现更稳定。
    terrain: {
        url: 'https://terrain.reearth.land/cesium-mesh/ellipsoid',
        requestVertexNormals: true,
    },

    // 底图服务地址
    baseMaps: {
        defaultType: 'satellite',
        osmUrl: 'https://tile.openstreetmap.org/',
        satelliteUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    },

    // Viewer 基础选项：业务使用自定义线路信息面板，因此关闭默认 InfoBox。
    viewer: {
        infoBox: false,
        selectionIndicator: false,
        shouldAnimate: true,

        // 关闭 Cesium 自带控件，后续使用项目自己的中文切换按钮。
        baseLayerPicker: false,
        sceneModePicker: false,

        // 默认底图
        baseLayer: false,

        // 城市建筑边缘密集，关闭 4x MSAA 可避免显著的 GPU 多重采样开销。
        msaaSamples: 1,
    },

    // 开发调试开关，发布前可改为 false。
    debugShowFramesPerSecond: true,

    // Re:Earth 城市白膜 3D Tiles 配置。
    whiteModel: {
        url: 'https://buildings.reearth.land/tileset.json',
        maximumScreenSpaceError: 16,
    },

    // 福田行政区 GeoJSON、区外遮罩及边界视觉样式。
    futianBoundary: {
        url: 'test-data/futian-boundary.geojson',
        outsideMask: {
            color: '#0a1c36',
            alpha: 0.76,
            // 遮罩覆盖深圳及周边区域，避免常用视角下看到遮罩边缘。
            bounds: { west: 103.6, south: 12.2, east: 124.8, north: 33.0 },
        },
        outlineWidth: 4,
        outlineGlowPower: 0.14,
    },

} as const
