<script setup lang="ts">    
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 页面组件只负责组装各个图层和交互模块，具体实现放在 composables 中。
import BusRouteInfoPanel from '@/components/transit/BusRouteInfoPanel.vue'
import { useBusRouteLayer } from '@/composables/useBusRouteLayer'
import { useBusRouteSelection } from '@/composables/useBusRouteSelection'
import { useCesiumViewer } from '@/composables/useCesiumViewer'
import { useWhiteModelLayer } from '@/composables/useWhiteModelLayer'
import { useFutianBoundaryLayer } from '@/composables/useFutianBoundaryLayer'

const cesiumContainer = ref<HTMLElement | null>(null)

// viewer 属于当前页面实例，页面卸载时必须销毁，避免 WebGL 资源泄漏。
let viewer: Cesium.Viewer | undefined

// 公交线路图层同时维护业务线路索引，供点击后高亮同一条线路的多个片段。
const {
    routeEntitiesByFid,
    loadBusRoutes,
} = useBusRouteLayer()

// 线路选择 composable 负责 Cesium 选中事件、属性读取、面板状态和高亮恢复。
const {
    selectedRoute,
    bindRouteSelection,
    closeRoutePanel,
    cleanup: cleanupRouteSelection,
} = useBusRouteSelection()

// Cesium Viewer 和各基础图层分别管理，页面只按业务顺序调用它们。
const {
    createViewer,
    destroyViewer,
} = useCesiumViewer()

const {
    loadWhiteModel,
    cleanupWhiteModel,
} = useWhiteModelLayer()

const {
    loadFutianBoundary,
    cleanupFutianBoundary,
} = useFutianBoundaryLayer()

function handleCloseRoutePanel() {
    closeRoutePanel(viewer)
}

// 页面挂载后按“Viewer → 白膜 → 行政区 → 公交线路 → 点击交互”的顺序初始化。
onMounted(async () => { 
    if ( !cesiumContainer.value) return

    try {
        viewer = await createViewer(cesiumContainer.value)

        await loadWhiteModel(viewer)

        await loadFutianBoundary(viewer)

        const futianBusRoutes = await loadBusRoutes(viewer)

        bindRouteSelection(
            viewer,
            futianBusRoutes,
            routeEntitiesByFid,
        )

        // 初始化完成后飞到福田区附近视角：经度、纬度、相机高度（米）。
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(114.050, 22.490, 5000),
            orientation: {
                heading: 0,
                pitch: Cesium.Math.toRadians(-45),
                roll: 0,
            },
            duration: 1.2,
        })

    } catch (error) { 
        console.error('Re:Earth Buildings 初始化失败：', error) 
    }
})

// 卸载时按“交互监听 → 业务索引 → 图层 → Viewer”的顺序释放资源。
onBeforeUnmount(() => { 
    cleanupRouteSelection()
    routeEntitiesByFid.clear()

    cleanupFutianBoundary(viewer)
    cleanupWhiteModel(viewer)
    destroyViewer()

    viewer = undefined
})

</script>

<template> 
    <div ref="cesiumContainer" class="cesium-container">
        <!-- 信息面板覆盖在 Cesium 容器上方，不参与 Cesium Entity 绘制。 -->
        <BusRouteInfoPanel
            :route="selectedRoute"
            @close="handleCloseRoutePanel"
        />
    </div>
</template>

<style scoped>
.cesium-container {
    position: relative;
    width: 100%;
    height: 100%;
}
</style>
