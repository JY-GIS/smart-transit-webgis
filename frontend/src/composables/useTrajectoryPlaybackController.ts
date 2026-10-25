import { computed, type Ref } from 'vue'

import type { TrajectoryReplayMode } from '@/types/vehicleTrajectory'

interface TrajectoryPlaybackControls {
    loaded: Ref<boolean>
    isPlaying: Ref<boolean>
    playbackSpeed: Ref<number>
    play: () => void
    pause: () => void
    reset: () => void
    setPlaybackSpeed: (speed: number) => void
    clearData: () => void
    clearLayer: () => void
    cleanupData: () => void
    cleanupLayer: () => void
}

interface UseTrajectoryPlaybackControllerOptions {
    mode: Ref<TrajectoryReplayMode>
    vehicle: TrajectoryPlaybackControls
    route: TrajectoryPlaybackControls
    network: TrajectoryPlaybackControls
}

// 统一选择当前历史回放模式，并把播放操作交给对应的图层模块
export function useTrajectoryPlaybackController(
    options: UseTrajectoryPlaybackControllerOptions,
) {
    const {
        mode,
        vehicle,
        route,
        network,
    } = options

    const playbacks = [vehicle, route, network]

    // 根据当前模式返回单车、线路或全网回放控制组
    function getActivePlayback(): TrajectoryPlaybackControls {
        if (mode.value === 'vehicle') return vehicle
        if (mode.value === 'route') return route
        return network
    }

    // 返回当前模式的图层加载状态
    const activeLoaded = computed(() => {
        return getActivePlayback().loaded.value
    })

    // 返回当前模式是否正在播放
    const activeIsPlaying = computed(() => {
        return getActivePlayback().isPlaying.value
    })

    // 返回当前模式的播放倍速
    const activePlaybackSpeed = computed(() => {
        return getActivePlayback().playbackSpeed.value
    })

    // 播放当前模式的历史轨迹
    function play() {
        getActivePlayback().play()
    }

    // 暂停当前模式的历史轨迹
    function pause() {
        getActivePlayback().pause()
    }

    // 将当前模式的历史回放重置到起点
    function reset() {
        getActivePlayback().reset()
    }

    // 修改当前模式的播放倍速
    function setPlaybackSpeed(speed: number) {
        getActivePlayback().setPlaybackSpeed(speed)
    }

    // 清空三种回放结果，但保留历史模式使用的图层和公共数据
    function clearAll() {
        for (const playback of playbacks) {
            playback.clearData()
            playback.clearLayer()
        }
    }

    // 退出历史功能并释放三种回放模式使用的资源
    function cleanupAll() {
        for (const playback of playbacks) {
            playback.cleanupLayer()
            playback.cleanupData()
        }
    }

    // 切换回放模式，并清除上一种模式留下的图层和查询结果
    function changeMode(nextMode: TrajectoryReplayMode): boolean {
        if (mode.value === nextMode) return false

        for (const playback of playbacks) {
            playback.cleanupLayer()
            playback.clearData()
        }

        mode.value = nextMode
        return true
    }

    return {
        activeLoaded,
        activeIsPlaying,
        activePlaybackSpeed,
        play,
        pause,
        reset,
        setPlaybackSpeed,
        clearAll,
        cleanupAll,
        changeMode,
    }
}
