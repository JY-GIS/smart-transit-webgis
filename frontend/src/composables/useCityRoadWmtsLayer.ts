import * as Cesium from 'cesium'

export function useCityRoadWmtsLayer() {
    let imageryLayer: Cesium.ImageryLayer | undefined

    function loadCityRoadWmts(viewer: Cesium.Viewer) {
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

                rectangle: Cesium.Rectangle.fromDegrees(
                    113.9860277,
                    22.503682,
                    114.0996825,
                    22.5888487,
                ),

                maximumLevel: 21,

                enablePickFeatures: true,
            })

        imageryLayer = viewer.imageryLayers.addImageryProvider(provider)

        console.info('城市道路 WMTS 图层加载完成')

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