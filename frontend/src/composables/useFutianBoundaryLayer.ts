import * as Cesium from 'cesium'
import { CESIUM_CONFIG } from '@/config/cesium.config'

// 福田行政区图层：保留 GeoJSON 填充，同时额外绘制一条发光边界线。
export function useFutianBoundaryLayer() {
    let dataSource: Cesium.GeoJsonDataSource | undefined
    let outlineEntity: Cesium.Entity | undefined

    async function loadFutianBoundary(
        viewer: Cesium.Viewer,
    ) {
        // 行政区面使用半透明填充，便于观察白膜和公交线路。
        dataSource =
            await Cesium.GeoJsonDataSource.load(
                CESIUM_CONFIG.futianBoundary.url,
                {
                    fill: Cesium.Color.CYAN.withAlpha(
                        CESIUM_CONFIG.futianBoundary.fillAlpha,
                    ),
                    clampToGround: true,
                },
            )

        viewer.dataSources.add(dataSource)

        console.info('福田行政区填充加载完成')

        // 从 GeoJSON 数据源中找到行政区 polygon，读取其边界坐标。
        const boundaryEntity =
            dataSource.entities.values.find(
                (entity) => entity.polygon,
            )

        const hierarchy =
            boundaryEntity?.polygon?.hierarchy?.getValue(
                Cesium.JulianDate.now(),
            )

        if (!hierarchy) {
            return []
        }

        // GeoJSON 外环首尾重复；裁剪多边形只需要每个顶点一次。
        const boundaryPositions = hierarchy.positions
        const lastPosition = boundaryPositions[boundaryPositions.length - 1]
        const clippingPositions = Cesium.Cartesian3.equals(boundaryPositions[0], lastPosition)
            ? boundaryPositions.slice(0, -1) : boundaryPositions

        // 首尾闭合后单独创建 polyline，可独立控制边界宽度和发光效果。
        const groundPositions = [
            ...clippingPositions,
            clippingPositions[0],
        ]

        outlineEntity = viewer.entities.add({
            polyline: {
                positions: groundPositions,
                width: CESIUM_CONFIG.futianBoundary
                    .outlineWidth,
                material:
                    new Cesium.PolylineGlowMaterialProperty({
                        glowPower:
                            CESIUM_CONFIG.futianBoundary
                                .outlineGlowPower,
                        color: Cesium.Color.YELLOW,
                    }),
                clampToGround: true,
                zIndex: 10,
            },
        })

        // 复用已解析的真实行政区外环，供白模运行时裁剪使用，避免再次请求 GeoJSON。
        return clippingPositions
    }

    function cleanupFutianBoundary(
        viewer: Cesium.Viewer | undefined,
    ) {
        // 填充属于 dataSource，边界线属于 viewer.entities，需要分别移除。
        if (
            outlineEntity &&
            viewer &&
            !viewer.isDestroyed()
        ) {
            viewer.entities.remove(outlineEntity)
        }

        if (
            dataSource &&
            viewer &&
            !viewer.isDestroyed()
        ) {
            viewer.dataSources.remove(dataSource)
        }

        outlineEntity = undefined
        dataSource = undefined
    }

    return {
        loadFutianBoundary,
        cleanupFutianBoundary,
    }
}
