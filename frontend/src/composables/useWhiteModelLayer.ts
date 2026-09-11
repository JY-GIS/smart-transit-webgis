import * as Cesium from 'cesium'
import { CESIUM_CONFIG } from '@/config/cesium.config'

// 白膜图层封装：负责加载 Re:Earth 3D Tiles 和监听瓦片状态。
export function useWhiteModelLayer() {
    // 保存 tileset 及事件移除函数，支持重复调用和页面卸载清理。
    let tileset: Cesium.Cesium3DTileset | undefined

    let removeAllTilesLoadedListener:
        | (() => void)
        | undefined

    let removeTileFailedListener:
        | (() => void)
        | undefined

    async function loadWhiteModel(
        viewer: Cesium.Viewer,
    ) {
        // 避免重复添加同一个 3D Tileset。
        if (tileset && !tileset.isDestroyed()) {
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

        viewer.scene.primitives.add(tileset)

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

    function cleanupWhiteModel(
        viewer: Cesium.Viewer | undefined,
    ) {
        // 先移除事件，再从场景移除 tileset，最后清空引用。
        removeAllTilesLoadedListener?.()
        removeTileFailedListener?.()

        removeAllTilesLoadedListener = undefined
        removeTileFailedListener = undefined

        if (
            tileset &&
            !tileset.isDestroyed() &&
            viewer &&
            !viewer.isDestroyed()
        ) {
            viewer.scene.primitives.remove(tileset)
        }

        tileset = undefined
    }

    return {
        loadWhiteModel,
        cleanupWhiteModel,
    }
}
