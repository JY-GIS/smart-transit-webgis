import { computed, ref } from 'vue'
import type { Ref } from 'vue'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type {
    RouteTrajectoryQuery,
    RouteTrajectoryReplay,
    VehicleHistoryAvailability,
    VehicleHistoryQueryStatus,
    VehicleHistoryRouteAvailability,
    VehicleTrajectory,
    VehicleTrajectoryPoint,
} from '@/types/vehicleTrajectory'
import type {
    RealtimeVehicleMotionStatus,
    RealtimeVehicleOperationalStatus,
} from '@/types/realtimeVehicle'

interface ApiResponse {
    code: number
    msg?: string
    data?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return (typeof value === 'object' && value !== null)
}

function isFiniteNumber(value: unknown): value is number {
    return (typeof value === 'number' && Number.isFinite(value))
}

function isDateTimeString(value: unknown): value is string {
    return (typeof value === 'string' && Number.isFinite(Date.parse(value)))
}

function isMotionStatus(value: unknown): value is RealtimeVehicleMotionStatus {
    return (value === 'CRUISING' || value === 'APPROACHING' || value === 'DWELLING')
}

function isOperationalStatus(value: unknown): value is RealtimeVehicleOperationalStatus {
    return (value === 'NORMAL' || value === 'BUNCHING' || value === 'LARGE_GAP')
}

function isApiResponse(value: unknown): value is ApiResponse {
    if (!isRecord(value)) {
        return false
    }

    return (
        isFiniteNumber(value.code) &&
        (value.msg === undefined || typeof value.msg === 'string')
    )
}

function isTrajectoryPoint(value: unknown): value is VehicleTrajectoryPoint {
    if (!isRecord(value)) {
        return false
    }

    return (
        isDateTimeString(value.recordedAt) &&
        isFiniteNumber(value.longitude) && value.longitude >= -180 && value.longitude <= 180 &&
        isFiniteNumber(value.latitude) && value.latitude >= -90 && value.latitude <= 90 &&
        isFiniteNumber(value.distanceMeters) && value.distanceMeters >= 0 &&
        isFiniteNumber(value.totalDistanceMeters) && value.totalDistanceMeters > 0 &&
        isFiniteNumber(value.routeProgressPercent) && value.routeProgressPercent >= 0 && value.routeProgressPercent <= 100 &&
        isFiniteNumber(value.speedMetersPerSecond) && value.speedMetersPerSecond >= 0 &&
        isMotionStatus(value.motionStatus) &&
        isOperationalStatus(value.operationalStatus)
    )
}

function pointsAreChronological(points: VehicleTrajectoryPoint[]): boolean {
    for (let index = 1; index < points.length; index += 1) {
        if (Date.parse(points[index].recordedAt) <= Date.parse(points[index - 1].recordedAt)) {
            return false
        }
    }

    return true
}

function isTrajectory(value: unknown): value is VehicleTrajectory {
    if (!isRecord(value) || !Array.isArray(value.points) || !value.points.every(isTrajectoryPoint)) {
        return false
    }

    const points = value.points

    return (
        points.length >= 2 &&
        typeof value.vehicleId === 'string' &&
        isDateTimeString(value.startTime) &&
        isDateTimeString(value.endTime) &&
        isFiniteNumber(value.pointCount) && value.pointCount === points.length &&
        isFiniteNumber(value.averageSpeedMetersPerSecond) && value.averageSpeedMetersPerSecond >= 0 &&
        isFiniteNumber(value.maximumSpeedMetersPerSecond) && value.maximumSpeedMetersPerSecond >= 0 &&
        value.startTime === points[0].recordedAt &&
        value.endTime === points[points.length - 1].recordedAt &&
        pointsAreChronological(points)
    )
}

function isRouteTrajectoryReplay(value: unknown): value is RouteTrajectoryReplay {
    if (!isRecord(value)) {
        return false
    }

    if (!Array.isArray(value.trajectories) || !value.trajectories.every(isTrajectory)) {
        return false
    }

    if (!Array.isArray(value.unavailableVehicleIds) || !value.unavailableVehicleIds.every((vehicleId) => typeof vehicleId === 'string')) {
        return false
    }

    const trajectories = value.trajectories
    const startTime = typeof value.startTime === 'string' ? Date.parse(value.startTime) : Number.NaN
    const endTime = typeof value.endTime === 'string' ? Date.parse(value.endTime) : Number.NaN
    const totalPointCount = trajectories.reduce((total, trajectory) => total + trajectory.pointCount, 0)
    const uniqueVehicleIds = new Set(trajectories.map((trajectory) => trajectory.vehicleId))
    const everyTrajectoryCoversRange = trajectories.every((trajectory) => {
        return Date.parse(trajectory.startTime) <= startTime && Date.parse(trajectory.endTime) >= endTime
    })

    return (
        typeof value.routeId === 'string' && value.routeId.length > 0 &&
        isFiniteNumber(value.routeFid) &&
        typeof value.routeName === 'string' && value.routeName.length > 0 &&
        Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime &&
        isFiniteNumber(value.vehicleCount) && value.vehicleCount > 0 && value.vehicleCount === trajectories.length &&
        isFiniteNumber(value.totalPointCount) && value.totalPointCount === totalPointCount &&
        uniqueVehicleIds.size === trajectories.length &&
        everyTrajectoryCoversRange
    )
}

function isAbortError(error: unknown): boolean {
    return (isRecord(error) && error.name === 'AbortError')
}

