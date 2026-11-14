import { onBeforeUnmount, ref } from 'vue'
import type { PlaceSearchResult } from '@/types/placeSearch'

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error'

/** 新输入取消旧请求，避免搜索结果错序；联想使用 350ms 防抖。 */
export function usePlaceSearch() {
    const keywords = ref('')
    const results = ref<PlaceSearchResult[]>([])
    const status = ref<SearchStatus>('idle')
    const error = ref('')
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined

    function reset() {
        clearTimeout(timer)
        controller?.abort()
        results.value = []
        error.value = ''
        status.value = 'idle'
    }

    async function search(suggest = false) {
        reset()
        const query = keywords.value.trim()
        if (!query) return
        const requestController = new AbortController()
        controller = requestController
        status.value = 'loading'
        try {
            const parameters = new URLSearchParams({ keywords: query })
            const response = await fetch(`/api/places/${suggest ? 'suggestions' : 'search'}?${parameters}`, {
                signal: requestController.signal,
            })
            if (!response.ok) throw new Error('地点服务暂时不可用，请稍后重试')
            const body = await response.json() as { code: number; msg?: string; data: PlaceSearchResult[] }
            if (body.code !== 1) throw new Error(body.msg || '地点查询失败，请重试')
            if (requestController.signal.aborted) return
            results.value = body.data
            status.value = body.data.length ? 'success' : 'empty'
        } catch (reason) {
            if (requestController.signal.aborted) return
            error.value = reason instanceof Error ? reason.message : '地点查询失败，请重试'
            status.value = 'error'
        }
    }

    function suggest() {
        reset()
        if (keywords.value.trim()) timer = setTimeout(() => { void search(true) }, 350)
    }

    onBeforeUnmount(reset)
    return { keywords, results, status, error, search, suggest, reset }
}
