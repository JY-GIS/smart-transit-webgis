import { ref } from 'vue'
import * as Cesium from 'cesium'

import { CESIUM_CONFIG } from '@/config/cesium.config'

export type BaseMapType = 'osm' | 'satellite'

export type SceneDimension = '2d' | '3d'

/**
 * 管理卫星、OSM底图切换和二维、三维场景转换。
 */
export function useMapDisplay() {
    const activeBaseMap = ref<BaseMapType>(CESIUM_CONFIG.baseMaps.defaultType)

    const sceneDimension = ref<SceneDimension>('3d')

    let baseMapLayer: Cesium.ImageryLayer | undefined

    // 根据底图类型创建对应的Cesium影像提供者
    async function createBaseMapProvider(type: BaseMapType): Promise<Cesium.ImageryProvider> {
        if (type === 'osm') {
            return new Cesium.OpenStreetMapImageryProvider({
                url: CESIUM_CONFIG.baseMaps.osmUrl,
                credit: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            })
        }

        return Cesium.ArcGisMapServerImageryProvider.fromUrl(CESIUM_CONFIG.baseMaps.satelliteUrl)
    }

    // 创建目标底图并放到最底层，然后只删除当前底图
    async function setBaseMap(viewer: Cesium.Viewer, type: BaseMapType) {
        if (baseMapLayer && activeBaseMap.value === type) {
            return
        }

        const imageryProvider = await createBaseMapProvider(type)

        if (viewer.isDestroyed()) {
            return
        }

        const nextBaseMapLayer = viewer.imageryLayers.addImageryProvider(
            imageryProvider,
            0,
        )

        if (baseMapLayer) {
            viewer.imageryLayers.remove(baseMapLayer, true)
        }

        baseMapLayer = nextBaseMapLayer
        activeBaseMap.value = type
    }

    // 初始化地图时加载配置中指定的默认卫星底图
    async function initializeBaseMap(viewer: Cesium.Viewer) {
        await setBaseMap(viewer, CESIUM_CONFIG.baseMaps.defaultType)
    }

    async function toggleBaseMap(viewer: Cesium.Viewer) {
        const nextBaseMap: BaseMapType =
            activeBaseMap.value === 'satellite'
                ? 'osm'
                : 'satellite'

        await setBaseMap(viewer, nextBaseMap)
    }

    function toggleSceneDimension(viewer: Cesium.Viewer) {
        if (sceneDimension.value === '3d') {
            sceneDimension.value = '2d'
            viewer.scene.morphTo2D(1)
            return
        }

        sceneDimension.value = '3d'
        viewer.scene.morphTo3D(1)
    }

    return {
        activeBaseMap,
        sceneDimension,
        initializeBaseMap,
        toggleBaseMap,
        toggleSceneDimension,
    }
}