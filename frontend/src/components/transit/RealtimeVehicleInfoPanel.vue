<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import { REALTIME_VEHICLE_STATUS_STYLES } from '@/config/realtimeVehicleStatus.config'
import { REALTIME_VEHICLE_OPERATIONAL_STATUS_STYLES } from '@/config/realtimeVehicleOperationalStatus.config'
import type { BusRouteProperties } from '@/types/busRoute'
import type { RealtimeVehiclePositionSnapshot } from '@/types/realtimeVehicle'

/**
 * 实时车辆详情面板
 */
const props = defineProps<{
    vehicle: RealtimeVehiclePositionSnapshot | null
    route: BusRouteProperties | null
    tracking: boolean
}>()

const emit = defineEmits<{
    close: []
    'start-tracking': []
}>()

const isCollapsed = ref(false)
const displayedCurrentSpeedMetersPerSecond = ref(0)
const displayedDistanceToFrontVehicleMeters = ref<number | null>(null)

interface VehicleMetricAnimation {
    startedAtMilliseconds: number

    startSpeedMetersPerSecond: number
    targetSpeedMetersPerSecond: number

    interpolateFrontVehicleDistance: boolean
    startDistanceToFrontVehicleMeters: number | null
    targetDistanceToFrontVehicleMeters: number | null
}

let animationFrameId: number | undefined
let animation: VehicleMetricAnimation | undefined
let activeVehicleId: string | null = null
let previousFrontVehicleId: string | null = null

function formatDistance(distanceMeters: number | null,): string {
    if (distanceMeters === null) {
        return '—'
    }
    return `${distanceMeters.toFixed(0)} 米`
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
    displayedCurrentSpeedMetersPerSecond.value =
        vehicle.currentSpeedMetersPerSecond

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

    // 车辆速度显示效果直接根据平滑里程计算
    displayedCurrentSpeedMetersPerSecond.value =
        currentAnimation.startSpeedMetersPerSecond + (
            currentAnimation.targetSpeedMetersPerSecond - currentAnimation.startSpeedMetersPerSecond
        ) * progress

    if (
        currentAnimation.interpolateFrontVehicleDistance &&
        currentAnimation.startDistanceToFrontVehicleMeters  !== null &&
        currentAnimation.targetDistanceToFrontVehicleMeters  !== null
    ) {
        displayedDistanceToFrontVehicleMeters.value = 
            currentAnimation.startDistanceToFrontVehicleMeters  +
            progress * (currentAnimation.targetDistanceToFrontVehicleMeters  - currentAnimation.startDistanceToFrontVehicleMeters)
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
            previousFrontVehicleId = null

            displayedCurrentSpeedMetersPerSecond.value = 0
            displayedDistanceToFrontVehicleMeters.value = null

            return
        }
        // 第一次打开面板或切换到另一辆车时，不应该从上一辆车的数字插值过来
        if (activeVehicleId !== vehicle.vehicleId) {
            activeVehicleId = vehicle.vehicleId
            previousFrontVehicleId = vehicle.frontVehicleId

            applySnapshotImmediately(vehicle)

            return
        }

        // 前车编号相同且新旧距离都有值时才进行插值
        const interpolateFrontVehicleDistance =
            previousFrontVehicleId !== null &&
            previousFrontVehicleId === vehicle.frontVehicleId &&
            displayedDistanceToFrontVehicleMeters.value !== null &&
            vehicle.distanceToFrontVehicleMeters !== null

        animation = {
            startedAtMilliseconds: performance.now(),
            startSpeedMetersPerSecond: displayedCurrentSpeedMetersPerSecond.value,
            targetSpeedMetersPerSecond: vehicle.currentSpeedMetersPerSecond,
            interpolateFrontVehicleDistance,
            startDistanceToFrontVehicleMeters:displayedDistanceToFrontVehicleMeters.value,
            targetDistanceToFrontVehicleMeters: vehicle.distanceToFrontVehicleMeters,
        }

        previousFrontVehicleId = vehicle.frontVehicleId

        animationFrameId = window.requestAnimationFrame(animateVehicleMetrics)
    },
    {
        immediate: true,
    }
)

function toggleCollapsed() {
    isCollapsed.value = !isCollapsed.value
}

onBeforeUnmount(() => {
    cancelMetricAnimation()
})
</script>

