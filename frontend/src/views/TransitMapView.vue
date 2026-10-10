<script setup lang="ts">    
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 页面组件只负责组装各个图层和交互模块，具体实现放在 composables 中。
import BusRouteInfoPanel from '@/components/transit/BusRouteInfoPanel.vue'
import NearbyBusStopPanel from '@/components/transit/NearbyBusStopPanel.vue'
import PoiAnalysisPanel from '@/components/transit/PoiAnalysisPanel.vue'
import RealtimeVehicleInfoPanel from '@/components/transit/RealtimeVehicleInfoPanel.vue'
import RealtimeOperationalAlertPanel from '@/components/transit/RealtimeOperationalAlertPanel.vue'
import StopArrivalPanel from '@/components/transit/StopArrivalPanel.vue'
import VehicleTrajectoryPanel from '@/components/transit/VehicleTrajectoryPanel.vue'
import RealtimeRouteProgressPanel from '@/components/transit/RealtimeRouteProgressPanel.vue'
import { TRANSIT_CONFIG } from '@/config/transit.config'
import { useBusRouteLayer } from '@/composables/useBusRouteLayer'
import { useBusRouteSelection } from '@/composables/useBusRouteSelection'
import { useBusStopLayer } from '@/composables/useBusStopLayer'
import { useCesiumViewer } from '@/composables/useCesiumViewer'
import { useWhiteModelLayer } from '@/composables/useWhiteModelLayer'
import { useFutianBoundaryLayer } from '@/composables/useFutianBoundaryLayer'
import { useCityRoadWmtsLayer } from '@/composables/useCityRoadWmtsLayer'
import { useNearbyBusStops } from '@/composables/useNearbyBusStops'
import { usePoiAnalysis } from '@/composables/usePoiAnalysis'
import { usePoiPointLayer } from '@/composables/usePoiPointLayer'
import { useRealtimeVehicles } from '@/composables/useRealtimeVehicles'
import { useRealtimeVehiclePointLayer } from '@/composables/useRealtimeVehiclePointLayer'
import { useRealtimeVehicleModelLayer } from '@/composables/useRealtimeVehicleModelLayer'
import { useRealtimeVehicleLod } from '@/composables/useRealtimeVehicleLod'
import { useRealtimeVehicleGridAggregation } from '@/composables/useRealtimeVehicleGridAggregation'
import { useRealtimeVehicleGridLayer } from '@/composables/useRealtimeVehicleGridLayer'
import { useRealtimeVehicleViewportCulling } from '@/composables/useRealtimeVehicleViewportCulling'
import { useStopArrivals } from '@/composables/useStopArrivals'
import { useMapDisplay } from '@/composables/useMapDisplay'
import type {
    NetworkTrajectoryQuery,
    RouteTrajectoryQuery,
    TrajectoryReplayMode,
    VehicleTrajectoryQuery,
} from '@/types/vehicleTrajectory'
import { useVehicleTrajectoryLayer } from '@/composables/useVehicleTrajectoryLayer'
import { useVehicleTrajectory } from '@/composables/useVehicleTrajectory'
import { useRouteTrajectoryReplay } from '@/composables/useRouteTrajectoryReplay'
import { useRouteTrajectoryReplayLayer } from '@/composables/useRouteTrajectoryReplayLayer'
import { useNetworkTrajectoryReplay } from '@/composables/useNetworkTrajectoryReplay'
import { useNetworkTrajectoryReplayLayer } from '@/composables/useNetworkTrajectoryReplayLayer'
import { useRealtimeVehicleRoaming } from '@/composables/useRealtimeVehicleRoaming'

import type { NearbyQueryCenter, OrderedBusStop } from '@/types/busStop'
import type { RealtimeVehiclePositionSnapshot, RealtimeVehicleRenderMode } from '@/types/realtimeVehicle'

const cesiumContainer = ref<HTMLElement | null>(null)

const nearbyQueryEnabled = ref(false)
const selectedPoiRadiusMeters = ref<number>(TRANSIT_CONFIG.poiAnalysis.defaultRadiusMeters)
const historyModeEnabled = ref(false)
const historyReplayMode = ref<TrajectoryReplayMode>('vehicle')
const realtimeVehicleRenderMode = ref<RealtimeVehicleRenderMode>('auto')
const selectedRouteStops = ref<OrderedBusStop[]>([])
const terrainEnabled = ref(true)

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
    loadCityRoadWmts,
    cleanupCityRoadWmts,
} = useCityRoadWmtsLayer()

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
    summary: poiSummary,
    nearbyPois,
    queryCenter: poiQueryCenter,
    queryStatus: poiAnalysisStatus,
    errorMessage: poiAnalysisErrorMessage,
    pointsVisible: poiPointsVisible,
    typeVisibility: poiTypeVisibility,
    queryAnalysis: queryPoiAnalysis,
    setZeroRadius: setPoiZeroRadius,
    setPointsVisible: setPoiPointsVisible,
    focusType: focusPoiType,
    clearAnalysis: clearPoiAnalysis,
    cleanup: cleanupPoiAnalysis,
} = usePoiAnalysis()

const {
    renderPoints: renderPoiPoints,
    clearPoints: clearPoiPoints,
    setPointsVisible: setPoiLayerVisible,
    setTypeVisibility: setPoiLayerTypeVisibility,
    cleanup: cleanupPoiPointLayer,
} = usePoiPointLayer()

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

// 右侧工作台只在有明确任务或选中对象时占用页面宽度。
const rightWorkbenchVisible = computed(() => (
    historyModeEnabled.value ||
    nearbyQueryEnabled.value ||
    queryStatus.value !== 'idle' ||
    poiAnalysisStatus.value !== 'idle' ||
    Boolean(selectedRoute.value) ||
    Boolean(selectedRouteStop.value) ||
    Boolean(selectedRealtimeVehicle.value)
))

