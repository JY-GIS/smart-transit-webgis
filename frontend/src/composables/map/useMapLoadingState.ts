import { ref } from 'vue'

export type MapLoadingStatus =
    | 'initializing'
    | 'loading'
    | 'ready'
    | 'degraded'
    | 'error'

/**
 * 管理地图初始化阶段、加载问题和加载面板状态。
 */
export function useMapLoadingState() {
    const status = ref<MapLoadingStatus>('initializing')
    const stage = ref('正在初始化三维场景...')
    const issues = ref<string[]>([])
    const panelVisible = ref(true)

    // 开始一次新的地图初始化流程
    function start() {
        panelVisible.value = true
        status.value = 'initializing'
        stage.value = '正在初始化三维场景'
        issues.value = []
    }

    // 更新当前加载步骤，但不改变加载状态
    function setStage(nextStage: string) {
        stage.value = nextStage
    }

    // 进入地图资源加载阶段
    function beginLoading(nextStage: string) {
        status.value = 'loading'
        stage.value = nextStage
    }

    // 记录一个不影响核心地图继续使用的加载问题
    function addIssue(issue: string) {
        issues.value.push(issue)
    }

    // 根据是否存在加载问题结束初始化流程
    function finish() {
        if (issues.value.length === 0) {
            status.value = 'ready'
            stage.value = '地图加载完成'
            return
        }

        status.value = 'degraded'
        stage.value = '部分资源未完成，核心地图仍可使用'
    }

    // 将无法继续初始化的异常显示在加载面板中
    function fail(error: unknown) {
        status.value = 'error'
        stage.value = '三维地图初始化失败'
        issues.value = [error instanceof Error ? error.message : '发生未知初始化错误']
    }

    // 用户接受部分资源不可用后隐藏加载面板
    function hidePanel() {
        panelVisible.value = false
    }

    return {
        status,
        stage,
        issues,
        panelVisible,
        start,
        setStage,
        beginLoading,
        addIssue,
        finish,
        fail,
        hidePanel,
    }
}

