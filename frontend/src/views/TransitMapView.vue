<script setup lang="ts">    
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 页面组件只负责组装各个图层和交互模块，具体实现放在 composables 中。
import BusRouteInfoPanel from '@/components/transit/BusRouteInfoPanel.vue'
import NearbyBusStopPanel from '@/components/transit/NearbyBusStopPanel.vue'
import RealtimeVehicleInfoPanel from '@/components/transit/RealtimeVehicleInfoPanel.vue'
import RealtimeOperationalAlertPanel from '@/components/transit/RealtimeOperationalAlertPanel.vue'
import StopArrivalPanel from '@/components/transit/StopArrivalPanel.vue'
import VehicleTrajectoryPanel from '@/components/transit/VehicleTrajectoryPanel.vue'
import { useBusRouteLayer } from '@/composables/useBusRouteLayer'
import { useBusRouteSelection } from '@/composables/useBusRouteSelection'
import { useBusStopLayer } from '@/composables/useBusStopLayer'
import { useCesiumViewer } from '@/composables/useCesiumViewer'
import { useWhiteModelLayer } from '@/composables/useWhiteModelLayer'
import { useFutianBoundaryLayer } from '@/composables/useFutianBoundaryLayer'
import { useNearbyBusStops } from '@/composables/useNearbyBusStops'
import { useRealtimeVehicles } from '@/composables/useRealtimeVehicles'
import { useRealtimeVehicleLayer } from '@/composables/useRealtimeVehicleLayer'
import { useStopArrivals } from '@/composables/useStopArrivals'
import type {
    RouteTrajectoryQuery,
    TrajectoryReplayMode,
    VehicleTrajectoryQuery,
} from '@/types/vehicleTrajectory'
import { useVehicleTrajectoryLayer } from '@/composables/useVehicleTrajectoryLayer'
import { useVehicleTrajectory } from '@/composables/useVehicleTrajectory'
import { useRouteTrajectoryReplay } from '@/composables/useRouteTrajectoryReplay'
import { useRouteTrajectoryReplayLayer } from '@/composables/useRouteTrajectoryReplayLayer'

import type { NearbyQueryCenter, OrderedBusStop } from '@/types/busStop'

const cesiumContainer = ref<HTMLElement | null>(null)

const nearbyQueryEnabled = ref(false)

const historyModeEnabled = ref(false)
const historyReplayMode = ref<TrajectoryReplayMode>('vehicle')

const selectedRouteStops = ref<OrderedBusStop[]>([])

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
    selectedVehicleId,
    selectedRouteStop,
    selectRealtimeVehicle,
    selectRouteByFid,
    bindRouteSelection,
    closeRoutePanel,
    closeRouteStopPanel,
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
    arrivalBoard,
    arrivalQueryStatus,
    arrivalErrorMessage,
    startAutoRefresh,
    clearArrivals,
    cleanup: cleanupStopArrivals,
} = useStopArrivals()

const {
    loadBusStops,
    getOrderedRouteStops,
    showRouteStops,
    clearRouteStops,
    cleanup: cleanupBusStopLayer,
} = useBusStopLayer()

const {
    vehicles: realtimeVehicles,
    connect: connectRealtimeVehicles,
    disconnect: disconnectRealtimeVehicles,
} = useRealtimeVehicles()

const selectedRealtimeVehicle = computed(() => {
    const vehicleId = selectedVehicleId.value

    if (!vehicleId) {
        return null
    }

    return (
        realtimeVehicles.value.find(
            (vehicle) => vehicle.vehicleId === vehicleId,
        ) ?? null
    )
})

const {
    getVehicleEntity: getRealtimeVehicleEntity,
    updateVehicles: updateRealtimeVehicleLayer,
    setVehiclesVisible: setRealtimeVehiclesVisible,
    cleanup: cleanupRealtimeVehicleLayer,
} = useRealtimeVehicleLayer()

const {
    availableVehicles: historyAvailableVehicles,
    availabilityStatus: historyAvailabilityStatus,
    availabilityErrorMessage: historyAvailabilityErrorMessage,
    trajectory: vehicleTrajectory,
    trajectoryStatus: vehicleTrajectoryStatus,
    trajectoryErrorMessage: vehicleTrajectoryErrorMessage,
    loadAvailability: loadVehicleHistoryAvailability,
    queryTrajectory: queryVehicleTrajectory,
    clearTrajectory: clearVehicleTrajectory,
    cleanup: cleanupVehicleTrajectoryQuery,
} = useVehicleTrajectory()

