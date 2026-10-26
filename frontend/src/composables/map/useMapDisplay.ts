import { ref } from 'vue'
import * as Cesium from 'cesium'

import { CESIUM_CONFIG } from '@/config/cesium.config'

export type BaseMapType = 'osm' | 'satellite'

export type SceneDimension = '2d' | '3d'

// 保存切换前的地图中心、观察距离和朝向
interface SceneViewState {
    target: Cesium.Cartesian3
    range: number
    heading: number
}

/**
 * 管理卫星、OSM底图切换和二维、三维场景转换。
 */
export function useMapDisplay() {
    const activeBaseMap = ref<BaseMapType>(CESIUM_CONFIG.baseMaps.defaultType)

    const sceneDimension = ref<SceneDimension>('3d')

    let baseMapLayer: Cesium.ImageryLayer | undefined

    // 切回三维时恢复用户离开三维场景前的倾斜角度
    let last3DPitch = Cesium.Math.toRadians(-45)

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

    // 读取屏幕中心对应的地理位置和当前观察距离。
    function captureSceneView(viewer: Cesium.Viewer): SceneViewState | undefined {
        const { camera, canvas, globe, mode } = viewer.scene
        const screenCenter = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)

        // pickEllipsoid 屏幕像素位置转换成地球表面的三维坐标。
        const target = camera.pickEllipsoid(screenCenter, globe.ellipsoid)

        if (!target) return undefined

        const range = mode === Cesium.SceneMode.SCENE2D
            ? camera.positionCartographic.height
            : Cesium.Cartesian3.distance(camera.positionWC, target)

        return {
            target: Cesium.Cartesian3.clone(target),
            range,
            heading: camera.heading,
        }
    }

    // 场景切换结束后，重新对准切换前的地图中心
    function restoreSceneView(
        viewer: Cesium.Viewer,
        viewState: SceneViewState,
        targetDimension: SceneDimension,
    ) {
        const pitch = targetDimension === '2d' ? -Cesium.Math.PI_OVER_TWO : last3DPitch

        viewer.camera.lookAt(
            viewState.target,
            new Cesium.HeadingPitchRange(
                viewState.heading,
                pitch,
                viewState.range,
            ),
        )

        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
        viewer.scene.requestRender()
    }

    // 在二维和三维之间切换，并在完成后恢复地图中心和观察范围
    function toggleSceneDimension(viewer: Cesium.Viewer) {
        const { scene } = viewer

        // SceneMode.MORPHING 表示 Cesium 正在执行二维/三维过渡。
        // 过渡期间忽略重复点击，防止两个转换动画互相打断
        if (scene.mode === Cesium.SceneMode.MORPHING) {
            return
        }

        const viewState = captureSceneView(viewer)

        if (!viewState) return

        const targetDimension: SceneDimension = sceneDimension.value === '3d' ? '2d' : '3d'

        if (sceneDimension.value === '3d') {
            last3DPitch = viewer.camera.pitch
        }

        // 监听morphComplete，等投影切换结束后恢复相机
        const removeMorphCompleteListener = scene.morphComplete.addEventListener(() => {
            removeMorphCompleteListener()
            restoreSceneView(viewer, viewState, targetDimension)
            sceneDimension.value = targetDimension
        })

        if (targetDimension === '2d') {
            scene.morphTo2D(0)
            return
        }

        scene.morphTo3D(0)
    }

    return {
        activeBaseMap,
        sceneDimension,
        initializeBaseMap,
        toggleBaseMap,
        toggleSceneDimension,
    }
}