import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type {
    RealtimeVehicleEntityProperties,
    RealtimeVehiclePositionSnapshot,
} from '@/types/realtimeVehicle'

// 一辆实时车辆对应的三维模型对象
interface RealtimeVehicleModelVisual {
    entity: Cesium.Entity
    positionProperty: Cesium.ConstantPositionProperty

    // Cesium Entity 当前使用的旋转四元数。
    orientationProperty: Cesium.ConstantProperty

    // 当前实际显示的位置。
    displayedPosition: Cesium.Cartesian3

    // 本轮插值的起点。
    interpolationStartPosition: Cesium.Cartesian3

    // 本轮插值的服务端目标位置。
    interpolationTargetPosition: Cesium.Cartesian3

    // 本轮插值开始的浏览器单调时间。
    interpolationStartedAtMilliseconds: number

    // 上一次服务端快照中的线路里程，用于识别车辆是否完成一圈。
    lastRouteDistanceMeters: number

    // 上一次服务端目标位置的经纬度，用于计算行驶方向。
    lastLongitude: number
    lastLatitude: number
}

/**
 * 管理实时车辆三维模型图层。
 */
export function useRealtimeVehicleModelLayer() {
    let vehicleModelDataSource: Cesium.CustomDataSource | undefined

    const vehicleModels = new Map<string, RealtimeVehicleModelVisual>()

    let modelsVisible = false

    // 当前等待执行的浏览器动画帧编号
    let animationFrameId: number | undefined

    let activeViewer: Cesium.Viewer | undefined

    function ensureDataSource(viewer: Cesium.Viewer): Cesium.CustomDataSource | undefined {
        if (viewer.isDestroyed()) {
            return undefined
        }

        if (vehicleModelDataSource) {
            return vehicleModelDataSource
        }

        vehicleModelDataSource = new Cesium.CustomDataSource('realtime-vehicle-model-layer')

        vehicleModelDataSource.show = modelsVisible

        viewer.dataSources.add(vehicleModelDataSource)

        return vehicleModelDataSource
    }

    /**
     * 将实时车辆线路编号和车辆编号整理成地图标签文本。
     */
    function formatVehicleLabel(snapshot: RealtimeVehiclePositionSnapshot): string {
        const vehicleId = snapshot.vehicleId
            .replace(/^simulated-bus-/i, '')
            .toUpperCase()

        const routeId = snapshot.routeId
            .replace(/^route_000/i, '')
            .toUpperCase()

        return `${routeId}路 · ${vehicleId}`
    }

    function createModelPosition(snapshot: RealtimeVehiclePositionSnapshot): Cesium.Cartesian3 {
        return Cesium.Cartesian3.fromDegrees(
            snapshot.longitude,
            snapshot.latitude,
            TRANSIT_CONFIG.realtimeVehicles.model.heightOffsetMeters,
        )
    }

    // 根据位置和Cesium局部航向角创建Entity旋转四元数
    function createModelOrientation(
        position: Cesium.Cartesian3,
        headingRadians: number,
    ): Cesium.Quaternion {
        const headingPitchRoll = new Cesium.HeadingPitchRoll(headingRadians, 0, 0)

        return Cesium.Transforms.headingPitchRollQuaternion(position, headingPitchRoll)
    }

    // 根据相邻两次服务端经纬度更新模型车头方向
    function updateModelOrientation(
        visual: RealtimeVehicleModelVisual,
        snapshot: RealtimeVehiclePositionSnapshot,
        nextPosition: Cesium.Cartesian3,
    ) {
        const movementDistanceMeters =
            Cesium.Cartesian3.distance(
                visual.interpolationTargetPosition,
                nextPosition,
            )

        if (movementDistanceMeters < 0.1) {
            visual.lastLongitude = snapshot.longitude
            visual.lastLatitude = snapshot.latitude
            return
        }

        const previousLongitude = Cesium.Math.toRadians(visual.lastLongitude)
        const previousLatitude = Cesium.Math.toRadians(visual.lastLatitude)

        const nextLongitude = Cesium.Math.toRadians(snapshot.longitude)
        const nextLatitude = Cesium.Math.toRadians(snapshot.latitude)

        const longitudeDifference = nextLongitude - previousLongitude

        const directionEast = Math.sin(longitudeDifference) * Math.cos(nextLatitude)

        const directionNorth =
            Math.cos(previousLatitude) * Math.sin(nextLatitude) -
            Math.sin(previousLatitude) * Math.cos(nextLatitude) * Math.cos(longitudeDifference)

        const bearingFromNorth = Math.atan2(directionEast, directionNorth)

        const headingFromEast = bearingFromNorth - Cesium.Math.PI_OVER_TWO

        const modelHeading =
            headingFromEast +
            Cesium.Math.toRadians(
                TRANSIT_CONFIG
                    .realtimeVehicles
                    .model
                    .headingOffsetDegrees,
            )

        const orientation = createModelOrientation(nextPosition, modelHeading)

        visual.orientationProperty.setValue(orientation)

        visual.lastLongitude = snapshot.longitude
        visual.lastLatitude = snapshot.latitude
    }

    function applyInterpolatedPosition(
        visual: RealtimeVehicleModelVisual,
        currentTimeMilliseconds: number,
    ): boolean {
        const durationMilliseconds = TRANSIT_CONFIG.realtimeVehicles.interpolationDurationMilliseconds

        const elapsedMilliseconds = currentTimeMilliseconds - visual.interpolationStartedAtMilliseconds

        const progress = Cesium.Math.clamp(
            elapsedMilliseconds / durationMilliseconds,
            0,
            1,
        )

        Cesium.Cartesian3.lerp(
            visual.interpolationStartPosition,
            visual.interpolationTargetPosition,
            progress,
            visual.displayedPosition,
        )

        visual.positionProperty.setValue(visual.displayedPosition)

        return progress < 1
    }

    function animateVehicles(currentTimeMilliseconds: number) {
        animationFrameId = undefined

        const currentViewer = activeViewer

        if (!currentViewer || currentViewer.isDestroyed()) {
            return
        }

        let hasMovingVehicle = false

        for (const visual of vehicleModels.values()) {
            const isStillMoving = applyInterpolatedPosition(visual, currentTimeMilliseconds)

            if (isStillMoving) {
                hasMovingVehicle = true
            }
        }

        currentViewer.scene.requestRender()

        if (hasMovingVehicle) {
            animationFrameId = window.requestAnimationFrame(animateVehicles)
        }
    }

    // 确保当前只有一套车辆模型动画循环
    function ensureAnimationRunning(viewer: Cesium.Viewer) {
        activeViewer = viewer

        if (animationFrameId !== undefined) {
            return
        }

        animationFrameId = window.requestAnimationFrame(animateVehicles)
    }

    // 为第一次出现的车辆创建三维模型 Entity
    function createVehicleModel(
        dataSource: Cesium.CustomDataSource,
        snapshot: RealtimeVehiclePositionSnapshot,
    ): RealtimeVehicleModelVisual {
        const position = createModelPosition(snapshot)

        const positionProperty = new Cesium.ConstantPositionProperty(position)

        const initialHeading =
            Cesium.Math.toRadians(
                TRANSIT_CONFIG
                    .realtimeVehicles
                    .model
                    .headingOffsetDegrees,
            )

        const orientationProperty =
            new Cesium.ConstantProperty(
                createModelOrientation(position, initialHeading)
            )

        const entityProperties:
            RealtimeVehicleEntityProperties = {
            entityType: 'realtime-vehicle',
            vehicleId: snapshot.vehicleId,
            routeFid: snapshot.routeFid,
        }

        const entity = dataSource.entities.add({
            id: `realtime-vehicle-model:${snapshot.vehicleId}`,
            name: `实时公交模型 ${snapshot.vehicleId}`,
            position: positionProperty,
            orientation: orientationProperty,
            properties: entityProperties,
            model: {
                uri: TRANSIT_CONFIG.realtimeVehicles.model.uri,
                scale: TRANSIT_CONFIG.realtimeVehicles.model.scale,
                minimumPixelSize: TRANSIT_CONFIG.realtimeVehicles.model.minimumPixelSize,
                maximumScale: TRANSIT_CONFIG.realtimeVehicles.model.maximumScale,
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                nodeTransformations: {
                    [TRANSIT_CONFIG.realtimeVehicles.model.originCorrection.nodeName]:
                        new Cesium.TranslationRotationScale(
                            new Cesium.Cartesian3(
                                TRANSIT_CONFIG.realtimeVehicles.model.originCorrection.x,
                                TRANSIT_CONFIG.realtimeVehicles.model.originCorrection.y,
                                TRANSIT_CONFIG.realtimeVehicles.model.originCorrection.z,
                            ),
                        ),
                },
            },
            label: {
                text: formatVehicleLabel(snapshot),
                font: '13px sans-serif',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString('#0b1728').withAlpha(0.85),
                backgroundPadding: new Cesium.Cartesian2(8, 5),
                pixelOffset: new Cesium.Cartesian2(0, -35),
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1000),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        })

        return {
            entity,
            positionProperty,
            orientationProperty,
            displayedPosition: Cesium.Cartesian3.clone(position),
            interpolationStartPosition: Cesium.Cartesian3.clone(position),
            interpolationTargetPosition: Cesium.Cartesian3.clone(position),
            interpolationStartedAtMilliseconds: performance.now(),
            lastRouteDistanceMeters: snapshot.distanceMeters,
            lastLongitude: snapshot.longitude,
            lastLatitude: snapshot.latitude,
        }
    }

    // 使用新的服务端位置开始下一轮平滑插值。先计算当前已经移动到的位置，再把它作为新一轮起点
    function setInterpolationTarget(
        visual: RealtimeVehicleModelVisual,
        nextPosition: Cesium.Cartesian3,
        currentTimeMilliseconds: number,
    ) {
        applyInterpolatedPosition(visual, currentTimeMilliseconds)

        Cesium.Cartesian3.clone(
            visual.displayedPosition,
            visual.interpolationStartPosition,
        )

        Cesium.Cartesian3.clone(
            nextPosition,
            visual.interpolationTargetPosition,
        )

        visual.interpolationStartedAtMilliseconds = currentTimeMilliseconds
    }

    // 车辆完成一圈回到线路起点时直接设置位置
    function setPositionImmediately(
        visual: RealtimeVehicleModelVisual,
        nextPosition: Cesium.Cartesian3,
        currentTimeMilliseconds: number,
    ) {
        Cesium.Cartesian3.clone(nextPosition, visual.displayedPosition)
        Cesium.Cartesian3.clone(nextPosition, visual.interpolationStartPosition)
        Cesium.Cartesian3.clone(nextPosition, visual.interpolationTargetPosition)

        visual.interpolationStartedAtMilliseconds = currentTimeMilliseconds
        visual.positionProperty.setValue(visual.displayedPosition)
    }

    function updateVehicles(
        viewer: Cesium.Viewer,
        snapshots: RealtimeVehiclePositionSnapshot[],
    ) {
        const dataSource = ensureDataSource(viewer)

        if (!dataSource) {
            return
        }

        const currentTimeMilliseconds = performance.now()

        const activeVehicleIds = new Set<string>()

        for (const snapshot of snapshots) {
            activeVehicleIds.add(snapshot.vehicleId)

            const position = createModelPosition(snapshot)

            const existingModel = vehicleModels.get(snapshot.vehicleId)

            if (existingModel) {
                const hasWrappedToRouteStart =
                    snapshot.totalDistanceMeters > 0 &&
                    existingModel.lastRouteDistanceMeters - snapshot.distanceMeters > snapshot.totalDistanceMeters / 2

                if (hasWrappedToRouteStart) {
                    setPositionImmediately(
                        existingModel,
                        position,
                        currentTimeMilliseconds,
                    )

                    existingModel.lastLongitude = snapshot.longitude
                    existingModel.lastLatitude = snapshot.latitude
                } else {
                    updateModelOrientation(
                        existingModel,
                        snapshot,
                        position,
                    )

                    setInterpolationTarget(
                        existingModel,
                        position,
                        currentTimeMilliseconds,
                    )
                }

                existingModel.lastRouteDistanceMeters = snapshot.distanceMeters

                continue
            }

            const newModel = createVehicleModel(dataSource, snapshot)

            vehicleModels.set(snapshot.vehicleId, newModel)
        }

        for (const [vehicleId, model] of vehicleModels) {
            if (activeVehicleIds.has(vehicleId)) {
                continue
            }

            dataSource.entities.remove(model.entity)

            vehicleModels.delete(vehicleId)
        }
        ensureAnimationRunning(viewer)

        viewer.scene.requestRender()
    }

    function getVehicleEntity(vehicleId: string): Cesium.Entity | undefined {
        return vehicleModels.get(vehicleId)?.entity
    }

    // 返回指定车辆模型当前实际显示的位置
    function getVehiclePosition(vehicleId: string): Cesium.Cartesian3 | undefined {
        const visual = vehicleModels.get(vehicleId)

        if (!visual) {
            return undefined
        }

        return Cesium.Cartesian3.clone(visual.displayedPosition)
    }

    function setVehiclesVisible(visible: boolean) {
        modelsVisible = visible

        if (vehicleModelDataSource) {
            vehicleModelDataSource.show = visible
        }
    }

    function cleanup(viewer?: Cesium.Viewer) {
        if (animationFrameId !== undefined) {
            window.cancelAnimationFrame(animationFrameId)
            animationFrameId = undefined
        }

        activeViewer = undefined

        vehicleModels.clear()

        if (vehicleModelDataSource && viewer && !viewer.isDestroyed()) {
            viewer.dataSources.remove(vehicleModelDataSource, true)
        }

        vehicleModelDataSource = undefined
        modelsVisible = false
    }

    return {
        getVehicleEntity,
        getVehiclePosition,
        updateVehicles,
        setVehiclesVisible,
        cleanup,
    }
}