const {
    availableRoutes: historyAvailableRoutes,
    routeReplay: vehicleRouteReplay,
    routeReplayStatus: vehicleRouteReplayStatus,
    routeReplayErrorMessage: vehicleRouteReplayErrorMessage,
    queryRouteTrajectories: queryVehicleRouteTrajectories,
    clearRouteReplay: clearVehicleRouteReplay,
    cleanup: cleanupVehicleRouteReplayQuery,
} = useRouteTrajectoryReplay(historyAvailableVehicles)

const {
    trajectoryLoaded,
    isPlaying: trajectoryIsPlaying,
    playbackSpeed: trajectoryPlaybackSpeed,
    cameraTrackingEnabled: trajectoryCameraTrackingEnabled,
    loadTrajectoryLayer,
    clearTrajectoryLayer,
    play: playVehicleTrajectory,
    pause: pauseVehicleTrajectory,
    reset: resetVehicleTrajectory,
    setPlaybackSpeed: setVehicleTrajectoryPlaybackSpeed,
    setCameraTracking: setVehicleTrajectoryCameraTracking,
    cleanup: cleanupVehicleTrajectoryLayer,
} = useVehicleTrajectoryLayer()

const {
    routeReplayLoaded,
    isPlaying: routeReplayIsPlaying,
    playbackSpeed: routeReplayPlaybackSpeed,
    trackedVehicleId: trackedRouteVehicleId,
    loadRouteReplayLayer,
    clearRouteReplayLayer,
    play: playRouteReplay,
    pause: pauseRouteReplay,
    reset: resetRouteReplay,
    setPlaybackSpeed: setRouteReplayPlaybackSpeed,
    setTrackedVehicle: setTrackedRouteVehicle,
    cleanup: cleanupRouteReplayLayer,
} = useRouteTrajectoryReplayLayer()

const activeTrajectoryLoaded = computed(() => {
    return historyReplayMode.value === 'vehicle' ? trajectoryLoaded.value : routeReplayLoaded.value
})

const activeTrajectoryIsPlaying = computed(() => {
    return historyReplayMode.value === 'vehicle' ? trajectoryIsPlaying.value : routeReplayIsPlaying.value
})

const activeTrajectoryPlaybackSpeed = computed(() => {
    return historyReplayMode.value === 'vehicle' ? trajectoryPlaybackSpeed.value : routeReplayPlaybackSpeed.value
})

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

// 查询当前选中线路站点的到站车辆。
function loadSelectedStopArrivals() {
    const stop = selectedRouteStop.value

    if (!stop) {
        clearArrivals()
        return
    }

    startAutoRefresh({
        routeId: stop.routeId,
        stopId: stop.stopId,
    })
}

// 关闭到站面板
function handleCloseStopArrivalPanel() {
    closeRouteStopPanel(viewer)
    clearArrivals()
}

// 查询失败后的手动重试
function handleRetryStopArrivals() {
    loadSelectedStopArrivals()
}

// 进入历史轨迹模式
function openHistoryMode() {
    historyModeEnabled.value = true
    historyReplayMode.value = 'vehicle'

    // 历史模式与当前实时业务面板互斥
    handleCloseRoutePanel()
    handleCloseStopArrivalPanel()
    handleClearNearbyQuery()

    // 隐藏实时车辆，但不关闭WebSocket
    setRealtimeVehiclesVisible(false)

    clearVehicleTrajectory()
    clearTrajectoryLayer()
    clearVehicleRouteReplay()
    clearRouteReplayLayer()

    void loadVehicleHistoryAvailability()
}

/**
 * 退出历史轨迹模式。
 */
function closeHistoryMode() {
    /*
     * 先清理历史图层并恢复Cesium时钟，
     * 再重新显示实时车辆。
     */
    cleanupVehicleTrajectoryLayer(viewer)
    cleanupRouteReplayLayer(viewer)
    cleanupVehicleTrajectoryQuery()
    cleanupVehicleRouteReplayQuery()
    handleCloseRoutePanel()

    setRealtimeVehiclesVisible(true)

    historyModeEnabled.value = false
}

