import { ref } from 'vue'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import { DEFAULT_POI_TYPE_VISIBILITY, POI_CATEGORY_ORDER } from '@/config/poi.config'
import type {
    NearbyPoiRecord,
    PoiAnalysisStatus,
    PoiCategorySummary,
    PoiQueryCenter,
    PoiType,
    PoiTypeVisibility,
} from '@/types/poi'

interface ApiResponse<T> {
    code: number
    msg?: string
    data: T
}

/**
 * 管理 POI 分类统计请求及其响应状态。
 */
export function usePoiAnalysis() {
    const summary = ref<PoiCategorySummary | null>(null)

    const nearbyPois = ref<NearbyPoiRecord[]>([])

    const pointsVisible = ref(true)

    const typeVisibility = ref<PoiTypeVisibility>({ ...DEFAULT_POI_TYPE_VISIBILITY })

    const queryCenter = ref<PoiQueryCenter | null>(null)

    const queryRadiusMeters = ref<number>(TRANSIT_CONFIG.poiAnalysis.defaultRadiusMeters)

    const queryStatus = ref<PoiAnalysisStatus>('idle')

    const errorMessage = ref<string | null>(null)

    // 用请求序号阻止较早完成的响应覆盖最新查询结果
    let latestRequestId = 0

    // 当前请求控制器，新查询开始时取消旧请求
    let activeAbortController: AbortController | undefined

    // 检查POI分析中心是否为合法经纬度
    function isValidCenter(center: PoiQueryCenter): boolean {
        return (
            Number.isFinite(center.longitude) &&
            Number.isFinite(center.latitude) &&
            center.longitude >= -180 &&
            center.longitude <= 180 &&
            center.latitude >= -90 &&
            center.latitude <= 90
        )
    }

    // 检查POI分析半径是否符合前后端约定
    function isValidRadius(radiusMeters: number): boolean {
        return (
            Number.isFinite(radiusMeters) &&
            radiusMeters > 0 &&
            radiusMeters <= TRANSIT_CONFIG.poiAnalysis.maxRadiusMeters
        )
    }
    /**
     * 使用同一查询中心和半径，并行请求POI统计和点位明细。
     */
    async function queryAnalysis(
        center: PoiQueryCenter,
        radiusMeters: number = TRANSIT_CONFIG.poiAnalysis.defaultRadiusMeters,
    ): Promise<void> {
        if (!isValidCenter(center)) {
            queryStatus.value = 'error'
            errorMessage.value = 'POI分析中心经纬度无效'
            return
        }

        if (!isValidRadius(radiusMeters)) {
            queryStatus.value = 'error'
            errorMessage.value = `POI分析半径必须大于0且不超过${TRANSIT_CONFIG.poiAnalysis.maxRadiusMeters}米`
            return
        }

        const requestId = ++latestRequestId

        activeAbortController?.abort()

        const abortController = new AbortController()

        activeAbortController = abortController

        queryCenter.value = { longitude: center.longitude, latitude: center.latitude }

        queryRadiusMeters.value = radiusMeters
        summary.value = null
        nearbyPois.value = []
        queryStatus.value = 'loading'
        errorMessage.value = null

        const searchParams = new URLSearchParams({
            longitude: String(center.longitude),
            latitude: String(center.latitude),
            radiusMeters: String(radiusMeters),
        })

        const queryString = searchParams.toString()

        const summaryRequestUrl = `${TRANSIT_CONFIG.poiAnalysis.summaryUrl}?${queryString}`

        const nearbyRequestUrl = `${TRANSIT_CONFIG.poiAnalysis.nearbyUrl}?${queryString}`

        try {
            const [
                summaryResponse,
                nearbyResponse,
            ] = await Promise.all([
                fetch(summaryRequestUrl, {
                    method: 'GET',
                    signal: abortController.signal,
                }),
                fetch(nearbyRequestUrl, {
                    method: 'GET',
                    signal: abortController.signal,
                }),
            ])

            if (!summaryResponse.ok) {
                throw new Error(`POI分类统计接口请求失败：HTTP ${summaryResponse.status}`)
            }

            if (!nearbyResponse.ok) {
                throw new Error(`附近POI接口请求失败：HTTP ${nearbyResponse.status}`)
            }

            const summaryResult = (await summaryResponse.json()) as ApiResponse<PoiCategorySummary>

            const nearbyResult = (await nearbyResponse.json()) as ApiResponse<NearbyPoiRecord[]>

            if (summaryResult.code !== 1) {
                throw new Error(summaryResult.msg ?? 'POI分类统计接口返回失败')
            }

            if (nearbyResult.code !== 1) {
                throw new Error(nearbyResult.msg ?? '附近POI接口返回失败')
            }

            if (requestId !== latestRequestId) {
                return
            }

            summary.value = summaryResult.data
            nearbyPois.value = nearbyResult.data ?? []

            queryStatus.value = summaryResult.data.totalCount > 0 ? 'success' : 'empty'
        } catch (error) {
            if (
                error &&
                typeof error === 'object' &&
                'name' in error &&
                error.name === 'AbortError'
            ) {
                return
            }

            if (requestId !== latestRequestId) {
                return
            }

            summary.value = null
            nearbyPois.value = []
            queryStatus.value = 'error'
            errorMessage.value = error instanceof Error ? error.message : 'POI分析查询失败'
        } finally {
            if (requestId === latestRequestId && activeAbortController === abortController) {
                activeAbortController = undefined
            }
        }
    }

    /**
     * 半径调整为0米时清空结果；传入新中心时，同时记住用户最新点击的位置。
     */
    function setZeroRadius(center: PoiQueryCenter | null = queryCenter.value) {
        activeAbortController?.abort()
        activeAbortController = undefined
        latestRequestId += 1

        if (center) {
            queryCenter.value = {
                longitude: center.longitude,
                latitude: center.latitude,
            }
        }

        summary.value = null
        nearbyPois.value = []
        queryRadiusMeters.value = 0
        queryStatus.value = 'zero-radius'
        errorMessage.value = null
    }

    // 清除POI统计结果，并让尚未返回的旧请求失效
    function clearAnalysis() {
        activeAbortController?.abort()
        activeAbortController = undefined

        latestRequestId += 1

        summary.value = null
        nearbyPois.value = []
        queryCenter.value = null
        queryRadiusMeters.value = TRANSIT_CONFIG.poiAnalysis.defaultRadiusMeters
        queryStatus.value = 'idle'
        errorMessage.value = null
    }

    // 控制全部POI地图点位是否允许显示
    function setPointsVisible(visible: boolean) {
        pointsVisible.value = visible
    }

    // 点击分类后只显示该类；再次点击当前唯一分类时恢复全部分类
    function focusType(poiType: PoiType) {
        const onlyCurrentTypeVisible = POI_CATEGORY_ORDER.every((currentType) => {
            if (currentType === poiType) {
                return typeVisibility.value[currentType]
            }

            return !typeVisibility.value[currentType]
        })

        if (onlyCurrentTypeVisible) {
            typeVisibility.value = { ...DEFAULT_POI_TYPE_VISIBILITY }
            return
        }

        const nextVisibility = { ...DEFAULT_POI_TYPE_VISIBILITY }

        for (const currentType of POI_CATEGORY_ORDER) {
            nextVisibility[currentType] = currentType === poiType
        }

        typeVisibility.value = nextVisibility
    }

    // 页面卸载时取消POI请求并清除状态
    function cleanup() {
        clearAnalysis()
    }

    return {
        summary,
        nearbyPois,
        queryCenter,
        queryRadiusMeters,
        queryStatus,
        errorMessage,
        pointsVisible,
        typeVisibility,
        queryAnalysis,
        setZeroRadius,
        setPointsVisible,
        focusType,
        clearAnalysis,
        cleanup,
    }
}