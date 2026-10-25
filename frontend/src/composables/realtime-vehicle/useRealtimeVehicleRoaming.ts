/** 
 *    公交漫游
 * 
 * 职责：
 *  - 管理公交漫游是否开启。
 *  - 保存当前追踪车辆编号。
 *  - 创建唯一的不可见追踪锚点。
 *  - 从车辆点、车辆模型或 WebSocket 快照中取得实时位置。
 *  - 让 Cesium 相机追踪锚点。
 *  - 退出漫游时清理锚点。
 */
import { ref } from 'vue'
import * as Cesium from 'cesium'

import type { RealtimeVehiclePositionSnapshot } from '@/types/realtimeVehicle'

// 实时车辆漫游需要的车辆位置来源
interface RealtimeVehicleRoamingPositionSources {
    getPointPosition: (vehicleId: string) => Cesium.Cartesian3 | undefined
    getModelPosition: (vehicleId: string) => Cesium.Cartesian3 | undefined
}

/**
 * 管理实时公交漫游和Cesium相机追踪。
 */
export function useRealtimeVehicleRoaming(positionSources: RealtimeVehicleRoamingPositionSources) {
    const roamingModeEnabled = ref(false)

    // 当前正在被相机追踪的车辆编号
    const trackedVehicleId = ref<string | null>(null)

    // 保存最新车辆快照，追踪锚点无法读取渲染位置时使用
    const snapshotsByVehicleId = new Map<string, RealtimeVehiclePositionSnapshot>()

    let activeViewer: Cesium.Viewer | undefined

    // 保存Cesium场景事件的解绑函数
    let removeCameraTrackingListener:
        | (() => void)
        | undefined

    // 第一次进入漫游时使用的默认相机偏移
    const initialCameraOffset = new Cesium.Cartesian3(0, -120, 48)

    // false表示相机还没有进入当前车辆的局部坐标系
    let cameraViewInitialized = false

    // 返回当前追踪车辆的实际显示位置。用于LOD切换瞬间，防止点对象已经删除、模型对象还没有创建时相机暂时失去目标。
    function getTrackedVehiclePosition(result?: Cesium.Cartesian3): Cesium.Cartesian3 | undefined {
        const vehicleId = trackedVehicleId.value

        if (!vehicleId) {
            return undefined
        }

        const renderedPosition = positionSources.getPointPosition(vehicleId) ?? positionSources.getModelPosition(vehicleId)

        if (renderedPosition) {
            return Cesium.Cartesian3.clone(renderedPosition, result)
        }

        const snapshot = snapshotsByVehicleId.get(vehicleId)

        if (!snapshot) {
            return undefined
        }

        const snapshotPosition = Cesium.Cartesian3.fromDegrees(snapshot.longitude, snapshot.latitude)

        return Cesium.Cartesian3.clone(snapshotPosition, result)
    }

    // 更新公交漫游相机
    function updateCameraView() {
        const viewer = activeViewer

        if (!viewer || viewer.isDestroyed() || !roamingModeEnabled.value || !trackedVehicleId.value) {
            return
        }

        const targetPosition = getTrackedVehiclePosition()

        if (!targetPosition) {
            return
        }

        const targetTransform = Cesium.Transforms.eastNorthUpToFixedFrame(targetPosition)

        if (!cameraViewInitialized) {
            viewer.camera.lookAtTransform(targetTransform, initialCameraOffset)

            cameraViewInitialized = true
            return
        }

        const currentCameraOffset = Cesium.Cartesian3.clone(viewer.camera.position)

        viewer.camera.lookAtTransform(targetTransform, currentCameraOffset)
    }

    // 注册Cesium每帧相机更新事件
    function bindCameraTracking(viewer: Cesium.Viewer) {
        if (activeViewer === viewer && removeCameraTrackingListener) {
            return
        }

        removeCameraTrackingListener?.()

        activeViewer = viewer

        removeCameraTrackingListener = viewer.scene.preRender.addEventListener(updateCameraView)
    }

    function openRoamingMode() {
        roamingModeEnabled.value = true
    }

    // 开始或切换实时追踪车辆
    function trackVehicle(viewer: Cesium.Viewer, vehicleId: string) {
        if (viewer.isDestroyed()) {
            return
        }

        const vehicleChanged = trackedVehicleId.value !== vehicleId

        roamingModeEnabled.value = true
        trackedVehicleId.value = vehicleId

        if (vehicleChanged) {
            cameraViewInitialized = false
        }

        bindCameraTracking(viewer)

        updateCameraView()

        viewer.scene.requestRender()
    }

    // 接收最新完整车辆快照
    function updateVehicles(snapshots: RealtimeVehiclePositionSnapshot[]) {
        snapshotsByVehicleId.clear()

        for (const snapshot of snapshots) {
            snapshotsByVehicleId.set(snapshot.vehicleId, snapshot)
        }

        if (trackedVehicleId.value && activeViewer && !activeViewer.isDestroyed()) {
            activeViewer.scene.requestRender()
        }
    }

    // 退出公交轨迹漫游
    function closeRoamingMode(viewer?: Cesium.Viewer) {
        const currentViewer = viewer ?? activeViewer

        removeCameraTrackingListener?.()
        removeCameraTrackingListener = undefined

        if (currentViewer && !currentViewer.isDestroyed()) {
            // lookAtTransform(Matrix4.IDENTITY)：退出观察目标后恢复Cesium默认的地球固定坐标系
            currentViewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)

            currentViewer.scene.requestRender()
        }

        activeViewer = undefined
        trackedVehicleId.value = null
        roamingModeEnabled.value = false
        cameraViewInitialized = false
    }

    function cleanup(viewer?: Cesium.Viewer) {
        closeRoamingMode(viewer)
        snapshotsByVehicleId.clear()
    }

    return {
        roamingModeEnabled,
        trackedVehicleId,

        openRoamingMode,
        trackVehicle,
        updateVehicles,
        closeRoamingMode,
        cleanup,
    }
}