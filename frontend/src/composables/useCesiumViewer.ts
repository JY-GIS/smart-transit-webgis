import * as Cesium from 'cesium'
import { CESIUM_CONFIG } from '@/config/cesium.config'

// Viewer 生命周期封装：统一创建 Cesium Viewer、地形和调试设置。
export function useCesiumViewer() {
    // 只在当前页面实例内复用 Viewer，避免重复初始化 WebGL 上下文。
    let viewer: Cesium.Viewer | undefined

    let cancelInitialGlobeTilesWait:
        | (() => void)
        | undefined
    // 在真实地形和椭球平面之间切换；页面默认启用真实地形。
    function setTerrainEnabled(
        currentViewer: Cesium.Viewer,
        enabled: boolean,
    ) {
        const terrainProviderPromise: Promise<Cesium.TerrainProvider> = enabled
            ? Cesium.CesiumTerrainProvider.fromUrl(
                CESIUM_CONFIG.terrain.url,
                {
                    requestVertexNormals:
                        CESIUM_CONFIG.terrain.requestVertexNormals,
                },
            )
            : Promise.resolve(new Cesium.EllipsoidTerrainProvider())

        currentViewer.scene.setTerrain(
            new Cesium.Terrain(terrainProviderPromise),
        )
        currentViewer.scene.requestRender()
    }

    function waitForInitialGlobeTiles(
        currentViewer: Cesium.Viewer,
        timeoutMilliseconds = 15000,
    ): Promise<boolean> {
        cancelInitialGlobeTilesWait?.()

        return new Promise((resolve) => {
            let finished = false
            let stableFrameCount = 0
            let timeoutId: number | undefined
            let removePostRenderListener:
                | (() => void)
                | undefined

            const finish = (loaded: boolean) => {
                if (finished) return

                finished = true
                removePostRenderListener?.()

                if (timeoutId !== undefined) {
                    window.clearTimeout(timeoutId)
                }

                cancelInitialGlobeTilesWait = undefined
                resolve(loaded)
            }

            removePostRenderListener = currentViewer.scene.postRender.addEventListener(() => {
                if (currentViewer.isDestroyed()) {
                    finish(false)
                    return
                }

                if (currentViewer.scene.globe.tilesLoaded) {
                    stableFrameCount += 1
                } else {
                    stableFrameCount = 0
                }

                // 连续两帧加载队列都为空，避免在请求尚未入队时过早完成。
                if (stableFrameCount >= 2) {
                    finish(true)
                }
            })

            timeoutId = window.setTimeout(() => {
                finish(false)
            }, timeoutMilliseconds)
        })
    }

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
        setTerrainEnabled(viewer, true)

        return viewer
    }

    function destroyViewer() {
        cancelInitialGlobeTilesWait?.()
        cancelInitialGlobeTilesWait = undefined

        // 销毁 Viewer 会释放 WebGL 资源和内部事件监听。
        if (viewer && !viewer.isDestroyed()) {
            viewer.destroy()
        }

        viewer = undefined
    }

    return {
        createViewer,
        destroyViewer,
        setTerrainEnabled,
        waitForInitialGlobeTiles,
    }
}