function toggleHistoryMode() {
    if (historyModeEnabled.value) {
        closeHistoryMode()
        return
    }

    openHistoryMode()
}

function handleHistoryReplayModeChange(mode: TrajectoryReplayMode) {
    if (historyReplayMode.value === mode) {
        return
    }

    cleanupVehicleTrajectoryLayer(viewer)
    cleanupRouteReplayLayer(viewer)
    clearVehicleTrajectory()
    clearVehicleRouteReplay()
    handleCloseRoutePanel()
    historyReplayMode.value = mode
}

// 接收历史面板提交的单车查询参数。
function handleVehicleTrajectoryQuery(query: VehicleTrajectoryQuery) {
    void queryVehicleTrajectory(query)
}

// 接收历史面板提交的线路查询参数。
function handleRouteTrajectoryQuery(query: RouteTrajectoryQuery) {
    void queryVehicleRouteTrajectories(query)
}

/**
 * 清除上一辆车或上一次查询的轨迹。
 */
function handleClearVehicleTrajectory() {
    clearVehicleTrajectory()
    clearVehicleRouteReplay()
    clearTrajectoryLayer()
    clearRouteReplayLayer()
    handleCloseRoutePanel()
}

function handleTrajectoryPlay() {
    if (historyReplayMode.value === 'vehicle') {
        playVehicleTrajectory()
        return
    }

    playRouteReplay()
}

function handleTrajectoryPause() {
    if (historyReplayMode.value === 'vehicle') {
        pauseVehicleTrajectory()
        return
    }

    pauseRouteReplay()
}

function handleTrajectoryReset() {
    if (historyReplayMode.value === 'vehicle') {
        resetVehicleTrajectory()
        return
    }

    resetRouteReplay()
}

function handleTrajectoryPlaybackSpeed(speed: number) {
    if (historyReplayMode.value === 'vehicle') {
        setVehicleTrajectoryPlaybackSpeed(speed)
        return
    }

    setRouteReplayPlaybackSpeed(speed)
}

