import { ref } from 'vue'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type {
    StopArrivalBoard,
    StopArrivalQuery,
    StopArrivalQueryStatus,
} from '@/types/stopArrival'

// 后端统一 Result 的前端结构
interface ApiResponse<T> {
    code: number
    msg?: string
    data?: T
}

// 判断 fetch 抛出的错误是否来自主动取消请求
function isAbortError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError'
    )
}


/**
 * 管理一个线路站点的到站查询状态。
 */
export function useStopArrivals() {
    const arrivalBoard = ref<StopArrivalBoard | null>(null)

    const arrivalQueryStatus = ref<StopArrivalQueryStatus>('idle')

    const arrivalErrorMessage = ref<string | null>(null)

    /*
     * AbortController：浏览器原生请求取消 API。
     *用户可能连续点击多个站点，需要取消旧请求，防止不再需要的网络请求继续执行
     */
    let activeAbortController:
        | AbortController
        | undefined

    let latestRequestId = 0

    /*
     * 当前正在自动刷新的站点查询。
     * null 表示自动刷新已经停止。
     */
    let activeAutoRefreshQuery:
        | StopArrivalQuery
        | null = null

    /*
     * 保存下一次刷新任务的编号。
     */
    let refreshTimeoutId:
        | ReturnType<typeof window.setTimeout>
        | undefined

    /**
     * 查询指定线路即将到达目标站点的车辆。
     */
    async function queryArrivals(query: StopArrivalQuery): Promise<void> {
        // 新查询开始前先废弃旧查询。即使新参数无效，也不能让旧请求回来覆盖当前页面。
        activeAbortController?.abort()
        activeAbortController = undefined

        const requestId = ++latestRequestId

        const routeId = query.routeId.trim()
        const stopId = query.stopId.trim()
        const limit = query.limit ?? TRANSIT_CONFIG.stopArrivals.defaultLimit

        if (!routeId || !stopId) {
            arrivalBoard.value = null
            arrivalQueryStatus.value = 'error'
            arrivalErrorMessage.value = '线路编号和站点编号不能为空'

            return
        }

        if (!Number.isInteger(limit) || limit <= 0 || limit > TRANSIT_CONFIG.stopArrivals.maximumLimit) {
            arrivalBoard.value = null
            arrivalQueryStatus.value = 'error'
            arrivalErrorMessage.value = `到站车辆数量必须是 1~${TRANSIT_CONFIG.stopArrivals.maximumLimit} 之间的整数`

            return
        }

        const abortController = new AbortController()

        activeAbortController = abortController

        const refreshingCurrentBoard =
            arrivalBoard.value?.routeId === routeId &&
            arrivalBoard.value.stopId === stopId

        if (!refreshingCurrentBoard) {
            arrivalBoard.value = null
            arrivalQueryStatus.value = 'loading'
        }

        arrivalErrorMessage.value = null

        /*
         *  URLSearchParams：浏览器原生查询参数构造器。
         *（ 会自动完成 URL 编码，避免 routeId 中出现特殊字符时破坏查询字符串 ）
         */
        const searchParams = new URLSearchParams({
            routeId,
            limit: String(limit),
        })

        /*
         *  encodeURIComponent：对 URL 路径中的单个动态片段编码。
         *（ URLSearchParams 只处理问号后面的查询参数，stopId 位于路径中，因此必须单独编码 ）
         */
        const encodedStopId = encodeURIComponent(stopId)

        const requestUrl =
            `${TRANSIT_CONFIG.stopArrivals.baseUrl}` +
            `/${encodedStopId}/arrivals` +
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
                throw new Error(`到站查询接口请求失败：HTTP ${response.status}`)
            }

            const result = (await response.json()) as ApiResponse<StopArrivalBoard>

            if (result.code !== 1) {
                throw new Error(result.msg ?? '到站查询接口返回失败')
            }

            if (!result.data) {
                throw new Error('到站查询接口缺少 data')
            }

            // 旧请求即使成功返回，也不能再修改当前站点的数据
            if (requestId !== latestRequestId) {
                return
            }

            arrivalBoard.value = result.data

            arrivalQueryStatus.value = result.data.arrivals.length > 0 ? 'success' : 'empty'

        } catch (error) {
            // 主动取消属于正常交互，不向用户显示为查询失败
            if (isAbortError(error)) {
                return
            }

            if (requestId !== latestRequestId) {
                return
            }

            arrivalBoard.value = null
            arrivalQueryStatus.value = 'error'

            arrivalErrorMessage.value = error instanceof Error
                ? error.message : '到站查询失败'

        } finally {
            // 只能由当前最新请求清理自己的控制器，否则旧请求可能错误地清除新请求的控制器。
            if (requestId === latestRequestId && activeAbortController === abortController) {
                activeAbortController = undefined
            }
        }
    }

    /**
     * 停止定时循环
     */
    function stopAutoRefresh() {
        activeAutoRefreshQuery = null

        if (refreshTimeoutId !== undefined) {
            window.clearTimeout(refreshTimeoutId)
            refreshTimeoutId = undefined
        }
    }

    /**
     * 执行一次查询，并在查询结束后安排下一次刷新。
     */
    async function runAutoRefreshCycle(query: StopArrivalQuery): Promise<void> {
        await queryArrivals(query)

        /*
         * 等待请求期间，用户可能已经关闭面板或切换站点。
         *
         * 使用对象引用判断当前循环是否仍然有效。
         * 如果不是同一个查询对象，就不能继续安排下一轮。
         */
        if (activeAutoRefreshQuery !== query) {
            return
        }

        refreshTimeoutId = window.setTimeout(
            () => {
                void runAutoRefreshCycle(query)
            },
            TRANSIT_CONFIG
                .stopArrivals
                .refreshIntervalMilliseconds,
        )
    }

    /**
     * 启动一个站点的自动刷新。
     * 切换站点时先停止旧循环，然后立即查询新站点，不需要先等待 2 秒。
     */
    function startAutoRefresh(query: StopArrivalQuery) {
        stopAutoRefresh()

        /*
         * 创建新的查询对象。
         *
         * 每次启动都有独立对象，
         * runAutoRefreshCycle 可以通过对象引用判断
         * 自己是否仍是当前有效循环。
         */
        const autoRefreshQuery: StopArrivalQuery = {
            routeId: query.routeId,
            stopId: query.stopId,
            limit: query.limit,
        }

        activeAutoRefreshQuery = autoRefreshQuery

        void runAutoRefreshCycle(autoRefreshQuery)
    }

    /**
     * 清除当前查询和页面状态。
     */
    function clearArrivals() {
        stopAutoRefresh()

        activeAbortController?.abort()
        activeAbortController = undefined

        // 编号加一，使所有旧请求立即失效
        latestRequestId += 1

        arrivalBoard.value = null
        arrivalQueryStatus.value = 'idle'
        arrivalErrorMessage.value = null
    }

    function cleanup() {
        clearArrivals()
    }

    return {
        arrivalBoard,
        arrivalQueryStatus,
        arrivalErrorMessage,
        queryArrivals,
        startAutoRefresh,
        stopAutoRefresh,
        clearArrivals,
        cleanup,
    }

}