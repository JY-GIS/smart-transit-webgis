import * as Cesium from 'cesium'
import { hasPlaceCoordinates, type PlaceSearchResult } from '@/types/placeSearch'

/** 单个搜索标记随选择复用，关闭搜索或卸载页面时释放。 */
export function usePlaceSearchLayer(getViewer: () => Cesium.Viewer | undefined) {
    let marker: Cesium.Entity | undefined

    function clear() {
        const viewer = getViewer()
        if (marker && viewer && !viewer.isDestroyed()) {
            viewer.entities.remove(marker)
            viewer.scene.requestRender()
        }
        marker = undefined
    }

    function locate(place: PlaceSearchResult) {
        const viewer = getViewer()
        if (!viewer || viewer.isDestroyed() || !hasPlaceCoordinates(place)) return
        clear()
        const target = Cesium.Cartesian3.fromDegrees(place.longitude, place.latitude)
        marker = viewer.entities.add({
            id: 'place-search-marker',
            name: place.name,
            position: target,
            point: {
                pixelSize: 14,
                color: Cesium.Color.fromCssColorString('#2478ed'),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
                text: place.name,
                font: '14px "Microsoft YaHei", sans-serif',
                fillColor: Cesium.Color.fromCssColorString('#13223a'),
                showBackground: true,
                backgroundColor: Cesium.Color.WHITE.withAlpha(0.95),
                backgroundPadding: new Cesium.Cartesian2(10, 7),
                pixelOffset: new Cesium.Cartesian2(0, -30),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        })
        viewer.trackedEntity = undefined
        viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 1), {
            offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-65), 1600),
            duration: 1.1,
        })
        viewer.scene.requestRender()
    }

    return { locate, clear }
}
