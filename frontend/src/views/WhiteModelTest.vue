<script setup lang="ts">    
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const cesiumContainer = ref<HTMLElement | null>(null)

let viewer: Cesium.Viewer | undefined


onMounted(async () => { 
    if ( !cesiumContainer.value) return

    viewer = new Cesium.Viewer(cesiumContainer.value)

    viewer.scene.debugShowFramesPerSecond = true

    try {
        // Re:Earth Buildings 的建筑高度使用椭球高；
        // 配套地形能减少建筑底部悬空或埋入地面的情况。
        viewer.scene.setTerrain(
            new Cesium.Terrain(
                Cesium.CesiumTerrainProvider.fromUrl(
                    'https://terrain.reearth.land/cesium-mesh/ellipsoid',
                    {
                        requestVertexNormals: true // 请求地形法线
                    },
                ),
            ),
        )

        const buildings = await Cesium.Cesium3DTileset.fromUrl(
            'https://buildings.reearth.land/tileset.json',
            {
                maximumScreenSpaceError: 16,
            },
        )

        viewer.scene.primitives.add(buildings)

        const futianBoundary = await Cesium.GeoJsonDataSource.load(
            'test-data/futian-boundary.geojson',
            {
                fill: Cesium.Color.CYAN.withAlpha(0.07),
                clampToGround: true,
            }
        )

        viewer.dataSources.add(futianBoundary)
        console.info('福田行政区填充加载完成')

        const boundaryEntity = futianBoundary.entities.values.find(
            (entity) => entity.polygon
        )

        const hierarchy = boundaryEntity?.polygon?.hierarchy?.getValue(
            Cesium.JulianDate.now()
        )

        if (hierarchy) {
            const groundPositions = [...hierarchy.positions, hierarchy.positions[0]]
        
            viewer.entities.add({
                polyline: {
                positions: groundPositions,
                width: 8,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.2,
                    color: Cesium.Color.YELLOW,
                }),
                clampToGround: true,
                zIndex: 10,
                },
            })
        }

        // 福田区附近视角：经度、纬度、相机高度（米）
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(114.050, 22.490, 5000),
            orientation: {
                heading: 0,
                pitch: Cesium.Math.toRadians(-45),
                roll: 0,
            },
            duration: 1.2,
        })

        buildings.allTilesLoaded.addEventListener(() => {
            console.log('Re:Earth 福田白膜：当前视角瓦片加载完成')
        })

        buildings.tileFailed.addEventListener((event) => {
            const url = event.url ?? ''
            const message = event.message ?? ''
            const isEmptyTile = /\b404\b/.test(url) || /\b404\b/.test(message)

            if (isEmptyTile) {
                console.debug('Re:Earth 空瓦片，属于正常情况：', url)
                return
            }

            console.error('Re:Earth 白膜瓦片加载失败：', event.url, event.message)
        })

    } catch (error) { 
        console.error('Re:Earth Buildings 初始化失败：', error) 
    }
})

onBeforeUnmount(() => { 
    if (viewer && !viewer.isDestroyed()) { 
        viewer.destroy() 
    }

    viewer = undefined
})

</script>

<template> 
    <div ref="cesiumContainer" class="cesium-container"></div>
</template>

<style scoped>
.cesium-container { 
    width: 100%;
    height: 100%;
} 
</style>