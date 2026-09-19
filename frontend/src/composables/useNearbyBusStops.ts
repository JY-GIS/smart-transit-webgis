import { ref } from 'vue'
import * as Cesium from 'cesium'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type {
    NearbyBusStopRecord,
    NearbyQueryCenter,
    NearbyQueryStatus,
} from '@/types/busStop'

interface ApiResponse<T> {
    code: number
    msg?: string
    data: T
}

export function useNearbyBusStops() {
    const nearbyStops = ref<NearbyBusStopRecord[]>([])

    const queryCenter = ref<NearbyQueryCenter | null>(null)

    const queryRadiusMeters = ref<number>(TRANSIT_CONFIG.nearbyQuery.defaultRadiusMeters)

    const queryStatus = ref<NearbyQueryStatus>('idle')

    const errorMessage = ref<string | null>(null)

    let nearbyDataSource:
        | Cesium.CustomDataSource
        | undefined

    // 请求序号
    let latestRequestId = 0

    // 当前正在执行的请求控制器
    let activeAbortController:
        | AbortController
        | undefined

    function ensureDataSource(viewer: Cesium.Viewer) {
        if (nearbyDataSource || viewer.isDestroyed()) {
            return nearbyDataSource
        }

        nearbyDataSource = new Cesium.CustomDataSource('Nearby Bus Stops')

        viewer.dataSources.add(nearbyDataSource)

        return nearbyDataSource
    }

    // 清空附近查询图层中的 Entity
    function clearLayerEntities() {
        nearbyDataSource?.entities.removeAll()
    }

    function isValidCenter(center: NearbyQueryCenter): boolean {
        return (
            typeof center.longitude === 'number' &&
            typeof center.latitude === 'number' &&
            center.longitude >= -180 &&
            center.longitude <= 180 &&
            center.latitude >= -90 &&
            center.latitude <= 90
        )
    }

    function isValidRadius(radiusMeters: number): boolean {
        return (
            typeof radiusMeters === 'number' && radiusMeters > 0 &&
            radiusMeters <= TRANSIT_CONFIG.nearbyQuery.maxRadiusMeters
        )
    }

    // 绘制可视化边界
    function createRadiusOutlinePositions(
        center: NearbyQueryCenter,
        radiusMeters: number,
    ): Cesium.Cartesian3[] {
        const positions: Cesium.Cartesian3[] = []

        const segmentCount = 96

        // 绘制圆形的地球近似半径
        const earthRadiusMeters = 6378137

        const angularDistance = radiusMeters / earthRadiusMeters
        const centerLatitude = Cesium.Math.toRadians(center.latitude)
        const centerLongitude = Cesium.Math.toRadians(center.longitude)

        for (let index = 0; index <= segmentCount; index += 1) {
            const bearing = (index / segmentCount) * Cesium.Math.TWO_PI

            const sinCenterLatitude = Math.sin(centerLatitude)
            const cosCenterLatitude = Math.cos(centerLatitude)

            const sinAngularDistance = Math.sin(angularDistance)
            const cosAngularDistance = Math.cos(angularDistance)

            const sinLatitude =
                sinCenterLatitude * cosAngularDistance +
                cosCenterLatitude * sinAngularDistance * Math.cos(bearing)

            const latitude = Math.asin(Math.min(1, Math.max(-1, sinLatitude)))

            const longitude =
                centerLongitude +
                Math.atan2(
                    Math.sin(bearing) * sinAngularDistance * cosCenterLatitude,
                    cosAngularDistance - sinCenterLatitude * Math.sin(latitude),
                )

            positions.push(Cesium.Cartesian3.fromRadians(longitude, latitude))
        }

        return positions
    }

    // 在 Cesium 中绘制查询中心、查询范围和附近站点
    function drawNearbyLayer(
        viewer: Cesium.Viewer,
        center: NearbyQueryCenter,
        radiusMeters: number,
        stops: NearbyBusStopRecord[],
    ) {
        if (viewer.isDestroyed()) {
            return
        }

        const dataSource = ensureDataSource(viewer)

        if (!dataSource) {
            return
        }

        clearLayerEntities()

        const centerPosition = Cesium.Cartesian3.fromDegrees(
            center.longitude,
            center.latitude,
        )

        // 查询中心点
        dataSource.entities.add({
            id: 'nearby-query-center',
            name: '附近公交站查询中心',
            position: centerPosition,
            point: {
                pixelSize: 14,
                color: Cesium.Color.ORANGE,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
        })

        dataSource.entities.add({
            id: 'nearby-query-radius',
            name: '附近公交站查询范围填充',
            position: centerPosition,
            ellipse: {
                semiMajorAxis: radiusMeters,
                semiMinorAxis: radiusMeters,
                material: Cesium.Color.CYAN.withAlpha(0.08),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                classificationType: new Cesium.ConstantProperty(Cesium.ClassificationType.TERRAIN),
            },
        })

        const radiusOutlinePositions = createRadiusOutlinePositions(center, radiusMeters)

        dataSource.entities.add({
            id: 'nearby-query-radius-outline',
            name: '附近公交站查询范围边界',
            polyline: {
                positions: radiusOutlinePositions,
                width: 4,
                // clampToGround: true,
                material: new Cesium.ColorMaterialProperty(Cesium.Color.CYAN.withAlpha(0.95)),
                classificationType: new Cesium.ConstantProperty(Cesium.ClassificationType.TERRAIN),
                depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
                    color: Cesium.Color.CYAN.withAlpha(0.95),
                    glowPower: 0.25,
                    taperPower: 1.0,
                }),
            },
        })

        for (const stop of stops) {
            const stopPosition = Cesium.Cartesian3.fromDegrees(stop.longitude, stop.latitude)

            dataSource.entities.add({
                id: `nearby-bus-stop-${stop.stopId}`,
                name: stop.stopName,
                properties: {
                    entityType: 'nearby-bus-stop',
                    stopId: stop.stopId,
                    stopName: stop.stopName,
                    distanceMeters: stop.distanceMeters,
                },
                position: stopPosition,
                point: {
                    pixelSize: 18,
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.RED,
                    outlineWidth: 3,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
            })
        }
    }

    // 清除正在进行的请求和当前查询状态
    function clearQueryState() {
        activeAbortController?.abort()  // 取消正在进行的 fetch 请求
        activeAbortController = undefined

        latestRequestId += 1

        nearbyStops.value = []
        queryCenter.value = null
        queryStatus.value = 'idle'
        errorMessage.value = null

        clearLayerEntities()
    }

    // 查询指定位置附近的公交站
    async function queryNearby(
        viewer: Cesium.Viewer,
        center: NearbyQueryCenter,
        radiusMeters: number = TRANSIT_CONFIG.nearbyQuery.defaultRadiusMeters,
    ): Promise<void> {
        if (viewer.isDestroyed()) {
            return
        }

        if (!isValidCenter(center)) {
            queryStatus.value = 'error'
            errorMessage.value = '查询中心经纬度无效'
            return
        }

        if (!isValidRadius(radiusMeters)) {
            queryStatus.value = 'error'
            errorMessage.value = `查询半径必须大于 0 且不超过 ${TRANSIT_CONFIG.nearbyQuery.maxRadiusMeters} 米`
            return
        }

        // 每次新查询都生成新的请求编号
        const requestId = ++latestRequestId //latestRequestId是防止旧响应覆盖新响应的关键

        activeAbortController?.abort()

        const abortController = new AbortController()

        activeAbortController = abortController

        queryCenter.value = {
            longitude: center.longitude,
            latitude: center.latitude,
        }

        queryRadiusMeters.value = radiusMeters

        nearbyStops.value = []
        queryStatus.value = 'loading'
        errorMessage.value = null

        // 查询开始时立即显示中心点和范围圆
        drawNearbyLayer(viewer, center, radiusMeters, [])

        // URLSearchParams (浏览器API) : 自动对查询参数进行 URL 编码
        const searchParams = new URLSearchParams({
            longitude: String(center.longitude),
            latitude: String(center.latitude),
            radiusMeters: String(radiusMeters),
        })

        const requestUrl = `${TRANSIT_CONFIG.nearbyStopsUrl}?${searchParams.toString()}`

        try {
            const response = await fetch(
                requestUrl,
                {
                    method: 'GET',
                    signal: abortController.signal,
                },
            )

            if (!response.ok) {
                throw new Error(`附近公交站接口请求失败：HTTP ${response.status}`)
            }

            const result = (await response.json()) as ApiResponse<NearbyBusStopRecord[]>

            if (result.code !== 1) {
                throw new Error(result.msg ?? '附近公交站接口返回失败')
            }

            // 如果这个响应已经不是最新请求,直接忽略
            if (requestId !== latestRequestId) {
                return
            }

            const stops = result.data ?? []

            nearbyStops.value = stops

            queryStatus.value = stops.length > 0 ? 'success' : 'empty'

            drawNearbyLayer(viewer, center, radiusMeters, stops)

        } catch (error) {
            if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
                return
            }
            if (requestId !== latestRequestId) {
                return
            }

            queryStatus.value = 'error'

            errorMessage.value = error instanceof Error ? error.message : '附近公交站查询失败'

            /*
             * 查询失败时保留查询中心和范围圆，
             * 但不显示旧的站点结果。
             */
            nearbyStops.value = []

            drawNearbyLayer(viewer, center, radiusMeters, [])

        } finally {
            if (requestId === latestRequestId && activeAbortController === abortController) {
                activeAbortController = undefined
            }
        }
    }

    // 清除当前附近查询
    function clearNearbyQuery() {
        clearQueryState()
    }

    // 页面卸载时清理资源
    function cleanup(viewer?: Cesium.Viewer) {
        clearQueryState()

        if (nearbyDataSource && viewer && !viewer.isDestroyed()) {
            viewer.dataSources.remove(nearbyDataSource, true)
        }

        nearbyDataSource = undefined
    }

    return {
        nearbyStops,
        queryCenter,
        queryRadiusMeters,
        queryStatus,
        errorMessage,
        queryNearby,
        clearNearbyQuery,
        cleanup,
    }

}