export function useRouteTrajectoryReplay(availableVehicles: Ref<VehicleHistoryAvailability[]>) {
    const availableRoutes = computed<VehicleHistoryRouteAvailability[]>(() => {
        const routesById = new Map<string, VehicleHistoryRouteAvailability>()

        for (const vehicle of availableVehicles.value) {
            const existingRoute = routesById.get(vehicle.routeId)

            if (!existingRoute) {
                routesById.set(vehicle.routeId, {
                    routeId: vehicle.routeId,
                    routeFid: vehicle.routeFid,
                    routeName: vehicle.routeName,
                    vehicleCount: 1,
                    pointCount: vehicle.pointCount,
                    firstRecordedAt: vehicle.firstRecordedAt,
                    lastRecordedAt: vehicle.lastRecordedAt,
                })
                continue
            }

            existingRoute.vehicleCount += 1
            existingRoute.pointCount += vehicle.pointCount

            if (Date.parse(vehicle.firstRecordedAt) > Date.parse(existingRoute.firstRecordedAt)) {
                existingRoute.firstRecordedAt = vehicle.firstRecordedAt
            }

            if (Date.parse(vehicle.lastRecordedAt) < Date.parse(existingRoute.lastRecordedAt)) {
                existingRoute.lastRecordedAt = vehicle.lastRecordedAt
            }
        }

        return Array.from(routesById.values()).filter((route) => {
            return Date.parse(route.lastRecordedAt) > Date.parse(route.firstRecordedAt)
        })
    })

    const routeReplay = ref<RouteTrajectoryReplay | null>(null)
    const routeReplayStatus = ref<VehicleHistoryQueryStatus>('idle')
    const routeReplayErrorMessage = ref<string | null>(null)

    let routeReplayAbortController: AbortController | undefined
    let latestRouteReplayRequestId = 0

    async function queryRouteTrajectories(query: RouteTrajectoryQuery): Promise<void> {
        routeReplayAbortController?.abort()

        const requestId = ++latestRouteReplayRequestId
        const routeId = query.routeId.trim()

        if (!routeId) {
            routeReplay.value = null
            routeReplayStatus.value = 'error'
            routeReplayErrorMessage.value = '请选择需要回放的线路'
            return
        }

        if (!Number.isFinite(query.startTime.getTime()) || !Number.isFinite(query.endTime.getTime())) {
            routeReplay.value = null
            routeReplayStatus.value = 'error'
            routeReplayErrorMessage.value = '线路轨迹查询时间无效'
            return
        }

        const durationMilliseconds = query.endTime.getTime() - query.startTime.getTime()
        const maximumDurationMilliseconds = TRANSIT_CONFIG.vehicleHistory.maximumQueryRangeMinutes * 60 * 1000

        if (durationMilliseconds <= 0 || durationMilliseconds > maximumDurationMilliseconds) {
            routeReplay.value = null
            routeReplayStatus.value = 'error'
            routeReplayErrorMessage.value = durationMilliseconds <= 0
                ? '结束时间必须晚于开始时间'
                : `查询时间不能超过${TRANSIT_CONFIG.vehicleHistory.maximumQueryRangeMinutes}分钟`
            return
        }

        const abortController = new AbortController()
        routeReplayAbortController = abortController
        routeReplay.value = null
        routeReplayStatus.value = 'loading'
        routeReplayErrorMessage.value = null

        const searchParams = new URLSearchParams({
            startTime: query.startTime.toISOString(),
            endTime: query.endTime.toISOString(),
        })

        const requestUrl =
            `${TRANSIT_CONFIG.vehicleHistory.baseUrl}` +
            `/routes/${encodeURIComponent(routeId)}/trajectories` +
            `?${searchParams.toString()}`

        try {
            const response = await fetch(requestUrl, {
                method: 'GET',
                signal: abortController.signal,
            })

            if (!response.ok) {
                throw new Error(`线路轨迹接口请求失败：HTTP ${response.status}`)
            }

            const result: unknown = await response.json()

            if (!isApiResponse(result)) {
                throw new Error('线路轨迹接口格式错误')
            }

            if (result.code !== 1) {
                throw new Error(result.msg ?? '线路轨迹接口返回失败')
            }

            if (!isRouteTrajectoryReplay(result.data)) {
                throw new Error('线路轨迹数据格式错误')
            }

            if (requestId !== latestRouteReplayRequestId) {
                return
            }

            routeReplay.value = result.data
            routeReplayStatus.value = 'success'

        } catch (error) {
            if (isAbortError(error) || requestId !== latestRouteReplayRequestId) {
                return
            }

            routeReplay.value = null
            routeReplayStatus.value = 'error'
            routeReplayErrorMessage.value = error instanceof Error ? error.message : '线路轨迹查询失败'

        } finally {
            if (requestId === latestRouteReplayRequestId && routeReplayAbortController === abortController) {
                routeReplayAbortController = undefined
            }
        }
    }

    function clearRouteReplay() {
        routeReplayAbortController?.abort()
        routeReplayAbortController = undefined
        latestRouteReplayRequestId += 1
        routeReplay.value = null
        routeReplayStatus.value = 'idle'
        routeReplayErrorMessage.value = null
    }

    function cleanup() {
        clearRouteReplay()
    }

    return {
        availableRoutes,
        routeReplay,
        routeReplayStatus,
        routeReplayErrorMessage,
        queryRouteTrajectories,
        clearRouteReplay,
        cleanup,
    }
}
