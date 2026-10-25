<script setup lang="ts">    
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import TransitMapHeader from '@/components/transit-map/TransitMapHeader.vue'
import TransitLayerToolbar from '@/components/transit-map/TransitLayerToolbar.vue'

// 页面组件只负责组装各个图层和交互模块，具体实现放在 composables 中。
import BusRouteInfoPanel from '@/components/transit/BusRouteInfoPanel.vue'
import NearbyBusStopPanel from '@/components/transit/NearbyBusStopPanel.vue'
import PoiAnalysisPanel from '@/components/transit/PoiAnalysisPanel.vue'
import RealtimeVehicleInfoPanel from '@/components/transit/RealtimeVehicleInfoPanel.vue'
import RealtimeOperationalAlertPanel from '@/components/transit/RealtimeOperationalAlertPanel.vue'
import StopArrivalPanel from '@/components/transit/StopArrivalPanel.vue'
import VehicleTrajectoryPanel from '@/components/transit/VehicleTrajectoryPanel.vue'
import RealtimeRouteProgressPanel from '@/components/transit/RealtimeRouteProgressPanel.vue'
import MapLoadingView from './MapLoadingView.vue'
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
import { useTrajectoryPlaybackController } from '@/composables/useTrajectoryPlaybackController'
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

type MapLoadingStatus =
    | 'initializing'
    | 'loading'
    | 'ready'
    | 'degraded'
    | 'error'

const mapLoadingStatus = ref<MapLoadingStatus>('initializing')
const mapLoadingStage = ref('正在初始化三维场景...')
const mapLoadingIssues = ref<string[]>([])
const loadingPanelVisible = ref(true)

const nearbyQueryEnabled = ref(false)
const selectedPoiRadiusMeters = ref<number>(TRANSIT_CONFIG.poiAnalysis.defaultRadiusMeters)
const historyModeEnabled = ref(false)
const historyReplayMode = ref<TrajectoryReplayMode>('vehicle')
const realtimeVehicleRenderMode = ref<RealtimeVehicleRenderMode>('auto')
const selectedRouteStops = ref<OrderedBusStop[]>([])
const terrainEnabled = ref(true)

// viewer 属于当前页面实例，页面卸载时必须销毁，避免 WebGL 资源泄漏。
let viewer: Cesium.Viewer | undefined
let baseMapInitialized = false

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

const {
    activeLoaded: activeTrajectoryLoaded,
    activeIsPlaying: activeTrajectoryIsPlaying,
    activePlaybackSpeed: activeTrajectoryPlaybackSpeed,
    play: handleTrajectoryPlay,
    pause: handleTrajectoryPause,
    reset: handleTrajectoryReset,
    setPlaybackSpeed: handleTrajectoryPlaybackSpeed,
    clearAll: clearAllTrajectoryPlayback,
    cleanupAll: cleanupAllTrajectoryPlayback,
    changeMode: changeTrajectoryPlaybackMode,
} = useTrajectoryPlaybackController({
    mode: historyReplayMode,
    vehicle: {
        loaded: trajectoryLoaded,
        isPlaying: trajectoryIsPlaying,
        playbackSpeed: trajectoryPlaybackSpeed,
        play: playVehicleTrajectory,
        pause: pauseVehicleTrajectory,
        reset: resetVehicleTrajectory,
        setPlaybackSpeed: setVehicleTrajectoryPlaybackSpeed,
        clearData: clearVehicleTrajectory,
        clearLayer: clearTrajectoryLayer,
        cleanupData: cleanupVehicleTrajectoryQuery,
        cleanupLayer: () => cleanupVehicleTrajectoryLayer(viewer),
    },
    route: {
        loaded: routeReplayLoaded,
        isPlaying: routeReplayIsPlaying,
        playbackSpeed: routeReplayPlaybackSpeed,
        play: playRouteReplay,
        pause: pauseRouteReplay,
        reset: resetRouteReplay,
        setPlaybackSpeed: setRouteReplayPlaybackSpeed,
        clearData: clearVehicleRouteReplay,
        clearLayer: clearRouteReplayLayer,
        cleanupData: cleanupVehicleRouteReplayQuery,
        cleanupLayer: () => cleanupRouteReplayLayer(viewer),
    },
    network: {
        loaded: networkReplayLoaded,
        isPlaying: networkReplayIsPlaying,
        playbackSpeed: networkReplayPlaybackSpeed,
        play: playNetworkReplay,
        pause: pauseNetworkReplay,
        reset: resetNetworkReplay,
        setPlaybackSpeed: setNetworkReplayPlaybackSpeed,
        clearData: clearVehicleNetworkReplay,
        clearLayer: clearNetworkReplayLayer,
        cleanupData: cleanupVehicleNetworkReplayQuery,
        cleanupLayer: () => cleanupNetworkReplayLayer(viewer),
    },
})

