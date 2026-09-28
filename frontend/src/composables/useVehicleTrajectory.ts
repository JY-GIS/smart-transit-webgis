import { ref } from 'vue'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type {
    VehicleHistoryAvailability,
    VehicleHistoryQueryStatus,
    VehicleTrajectory,
    VehicleTrajectoryPoint,
    VehicleTrajectoryQuery,
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

// 检查字符串能否表示一个有效时间
function isDateTimeString(value: unknown): value is string {
    return (typeof value === 'string' && Number.isFinite(Date.parse(value)))
}

function isMotionStatus(value: unknown): value is RealtimeVehicleMotionStatus {
    return (value === 'CRUISING' || value === 'APPROACHING' || value === 'DWELLING')
}

function isOperationalStatus(value: unknown,): value is RealtimeVehicleOperationalStatus {
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

function isAvailability(value: unknown): value is VehicleHistoryAvailability {
    if (!isRecord(value)) {
        return false
    }

    return (
        typeof value.vehicleId === 'string' &&
        typeof value.routeId === 'string' &&
        isFiniteNumber(value.routeFid) &&
        typeof value.routeName === 'string' &&
        isDateTimeString(value.firstRecordedAt) &&
        isDateTimeString(value.lastRecordedAt) &&
        isFiniteNumber(value.pointCount) &&
        value.pointCount >= 0
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

/**
 * 检查轨迹点是否按时间从早到晚排列。
 */
function pointsAreChronological(points: VehicleTrajectoryPoint[]): boolean {
    for (let index = 1; index < points.length; index += 1) {
        const previousTime = Date.parse(points[index - 1].recordedAt)

        const currentTime = Date.parse(points[index].recordedAt)

        if (currentTime <= previousTime) {
            return false
        }
    }

    return true
}

function isTrajectory(value: unknown,): value is VehicleTrajectory {
    if (!isRecord(value)) {
        return false
    }

    if (!Array.isArray(value.points)) {
        return false
    }

    if (!value.points.every(isTrajectoryPoint)) {
        return false
    }

    const points = value.points

    if (points.length < 2) {
        return false
    }

    return (
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

function isAbortError(error: unknown,): boolean {
    return (isRecord(error) && error.name === 'AbortError')
}

function hasValidDate(value: Date): boolean {
    return Number.isFinite(value.getTime())
}

/**
 * 管理车辆历史数据查询状态。
 */
export function useVehicleTrajectory() {
    const availableVehicles = ref<VehicleHistoryAvailability[]>([])

    const availabilityStatus = ref<VehicleHistoryQueryStatus>('idle')

    const availabilityErrorMessage = ref<string | null>(null)

    const trajectory = ref<VehicleTrajectory | null>(null)

    const trajectoryStatus = ref<VehicleHistoryQueryStatus>('idle')

    const trajectoryErrorMessage = ref<string | null>(null)

    let availabilityAbortController:
        | AbortController
        | undefined

    let trajectoryAbortController:
        | AbortController
        | undefined

    let latestAvailabilityRequestId = 0
    let latestTrajectoryRequestId = 0

    /**
     * 查询当前可以回放的车辆。
     */
    async function loadAvailability(): Promise<void> {
        availabilityAbortController?.abort()

        const requestId = ++latestAvailabilityRequestId

        const abortController = new AbortController()

        availabilityAbortController = abortController

        availableVehicles.value = []
        availabilityStatus.value = 'loading'
        availabilityErrorMessage.value = null

        const requestUrl =
            `${TRANSIT_CONFIG.vehicleHistory.baseUrl}` +
            '/availability'

        try {
            const response = await fetch(
                requestUrl,
                {
                    method: 'GET',
                    signal: abortController.signal,
                },
            )

            if (!response.ok) {
                throw new Error(`可回放车辆接口请求失败：HTTP ${response.status}`)
            }

            const result: unknown = await response.json()

            if (!isApiResponse(result)) {
                throw new Error('可回放车辆接口格式错误')
            }

            if (result.code !== 1) {
                throw new Error(result.msg ?? '可回放车辆接口返回失败')
            }

            if (!Array.isArray(result.data) || !result.data.every(isAvailability)) {
                throw new Error('可回放车辆数据格式错误')
            }

            if (requestId !== latestAvailabilityRequestId) {
                return
            }

            availableVehicles.value = result.data

            availabilityStatus.value =
                result.data.length > 0 ? 'success' : 'empty'

        } catch (error) {
            if (isAbortError(error)) {
                return
            }

            if (requestId !== latestAvailabilityRequestId) {
                return
            }

            availableVehicles.value = []
            availabilityStatus.value = 'error'

            availabilityErrorMessage.value =
                error instanceof Error ? error.message : '可回放车辆查询失败'

        } finally {
            if (requestId === latestAvailabilityRequestId && availabilityAbortController === abortController) {
                availabilityAbortController = undefined
            }
        }
    }

    /**
     * 查询一辆车在指定时间范围内的轨迹。
     */
    async function queryTrajectory(query: VehicleTrajectoryQuery): Promise<void> {
        trajectoryAbortController?.abort()

        const requestId = ++latestTrajectoryRequestId

        const vehicleId = query.vehicleId.trim()

        if (!vehicleId) {
            trajectory.value = null
            trajectoryStatus.value = 'error'
            trajectoryErrorMessage.value = '请选择需要回放的车辆'

            return
        }

        if (!hasValidDate(query.startTime) || !hasValidDate(query.endTime)) {
            trajectory.value = null
            trajectoryStatus.value = 'error'
            trajectoryErrorMessage.value = '轨迹查询时间无效'

            return
        }

        const durationMilliseconds = query.endTime.getTime() - query.startTime.getTime()

        if (durationMilliseconds <= 0) {
            trajectory.value = null
            trajectoryStatus.value = 'error'
            trajectoryErrorMessage.value = '结束时间必须晚于开始时间'

            return
        }

        const maximumDurationMilliseconds =
            TRANSIT_CONFIG.vehicleHistory.maximumQueryRangeMinutes * 60 * 1000

        if (durationMilliseconds > maximumDurationMilliseconds) {
            trajectory.value = null
            trajectoryStatus.value = 'error'
            trajectoryErrorMessage.value =
                `查询时间不能超过` +
                `${TRANSIT_CONFIG.vehicleHistory.maximumQueryRangeMinutes}分钟`

            return
        }

        const abortController = new AbortController()

        trajectoryAbortController = abortController

        trajectory.value = null
        trajectoryStatus.value = 'loading'
        trajectoryErrorMessage.value = null

        const searchParams =
            new URLSearchParams({
                startTime: query.startTime.toISOString(),
                endTime: query.endTime.toISOString(),
            })

        const encodedVehicleId = encodeURIComponent(vehicleId)

        const requestUrl =
            `${TRANSIT_CONFIG.vehicleHistory.baseUrl}` +
            `/${encodedVehicleId}/trajectory` +
            `?${searchParams.toString()}`

        try {
            const response = await fetch(
                requestUrl,
                {
                    method: 'GET',
                    signal: abortController.signal,
                },
            )

            if (!response.ok) {
                throw new Error(`历史轨迹接口请求失败：HTTP ${response.status}`)
            }

            const result: unknown = await response.json()

            if (!isApiResponse(result)) {
                throw new Error('历史轨迹接口格式错误')
            }

            if (result.code !== 1) {
                throw new Error(result.msg ?? '历史轨迹接口返回失败')
            }

            if (!isTrajectory(result.data)) {
                throw new Error('历史轨迹数据格式错误')
            }

            if (requestId !== latestTrajectoryRequestId) {
                return
            }

            trajectory.value = result.data
            trajectoryStatus.value = 'success'

        } catch (error) {
            if (isAbortError(error)) {
                return
            }

            if (requestId !== latestTrajectoryRequestId) {
                return
            }

            trajectory.value = null
            trajectoryStatus.value = 'error'

            trajectoryErrorMessage.value =
                error instanceof Error ? error.message : '历史轨迹查询失败'

        } finally {
            if (requestId === latestTrajectoryRequestId && trajectoryAbortController === abortController) {
                trajectoryAbortController = undefined
            }
        }
    }

    /**
     * 只清除当前轨迹，不清除车辆列表。
     */
    function clearTrajectory() {
        trajectoryAbortController?.abort()
        trajectoryAbortController = undefined

        latestTrajectoryRequestId += 1

        trajectory.value = null
        trajectoryStatus.value = 'idle'
        trajectoryErrorMessage.value = null
    }

    /**
     * 页面卸载时取消全部历史请求并清空状态。
     */
    function cleanup() {
        availabilityAbortController?.abort()
        trajectoryAbortController?.abort()

        availabilityAbortController = undefined
        trajectoryAbortController = undefined

        latestAvailabilityRequestId += 1
        latestTrajectoryRequestId += 1

        availableVehicles.value = []
        availabilityStatus.value = 'idle'
        availabilityErrorMessage.value = null

        trajectory.value = null
        trajectoryStatus.value = 'idle'
        trajectoryErrorMessage.value = null
    }

    return {
        availableVehicles,
        availabilityStatus,
        availabilityErrorMessage,

        trajectory,
        trajectoryStatus,
        trajectoryErrorMessage,

        loadAvailability,
        queryTrajectory,
        clearTrajectory,
        cleanup,
    }
}