import * as Cesium from 'cesium'

export type CityRoadLayerMode = 'local' | 'static'

export interface CityRoadLayerOptions {
    mode?: CityRoadLayerMode
    staticUrlTemplate?: string
    staticMinimumLevel?: number
    staticMaximumLevel?: number
}

const DEFAULT_STATIC_URL_TEMPLATE = '/static/roads/{z}/{x}/{y}.png'

function configuredLayerMode(): CityRoadLayerMode {
    return import.meta.env.VITE_CITY_ROAD_LAYER_MODE === 'static' ? 'static' : 'local'
}

export function useCityRoadWmtsLayer(options: CityRoadLayerOptions = {}) {
    let imageryLayer: Cesium.ImageryLayer | undefined

    const mode = options.mode ?? configuredLayerMode()
    const staticUrlTemplate =
        options.staticUrlTemplate ??
        import.meta.env.VITE_CITY_ROAD_STATIC_URL ??
        DEFAULT_STATIC_URL_TEMPLATE
    const staticMinimumLevel = options.staticMinimumLevel ?? 9
    const staticMaximumLevel = options.staticMaximumLevel ?? 17

    function loadCityRoadWmts(viewer: Cesium.Viewer) {
        if (mode === 'static') {
            const provider = new Cesium.UrlTemplateImageryProvider({
                url: staticUrlTemplate,
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                rectangle: Cesium.Rectangle.fromDegrees(113.9860277, 22.503682, 114.0996825, 22.5888487,),
                minimumLevel: staticMinimumLevel,
                maximumLevel: staticMaximumLevel,
                hasAlphaChannel: true,
                enablePickFeatures: false,
            })

            imageryLayer = viewer.imageryLayers.addImageryProvider(provider)
            console.info(`城市道路静态 XYZ 图层已添加（${staticMinimumLevel}-${staticMaximumLevel}级）`)
            return imageryLayer
        }

        const tileMatrixLabels = Array.from(
            { length: 22 },
            (_, level) => `EPSG:900913:${level}`,
        )

        const provider =
            new Cesium.WebMapTileServiceImageryProvider({
                url: '/geoserver/gwc/service/wmts',
                layer: 'smart_transit:city_roads',
                style: 'smart_transit:city_roads_style',
                format: 'image/png',
                tileMatrixSetID: 'EPSG:900913',
                tileMatrixLabels,
                tilingScheme: new Cesium.WebMercatorTilingScheme(),
                rectangle: Cesium.Rectangle.fromDegrees(113.9860277, 22.503682, 114.0996825, 22.5888487,),
                maximumLevel: 21,
                enablePickFeatures: true,
            })

        imageryLayer = viewer.imageryLayers.addImageryProvider(provider)

        console.info('城市道路 WMTS 图层已添加')

        return imageryLayer
    }

    function cleanupCityRoadWmts(viewer: Cesium.Viewer | undefined) {
        if (imageryLayer && viewer && !viewer.isDestroyed()) {
            viewer.imageryLayers.remove(imageryLayer, true)
        }

        imageryLayer = undefined
    }

    return {
        loadCityRoadWmts,
        cleanupCityRoadWmts,
    }
}