// Cesium Viewer 和各基础图层分别管理，页面只按业务顺序调用它们。
const {
    createViewer,
    destroyViewer,
    setTerrainEnabled,
    waitForInitialGlobeTiles,
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
    waitForInitialWhiteModelTiles,
    applyBoundaryClipping,
    whiteModelVisible,
    setWhiteModelVisible,
    cleanupWhiteModel,
} = useWhiteModelLayer()

const {
    loadFutianBoundary,
    cleanupFutianBoundary,
} = useFutianBoundaryLayer()

// ===========================【函数】===========================
// 根据整体模式控制聚合网格、车辆点
function syncRealtimeVehicleLayerVisibility(visible: boolean) {
    const renderMode = realtimeVehicleRenderMode.value
    setRealtimeVehiclePointsVisible(visible)
    setRealtimeVehicleModelsVisible(visible && renderMode === 'auto')
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

function getActiveRealtimeVehicleEntity(vehicleId: string): Cesium.Entity | undefined {
    if (
        realtimeVehicleRenderMode.value === 'auto' &&
        getVehicleRepresentation(vehicleId) === 'model'
    ) {
        return getRealtimeVehicleModelEntity(vehicleId)
    }

    return undefined
}

// 在自动LOD和全部点模式之间切换
function toggleRealtimeVehicleRenderMode() {
    realtimeVehicleRenderMode.value = realtimeVehicleRenderMode.value === 'auto' ? 'point' : 'auto'

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

    clearAllTrajectoryPlayback()

    void loadVehicleHistoryAvailability()
}

/**
 * 退出历史轨迹模式。
 */
function closeHistoryMode() {
    cleanupAllTrajectoryPlayback()
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

// 切换历史回放模式，并关闭上一种模式关联的线路面板
function handleHistoryReplayModeChange(mode: TrajectoryReplayMode) {
    if (!changeTrajectoryPlaybackMode(mode)) return

    handleCloseRoutePanel()
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

// 清空当前历史查询和三种回放图层
function handleClearTrajectoryReplay() {
    clearAllTrajectoryPlayback()
    handleCloseRoutePanel()
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

function retryMapLoading() {
    window.location.reload()
}
function continueWithDegradedMap() {
    loadingPanelVisible.value = false
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
    if (!currentViewer || currentViewer.isDestroyed() || !baseMapInitialized) {
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
    loadingPanelVisible.value = true
    mapLoadingStatus.value = 'initializing'
    mapLoadingStage.value = '正在初始化三维场景'
    mapLoadingIssues.value = []

    // WebSocket 与 Cesium 图层初始化相互独立
    connectRealtimeVehicles()

    if ( !cesiumContainer.value) return

    try {
        viewer = await createViewer(cesiumContainer.value)
        mapLoadingStage.value = '正在定位福田区...'

        viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(114.041, 22.462, 8000),
            orientation: {
                heading: 0,
                pitch: Cesium.Math.toRadians(-45),
                roll: 0,
            },
        })

        mapLoadingStatus.value = 'loading'
        mapLoadingStage.value = '正在加载地图影像与地形...'

        await initializeBaseMap(viewer)

        baseMapInitialized = true

        updateActiveRealtimeVehicleLayer(viewer, realtimeVehicles.value)

        syncRealtimeVehicleLayerVisibility(true)

        loadCityRoadWmts(viewer)  // 城市静态路网使用 GeoServer WMTS

        mapLoadingStage.value = '正在加载城市建筑与公交数据...'

        const initialGlobeTilesPromise = waitForInitialGlobeTiles(viewer)

        const whiteModelLoadPromise = loadWhiteModel(viewer)
        const whiteModelInitialTilesPromise = whiteModelLoadPromise
            .then((tileset) => {
                return waitForInitialWhiteModelTiles(tileset)
            })
            .catch(() => false)

        // 资源互不依赖，同时开始请求
        const [
            futianBoundaryResult,
            whiteModelResult,
            busRoutesResult,
            busStopsResult,
        ] = await Promise.allSettled([
            loadFutianBoundary(viewer),
            whiteModelLoadPromise,
            loadBusRoutes(viewer),
            loadBusStops(viewer),
        ])

        // 只有边界坐标和白模都准备完成后，才能应用白模裁剪。
        if (futianBoundaryResult.status === 'fulfilled' && whiteModelResult.status === 'fulfilled' && !viewer.isDestroyed()) {
            applyBoundaryClipping(viewer.scene, futianBoundaryResult.value)
        }

        if (futianBoundaryResult.status === 'rejected') {
            console.error('福田行政区边界加载失败：', futianBoundaryResult.reason)
            mapLoadingIssues.value.push('福田行政区边界加载失败')
        }
        if (whiteModelResult.status === 'rejected') {
            console.error('城市白模加载失败：', whiteModelResult.reason)
            mapLoadingIssues.value.push('城市白模加载失败')
        }
        if (busRoutesResult.status === 'fulfilled') {
            bindRouteSelection(
                viewer,
                busRoutesResult.value,
                routeEntitiesByFid,
                handleNearbyMapClick
            )
        } else {
            console.error('公交线路加载失败：', busRoutesResult.reason)
        }
        if (busStopsResult.status === 'rejected') {
            console.error('公交站点加载失败：', busStopsResult.reason)
            mapLoadingIssues.value.push('公交站点加载失败')
        }
        mapLoadingStage.value = '正在完成首屏地图渲染...'
        const [
            initialWhiteModelLoaded,
            initialGlobeTilesLoaded,
        ] = await Promise.all([
            whiteModelResult.status === 'fulfilled' ? whiteModelInitialTilesPromise : Promise.resolve(false),
            initialGlobeTilesPromise,
        ])
        setWhiteModelVisible(false)
        if (whiteModelResult.status === 'fulfilled' && !initialWhiteModelLoaded) {
            console.warn('城市白模初始瓦片加载超时')
            mapLoadingIssues.value.push('城市白模加载超时')
        }
        if (!initialGlobeTilesLoaded) {
            console.warn('地图影像或地形加载超时')
            mapLoadingIssues.value.push('地图影像或地形加载超时')
        }
        if (mapLoadingIssues.value.length === 0) {
            mapLoadingStatus.value = 'ready'
            mapLoadingStage.value = '地图加载完成'
        } else {
            mapLoadingStatus.value = 'degraded'
            mapLoadingStage.value = '部分资源未完成，核心地图仍可使用'
        }

    } catch (error) {
        console.error('地图初始化失败：', error)
        mapLoadingStatus.value = 'error'
        mapLoadingStage.value = '三维地图初始化失败'
        mapLoadingIssues.value = [error instanceof Error ? error.message : '发生未知初始化错误']
    }
})

// 卸载时按“交互监听 → 业务索引 → 图层 → Viewer”的顺序释放资源。
onBeforeUnmount(() => { 
    void disconnectRealtimeVehicles()

    cleanupRealtimeVehicleRoaming(viewer)

    cleanupAllTrajectoryPlayback()

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

        <TransitMapHeader
            :active-base-map="activeBaseMap"
            :scene-dimension="sceneDimension"
            :terrain-enabled="terrainEnabled"
            @toggle-base-map="handleToggleBaseMap"
            @toggle-scene-dimension="handleToggleSceneDimension"
            @toggle-terrain="handleToggleTerrain"
        />

        <div class="transit-workspace" :class="{ 'has-right-workbench': rightWorkbenchVisible }">

            <TransitLayerToolbar
                :history-mode-enabled="historyModeEnabled"
                :realtime-roaming-mode-enabled="realtimeRoamingModeEnabled"
                :nearby-query-enabled="nearbyQueryEnabled"
                :bus-routes-visible="busRoutesVisible"
                :white-model-visible="whiteModelVisible"
                :realtime-vehicle-render-mode="realtimeVehicleRenderMode"
                @toggle-history-mode="toggleHistoryMode"
                @toggle-realtime-roaming-mode="toggleRealtimeRoamingMode"
                @toggle-nearby-query="toggleNearbyQuery"
                @toggle-bus-routes="toggleBusRoutes"
                @toggle-white-model="toggleWhiteModel"
                @toggle-realtime-vehicle-render-mode="toggleRealtimeVehicleRenderMode"
            />

            <main class="map-stage">
                <div ref="cesiumContainer" class="cesium-container"></div>

                <Teleport to="body">
                    <Transition name="map-loading-fade" appear>
                        <MapLoadingView
                            v-if="loadingPanelVisible && mapLoadingStatus !== 'ready'"
                            :status="mapLoadingStatus"
                            :stage="mapLoadingStage"
                            :issues="mapLoadingIssues"
                            @retry="retryMapLoading"
                            @continue="continueWithDegradedMap"
                        />
                    </Transition>
                </Teleport>

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
            @clear-trajectory="handleClearTrajectoryReplay"
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

.map-loading-fade-enter-active,
.map-loading-fade-leave-active {
    transition: opacity 320ms ease;
}

.map-loading-fade-leave-active {
    pointer-events: none;
}

.map-loading-fade-enter-from,
.map-loading-fade-leave-to {
    opacity: 0;
}

@media (max-width: 680px) {
    .transit-workspace {
        display: block;
        padding: 0 6px 72px;
    }

    .map-stage {
        width: 100%;
        height: 100%;
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