const {
    getVehiclePosition: getRealtimeVehiclePointPosition,
    updateVehicles: updateRealtimeVehiclePointLayer,
    setVehiclesVisible: setRealtimeVehiclePointsVisible,
    cleanup: cleanupRealtimeVehiclePointLayer,
} = useRealtimeVehiclePointLayer()

const {
    getVehicleEntity: getRealtimeVehicleModelEntity,
    getVehiclePosition: getRealtimeVehicleModelPosition,
    updateVehicles: updateRealtimeVehicleModelLayer,
    setVehiclesVisible: setRealtimeVehicleModelsVisible,
    cleanup: cleanupRealtimeVehicleModelLayer,
} = useRealtimeVehicleModelLayer()

const {
    roamingModeEnabled: realtimeRoamingModeEnabled,
    trackedVehicleId: trackedRealtimeVehicleId,
    openRoamingMode,
    trackVehicle: trackRealtimeVehicle,
    updateVehicles: updateRealtimeVehicleRoamingVehicles,
    closeRoamingMode,
    cleanup: cleanupRealtimeVehicleRoaming,
} = useRealtimeVehicleRoaming({
    getPointPosition: getRealtimeVehiclePointPosition,
    getModelPosition: getRealtimeVehicleModelPosition,
})

const trackedRealtimeVehicle = computed(() => {
    const vehicleId = trackedRealtimeVehicleId.value

    if (!vehicleId) return null

    return (
        realtimeVehicles.value.find(
            (vehicle) => vehicle.vehicleId === vehicleId,
        ) ?? null
    )
})

// 根据追踪车辆线路编号读取完整有序站点。
const trackedRealtimeRouteStops = computed(() => {
    const vehicle = trackedRealtimeVehicle.value

    if (!vehicle) return []

    return getOrderedRouteStops(vehicle.routeId)
})

const trackedRealtimeRoute = computed(() => {
    const vehicle = trackedRealtimeVehicle.value
    const route = selectedRoute.value

    if (!vehicle || route?.fid !== vehicle.routeFid) return null

    return route
})

const {
    groupVehiclesByDistance,
    getVehicleRepresentation,
    cleanup: cleanupRealtimeVehicleLod,
} = useRealtimeVehicleLod()

const {
    resolveAggregationActive,
    aggregateVehicles,
    cleanup: cleanupRealtimeVehicleGridAggregation,
} = useRealtimeVehicleGridAggregation()

const {
    renderGridCells: renderRealtimeVehicleGridCells,
    clearGridCells: clearRealtimeVehicleGridCells,
    setGridsVisible: setRealtimeVehicleGridsVisible,
    cleanup: cleanupRealtimeVehicleGridLayer,
} = useRealtimeVehicleGridLayer()

const {
    filterVehiclesInView,
} = useRealtimeVehicleViewportCulling()

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
    networkReplay: vehicleNetworkReplay,
    networkReplayStatus: vehicleNetworkReplayStatus,
    networkReplayErrorMessage: vehicleNetworkReplayErrorMessage,
    queryNetworkTrajectories: queryVehicleNetworkTrajectories,
    clearNetworkReplay: clearVehicleNetworkReplay,
    cleanup: cleanupVehicleNetworkReplayQuery,
} = useNetworkTrajectoryReplay()

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

const {
    networkReplayLoaded,
    isPlaying: networkReplayIsPlaying,
    playbackSpeed: networkReplayPlaybackSpeed,
    trackedVehicleId: trackedNetworkVehicleId,
    loadNetworkReplayLayer,
    clearNetworkReplayLayer,
    play: playNetworkReplay,
    pause: pauseNetworkReplay,
    reset: resetNetworkReplay,
    setPlaybackSpeed: setNetworkReplayPlaybackSpeed,
    setTrackedVehicle: setTrackedNetworkVehicle,
    cleanup: cleanupNetworkReplayLayer,
} = useNetworkTrajectoryReplayLayer()

// 返回当前回放模式的图层加载状态
const activeTrajectoryLoaded = computed(() => {
    if (historyReplayMode.value === 'vehicle') return trajectoryLoaded.value
    if (historyReplayMode.value === 'route') return routeReplayLoaded.value
    return networkReplayLoaded.value
})
// 返回当前回放模式的播放状态
const activeTrajectoryIsPlaying = computed(() => {
    if (historyReplayMode.value === 'vehicle') return trajectoryIsPlaying.value
    if (historyReplayMode.value === 'route') return routeReplayIsPlaying.value
    return networkReplayIsPlaying.value
})
// 返回当前回放模式的播放倍速
const activeTrajectoryPlaybackSpeed = computed(() => {
    if (historyReplayMode.value === 'vehicle') return trajectoryPlaybackSpeed.value
    if (historyReplayMode.value === 'route') return routeReplayPlaybackSpeed.value
    return networkReplayPlaybackSpeed.value
})

// Cesium Viewer 和各基础图层分别管理，页面只按业务顺序调用它们。
const {
    createViewer,
    destroyViewer,
    setTerrainEnabled,
} = useCesiumViewer()

const {
    activeBaseMap,
    sceneDimension,
    initializeBaseMap,
    toggleBaseMap,
    toggleSceneDimension,
} = useMapDisplay()

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
// 根据整体模式控制聚合网格、车辆点和车辆模型
function syncRealtimeVehicleLayerVisibility(visible: boolean) {
    const renderMode = realtimeVehicleRenderMode.value
    setRealtimeVehiclePointsVisible(visible && renderMode !== 'model')
    setRealtimeVehicleModelsVisible(visible && renderMode !== 'point')
    setRealtimeVehicleGridsVisible(visible && renderMode === 'auto')
}

