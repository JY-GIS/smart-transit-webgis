import * as Cesium from 'cesium'
import { ref } from 'vue'
import { CESIUM_CONFIG } from '@/config/cesium.config'
import facadeWindowsShaderSource from '@/shaders/whiteModel/facadeWindows.glsl?raw'
import facadeWindowsVertexShaderSource from '@/shaders/whiteModel/facadeWindowsVertex.glsl?raw'

// 白膜图层封装：负责加载 Re:Earth 3D Tiles 和监听瓦片状态。
export function useWhiteModelLayer() {
    // 保存 tileset 及事件移除函数，支持重复调用和页面卸载清理。
    let tileset: Cesium.Cesium3DTileset | undefined
    let nightWindowsShader: Cesium.CustomShader | undefined
    const whiteModelVisible = ref(false)

    let removeNightWindowsPreRenderListener:
        | (() => void)
        | undefined

    let removeAllTilesLoadedListener:
        | (() => void)
        | undefined

    let removeTileFailedListener:
        | (() => void)
        | undefined

    // 创建白模夜景 Shader
    function createNightWindowsShader() {
        const config = CESIUM_CONFIG.whiteModel.nightWindows

        return new Cesium.CustomShader({
            mode: Cesium.CustomShaderMode.MODIFY_MATERIAL,
            lightingModel: Cesium.LightingModel.UNLIT,

            varyings: {
                v_normalMC: Cesium.VaryingType.VEC3,
            },

            uniforms: {
                u_time: {
                    type: Cesium.UniformType.FLOAT,
                    value: 0.0,
                },
                u_nightEnabled: {
                    type: Cesium.UniformType.BOOL,
                    value: config.enabled,
                },
                u_windowDensity: {
                    type: Cesium.UniformType.FLOAT,
                    value: config.density,
                },
                u_windowBrightness: {
                    type: Cesium.UniformType.FLOAT,
                    value: config.brightness,
                },
                u_windowWidth: {
                    type: Cesium.UniformType.FLOAT,
                    value: config.windowWidth,
                },
                u_floorHeight: {
                    type: Cesium.UniformType.FLOAT,
                    value: config.floorHeight,
                },
            },

            vertexShaderText: facadeWindowsVertexShaderSource,
            fragmentShaderText: facadeWindowsShaderSource,
        })
    }

    // 每帧更新夜景时间，让部分窗户产生缓慢的亮度变化。
    function startNightWindowsAnimation(scene: Cesium.Scene, shader: Cesium.CustomShader) {
        const startTime = performance.now()

        return scene.preRender.addEventListener(() => {
            const elapsedSeconds = (performance.now() - startTime) / 1000.0

            shader.setUniform('u_time', elapsedSeconds)
        })
    }

    async function loadWhiteModel(
        viewer: Cesium.Viewer,
    ) {
        // 避免重复添加同一个 3D Tileset。
        if (tileset && !tileset.isDestroyed()) {
            tileset.show = whiteModelVisible.value
            return tileset
        }

        tileset =
            await Cesium.Cesium3DTileset.fromUrl(
                CESIUM_CONFIG.whiteModel.url,
                {
                    maximumScreenSpaceError:
                        CESIUM_CONFIG.whiteModel
                            .maximumScreenSpaceError,
                },
            )

        nightWindowsShader = createNightWindowsShader()
        tileset.customShader = nightWindowsShader

        viewer.scene.primitives.add(tileset)
        tileset.show = whiteModelVisible.value

        removeNightWindowsPreRenderListener = startNightWindowsAnimation(viewer.scene, nightWindowsShader)

        // 当前视角瓦片加载完成不代表整个城市数据都已下载完成。
        removeAllTilesLoadedListener =
            tileset.allTilesLoaded.addEventListener(() => {
                console.log(
                    'Re:Earth 福田白膜：当前视角瓦片加载完成',
                )
            })

        // Re:Earth 空瓦片 404 在当前数据范围内是可接受情况，其它错误仍记录。
        removeTileFailedListener =
            tileset.tileFailed.addEventListener((event) => {
                const url = event.url ?? ''
                const message = event.message ?? ''

                const isEmptyTile =
                    /\b404\b/.test(url) ||
                    /\b404\b/.test(message)

                if (isEmptyTile) {
                    console.debug(
                        'Re:Earth 空瓦片，属于正常情况：',
                        url,
                    )
                    return
                }

                console.error(
                    'Re:Earth 白膜瓦片加载失败：',
                    event.url,
                    event.message,
                )
            })

        return tileset
    }

    function applyBoundaryClipping(
        scene: Cesium.Scene,
        boundaryPositions: Cesium.Cartesian3[],
    ) {
        if (!tileset || tileset.isDestroyed()) {
            console.warn('福田白模裁剪跳过：城市白模尚未加载')
            return false
        }

        if (!Cesium.ClippingPolygonCollection.isSupported(scene)) {
            console.warn('当前 WebGL 环境不支持 ClippingPolygonCollection，白模保持未裁剪状态')
            return false
        }

        try {
            const futianPolygon = new Cesium.ClippingPolygon({
                positions: boundaryPositions,
            })

            // inverse: true 裁掉多边形外部，只保留福田区内的白模。
            tileset.clippingPolygons =
                new Cesium.ClippingPolygonCollection({
                    polygons: [futianPolygon],
                    inverse: true,
                })

            return true
        } catch (error) {
            console.error('福田白模裁剪创建失败，白模保持未裁剪状态：', error)
            return false
        }
    }

    function setWhiteModelVisible(visible: boolean) {
        whiteModelVisible.value = visible

        if (tileset && !tileset.isDestroyed()) {
            tileset.show = visible
        }
    }

    function cleanupWhiteModel(
        viewer: Cesium.Viewer | undefined,
    ) {
        // 先移除事件，再从场景移除 tileset，最后清空引用。
        removeAllTilesLoadedListener?.()
        removeTileFailedListener?.()
        removeNightWindowsPreRenderListener?.()

        removeAllTilesLoadedListener = undefined
        removeTileFailedListener = undefined
        removeNightWindowsPreRenderListener = undefined

        if (
            tileset &&
            !tileset.isDestroyed() &&
            viewer &&
            !viewer.isDestroyed()
        ) {
            viewer.scene.primitives.remove(tileset)
        }

        if (nightWindowsShader && !nightWindowsShader.isDestroyed()) {
            nightWindowsShader.destroy()
        }

        nightWindowsShader = undefined
        tileset = undefined
    }

    return {
        loadWhiteModel,
        applyBoundaryClipping,
        whiteModelVisible,
        setWhiteModelVisible,
        cleanupWhiteModel,
    }
}