// 处理异常播报面板发出的车辆选择请求
function handleSelectOperationalVehicle(vehicleId: string) {
    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    const vehicle = realtimeVehicles.value.find( (item) => item.vehicleId === vehicleId )

    if (!vehicle)  return

    selectRealtimeVehicle(
        vehicle.vehicleId,
        vehicle.routeFid,
        routeEntitiesByFid,
        currentViewer.clock.currentTime,
    )

    const vehicleEntity = getRealtimeVehicleEntity(vehicleId)

    if (!vehicleEntity) return

    currentViewer.selectedEntity = vehicleEntity

    void currentViewer.flyTo(
        vehicleEntity,
        {
            duration: 1.2,
            offset: new Cesium.HeadingPitchRange(
                Cesium.Math.toRadians(0),
                Cesium.Math.toRadians(-65),
                1000,
            ),
        },
    )
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

watch(
    selectedRouteStop, (stop) => {
        if (!stop) {
            clearArrivals()
            return
        }

        startAutoRefresh({
            routeId: stop.routeId,
            stopId: stop.stopId,
        })
    },
)

watch(selectedRoute, (route) => {
    if (!route) {
        selectedRouteStops.value = []

        clearRouteStops()
        return
    }

    if (historyModeEnabled.value) {
        selectedRouteStops.value = []
        clearRouteStops()
        return
    }

    const routeId = toRouteId(route.fid)

    showRouteStops(routeId)

    selectedRouteStops.value = getOrderedRouteStops(routeId)
})

watch(realtimeVehicles, (snapshots) => {
    const currentViewer = viewer

    // Viewer 尚未创建时先保留数据，暂不绘制
    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    updateRealtimeVehicleLayer(currentViewer, snapshots)
})

// 查询成功后将轨迹加载到Cesium
watch(
    vehicleTrajectory, (trajectory) => {
        const currentViewer = viewer

        if (historyReplayMode.value !== 'vehicle' || !historyModeEnabled.value || !trajectory || !currentViewer || currentViewer.isDestroyed()) {
            return
        }

        void loadTrajectoryLayer(
            currentViewer,
            trajectory,
        )
    },
)

// 线路查询成功后加载多车轨迹并高亮线路。
watch(
    vehicleRouteReplay, (routeReplay) => {
        const currentViewer = viewer

        if (historyReplayMode.value !== 'route' || !historyModeEnabled.value || !routeReplay || !currentViewer || currentViewer.isDestroyed()) {
            return
        }

        selectRouteByFid(
            routeReplay.routeFid,
            routeEntitiesByFid,
            currentViewer.clock.currentTime,
        )

        void loadRouteReplayLayer(currentViewer, routeReplay)
    },
)

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

    cleanupVehicleTrajectoryQuery()
    cleanupVehicleTrajectoryLayer(viewer)
    cleanupVehicleRouteReplayQuery()
    cleanupRouteReplayLayer(viewer)
    cleanupRouteSelection()
    cleanupStopArrivals()
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
                :class="{ 'is-active': historyModeEnabled }"
                type="button"
                :aria-pressed="historyModeEnabled"
                @click="toggleHistoryMode"
            >
                <span class="layer-control-dot" aria-hidden="true"></span>
                {{ historyModeEnabled ? '退出历史回放' : '历史轨迹回放' }}
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

        <template v-if="!historyModeEnabled">
            <!-- 信息面板覆盖在 Cesium 容器上方，不参与 Cesium Entity 绘制。 -->
            <BusRouteInfoPanel :route="selectedRealtimeVehicle || selectedRouteStop ? null : selectedRoute"
                @close="handleCloseRoutePanel"
            />

            <StopArrivalPanel
                :route="selectedRoute"
                :stop="selectedRouteStop"
                :board="arrivalBoard"
                :status="arrivalQueryStatus"
                :error-message="arrivalErrorMessage"
                :route-stops="selectedRouteStops"
                @close="handleCloseStopArrivalPanel"
                @retry="handleRetryStopArrivals"
                @select-vehicle="handleSelectOperationalVehicle"
            />
            
            <RealtimeVehicleInfoPanel
                :vehicle="selectedRealtimeVehicle"
                :route="selectedRoute"
                @close="handleCloseRoutePanel"
            />
            <RealtimeOperationalAlertPanel
                :vehicles="realtimeVehicles"
                @select-vehicle="handleSelectOperationalVehicle"
            />
            <NearbyBusStopPanel
                :stops="nearbyStops"
                :status="queryStatus"
                :error-message="errorMessage"
                :radius-meters="queryRadiusMeters"
                @clear="handleClearNearbyQuery"
            />
        </template>
        <VehicleTrajectoryPanel
            v-if="historyModeEnabled"
            :mode="historyReplayMode"
            :vehicles="historyAvailableVehicles"
            :routes="historyAvailableRoutes"
            :availability-status="historyAvailabilityStatus"
            :availability-error-message="historyAvailabilityErrorMessage"
            :trajectory="vehicleTrajectory"
            :trajectory-status="vehicleTrajectoryStatus"
            :trajectory-error-message="vehicleTrajectoryErrorMessage"
            :route-replay="vehicleRouteReplay"
            :route-replay-status="vehicleRouteReplayStatus"
            :route-replay-error-message="vehicleRouteReplayErrorMessage"
            :trajectory-loaded="activeTrajectoryLoaded"
            :is-playing="activeTrajectoryIsPlaying"
            :playback-speed="activeTrajectoryPlaybackSpeed"
            :camera-tracking-enabled="trajectoryCameraTrackingEnabled"
            :tracked-route-vehicle-id="trackedRouteVehicleId"
            @change-mode="handleHistoryReplayModeChange"
            @query-vehicle="handleVehicleTrajectoryQuery"
            @query-route="handleRouteTrajectoryQuery"
            @close="closeHistoryMode"
            @retry-availability="loadVehicleHistoryAvailability"
            @clear-trajectory="handleClearVehicleTrajectory"
            @play="handleTrajectoryPlay"
            @pause="handleTrajectoryPause"
            @reset="handleTrajectoryReset"
            @change-speed="handleTrajectoryPlaybackSpeed"
            @change-camera-tracking="setVehicleTrajectoryCameraTracking"
            @change-route-tracking="setTrackedRouteVehicle"
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
