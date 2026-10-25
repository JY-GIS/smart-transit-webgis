import { ref, watch } from 'vue'
import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import { useNearbyBusStops } from '@/composables/spatial-analysis/useNearbyBusStops'
import { usePoiAnalysis } from '@/composables/spatial-analysis/usePoiAnalysis'
import { usePoiPointLayer } from '@/composables/spatial-analysis/usePoiPointLayer'

import type { NearbyQueryCenter } from '@/types/busStop'

interface UseNearbyAnalysisControllerOptions {
    getViewer: () => Cesium.Viewer | undefined
}

/**
 * 组合附近公交站、POI统计和POI点图层，统一处理地图周边分析。
 */
export function useNearbyAnalysisController(
    options: UseNearbyAnalysisControllerOptions,
) {
    const {
        getViewer,
    } = options

    const enabled = ref(false)

    const selectedRadiusMeters = ref<number>(
        TRANSIT_CONFIG.poiAnalysis.defaultRadiusMeters,
    )

    const {
        nearbyStops,
        queryRadiusMeters: nearbyRadiusMeters,
        queryStatus: nearbyStatus,
        errorMessage: nearbyErrorMessage,
        queryNearby,
        clearNearbyQuery,
        cleanup: cleanupNearbyBusStops,
    } = useNearbyBusStops()

    const {
        summary: poiSummary,
        nearbyPois,
        queryCenter: poiQueryCenter,
        queryStatus: poiStatus,
        errorMessage: poiErrorMessage,
        pointsVisible: poiPointsVisible,
        typeVisibility: poiTypeVisibility,
        queryAnalysis,
        setZeroRadius,
        setPointsVisible: setPoiPointsVisible,
        focusType: focusPoiType,
        clearAnalysis,
        cleanup: cleanupPoiAnalysis,
    } = usePoiAnalysis()

    const {
        renderPoints: renderPoiPoints,
        clearPoints: clearPoiPoints,
        setPointsVisible: setPoiLayerVisible,
        setTypeVisibility: setPoiLayerTypeVisibility,
        cleanup: cleanupPoiPointLayer,
    } = usePoiPointLayer()

    // 清空附近站点、POI统计和地图点位，并退出周边查询模式
    function clear() {
        enabled.value = false
        selectedRadiusMeters.value =
            TRANSIT_CONFIG.poiAnalysis.defaultRadiusMeters

        clearNearbyQuery()
        clearAnalysis()
        clearPoiPoints()
    }

    // 开启周边查询模式；再次调用时关闭并清空查询
    function toggle() {
        if (enabled.value) {
            clear()
            return
        }

        clearNearbyQuery()
        clearAnalysis()
        clearPoiPoints()

        enabled.value = true
    }

    // 使用同一中心和半径同时查询附近站点和POI
    function runAnalysis(
        viewer: Cesium.Viewer,
        center: NearbyQueryCenter,
    ) {
        const radiusMeters = selectedRadiusMeters.value

        if (radiusMeters === 0) {
            clearNearbyQuery()
            setZeroRadius(center)
            clearPoiPoints()
            return
        }

        void queryNearby(viewer, center, radiusMeters)
        void queryAnalysis(center, radiusMeters)
    }

    // 拖动半径滑动条时只更新当前显示值
    function setRadiusInput(radiusMeters: number) {
        selectedRadiusMeters.value = radiusMeters
    }

    // 半径确认改变后，围绕上一次点击中心重新查询
    function changeRadius(radiusMeters: number) {
        selectedRadiusMeters.value = radiusMeters

        const center = poiQueryCenter.value
        const viewer = getViewer()

        if (
            !center ||
            !viewer ||
            viewer.isDestroyed()
        ) {
            return
        }

        runAnalysis(viewer, center)
    }

    // 将Cesium屏幕点击坐标转换成地球表面的经纬度
    function getClickCenter(
        viewer: Cesium.Viewer,
        clickPosition: Cesium.Cartesian2,
    ): NearbyQueryCenter | null {
        const ray = viewer.camera.getPickRay(clickPosition)

        if (!ray) {
            return null
        }

        const cartesian =
            viewer.scene.globe.pick(
                ray,
                viewer.scene,
            ) ??
            viewer.camera.pickEllipsoid(
                clickPosition,
                viewer.scene.globe.ellipsoid,
            )

        if (!cartesian) {
            return null
        }

        const cartographic =
            Cesium.Cartographic.fromCartesian(cartesian)

        return {
            longitude: Cesium.Math.toDegrees(cartographic.longitude),
            latitude: Cesium.Math.toDegrees(cartographic.latitude),
        }
    }

    // 在周边查询模式中处理地图空白位置点击
    function handleMapClick(clickPosition: Cesium.Cartesian2) {
        if (!enabled.value) {
            return
        }

        const viewer = getViewer()

        if (!viewer || viewer.isDestroyed()) {
            return
        }

        const center = getClickCenter(viewer, clickPosition)

        if (!center) {
            clearNearbyQuery()
            clearAnalysis()
            clearPoiPoints()
            return
        }

        runAnalysis(viewer, center)
    }

    // 页面卸载时取消请求，并释放站点和POI图层
    function cleanup() {
        const viewer = getViewer()

        cleanupNearbyBusStops(viewer)
        cleanupPoiAnalysis()
        cleanupPoiPointLayer(viewer)

        enabled.value = false
        selectedRadiusMeters.value =
            TRANSIT_CONFIG.poiAnalysis.defaultRadiusMeters
    }

    watch(nearbyPois, (pois) => {
        const viewer = getViewer()

        if (!viewer || viewer.isDestroyed()) {
            return
        }

        if (pois.length === 0) {
            clearPoiPoints()
            return
        }

        renderPoiPoints(viewer, pois)
    })

    watch(poiPointsVisible, (visible) => {
        setPoiLayerVisible(visible)
    })

    watch(poiTypeVisibility, (visibility) => {
        setPoiLayerTypeVisibility(visibility)
    })

    return {
        enabled,
        selectedRadiusMeters,

        nearbyStops,
        nearbyRadiusMeters,
        nearbyStatus,
        nearbyErrorMessage,

        poiSummary,
        poiStatus,
        poiErrorMessage,
        poiPointsVisible,
        poiTypeVisibility,

        clear,
        toggle,
        setRadiusInput,
        changeRadius,
        handleMapClick,
        setPoiPointsVisible,
        focusPoiType,
        cleanup,
    }
}
