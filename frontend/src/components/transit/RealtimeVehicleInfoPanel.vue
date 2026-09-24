<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import { REALTIME_VEHICLE_STATUS_STYLES } from '@/config/realtimeVehicleStatus.config'
import type { BusRouteProperties } from '@/types/busRoute'
import type { RealtimeVehiclePositionSnapshot } from '@/types/realtimeVehicle'

/**
 * 实时车辆详情面板
 */
const props = defineProps<{
    vehicle: RealtimeVehiclePositionSnapshot | null
    route: BusRouteProperties | null
}>()

const emit = defineEmits<{
    close: []
}>()

/**
 * 面板当前显示的平滑数值
 */
const displayedDistanceMeters = ref(0)
const displayedRouteProgressPercent = ref(0)
const displayedCurrentSpeedMetersPerSecond = ref(0)
const displayedDistanceToNextStopMeters = ref<number | null>(null)
const displayedDistanceToFrontVehicleMeters = ref<number | null>(null)

interface VehicleMetricAnimation {
    startedAtMilliseconds: number
    startDistanceMeters: number
    targetDistanceMeters: number
    totalDistanceMeters: number
    fallbackProgressPercent: number

    startCurrentSpeedMetersPerSecond: number
    targetCurrentSpeedMetersPerSecond: number

    interpolateNextStopDistance: boolean
    startDistanceToNextStopMeters: number | null
    targetDistanceToNextStopMeters: number | null

    interpolateFrontVehicleDistance: boolean
    startDistanceToFrontVehicleMeters: number | null
    targetDistanceToFrontVehicleMeters: number | null
}

let animationFrameId: number | undefined
let animation: VehicleMetricAnimation | undefined
let activeVehicleId: string | null = null
let previousNextStopId: string | null = null
let previousFrontVehicleId: string | null = null

function formatDistance(distanceMeters: number | null,): string {
    if (distanceMeters === null) {
        return '—'
    }
    return `${distanceMeters.toFixed(0)} 米`
}

// 将线路里程限制在线路总长度范围内
function normalizeRouteDistance(distanceMeters: number, totalDistanceMeters: number): number { 
    if (totalDistanceMeters <= 0) {
        return distanceMeters
    }

    return (
        (distanceMeters % totalDistanceMeters) + totalDistanceMeters
    ) % totalDistanceMeters
}

// 停止当前面板动画
function cancelMetricAnimation() {
    if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId)

        animationFrameId = undefined
    }

    animation = undefined
}

// 切换车辆或第一次打开面板时，直接使用服务端快照初始化
function applySnapshotImmediately(vehicle: RealtimeVehiclePositionSnapshot) {
    displayedDistanceMeters.value =
        vehicle.distanceMeters

    displayedRouteProgressPercent.value =
        vehicle.routeProgressPercent

    displayedCurrentSpeedMetersPerSecond.value =
        vehicle.currentSpeedMetersPerSecond

    displayedDistanceToNextStopMeters.value =
        vehicle.distanceToNextStopMeters

    displayedDistanceToFrontVehicleMeters.value =
        vehicle.distanceToFrontVehicleMeters
}

