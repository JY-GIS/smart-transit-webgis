<script setup lang="ts">    
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 页面组件只负责组装各个图层和交互模块，具体实现放在 composables 中。
import BusRouteInfoPanel from '@/components/transit/BusRouteInfoPanel.vue'
import NearbyBusStopPanel from '@/components/transit/NearbyBusStopPanel.vue'
import { useBusRouteLayer } from '@/composables/useBusRouteLayer'
import { useBusRouteSelection } from '@/composables/useBusRouteSelection'
import { useBusStopLayer } from '@/composables/useBusStopLayer'
import { useCesiumViewer } from '@/composables/useCesiumViewer'
import { useWhiteModelLayer } from '@/composables/useWhiteModelLayer'
import { useFutianBoundaryLayer } from '@/composables/useFutianBoundaryLayer'
import { useNearbyBusStops } from '@/composables/useNearbyBusStops'
import { useRealtimeVehicles } from '@/composables/useRealtimeVehicles'
import { useRealtimeVehicleLayer } from '@/composables/useRealtimeVehicleLayer'

import type { NearbyQueryCenter } from '@/types/busStop'

const cesiumContainer = ref<HTMLElement | null>(null)

const nearbyQueryEnabled = ref(false)

// viewer 属于当前页面实例，页面卸载时必须销毁，避免 WebGL 资源泄漏。
let viewer: Cesium.Viewer | undefined

// 公交线路图层同时维护业务线路索引，供点击后高亮同一条线路的多个片段。
const {
    routeEntitiesByFid,
    loadBusRoutes,
    busRoutesVisible,
    setBusRoutesVisible,
} = useBusRouteLayer()

// 线路选择 composable 负责 Cesium 选中事件、属性读取、面板状态和高亮恢复。
const {
    selectedRoute,
    bindRouteSelection,
    closeRoutePanel,
    cleanup: cleanupRouteSelection,
} = useBusRouteSelection()

const {
    nearbyStops,
    queryRadiusMeters,
    queryStatus,
    errorMessage,
    queryNearby,
    clearNearbyQuery,
    cleanup: cleanupNearbyBusStops,
} = useNearbyBusStops()

const {
    loadBusStops,
    showRouteStops,
    clearRouteStops,
    cleanup: cleanupBusStopLayer,
} = useBusStopLayer()

const {
    vehicles: realtimeVehicles,
    connect: connectRealtimeVehicles,
    disconnect: disconnectRealtimeVehicles,
} = useRealtimeVehicles()

const {
    updateVehicles: updateRealtimeVehicleLayer,
    cleanup: cleanupRealtimeVehicleLayer,
} = useRealtimeVehicleLayer()

// Cesium Viewer 和各基础图层分别管理，页面只按业务顺序调用它们。
const {
    createViewer,
    destroyViewer,
} = useCesiumViewer()

const {
    loadWhiteModel,
    whiteModelVisible,
    setWhiteModelVisible,
    cleanupWhiteModel,
} = useWhiteModelLayer()

const {
    loadFutianBoundary,
    cleanupFutianBoundary,
} = useFutianBoundaryLayer()

// ===========================【函数】===========================

function handleCloseRoutePanel() {
    closeRoutePanel(viewer)
}

function handleClearNearbyQuery() {
    nearbyQueryEnabled.value = false
    clearNearbyQuery()
}

function toggleNearbyQuery() {
    if (nearbyQueryEnabled.value) {
        handleClearNearbyQuery()
        return
    }
    // 重新进入查询模式前清理旧结果，避免上一次结果残留。
    clearNearbyQuery()
    nearbyQueryEnabled.value = true
}

function getClickCenter(clickPosition: Cesium.Cartesian2): NearbyQueryCenter | null { 
    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return null
    }

    const ray = currentViewer.camera.getPickRay(clickPosition)

    if (!ray) {
        return null
    }

    const cartesian = currentViewer.scene.globe.pick(
        ray, 
        currentViewer.scene
    ) ?? currentViewer.camera.pickEllipsoid(
        clickPosition, 
        currentViewer.scene.globe.ellipsoid
    )

    if (!cartesian) {
        return null
    }

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian)

    return {
        longitude: Cesium.Math.toDegrees(cartographic.longitude),
        latitude: Cesium.Math.toDegrees(cartographic.latitude),
    }
}

// 地图点击到后端查询的桥接函数
function handleNearbyMapClick(clickPosition: Cesium.Cartesian2) {
    if (!nearbyQueryEnabled.value) {
        return
    }

    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    const center = getClickCenter(clickPosition)

    if (!center) {
        clearNearbyQuery()
        return
    }

    void queryNearby(currentViewer, center)
}

function toggleBusRoutes() {
    setBusRoutesVisible(!busRoutesVisible.value)
}

