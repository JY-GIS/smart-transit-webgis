import { ref } from 'vue'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type {
    NetworkTrajectoryQuery,
    NetworkTrajectoryReplay,
    VehicleHistoryQueryStatus,
} from '@/types/vehicleTrajectory'

interface ApiResponse<T> {
    code: number
    msg?: string
    data?: T
}

/**
 * 管理全网历史轨迹查询状态。
 */
export function useNetworkTrajectoryReplay() {
    const networkReplay = ref<NetworkTrajectoryReplay | null>(null)

    const networkReplayStatus = ref<VehicleHistoryQueryStatus>('idle')

    const networkReplayErrorMessage =
        ref<string | null>(null)

    let networkReplayAbortController:
        | AbortController
        | undefined

    let latestNetworkReplayRequestId = 0

    async function queryNetworkTrajectories(
        query: NetworkTrajectoryQuery,
    ): Promise<void> {
        networkReplayAbortController?.abort()

        const requestId = ++latestNetworkReplayRequestId

        if (
            !Number.isFinite(query.startTime.getTime()) ||
            !Number.isFinite(query.endTime.getTime())
        ) {
            networkReplay.value = null
            networkReplayStatus.value = 'error'
            networkReplayErrorMessage.value = '全网轨迹查询时间无效'
            return
        }

        const durationMilliseconds = query.endTime.getTime() - query.startTime.getTime()

        const maximumDurationMilliseconds =
            TRANSIT_CONFIG.vehicleHistory.maximumQueryRangeMinutes * 60 * 1000

        if (
            durationMilliseconds <= 0 ||
            durationMilliseconds > maximumDurationMilliseconds
        ) {
            networkReplay.value = null
            networkReplayStatus.value = 'error'

            networkReplayErrorMessage.value =
                durationMilliseconds <= 0
                    ? '结束时间必须晚于开始时间'
                    : `查询时间不能超过${TRANSIT_CONFIG.vehicleHistory.maximumQueryRangeMinutes}分钟`

            return
        }

        const abortController = new AbortController()

        networkReplayAbortController = abortController

        networkReplay.value = null
        networkReplayStatus.value = 'loading'
        networkReplayErrorMessage.value = null

        const searchParams =
            new URLSearchParams({
                startTime: query.startTime.toISOString(),
                endTime: query.endTime.toISOString(),
            })

        const requestUrl =
            `${TRANSIT_CONFIG.vehicleHistory.baseUrl}` +
            `/network/trajectories` +
            `?${searchParams.toString()}`

        try {
            const response =
                await fetch(
                    requestUrl,
                    {
                        method: 'GET',
                        signal: abortController.signal,
                    },
                )

            if (!response.ok) {
                throw new Error(`全网轨迹接口请求失败：HTTP ${response.status}`)
            }

            const result = await response.json() as ApiResponse<NetworkTrajectoryReplay>

            if (result.code !== 1) {
                throw new Error(result.msg ?? '全网轨迹接口返回失败')
            }

            if (!result.data) {
                throw new Error('全网轨迹接口没有返回数据')
            }

            if (requestId !== latestNetworkReplayRequestId) {
                return
            }

            networkReplay.value = result.data
            networkReplayStatus.value = 'success'

        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return
            }

            if (requestId !== latestNetworkReplayRequestId) {
                return
            }

            networkReplay.value = null
            networkReplayStatus.value = 'error'

            networkReplayErrorMessage.value =
                error instanceof Error
                    ? error.message
                    : '全网轨迹查询失败'

        } finally {
            if (
                requestId === latestNetworkReplayRequestId &&
                networkReplayAbortController === abortController
            ) {
                networkReplayAbortController = undefined
            }
        }
    }

    function clearNetworkReplay() {
        networkReplayAbortController?.abort()

        networkReplayAbortController = undefined

        latestNetworkReplayRequestId += 1

        networkReplay.value = null
        networkReplayStatus.value = 'idle'
        networkReplayErrorMessage.value = null
    }

    function cleanup() {
        clearNetworkReplay()
    }

    return {
        networkReplay,
        networkReplayStatus,
        networkReplayErrorMessage,

        queryNetworkTrajectories,
        clearNetworkReplay,
        cleanup,
    }
}