// 根据整体模式更新当前车辆图层
function updateActiveRealtimeVehicleLayer(
    currentViewer: Cesium.Viewer,
    snapshots: RealtimeVehiclePositionSnapshot[],
) {
    const renderMode = realtimeVehicleRenderMode.value

    if (renderMode === 'point') {
        clearRealtimeVehicleGridCells()
        updateRealtimeVehiclePointLayer(currentViewer, snapshots)
        updateRealtimeVehicleModelLayer(currentViewer, [])
        return
    }

    if (renderMode === 'model') {
        clearRealtimeVehicleGridCells()
        updateRealtimeVehiclePointLayer(currentViewer, [])
        updateRealtimeVehicleModelLayer(currentViewer, snapshots)
        return
    }

    const aggregationActive = resolveAggregationActive(currentViewer)

    if (aggregationActive) {
        const gridCells = aggregateVehicles(snapshots)

        renderRealtimeVehicleGridCells(currentViewer, gridCells)
        updateRealtimeVehiclePointLayer(currentViewer, [])
        updateRealtimeVehicleModelLayer(currentViewer, [])

        return
    }

        clearRealtimeVehicleGridCells()

    const visibleSnapshots = filterVehiclesInView(currentViewer, snapshots, selectedVehicleId.value)

    const {
        pointSnapshots,
        modelSnapshots,
    } = groupVehiclesByDistance(currentViewer, visibleSnapshots)

    updateRealtimeVehiclePointLayer(currentViewer, pointSnapshots)
    updateRealtimeVehicleModelLayer(currentViewer, modelSnapshots)
}

// 只有当前使用模型表现的车辆才存在可供Cesium跟踪的Entity
function getActiveRealtimeVehicleEntity(vehicleId: string): Cesium.Entity | undefined {
    const renderMode = realtimeVehicleRenderMode.value

    if (renderMode === 'model') {
        return getRealtimeVehicleModelEntity(vehicleId)
    }

    if (renderMode === 'auto' && getVehicleRepresentation(vehicleId) === 'model') {
        return getRealtimeVehicleModelEntity(vehicleId)
    }

    return undefined
}

// 按自动、点、模型的顺序切换测试模式
function toggleRealtimeVehicleRenderMode() {
    if (realtimeVehicleRenderMode.value === 'auto') {
        realtimeVehicleRenderMode.value = 'point'
    } else if (realtimeVehicleRenderMode.value === 'point') {
        realtimeVehicleRenderMode.value = 'model'
    } else {
        realtimeVehicleRenderMode.value = 'auto'
    }

    syncRealtimeVehicleLayerVisibility(!historyModeEnabled.value)

    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    updateActiveRealtimeVehicleLayer(currentViewer, realtimeVehicles.value)

    const vehicleId = selectedVehicleId.value

    if (vehicleId) {
        currentViewer.selectedEntity = getActiveRealtimeVehicleEntity(vehicleId)
    }

    currentViewer.scene.requestRender()
}

// 返回当前车辆显示模式的按钮文本
function getRealtimeVehicleRenderModeText(): string {
    if (realtimeVehicleRenderMode.value === 'auto') {
        return '车辆显示：自动LOD'
    }

    if (realtimeVehicleRenderMode.value === 'point') {
        return '车辆显示：全部点'
    }

    return '车辆显示：全部模型'
}

// 开始漫游当前选中的实时车辆
function handleStartSelectedVehicleRoaming() {
    const currentViewer = viewer
    const vehicleId = selectedVehicleId.value

    if (!currentViewer || currentViewer.isDestroyed() || !vehicleId) {
        return
    }

    trackRealtimeVehicle(currentViewer, vehicleId)
}

// 进入公交轨迹漫游选车模式
function openRealtimeRoamingMode() {
    if (historyModeEnabled.value) {
        closeHistoryMode()
    }

    handleClearNearbyQuery()
    openRoamingMode()

    if (selectedVehicleId.value) {
        handleStartSelectedVehicleRoaming()
    }
}

function closeRealtimeRoamingMode() {
    closeRoamingMode(viewer)
}

function handleExitRealtimeVehicle() {
    closeRealtimeRoamingMode()
    closeRoutePanel(viewer)
}

function toggleRealtimeRoamingMode() {
    if (realtimeRoamingModeEnabled.value) {
        handleExitRealtimeVehicle()
        return
    }

    openRealtimeRoamingMode()
}

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
    closeRealtimeRoamingMode()

    historyModeEnabled.value = true
    historyReplayMode.value = 'vehicle'

    // 历史模式与当前实时业务面板互斥
    handleCloseRoutePanel()
    handleCloseStopArrivalPanel()
    handleClearNearbyQuery()

    // 隐藏两种实时车辆图层，但不关闭 WebSocket。
    syncRealtimeVehicleLayerVisibility(false)

    clearVehicleTrajectory()
    clearTrajectoryLayer()
    clearVehicleRouteReplay()
    clearRouteReplayLayer()
    clearVehicleNetworkReplay()
    clearNetworkReplayLayer()

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

    syncRealtimeVehicleLayerVisibility(true)

    historyModeEnabled.value = false
}

function toggleHistoryMode() {
    if (historyModeEnabled.value) {
        closeHistoryMode()
        return
    }

    openHistoryMode()
}

