import * as Cesium from 'cesium'
import { CESIUM_CONFIG } from '@/config/cesium.config'

// Viewer 生命周期封装：统一创建 Cesium Viewer、地形和调试设置。
export function useCesiumViewer() {
    // 只在当前页面实例内复用 Viewer，避免重复初始化 WebGL 上下文。
    let viewer: Cesium.Viewer | undefined

    async function createViewer(
        container: HTMLElement,
    ): Promise<Cesium.Viewer> {
        // 热更新或重复挂载时复用未销毁的 Viewer。
        if (viewer && !viewer.isDestroyed()) {
            return viewer
        }

        viewer = new Cesium.Viewer(
            container,
            CESIUM_CONFIG.viewer,
        )

        // 开发阶段保留帧率显示，生产环境可在配置中关闭。
        viewer.scene.debugShowFramesPerSecond =
            CESIUM_CONFIG.debugShowFramesPerSecond

        // 使用统一配置加载地形，白膜和公交线路共用同一场景地形。
        viewer.scene.setTerrain(
            new Cesium.Terrain(
                Cesium.CesiumTerrainProvider.fromUrl(
                    CESIUM_CONFIG.terrain.url,
                    {
                        requestVertexNormals:
                            CESIUM_CONFIG.terrain.requestVertexNormals,
                    },
                ),
            ),
        )

        return viewer
    }

    function destroyViewer() {
        // 销毁 Viewer 会释放 WebGL 资源和内部事件监听。
        if (viewer && !viewer.isDestroyed()) {
            viewer.destroy()
        }

        viewer = undefined
    }

    return {
        createViewer,
        destroyViewer,
    }
}
