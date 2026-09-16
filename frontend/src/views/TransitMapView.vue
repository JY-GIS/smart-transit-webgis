<script setup lang="ts">    
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 页面组件只负责组装各个图层和交互模块，具体实现放在 composables 中。
import BusRouteInfoPanel from '@/components/transit/BusRouteInfoPanel.vue'
import { useBusRouteLayer } from '@/composables/useBusRouteLayer'
import { useBusRouteSelection } from '@/composables/useBusRouteSelection'
import { useBusStopLayer } from '@/composables/useBusStopLayer'
import { useCesiumViewer } from '@/composables/useCesiumViewer'
import { useWhiteModelLayer } from '@/composables/useWhiteModelLayer'
import { useFutianBoundaryLayer } from '@/composables/useFutianBoundaryLayer'
import { useSimulatedBus } from '@/composables/useSimulatedBus'

const cesiumContainer = ref<HTMLElement | null>(null)

// viewer 属于当前页面实例，页面卸载时必须销毁，避免 WebGL 资源泄漏。
let viewer: Cesium.Viewer | undefined

// 公交线路图层同时维护业务线路索引，供点击后高亮同一条线路的多个片段。
const {
    routeEntitiesByFid,
    loadBusRoutes,
    busRoutesVisible,
    setBusRoutesVisible,
} = useBusRouteLayer()

const {
    busState,
    isBusLoaded,
    load: loadSimulatedBus,
    reload: reloadSimulatedBus,
    start: startSimulatedBus,
    stop: stopSimulatedBus,
    clear: clearSimulatedBus,
    cleanup: cleanupSimulatedBus,
} = useSimulatedBus()

// 线路选择 composable 负责 Cesium 选中事件、属性读取、面板状态和高亮恢复。
const {
    selectedRoute,
    bindRouteSelection,
    closeRoutePanel,
    cleanup: cleanupRouteSelection,
} = useBusRouteSelection()

const {
    loadBusStops,
    getOrderedRouteStops,
    showRouteStops,
    clearRouteStops,
    cleanup: cleanupBusStopLayer,
} = useBusStopLayer()

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

// 页面挂载后按“Viewer → 白膜 → 行政区 → 公交线路 → 点击交互”的顺序初始化。
onMounted(async () => { 
    if ( !cesiumContainer.value) return

    try {
        viewer = await createViewer(cesiumContainer.value)

        await loadWhiteModel(viewer)

        await loadFutianBoundary(viewer)

        const futianBusRoutes = await loadBusRoutes(viewer)

        await loadBusStops(viewer)

        const m103OrderedStops =
            getOrderedRouteStops(
            toRouteId(185),
        )

        loadSimulatedBus(viewer, routeEntitiesByFid,m103OrderedStops)

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
    cleanupBusStopLayer(viewer)
    cleanupSimulatedBus()
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
        </div>

        <div class="bus-controls" aria-label="模拟公交车辆控制">
            <span class="bus-controls__label">
                M103：{{ busState.status }}
            </span>

                <div
                    class="bus-progress"
                    aria-live="polite"
                    aria-label="M103 车辆站点进度"
                >
                    <span class="bus-progress__item">
                        进度：
                        {{ busState.routeProgressPercent.toFixed(1) }}%
                    </span>

                    <span class="bus-progress__item">
                        上一站：
                        {{ busState.previousStop?.stopName ?? '—' }}
                    </span>

                    <span class="bus-progress__item">
                        下一站：
                        {{ busState.nextStop?.stopName ?? '已到终点' }}
                    </span>

                    <span class="bus-progress__item">
                        距下一站：
                        <template
                            v-if="
                                busState.distanceToNextStopMeters !== null
                            "
                        >
                            {{
                                busState.distanceToNextStopMeters.toFixed(0)
                            }} 米
                        </template>

                        <template v-else>
                            —
                        </template>
                    </span>
                </div>

            <button
                class="bus-control-button"
                type="button"
                :disabled="!isBusLoaded || busState.status === 'running'"
                @click="startSimulatedBus"
            >
                开始
            </button>

            <button
                class="bus-control-button"
                type="button"
                :disabled="busState.status !== 'running'"
                @click="stopSimulatedBus"
            >
                停止
            </button>

            <button
                class="bus-control-button"
                type="button"
                @click="clearSimulatedBus"
            >
                清理
            </button>
            <button
                class="bus-control-button"
                type="button"
                @click="reloadSimulatedBus"
            >
                重新加载
            </button>
        </div>

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

.bus-controls {
    position: absolute;
    z-index: 10;
    top: 72px;
    left: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    color: #e9f5ff;
    background: rgba(18, 32, 48, 0.86);
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 6px;
}

.bus-controls__label {
    margin-right: 4px;
    font-size: 13px;
}

.bus-control-button {
    padding: 6px 10px;
    color: #e9f5ff;
    background: rgba(45, 75, 100, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
    cursor: pointer;
}

.bus-control-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

.bus-progress {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 230px;
    color: #c8d8e6;
    font-size: 12px;
    line-height: 1.4;
}

.bus-progress__item {
    white-space: nowrap;
}
</style>