// 切换回放模式并清理上一种模式留下的图层和查询结果
function handleHistoryReplayModeChange(mode: TrajectoryReplayMode) {
    if (historyReplayMode.value === mode) return

    cleanupVehicleTrajectoryLayer(viewer)
    cleanupRouteReplayLayer(viewer)
    cleanupNetworkReplayLayer(viewer)

    clearVehicleTrajectory()
    clearVehicleRouteReplay()
    clearVehicleNetworkReplay()

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

// 接收历史面板提交的全网查询参数
function handleNetworkTrajectoryQuery(query: NetworkTrajectoryQuery) {
    void queryVehicleNetworkTrajectories(query)
}

/**
 * 清除上一辆车或上一次查询的轨迹。
 */
function handleClearVehicleTrajectory() {
    clearVehicleTrajectory()
    clearVehicleRouteReplay()
    clearVehicleNetworkReplay()

    clearTrajectoryLayer()
    clearRouteReplayLayer()
    clearNetworkReplayLayer()

    handleCloseRoutePanel()
}

// 播放当前模式的历史轨迹
function handleTrajectoryPlay() {
    if (historyReplayMode.value === 'vehicle') {
        playVehicleTrajectory()
        return
    }

    if (historyReplayMode.value === 'route') {
        playRouteReplay()
        return
    }

    playNetworkReplay()
}

// 暂停当前模式的历史轨迹
function handleTrajectoryPause() {
    if (historyReplayMode.value === 'vehicle') {
        pauseVehicleTrajectory()
        return
    }

    if (historyReplayMode.value === 'route') {
        pauseRouteReplay()
        return
    }

    pauseNetworkReplay()
}

// 将当前模式的历史回放重置到起点
function handleTrajectoryReset() {
    if (historyReplayMode.value === 'vehicle') {
        resetVehicleTrajectory()
        return
    }

    if (historyReplayMode.value === 'route') {
        resetRouteReplay()
        return
    }

    resetNetworkReplay()
}

// 修改当前模式的历史回放倍速
function handleTrajectoryPlaybackSpeed(speed: number) {
    if (historyReplayMode.value === 'vehicle') {
        setVehicleTrajectoryPlaybackSpeed(speed)
        return
    }

    if (historyReplayMode.value === 'route') {
        setRouteReplayPlaybackSpeed(speed)
        return
    }

    setNetworkReplayPlaybackSpeed(speed)
}

// 跟随全网回放中的指定车辆，并高亮车辆所属线路
function handleNetworkTrackingChange(vehicleId: string | null) {
    setTrackedNetworkVehicle(vehicleId)

    if (!vehicleId) {
        handleCloseRoutePanel()
        return
    }

    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    const replayVehicle =
        vehicleNetworkReplay.value?.trajectories.find(
            (item) => item.trajectory.vehicleId === vehicleId
        )

    if (!replayVehicle) {
        return
    }

    selectRouteByFid(
        replayVehicle.routeFid,
        routeEntitiesByFid,
        currentViewer.clock.currentTime,
    )
}

// 从运营异常面板选择并定位车辆。
function handleSelectOperationalVehicle(vehicleId: string,) {
    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    const vehicle = realtimeVehicles.value.find( (item) => item.vehicleId === vehicleId )

    if (!vehicle) return

    selectRealtimeVehicle(
        vehicle.vehicleId,
        vehicle.routeFid,
        routeEntitiesByFid,
        currentViewer.clock.currentTime,
    )

    const vehicleEntity = getActiveRealtimeVehicleEntity(vehicleId)

    if (vehicleEntity) {
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

        return
    }

    const pointPosition = getRealtimeVehiclePointPosition(vehicleId)
        ?? Cesium.Cartesian3.fromDegrees(vehicle.longitude, vehicle.latitude)

    currentViewer.selectedEntity = undefined

    void currentViewer.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(pointPosition, 1),
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
    selectedPoiRadiusMeters.value = TRANSIT_CONFIG.poiAnalysis.defaultRadiusMeters
    clearNearbyQuery()
    clearPoiAnalysis()
    clearPoiPoints()
}

function toggleNearbyQuery() {
    if (nearbyQueryEnabled.value) {
        handleClearNearbyQuery()
        return
    }
    // 重新进入查询模式前清理旧结果，避免上一次结果残留。
    clearNearbyQuery()
    clearPoiAnalysis()
    nearbyQueryEnabled.value = true
}

// 使用当前滑动条半径，同时查询附近公交站和POI分析
function runNearbyAnalysis(center: NearbyQueryCenter) {
    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    const radiusMeters = selectedPoiRadiusMeters.value

    if (radiusMeters === 0) {
        clearNearbyQuery()
        setPoiZeroRadius(center)
        clearPoiPoints()
        return
    }

    void queryNearby(currentViewer, center, radiusMeters)
    void queryPoiAnalysis(center, radiusMeters)
}

// 拖动滑动条时只更新界面显示的半径
function handlePoiRadiusInput(radiusMeters: number) {
    selectedPoiRadiusMeters.value = radiusMeters
}

// 松开滑动条或点击预设值后，围绕原查询中心重新查询
function handlePoiRadiusChange(radiusMeters: number) {
    selectedPoiRadiusMeters.value = radiusMeters

    if (!poiQueryCenter.value) {
        return
    }

    runNearbyAnalysis(poiQueryCenter.value)
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

// 处理没有拾取到车辆、站点或线路时的地图点击
function handleNearbyMapClick(clickPosition: Cesium.Cartesian2) {
    closeRealtimeRoamingMode()

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
        clearPoiAnalysis()
        return
    }

    runNearbyAnalysis(center)
}

function toggleBusRoutes() {
    setBusRoutesVisible(!busRoutesVisible.value)
}

function toggleWhiteModel() {
    setWhiteModelVisible(!whiteModelVisible.value)
}

async function handleToggleBaseMap() {
    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    await toggleBaseMap(currentViewer)
}

function handleToggleSceneDimension() {
    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    toggleSceneDimension(currentViewer)
}

function handleToggleTerrain() {
    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    terrainEnabled.value = !terrainEnabled.value
    setTerrainEnabled(currentViewer, terrainEnabled.value)
}

function toRouteId(fid: number): string {
    return `route_${String(fid).padStart(6, '0')}`
}

watch(nearbyPois, (pois) => {
    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    if (pois.length === 0) {
        clearPoiPoints()
        return
    }

    renderPoiPoints(currentViewer, pois)
})

watch(poiPointsVisible, (visible) => {
    setPoiLayerVisible(visible)
})
watch(poiTypeVisibility, (visibility) => {
    setPoiLayerTypeVisibility(visibility)
})

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

// 全网查询成功后加载全部车辆轨迹。
watch(
    vehicleNetworkReplay, (networkReplay) => {
        const currentViewer = viewer

        if (
            historyReplayMode.value !== 'network' ||
            !historyModeEnabled.value ||
            !networkReplay ||
            !currentViewer ||
            currentViewer.isDestroyed()
        ) {
            return
        }

        loadNetworkReplayLayer(
            currentViewer,
            networkReplay,
        )
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
    updateRealtimeVehicleRoamingVehicles(snapshots)

    const currentViewer = viewer

    // Viewer 尚未创建时先保留数据，暂不绘制
    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    updateActiveRealtimeVehicleLayer(currentViewer, snapshots)
})

watch(selectedVehicleId, (vehicleId) => {
    if (!realtimeRoamingModeEnabled.value || !vehicleId) {
        return
    }

    const currentViewer = viewer

    if (!currentViewer || currentViewer.isDestroyed()) {
        return
    }

    trackRealtimeVehicle(currentViewer, vehicleId)
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

onMounted(async () => { 
    // WebSocket 与 Cesium 图层初始化相互独立
    connectRealtimeVehicles()

    if ( !cesiumContainer.value) return

    try {
        viewer = await createViewer(cesiumContainer.value)

        await initializeBaseMap(viewer)

        updateActiveRealtimeVehicleLayer(viewer, realtimeVehicles.value)

        syncRealtimeVehicleLayerVisibility(true)

        loadCityRoadWmts(viewer)  // 城市静态路网使用 GeoServer WMTS

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
        console.error('地图初始化失败：', error) 
    }
})

// 卸载时按“交互监听 → 业务索引 → 图层 → Viewer”的顺序释放资源。
onBeforeUnmount(() => { 
    void disconnectRealtimeVehicles()

    cleanupRealtimeVehicleRoaming(viewer)

    cleanupVehicleTrajectoryQuery()
    cleanupVehicleTrajectoryLayer(viewer)
    cleanupVehicleRouteReplayQuery()
    cleanupRouteReplayLayer(viewer)
    cleanupVehicleNetworkReplayQuery()
    cleanupNetworkReplayLayer(viewer)

    cleanupRouteSelection()
    cleanupStopArrivals()
    cleanupNearbyBusStops(viewer)
    cleanupPoiAnalysis()
    cleanupPoiPointLayer(viewer)
    cleanupBusStopLayer(viewer)
    cleanupRealtimeVehiclePointLayer(viewer)
    cleanupRealtimeVehicleModelLayer(viewer)
    cleanupRealtimeVehicleLod()
    cleanupRealtimeVehicleGridAggregation()
    cleanupRealtimeVehicleGridLayer(viewer)
    routeEntitiesByFid.clear()

    cleanupFutianBoundary(viewer)
    cleanupWhiteModel(viewer)
    cleanupCityRoadWmts(viewer)
    destroyViewer()

    viewer = undefined
})

</script>

<template>
    <div class="transit-shell" :class="{ 'is-history-mode': historyModeEnabled }">
        <header class="transit-header">
            <div class="transit-brand" aria-label="深圳智慧公交">
                <span class="transit-brand__mark" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M6.5 4.5h11l1.5 3v9.25a1.25 1.25 0 0 1-1.25 1.25H6.25A1.25 1.25 0 0 1 5 16.75V7.5l1.5-3Z" />
                        <path d="M5 8h14M8 18v2M16 18v2M8.25 14.5h.01M15.75 14.5h.01" />
                    </svg>
                </span>

                <div>
                    <strong>深圳市福田区智慧公交</strong>
                    <span>Smart Transit WebGIS</span>
                </div>
            </div>

            <div class="map-view-controls" aria-label="地图视图控制">
                <button
                    class="map-tool-button map-tool-button--basemap is-active"
                    type="button"
                    :title="activeBaseMap === 'satellite' ? '切换到 OSM 道路图' : '切换到卫星影像'"
                    :aria-label="activeBaseMap === 'satellite' ? '切换到 OSM 道路图' : '切换到卫星影像'"
                    @click="handleToggleBaseMap"
                >
                    <svg class="map-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
                        <path d="m3 12 9 5 9-5" />
                        <path d="m3 16 9 5 9-5" />
                    </svg>
                    <span class="map-tool-label">
                        {{ activeBaseMap === 'satellite' ? '卫星' : 'OSM' }}
                    </span>
                </button>

                <button
                    class="map-tool-button map-tool-button--dimension is-active"
                    type="button"
                    :title="sceneDimension === '3d' ? '切换到二维地图' : '切换到三维地图'"
                    :aria-label="sceneDimension === '3d' ? '切换到二维地图' : '切换到三维地图'"
                    @click="handleToggleSceneDimension"
                >
                    {{ sceneDimension === '3d' ? '3D' : '2D' }}
                </button>

                <button
                    class="map-tool-button map-tool-button--terrain"
                    :class="{ 'is-active': terrainEnabled }"
                    type="button"
                    :aria-pressed="terrainEnabled"
                    :title="terrainEnabled ? '关闭地形' : '开启地形'"
                    :aria-label="terrainEnabled ? '关闭地形' : '开启地形'"
                    @click="handleToggleTerrain"
                >
                    <svg class="map-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m3 19 6.2-10 3.2 4.5L15.2 10 21 19H3Z" />
                        <path d="m7.4 12 1.8 1.7 1.4-1.3" />
                    </svg>
                    <span class="map-tool-label">
                        {{ terrainEnabled ? '地形' : '平面' }}
                    </span>
                </button>
            </div>
        </header>

        <div class="transit-workspace" :class="{ 'has-right-workbench': rightWorkbenchVisible }">
            <nav class="layer-controls" aria-label="公交地图功能">
            <button
                class="layer-control-button"
                :class="{ 'is-active': historyModeEnabled }"
                type="button"
                :aria-pressed="historyModeEnabled"
                @click="toggleHistoryMode"
            >
                <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
                    <path d="M4 4v4.68h4.68M12 7v5l3 2" />
                </svg>
                <span class="layer-control-copy">
                    <strong>历史回放</strong>
                    <small>{{ historyModeEnabled ? '回放模式已开启' : '车辆轨迹查询' }}</small>
                </span>
            </button>

            <button
                class="layer-control-button"
                :class="{ 'is-active': realtimeRoamingModeEnabled }"
                type="button"
                :aria-pressed="realtimeRoamingModeEnabled"
                @click="toggleRealtimeRoamingMode"
            >
                <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 18c3.2-5.8 5.8-3.2 8.4-8.5C14.8 6.7 16.7 5 20 5" />
                    <circle cx="5" cy="18" r="2" />
                    <circle cx="20" cy="5" r="2" />
                    <path d="m14.5 17 2.5 2.5L21 15" />
                </svg>
                <span class="layer-control-copy">
                    <strong>公交漫游</strong>
                    <small>{{ realtimeRoamingModeEnabled ? '车辆跟随中' : '实时车辆跟随' }}</small>
                </span>
            </button>

            <button
                class="layer-control-button"
                :class="{ 'is-active': nearbyQueryEnabled }"
                type="button"
                :aria-pressed="nearbyQueryEnabled"
                @click="toggleNearbyQuery"
            >
                <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                    <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span class="layer-control-copy">
                    <strong>附近站点</strong>
                    <small>{{ nearbyQueryEnabled ? '点击地图选点' : '空间范围查询' }}</small>
                </span>
            </button>

            <button
                class="layer-control-button"
                :class="{ 'is-active': busRoutesVisible }"
                type="button"
                :aria-pressed="busRoutesVisible"
                @click="toggleBusRoutes"
            >
                <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4" y="5" width="16" height="13" rx="3" />
                    <path d="M7 9h10M8 18v2M16 18v2M8 14h.01M16 14h.01" />
                </svg>
                <span class="layer-control-copy">
                    <strong>公交线路</strong>
                    <small>{{ busRoutesVisible ? '线路图层已显示' : '线路图层已隐藏' }}</small>
                </span>
            </button>

            <button
                class="layer-control-button"
                :class="{ 'is-active': whiteModelVisible }"
                type="button"
                :aria-pressed="whiteModelVisible"
                @click="toggleWhiteModel"
            >
                <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 20V8l5-3v15M9 20V4l6-2v18M15 20V8l5 3v9M2 20h20" />
                    <path d="M6.5 10h.01M6.5 13h.01M12 7h.01M12 11h.01M18 13h.01" />
                </svg>
                <span class="layer-control-copy">
                    <strong>城市白膜</strong>
                    <small>{{ whiteModelVisible ? '建筑模型已显示' : '建筑模型已隐藏' }}</small>
                </span>
            </button>

            <button
                class="layer-control-button"
                :class="{ 'is-active': realtimeVehicleRenderMode === 'auto' }"
                type="button"
                :aria-pressed="realtimeVehicleRenderMode === 'auto'"
                :disabled="historyModeEnabled"
                @click="toggleRealtimeVehicleRenderMode"
            >
                <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m12 3 8 4-8 4-8-4 8-4Z" />
                    <path d="m4 11 8 4 8-4M4 15l8 4 8-4" />
                </svg>
                <span class="layer-control-copy">
                    <strong>车辆 LOD</strong>
                    <small>{{ getRealtimeVehicleRenderModeText().replace('车辆显示：', '') }}</small>
                </span>
            </button>
            </nav>

            <main class="map-stage">
                <div ref="cesiumContainer" class="cesium-container"></div>

                <RealtimeRouteProgressPanel
                    v-if="realtimeRoamingModeEnabled && trackedRealtimeVehicle && !selectedRouteStop"
                    :vehicle="trackedRealtimeVehicle"
                    :route="trackedRealtimeRoute"
                    :stops="trackedRealtimeRouteStops"
                />
            </main>

            <aside
                v-if="rightWorkbenchVisible"
                class="right-workbench"
                aria-label="公交业务工作台"
            >
                <div
                    v-if="nearbyQueryEnabled && queryStatus === 'idle'"
                    class="right-workbench__empty"
                >
                    <span class="right-workbench__empty-icon" aria-hidden="true">⌖</span>
                    <strong>附近站点查询</strong>
                    <p>请点击地图选择查询位置</p>
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
                :tracking="trackedRealtimeVehicleId === selectedRealtimeVehicle?.vehicleId"
                @start-tracking="handleStartSelectedVehicleRoaming"
                @close="handleExitRealtimeVehicle"
            />

            <PoiAnalysisPanel
                :summary="poiSummary"
                :status="poiAnalysisStatus"
                :error-message="poiAnalysisErrorMessage"
                :radius-meters="selectedPoiRadiusMeters"
                :points-visible="poiPointsVisible"
                :type-visibility="poiTypeVisibility"
                @clear="handleClearNearbyQuery"
                @radius-input="handlePoiRadiusInput"
                @radius-change="handlePoiRadiusChange"
                @points-visible-change="setPoiPointsVisible"
                @focus-type="focusPoiType"
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
            :network-replay="vehicleNetworkReplay"
            :network-replay-status="vehicleNetworkReplayStatus"
            :network-replay-error-message="vehicleNetworkReplayErrorMessage"
            :trajectory-loaded="activeTrajectoryLoaded"
            :is-playing="activeTrajectoryIsPlaying"
            :playback-speed="activeTrajectoryPlaybackSpeed"
            :camera-tracking-enabled="trajectoryCameraTrackingEnabled"
            :tracked-route-vehicle-id="trackedRouteVehicleId"
            :tracked-network-vehicle-id="trackedNetworkVehicleId"
            @change-mode="handleHistoryReplayModeChange"
            @query-vehicle="handleVehicleTrajectoryQuery"
            @query-route="handleRouteTrajectoryQuery"
            @query-network="handleNetworkTrajectoryQuery"
            @close="closeHistoryMode"
            @retry-availability="loadVehicleHistoryAvailability"
            @clear-trajectory="handleClearVehicleTrajectory"
            @play="handleTrajectoryPlay"
            @pause="handleTrajectoryPause"
            @reset="handleTrajectoryReset"
            @change-speed="handleTrajectoryPlaybackSpeed"
            @change-camera-tracking="setVehicleTrajectoryCameraTracking"
            @change-route-tracking="setTrackedRouteVehicle"
            @change-network-tracking="handleNetworkTrackingChange"
                />
            </aside>
        </div>

        <RealtimeOperationalAlertPanel
            v-if="!historyModeEnabled"
            :vehicles="realtimeVehicles"
            @select-vehicle="handleSelectOperationalVehicle"
        />

    </div>
</template>

<style scoped>
.transit-shell {
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    flex-direction: column;
    overflow: hidden;
    color: var(--transit-panel-text);
    background: #f2f5fa;
    font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.transit-header {
    position: relative;
    z-index: 30;
    display: flex;
    height: 76px;
    flex: 0 0 76px;
    align-items: center;
    justify-content: space-between;
    margin: 8px 10px 8px;
    padding: 0 18px 0 26px;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid rgba(219, 228, 240, 0.9);
    border-radius: 14px;
    box-shadow: 0 5px 18px rgba(37, 64, 109, 0.08);
}

.transit-brand {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 14px;
}

.transit-brand__mark {
    display: grid;
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    place-items: center;
    color: #2478ed;
    background: #eef6ff;
    border-radius: 12px;
}

.transit-brand__mark svg {
    width: 45px;
    height: 45px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.transit-brand strong,
.transit-brand span {
    display: block;
}

.transit-brand strong {
    color: #13223a;
    font-size: 24px;
    line-height: 1.2;
    letter-spacing: 0.03em;
}

.transit-brand span {
    margin-top: 3px;
    color: #8492a8;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.transit-workspace {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    gap: 8px;
    padding: 0 10px 10px;
}

.right-workbench {
    position: relative;
    z-index: 20;
    --workbench-width: clamp(340px, 29vw, 330px);
    width: var(--workbench-width);
    flex: 0 0 var(--workbench-width);
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid #dbe4f0;
    border-radius: 14px;
    box-shadow: 0 6px 22px rgba(28, 51, 86, 0.08);
    scrollbar-color: #cbd5e1 transparent;
    scrollbar-width: thin;
}
/* 公交线路详情 */
.right-workbench:has(.route-panel) {
    --workbench-width: 310px;
}

/* 实时车辆详情 */
.right-workbench:has(.vehicle-panel) {
    --workbench-width: 300px;
}

/* 站点到站信息 */
.right-workbench:has(.arrival-panel) {
    --workbench-width: 400px;
}

/* 附近站点 */
.right-workbench:has(.nearby-panel) {
    --workbench-width: 300px;
}

/* POI 服务分析 */
.right-workbench:has(.poi-panel) {
    --workbench-width: 360px;
}

/* 历史轨迹回放 */
.right-workbench:has(.trajectory-panel) {
    --workbench-width: 360px;
}

.right-workbench__empty {
    display: flex;
    min-height: 260px;
    align-items: center;
    justify-content: center;
    padding: 30px;
    color: var(--transit-panel-muted);
    text-align: center;
    flex-direction: column;
}

.right-workbench__empty-icon {
    display: grid;
    width: 48px;
    height: 48px;
    place-items: center;
    margin-bottom: 14px;
    color: var(--transit-panel-primary);
    background: var(--transit-panel-primary-soft);
    border-radius: 50%;
    font-size: 28px;
}

.right-workbench__empty strong {
    color: var(--transit-panel-text);
    font-size: 17px;
}

.right-workbench__empty p {
    margin: 8px 0 0;
    font-size: 13px;
}

.map-stage {
    position: relative;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
    background: #dbe4ee;
    border: 1px solid #dbe4f0;
    border-radius: 14px;
    box-shadow: 0 6px 22px rgba(28, 51, 86, 0.1);
}

.cesium-container {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.layer-controls {
    display: flex;
    width: 165px;
    flex: 0 0 165px;
    flex-direction: column;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid #dbe4f0;
    border-radius: 14px;
    box-shadow: 0 6px 22px rgba(28, 51, 86, 0.08);
}

.layer-control-button {
    position: relative;
    display: flex;
    width: 100%;
    min-height: 74px;
    align-items: center;
    gap: 13px;
    padding: 12px 16px;
    color: #53647c;
    background: transparent;
    border: 0;
    border-bottom: 1px solid #edf1f6;
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: color 160ms ease, background-color 160ms ease;
}

.layer-control-button:hover {
    color: #246fde;
    background: #f5f9ff;
}

.layer-control-button.is-active {
    color: #1670ed;
    background: #eef6ff;
}

.layer-control-button.is-active::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    content: "";
    background: #2478ed;
    border-radius: 0 4px 4px 0;
}

.layer-control-button:disabled {
    opacity: 0.48;
    cursor: not-allowed;
}

.layer-control-icon {
    width: 25px;
    height: 25px;
    flex: 0 0 25px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.layer-control-copy {
    min-width: 0;
}

.layer-control-copy strong,
.layer-control-copy small {
    display: block;
}

.layer-control-copy strong {
    font-size: 15px;
    line-height: 1.3;
}

.layer-control-copy small {
    margin-top: 4px;
    overflow: hidden;
    color: #93a0b2;
    font-size: 11px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.map-view-controls {
    display: flex;
    align-items: stretch;
    gap: 10px;
    margin-right: 100px;
}

.map-tool-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 58px;
    height: 48px;
    padding: 0;
    border: 1px solid var(--transit-panel-border);
    border-radius: 6px;
    color: var(--transit-panel-text);
    background: var(--transit-panel-bg);
    box-shadow: none;
    cursor: pointer;
    font: inherit;
    transition: background-color 160ms ease, border-color 160ms ease;
}

.map-tool-button.is-active {
    color: #185fc7;
    background: #f7fbff;
    border-color: #a9c9f8;
    box-shadow: inset 0 -3px 0 #2478ed;
}

.map-tool-button--dimension {
    font-size: 16px;
    font-weight: 750;
}

.map-tool-button:hover {
    color: var(--transit-panel-primary);
    border-color: #93c5fd;
    background: var(--transit-panel-primary-soft);
}

.map-tool-button:focus-visible {
    outline: 2px solid var(--transit-panel-primary);
    outline-offset: 2px;
}

.map-tool-icon {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.map-tool-label {
    font-size: 11px;
    line-height: 1;
}

.cesium-container :deep(.cesium-performanceDisplay-defaultContainer) {
    position: fixed;
    top: 23px;
    right: 26px;
    left: auto;
    bottom: auto;
    z-index: 50;
}

.cesium-container :deep(.cesium-viewer-toolbar) {
    display: none;
}

.cesium-container :deep(.cesium-viewer-animationContainer),
.cesium-container :deep(.cesium-viewer-timelineContainer) {
    display: none;
}

.transit-shell.is-history-mode .cesium-container :deep(.cesium-viewer-animationContainer),
.transit-shell.is-history-mode .cesium-container :deep(.cesium-viewer-timelineContainer) {
    display: block;
}

.cesium-container :deep(.cesium-viewer-bottom),
.cesium-container :deep(.cesium-widget-credits) {
    display: none !important;
}

.cesium-container :deep(.cesium-viewer-fullscreenContainer) {
    right: 8px;
    bottom: 8px;
}

.right-workbench :deep(.route-panel),
.right-workbench :deep(.vehicle-panel),
.right-workbench :deep(.arrival-panel),
.right-workbench :deep(.nearby-panel),
.right-workbench :deep(.trajectory-panel),
.right-workbench :deep(.poi-panel) {
    position: relative;
    inset: auto;
    width: 100%;
    max-width: none;
    max-height: none;
    color: var(--transit-panel-text);
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
}

.right-workbench :deep(.poi-panel) {
    border-bottom: 1px solid var(--transit-panel-divider);
}

.transit-shell :deep(.operational-alert-panel) {
    position: fixed;
    z-index: 90;
    right: 14px;
    bottom: 14px;
}

/* 公交漫游底部站序面板位置：right / bottom / left 控制地图内三侧留白。 */
.map-stage :deep(.realtime-route-progress) {
    position: absolute;
    z-index: 80;
    right: 14px;
    bottom: 14px;
    left: 14px;
}

@media (max-width: 960px) {
    .transit-header {
        padding-left: 18px;
    }

    .transit-brand strong {
        font-size: 20px;
    }

    .transit-brand span,
    .layer-control-copy small {
        display: none;
    }

    .layer-controls {
        width: 76px;
        flex-basis: 76px;
    }

    .layer-control-button {
        min-height: 70px;
        justify-content: center;
        padding: 10px 6px;
        gap: 5px;
        flex-direction: column;
        text-align: center;
    }

    .layer-control-copy strong {
        font-size: 12px;
    }

    .map-view-controls {
        margin-right: 94px;
    }
}

@media (max-width: 680px) {
    .transit-header {
        height: 62px;
        flex-basis: 62px;
        margin: 6px;
        padding: 0 10px 0 12px;
    }

    .transit-brand__mark {
        width: 36px;
        height: 36px;
        flex-basis: 36px;
    }

    .transit-brand__mark svg {
        width: 24px;
        height: 24px;
    }

    .transit-brand strong {
        font-size: 16px;
    }

    .transit-workspace {
        display: block;
        padding: 0 6px 72px;
    }

    .map-stage {
        width: 100%;
        height: 100%;
    }

    .layer-controls {
        position: fixed;
        z-index: 60;
        right: 6px;
        bottom: 6px;
        left: 6px;
        display: grid;
        width: auto;
        height: 60px;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        border-radius: 12px;
    }

    .layer-control-button {
        min-height: 0;
        height: 58px;
        border-right: 1px solid #edf1f6;
        border-bottom: 0;
    }

    .layer-control-button.is-active::before {
        inset: auto 8px 0;
        width: auto;
        height: 3px;
        border-radius: 3px 3px 0 0;
    }

    .layer-control-icon {
        width: 21px;
        height: 21px;
    }

    .layer-control-copy strong {
        font-size: 10px;
    }

    .map-view-controls {
        gap: 5px;
        margin-right: 0;
    }

    .map-tool-button {
        width: 42px;
        height: 40px;
    }

    .map-tool-button--basemap {
        display: none;
    }

    .cesium-container :deep(.cesium-performanceDisplay-defaultContainer) {
        display: none;
    }

    .transit-workspace.has-right-workbench {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .transit-workspace.has-right-workbench .map-stage {
        height: auto;
        flex: 1 1 54%;
    }

    .right-workbench {
        width: 100%;
        flex: 1 1 46%;
        border-radius: 12px;
    }

    .map-stage :deep(.realtime-route-progress) {
        right: 10px;
        bottom: 10px;
        left: 10px;
    }

    .transit-shell :deep(.operational-alert-panel) {
        right: 12px;
        bottom: 78px;
    }
}
</style>