<template> 
    <transition name="vehicle-panel">
        <aside v-if="vehicle" class="vehicle-panel" :class="{ 'is-collapsed': isCollapsed }" @click.stop>
            <header class="vehicle-panel__header">
                <div class="vehicle-panel__header-top">
                    <span class="vehicle-panel__label">
                        实时车辆
                    </span>

                    <div class="vehicle-panel__actions">
                        <button
                            v-if="!tracking"
                            type="button"
                            class="vehicle-panel__tracking-button"
                            @click="emit('start-tracking')"
                        >
                            追踪
                        </button>

                        <span v-else class="vehicle-panel__tracking-status">
                            漫游中
                        </span>

                        <button
                            type="button"
                            class="vehicle-panel__icon-button"
                            :aria-label="isCollapsed ? '展开车辆详情' : '收起车辆详情'"
                            :title="isCollapsed ? '展开' : '收起'"
                            @click="toggleCollapsed"
                        >
                            {{ isCollapsed ? '+' : '−' }}
                        </button>

                        <button
                            type="button"
                            class="vehicle-panel__icon-button vehicle-panel__close"
                            aria-label="退出车辆漫游"
                            title="退出"
                            @click="emit('close')"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div class="vehicle-panel__identity">
                    <strong class="vehicle-panel__title">
                        {{ vehicle.vehicleId }}
                    </strong>

                    <span class="vehicle-panel__route">
                        {{ route?.rname ?? vehicle.routeId }}
                    </span>
                </div>
            </header>

            <div v-show="!isCollapsed" class="vehicle-panel__body">
                <div class="vehicle-panel__field">
                    <span>车辆状态</span>

                    <strong class="vehicle-panel__combined-value">
                        <em :style="{ color: REALTIME_VEHICLE_STATUS_STYLES[vehicle.motionStatus].color, }">
                            {{ REALTIME_VEHICLE_STATUS_STYLES[vehicle.motionStatus].label }}
                        </em>

                        <i>·</i>

                        <em :style="{ color: REALTIME_VEHICLE_OPERATIONAL_STATUS_STYLES[vehicle.operationalStatus].color }">
                            {{ REALTIME_VEHICLE_OPERATIONAL_STATUS_STYLES[vehicle.operationalStatus].label }}
                        </em>
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
                    <span>当前速度</span>

                    <strong>
                        {{ displayedCurrentSpeedMetersPerSecond.toFixed(1) }}
                        米/秒
                    </strong>
                </div>

                <div class="vehicle-panel__field">
                    <span>前车间隔</span>

                    <strong>
                        {{ formatDistance(displayedDistanceToFrontVehicleMeters) }}
                        /
                        参考
                        {{ formatDistance(vehicle.referenceHeadwayMeters) }}
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
    top: 116px;
    left: 24px;
    width: 320px;
    max-width: calc(100% - 48px);
    overflow: hidden;
    color: #f4f8ff;
    background: rgba(13, 25, 42, 0.94);
    border: 1px solid rgba(255, 165, 0, 0.55);
    border-radius: 10px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.34);
    backdrop-filter: blur(12px);
}

.vehicle-panel__header {
    padding: 13px 16px 14px;
}

.vehicle-panel__header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.vehicle-panel__identity {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 10px;
    min-width: 0;
}

.vehicle-panel__label {
    color: #ffbd59;
    font-size: 12px;
    letter-spacing: 0.08em;
}

.vehicle-panel__title {
    color: #ffffff;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.45;
    overflow-wrap: anywhere;
}

.vehicle-panel__route {
    color: #9db0c4;
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
}

.vehicle-panel__actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 3px;
}

.vehicle-panel__tracking-button {
    padding: 5px 8px;
    color: #172033;
    cursor: pointer;
    background: #ffbd59;
    border: 0;
    border-radius: 5px;
    font: inherit;
    font-size: 10px;
    font-weight: 700;
}

.vehicle-panel__tracking-status {
    padding: 4px 7px;
    color: #86efac;
    background: rgba(34, 197, 94, 0.14);
    border: 1px solid rgba(34, 197, 94, 0.4);
    border-radius: 999px;
    font-size: 10px;
    white-space: nowrap;
}

.vehicle-panel__icon-button {
    width: 26px;
    height: 26px;
    padding: 0;
    color: #c4d7e4;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: 5px;
    font: inherit;
    font-size: 18px;
    line-height: 24px;
}

.vehicle-panel__icon-button:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.1);
}

.vehicle-panel__close {
    font-size: 21px;
}

.vehicle-panel__body {
    padding: 4px 17px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.vehicle-panel__field {
    display: grid;
    grid-template-columns: 82px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    padding: 11px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 14px;
    line-height: 1.6;
}

.vehicle-panel__field:last-child {
    border-bottom: 0;
}

.vehicle-panel__field > span {
    color: #8fa5b7;
    font-size: 11px;
}

.vehicle-panel__field strong {
    min-width: 0;
    color: #f5fbff;
    font-weight: 500;
    line-height: 1.6;
    overflow-wrap: anywhere;
    white-space: normal;
}

.vehicle-panel__combined-value {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.vehicle-panel__combined-value em {
    font-style: normal;
    font-weight: 600;
}

.vehicle-panel__combined-value i {
    color: #668092;
    font-style: normal;
}

.vehicle-panel.is-collapsed
.vehicle-panel__header {
    align-items: center;
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
    transform: translateY(-8px);
}
</style>