// 执行一帧面板数字插值
function animateVehicleMetrics(currentTimeMilliseconds: number) {
    const currentAnimation = animation

    if (!currentAnimation){
        animationFrameId = undefined
        return
    }

    const durationMiliseconds = 
        TRANSIT_CONFIG.realtimeVehicles.interpolationDurationMilliseconds

    // 面板与地图使用相同插值时长，让车辆位置、线路里程和进度保持视觉同步
    const progress = Math.min(
        1,
        (currentTimeMilliseconds - currentAnimation.startedAtMilliseconds) / durationMiliseconds
    )

    const rawDistanceMeters = 
        currentAnimation.startDistanceMeters +
        progress * (currentAnimation.targetDistanceMeters - currentAnimation.startDistanceMeters)

    const normalizedDistanceMeters = normalizeRouteDistance(
        rawDistanceMeters,
        currentAnimation.totalDistanceMeters
    )

    displayedDistanceMeters.value = normalizedDistanceMeters

    // 线路进度直接根据平滑里程计算
    displayedRouteProgressPercent.value = 
        currentAnimation.totalDistanceMeters > 0
            ? (normalizedDistanceMeters / currentAnimation.totalDistanceMeters) * 100
            : currentAnimation.fallbackProgressPercent

    // 车辆速度显示效果直接根据平滑里程计算
    displayedCurrentSpeedMetersPerSecond.value =
        currentAnimation.startCurrentSpeedMetersPerSecond + (
            currentAnimation.targetCurrentSpeedMetersPerSecond - currentAnimation.startCurrentSpeedMetersPerSecond
        ) * progress

    if (
        currentAnimation.interpolateNextStopDistance &&
        currentAnimation.startDistanceToNextStopMeters !== null &&
        currentAnimation.targetDistanceToNextStopMeters !== null
    ) {
        displayedDistanceToNextStopMeters.value = 
            currentAnimation.startDistanceToNextStopMeters +
            progress * (currentAnimation.targetDistanceToNextStopMeters - currentAnimation.startDistanceToNextStopMeters)
    } else {
        displayedDistanceToNextStopMeters.value = currentAnimation.targetDistanceToNextStopMeters
    }

    // 只有前车没有发生变化时，才能对车距进行线性插值
    if (
        currentAnimation.interpolateFrontVehicleDistance &&
        currentAnimation.startDistanceToFrontVehicleMeters !== null &&
        currentAnimation.targetDistanceToFrontVehicleMeters !== null
    ) {
        displayedDistanceToFrontVehicleMeters.value =
            currentAnimation.startDistanceToFrontVehicleMeters +
            progress * (currentAnimation.targetDistanceToFrontVehicleMeters - currentAnimation.startDistanceToFrontVehicleMeters)
    } else {
        displayedDistanceToFrontVehicleMeters.value = currentAnimation.targetDistanceToFrontVehicleMeters
    }

    if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(animateVehicleMetrics)
        return
    }

    animationFrameId = undefined
    animation = undefined
}

    /**
     * 监听服务端车辆快照。
     */
    watch(() => props.vehicle, (vehicle) => {
        // 取消旧动画后，从当前显示值继续向新目标移动，避免网络抖动造成数字回跳
        cancelMetricAnimation()

        if (!vehicle) {
            activeVehicleId = null
            previousNextStopId = null
            previousFrontVehicleId = null

            displayedDistanceMeters.value = 0
            displayedRouteProgressPercent.value = 0
            displayedCurrentSpeedMetersPerSecond.value = 0
            displayedDistanceToNextStopMeters.value = null
            displayedDistanceToFrontVehicleMeters.value = null

            return
        }

        const nextStopId = vehicle.nextStop?.stopId ?? null
        const frontVehicleId = vehicle.frontVehicleId

        // 第一次打开面板或切换到另一辆车时，不应该从上一辆车的数字插值过来
        if (activeVehicleId !== vehicle.vehicleId) {
            activeVehicleId = vehicle.vehicleId
            previousNextStopId = nextStopId
            previousFrontVehicleId = frontVehicleId

            applySnapshotImmediately(vehicle)

            return
        }

        let targetDistanceMeters = vehicle.distanceMeters

        /*
         * 处理循环线路末端
         */
        if (
            vehicle.totalDistanceMeters > 0 &&
            targetDistanceMeters < displayedDistanceMeters.value &&
            displayedDistanceMeters.value - targetDistanceMeters > vehicle.totalDistanceMeters / 2
        ) {
            targetDistanceMeters += vehicle.totalDistanceMeters
        }

        const interpolateNextStopDistance =
            previousNextStopId !== null &&
            previousNextStopId === nextStopId && 
            displayedDistanceToNextStopMeters.value !== null && 
            vehicle.distanceToNextStopMeters !== null

        // 前车编号相同且新旧距离都有值时才进行插值
        const interpolateFrontVehicleDistance =
            previousFrontVehicleId !== null &&
            previousFrontVehicleId === frontVehicleId &&
            displayedDistanceToFrontVehicleMeters.value !== null &&
            vehicle.distanceToFrontVehicleMeters !== null

        animation = {
            startedAtMilliseconds: performance.now(),
            startDistanceMeters: displayedDistanceMeters.value,
            targetDistanceMeters,
            totalDistanceMeters: vehicle.totalDistanceMeters,
            fallbackProgressPercent: vehicle.routeProgressPercent,
            startCurrentSpeedMetersPerSecond: displayedCurrentSpeedMetersPerSecond.value,
            targetCurrentSpeedMetersPerSecond: vehicle.currentSpeedMetersPerSecond,
            interpolateNextStopDistance,
            startDistanceToNextStopMeters: displayedDistanceToNextStopMeters.value,
            targetDistanceToNextStopMeters: vehicle.distanceToNextStopMeters,
            interpolateFrontVehicleDistance,
            startDistanceToFrontVehicleMeters: displayedDistanceToFrontVehicleMeters.value,
            targetDistanceToFrontVehicleMeters: vehicle.distanceToFrontVehicleMeters,
        }

        previousNextStopId = nextStopId
        previousFrontVehicleId = frontVehicleId

        animationFrameId = window.requestAnimationFrame(animateVehicleMetrics)
    },
    {
        immediate: true,
    }
)