function toggleWhiteModel() {
    setWhiteModelVisible(!whiteModelVisible.value)
}

function toRouteId(fid: number): string {
    return `route_${String(fid).padStart(6, '0')}`
}

watch(selectedRoute, (route) => {
    if (!route) {
        clearRouteStops()
        return
    }

    const routeId = toRouteId(route.fid)

    showRouteStops(routeId)
})

watch(realtimeVehicles, (snapshots) => {
    const currentViewer = viewer

    // Viewer 尚未创建时先保留数据，暂不绘制
    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    updateRealtimeVehicleLayer(currentViewer, snapshots)
})

// 页面挂载后按“Viewer → 白膜 → 行政区 → 公交线路 → 点击交互”的顺序初始化。
onMounted(async () => { 
    // WebSocket 与 Cesium 图层初始化相互独立
    connectRealtimeVehicles()

    if ( !cesiumContainer.value) return

    try {
        viewer = await createViewer(cesiumContainer.value)

        updateRealtimeVehicleLayer(viewer, realtimeVehicles.value)

        await loadWhiteModel(viewer)

        await loadFutianBoundary(viewer)

        const futianBusRoutes = await loadBusRoutes(viewer)

        await loadBusStops(viewer)

        bindRouteSelection(
            viewer,
            futianBusRoutes,
            routeEntitiesByFid,
            handleNearbyMapClick,
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
    void disconnectRealtimeVehicles()

    cleanupRouteSelection()
    cleanupNearbyBusStops(viewer)
    cleanupBusStopLayer(viewer)
    cleanupRealtimeVehicleLayer(viewer)
    routeEntitiesByFid.clear()

    cleanupFutianBoundary(viewer)
    cleanupWhiteModel(viewer)
    destroyViewer()

    viewer = undefined
})

</script>

<template> 
    <div ref="cesiumContainer" class="cesium-container">
        <div class="layer-controls" aria-label="图层控制">
            <button
                class="layer-control-button"
                :class="{ 'is-active': busRoutesVisible }"
                type="button"
                :aria-pressed="busRoutesVisible"
                @click="toggleBusRoutes"
            >
                <span class="layer-control-dot" aria-hidden="true"></span>
                {{ busRoutesVisible ? '隐藏公交线路' : '显示公交线路' }}
            </button>
            <button
                class="layer-control-button"
                :class="{ 'is-active': whiteModelVisible }"
                type="button"
                :aria-pressed="whiteModelVisible"
                @click="toggleWhiteModel"
            >
                <span class="layer-control-dot" aria-hidden="true"></span>
                {{ whiteModelVisible ? '隐藏城市白膜' : '显示城市白膜' }}
            </button>
            <button
                class="layer-control-button"
                :class="{ 'is-active': nearbyQueryEnabled }"
                type="button"
                :aria-pressed="nearbyQueryEnabled"
                @click="toggleNearbyQuery"
            >
                <span class="layer-control-dot" aria-hidden="true"></span>
                {{
                    nearbyQueryEnabled
                        ? '结束附近站点查询'
                        : '开始附近站点查询'
                }}
            </button>
        </div>

        <!-- 信息面板覆盖在 Cesium 容器上方，不参与 Cesium Entity 绘制。 -->
        <BusRouteInfoPanel
            :route="selectedRoute"
            @close="handleCloseRoutePanel"
        />
        <NearbyBusStopPanel
            :stops="nearbyStops"
            :status="queryStatus"
            :error-message="errorMessage"
            :radius-meters="queryRadiusMeters"
            @clear="handleClearNearbyQuery"
        />
    </div>
</template>

<style scoped>
.cesium-container {
    position: relative;
    width: 100%;
    height: 100%;
}

.layer-controls {
    position: absolute;
    z-index: 10;
    top: 20px;
    left: 20px;
    display: flex;
    gap: 10px;
    pointer-events: none;
}

.layer-control-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 138px;
    padding: 10px 14px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 6px;
    color: #e9f5ff;
    background: rgba(18, 32, 48, 0.86);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    line-height: 1.2;
    pointer-events: auto;
    transition: background-color 160ms ease, border-color 160ms ease;
}

.layer-control-button:hover {
    border-color: rgba(255, 255, 255, 0.7);
    background: rgba(29, 51, 72, 0.94);
}

.layer-control-button.is-active {
    border-color: rgba(87, 220, 255, 0.75);
}

.layer-control-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #7d8b96;
}

.layer-control-button.is-active .layer-control-dot {
    background: #51d6ff;
    box-shadow: 0 0 8px rgba(81, 214, 255, 0.85);
}

@media (max-width: 640px) {
    .layer-controls {
        top: 12px;
        right: 12px;
        left: 12px;
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>
