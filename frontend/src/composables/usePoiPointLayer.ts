import * as Cesium from 'cesium'

import {
    DEFAULT_POI_TYPE_VISIBILITY,
    POI_CATEGORY_CONFIG,
    POI_CATEGORY_ORDER,
} from '@/config/poi.config'
import type {
    NearbyPoiRecord,
    PoiType,
    PoiTypeVisibility,
} from '@/types/poi'

// 使用六个PointPrimitiveCollection绘制和控制POI分类点位
export function usePoiPointLayer() {
    const collections = new Map<PoiType, Cesium.PointPrimitiveCollection>()

    let pointsVisible = true

    let typeVisibility: PoiTypeVisibility = {
        ...DEFAULT_POI_TYPE_VISIBILITY,
    }

    function ensureCollections(viewer: Cesium.Viewer) {
        if (collections.size > 0 || viewer.isDestroyed()) {
            return
        }

        for (const poiType of POI_CATEGORY_ORDER) {
            const collection = viewer.scene.primitives.add(
                new Cesium.PointPrimitiveCollection(),
            )

            collections.set(poiType, collection)
        }

        applyVisibility()
    }

    /**
     * 根据总开关和分类开关更新六个点集合的显示状态。
     */
    function applyVisibility() {
        for (const poiType of POI_CATEGORY_ORDER) {
            const collection = collections.get(poiType)

            if (collection) {
                collection.show = pointsVisible && typeVisibility[poiType]
            }
        }
    }

    function clearPoints() {
        for (const collection of collections.values()) {
            collection.removeAll()
        }
    }

    /**
     * 按POI分类把明细数据写入对应的点集合。
     */
    function renderPoints(viewer: Cesium.Viewer, pois: NearbyPoiRecord[]) {
        if (viewer.isDestroyed()) {
            return
        }

        ensureCollections(viewer)
        clearPoints()

        for (const poi of pois) {
            const collection = collections.get(poi.poiType)
            const category = POI_CATEGORY_CONFIG[poi.poiType]

            if (!collection) {
                continue
            }

            collection.add({
                id: poi,
                position: Cesium.Cartesian3.fromDegrees(poi.longitude, poi.latitude),
                pixelSize: 5,
                color: Cesium.Color.fromCssColorString(category.color),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            })
        }

        applyVisibility()
    }

    // 控制全部POI点位是否显示
    function setPointsVisible(visible: boolean) {
        pointsVisible = visible
        applyVisibility()
    }

    // 控制指定分类的POI点位是否显示
    function setTypeVisible(poiType: PoiType, visible: boolean) {
        typeVisibility = {
            ...typeVisibility,
            [poiType]: visible,
        }

        applyVisibility()
    }

    // 一次更新六类POI的显示状态
    function setTypeVisibility(visibility: PoiTypeVisibility) {
        typeVisibility = {
            ...visibility,
        }

        applyVisibility()
    }

    // 页面卸载时从Cesium场景移除全部POI集合。
    function cleanup(viewer?: Cesium.Viewer) {
        if (viewer && !viewer.isDestroyed()) {
            for (const collection of collections.values()) {
                viewer.scene.primitives.remove(collection)
            }
        }

        collections.clear()
        pointsVisible = true
        typeVisibility = {
            ...DEFAULT_POI_TYPE_VISIBILITY,
        }
    }

    return {
        renderPoints,
        clearPoints,
        setPointsVisible,
        setTypeVisible,
        setTypeVisibility,
        cleanup,
    }
}