onBeforeUnmount(() => {
    cancelMetricAnimation()
})
</script>

<template> 
    <transition name="vehicle-panel">
        <aside v-if="vehicle" class="vehicle-panel" @click.stop>
            <div class="vehicle-panel__header">
                <span class="vehicle-panel__label">
                    实时车辆
                </span>

                <button type="button" class="vehicle-panel__close" aria-label="关闭车辆信息" @click="emit('close')">
                    ×
                </button>
            </div>

            <h2 class="vehicle-panel__title">
                {{ vehicle.vehicleId }}
            </h2>

            <div class="vehicle-panel__body">
                <div class="vehicle-panel__field">
                    <span>所属线路</span>

                    <strong>
                        {{ route?.rname ?? vehicle.routeId }}
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>运行状态</span>

                    <strong class="vehicle-panel__status" :style="{ color: REALTIME_VEHICLE_STATUS_STYLES[vehicle.motionStatus].color }">
                        {{ REALTIME_VEHICLE_STATUS_STYLES[vehicle.motionStatus].label }}
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>当前速度</span>

                    <strong>
                        {{ displayedCurrentSpeedMetersPerSecond.toFixed(1) }}
                        米/秒
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>线路进度</span>

                    <strong>
                        {{ displayedRouteProgressPercent.toFixed(2) }}%
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>距离前车</span>

                    <strong>
                        {{ formatDistance(displayedDistanceToFrontVehicleMeters) }}
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>上一站</span>

                    <strong>
                        {{ vehicle.previousStop?.stopName ?? '尚未经过首站' }}
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>下一站</span>

                    <strong>
                        {{ vehicle.nextStop?.stopName ?? '暂无下一站' }}
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>下一站序</span>

                    <strong>
                        {{ vehicle.nextStop?.stopSequence ?? '—' }}
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>距下一站</span>

                    <strong>
                        {{ formatDistance(displayedDistanceToNextStopMeters) }}
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>线路里程</span>

                    <strong>
                        {{ displayedDistanceMeters.toFixed(0) }}
                        /
                        {{ vehicle.totalDistanceMeters.toFixed(0) }}
                        米
                    </strong>
                </div>
            </div>
        </aside>
    </transition>
</template>

<style scoped>
.vehicle-panel {
    position: absolute;
    z-index: 20;
    top: 180px;
    left: 24px;
    width: 280px;
    max-width: calc(100% - 48px);
    overflow: hidden;
    color: #f4f8ff;
    background: rgba(13, 25, 42, 0.94);
    border: 1px solid rgba(255, 165, 0, 0.55);
    border-radius: 12px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.38);
    backdrop-filter: blur(12px);
}

.vehicle-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.vehicle-panel__label {
    color: #ffbd59;
    font-size: 13px;
    letter-spacing: 0.08em;
}

.vehicle-panel__close {
    width: 28px;
    height: 28px;
    color: #d7e8f4;
    font-size: 24px;
    line-height: 24px;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: 6px;
}

.vehicle-panel__close:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
}

.vehicle-panel__title {
    margin: 0;
    padding: 16px;
    color: #ffffff;
    font-size: 18px;
    line-height: 1.45;
    overflow-wrap: anywhere;
}

.vehicle-panel__body {
    padding: 0 16px 16px;
}

.vehicle-panel__field {
    display: grid;
    grid-template-columns: 78px 1fr;
    gap: 12px;
    padding: 9px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 14px;
    line-height: 1.5;
}

.vehicle-panel__field span {
    color: #9db0c4;
}

.vehicle-panel__field strong {
    color: #f5fbff;
    font-weight: 500;
    overflow-wrap: anywhere;
}

.vehicle-panel__status {
    font-weight: 600;
}

.vehicle-panel-enter-active,
.vehicle-panel-leave-active {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.vehicle-panel-enter-from,
.vehicle-panel-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}
</style>