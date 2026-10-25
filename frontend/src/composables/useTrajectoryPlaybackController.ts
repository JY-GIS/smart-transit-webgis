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

    return {
        activeLoaded,
        activeIsPlaying,
        activePlaybackSpeed,
        play,
        pause,
        reset,
        setPlaybackSpeed,
    }
}