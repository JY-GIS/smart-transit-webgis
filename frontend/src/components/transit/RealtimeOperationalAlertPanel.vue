<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { REALTIME_VEHICLE_OPERATIONAL_STATUS_STYLES } from '@/config/realtimeVehicleOperationalStatus.config'
import type { RealtimeVehicleOperationalStatus, RealtimeVehiclePositionSnapshot } from '@/types/realtimeVehicle'

// 一条车辆运营状态变化事件
interface RealtimeOperationalEvent {
    id: string
    detectedAt: Date
    vehicleId: string
    operationalStatus: RealtimeVehicleOperationalStatus
    distanceToFrontVehicleMeters: number | null
    referenceHeadwayMeters: number
}

// 组件接收后端实时车辆快照
const props = defineProps<{
    vehicles: RealtimeVehiclePositionSnapshot[]
}>()

// 用户点击异常记录中的“查看”按钮时，把车辆编号交给地图页面处理
const emit = defineEmits<{
    'select-vehicle': [vehicleId: string]
}>()

// 面板最多保留的事件数量
const MAX_EVENT_COUNT = 50

// 已经产生的运营事件，最新事件放在数组最前面
const operationalEvents = ref<RealtimeOperationalEvent[]>([])

// 右下角面板是否收起
const isCollapsed = ref(false)

// 保存每辆车上一次收到的运营状态
const previousStatusByVehicleId = new Map<string, RealtimeVehicleOperationalStatus>()

// 保证事件 id 唯一
let eventSequence = 0

/**
 * 当前处于异常状态的车辆数量。
 *（ computed 会根据 props.vehicles 自动重新计算，不需要手动维护另一个计数变量 ）
 */
const activeAbnormalVehicleCount = computed(() => {
    return props.vehicles.filter(
        (vehicle) => vehicle.operationalStatus !== 'NORMAL',
    ).length
})

/**
 * 新增一条运营状态变化事件。
 */
function addOperationalEvent(vehicle: RealtimeVehiclePositionSnapshot, detectedAt: Date ) { 
    eventSequence += 1

    const event: RealtimeOperationalEvent = {
        id: `${vehicle.vehicleId}-${detectedAt.getTime()}-${eventSequence}`,
        detectedAt,
        vehicleId: vehicle.vehicleId,
        operationalStatus: vehicle.operationalStatus,
        distanceToFrontVehicleMeters: vehicle.distanceToFrontVehicleMeters,
        referenceHeadwayMeters: vehicle.referenceHeadwayMeters,
    }

    // 新事件放在最前面，然后只保留最近 MAX_EVENT_COUNT 条
    operationalEvents.value = [event, ...operationalEvents.value].slice(0, MAX_EVENT_COUNT)
}

/**
 * 把完整车辆编号缩短成适合面板显示的形式:  simulated-bus-m103-001 → M103-001
 */
function formatVehicleName(vehicleId: string): string {
    const parts = vehicleId.split('-')

    if (parts.length < 2) return vehicleId

    const routeName = parts[parts.length - 2].toUpperCase()
    const vehicleNumber = parts[parts.length - 1]

    return `${routeName}-${vehicleNumber}`
}

/**
 * 格式化事件发现时间。
 */
function formatDetectedTime(detectedAt: Date): string {
    return detectedAt.toLocaleTimeString(
        'zh-CN',
        {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        },
    )
}

/**
 * 格式化米或千米。
 */
function formatDistance(distanceMeters: number | null): string {
    if (distanceMeters === null) return '—'
    if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(2)} km`

    return `${distanceMeters.toFixed(0)} m`
}

/**
 * 返回事件标签文字。
 */
function formatEventLabel(operationalStatus: RealtimeVehicleOperationalStatus): string {
    if (operationalStatus === 'NORMAL') return '已恢复'
    return REALTIME_VEHICLE_OPERATIONAL_STATUS_STYLES[operationalStatus].label
}

/**
 * 返回事件的完整播报文字。
 */
function formatEventMessage(event: RealtimeOperationalEvent): string {
    const vehicleName = formatVehicleName(event.vehicleId)

    if (event.operationalStatus === 'NORMAL') return `${vehicleName} 运行间隔恢复正常`

    const statusLabel = REALTIME_VEHICLE_OPERATIONAL_STATUS_STYLES[event.operationalStatus].label

    return `${vehicleName} 发现${statusLabel}`
}

/**
 * 请求父页面选择指定车辆。
 *（异常面板不直接访问 Cesium，只负责发出车辆编号。具体如何打开车辆面板、选择线路，由地图页面统一处理）
 */
function handleSelectVehicle(vehicleId: string) {
    emit('select-vehicle', vehicleId)
}

/**
 * 监听实时车辆快照。
 */
watch(
    () => props.vehicles,

    (vehicles) => {
        // 同一批 WebSocket 快照共用一个发现时间，表示这些状态是在同一次消息中被系统发现的
        const detectedAt = new Date()

        for (const vehicle of vehicles) {
            const previousStatus = previousStatusByVehicleId.get(vehicle.vehicleId)
            const currentStatus = vehicle.operationalStatus

            /*
             * 第一次收到某辆车：
             * - 如果正常，只保存初始状态；
             * - 如果已经异常，立即生成一条发现事件。
             */
            if (previousStatus === undefined) {
                previousStatusByVehicleId.set(vehicle.vehicleId, currentStatus)

                if (currentStatus !== 'NORMAL') {
                    addOperationalEvent(vehicle, detectedAt)
                }

                continue
            }

            // 状态没有变化时不重复播报
            if (previousStatus === currentStatus) {
                continue
            }

            // 先记录新状态，再生成事件。以后收到相同状态时就不会重复播报。
            previousStatusByVehicleId.set(vehicle.vehicleId, currentStatus)

            addOperationalEvent(vehicle, detectedAt)
        }
    },

    /*
     * immediate 让组件创建后立即处理已有车辆数据，不必等待下一条 WebSocket 消息。
     */
    {
        immediate: true,
    },
)

</script>
<template>
    <aside class="operational-alert-panel" :class="{ 'is-collapsed': isCollapsed }" aria-label="实时运营异常播报" aria-live="polite">
        <button type="button" class="operational-alert-panel__toggle"
            :aria-label="isCollapsed ? '展开运营异常播报面板' : '收起运营异常播报面板'"
            :title="isCollapsed ? '展开面板' : '收起面板'"
            @click="isCollapsed = !isCollapsed"
        >
            {{ isCollapsed ? '《' : '》' }}
        </button>

        <div class="operational-alert-panel__content">  
            <header class="operational-alert-panel__header">
                <div class="operational-alert-panel__title">
                    <span class="operational-alert-panel__indicator" :class="{ 'is-active': activeAbnormalVehicleCount > 0 }" aria-hidden="true"></span>
                    <span>运营异常播报</span>
                </div>

                <span class="operational-alert-panel__count" :class="{ 'is-active': activeAbnormalVehicleCount > 0 }">
                    当前 {{ activeAbnormalVehicleCount }}
                </span>
            </header>

            <div v-if="operationalEvents.length === 0" class="operational-alert-panel__empty">
                <strong>当前暂无运营异常</strong>
                <span>
                    车辆运行间隔正常
                </span>
            </div>

            <ol v-else class="operational-alert-panel__list">
                <li v-for="event in operationalEvents" :key="event.id" class="operational-alert-panel__event">
                    <time class="operational-alert-panel__time" :datetime="event.detectedAt.toISOString()">
                        {{ formatDetectedTime(event.detectedAt) }}
                    </time>

                    <div class="operational-alert-panel__summary">
                        <strong class="operational-alert-panel__message">
                            {{ formatEventMessage(event) }}
                        </strong>

                        <span class="operational-alert-panel__detail">
                            距前车
                            {{ formatDistance(event.distanceToFrontVehicleMeters) }}
                            · 参考
                            {{ formatDistance(event.referenceHeadwayMeters) }}
                        </span>
                    </div>

                    <span class="operational-alert-panel__tag" :class="{
                            'is-bunching': event.operationalStatus === 'BUNCHING',
                            'is-large-gap': event.operationalStatus === 'LARGE_GAP',
                            'is-recovered': event.operationalStatus === 'NORMAL',
                        }"
                    >
                        {{ formatEventLabel(event.operationalStatus) }}
                    </span>

                    <button type="button" class="operational-alert-panel__view-button"
                        :aria-label="`查看 ${formatVehicleName(event.vehicleId)}`"
                        @click.stop=" handleSelectVehicle(event.vehicleId)"
                    >
                        查看
                    </button>
                </li>
            </ol>
        </div>
    </aside>
</template>

<style scoped>
.operational-alert-panel {
    position: absolute;
    z-index: 20;
    right: 24px;
    bottom: 56px;
    width: 640px;
    max-width: calc(100% - 48px);
    overflow: visible;
    transition: transform 220ms ease;
    color: #1f2937;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(148, 163, 184, 0.55);
    border-radius: 12px;
    box-shadow:
        0 12px 32px rgba(15, 23, 42, 0.22);
    backdrop-filter: blur(10px);
    pointer-events: auto;
}

.operational-alert-panel.is-collapsed {
    transform: translateX(calc(100% + 24px));
}

.operational-alert-panel__content {
    visibility: visible;
}

.operational-alert-panel.is-collapsed
.operational-alert-panel__content {
    visibility: hidden;
}

.operational-alert-panel__toggle {
    position: absolute;
    top: 120px;
    left: -23px;
    display: grid;
    width: 20px;
    height: 30px;
    place-items: center;
    padding: 0;
    color: #2563eb;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.65);
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.2);
    cursor: pointer;
    font: inherit;
    font-size: 18px;
    font-weight: 700;
}

.operational-alert-panel__toggle:hover {
    color: #ffffff;
    background: #2563eb;
    border-color: #2563eb;
}

.operational-alert-panel__toggle:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
}

.operational-alert-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 15px;
    border-bottom: 1px solid #e5e7eb;
}

.operational-alert-panel__title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #111827;
    font-size: 14px;
    font-weight: 700;
}

.operational-alert-panel__indicator {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    background: #22c55e;
    border-radius: 50%;
    box-shadow:
        0 0 0 3px rgba(34, 197, 94, 0.14);
}

.operational-alert-panel__indicator.is-active {
    background: #ef4444;
    box-shadow:
        0 0 0 3px rgba(239, 68, 68, 0.14);
}

.operational-alert-panel__count {
    padding: 3px 8px;
    color: #64748b;
    background: #f1f5f9;
    border-radius: 999px;
    font-size: 12px;
    white-space: nowrap;
}

.operational-alert-panel__count.is-active {
    color: #b91c1c;
    background: #fee2e2;
}

.operational-alert-panel__empty {
    display: grid;
    gap: 5px;
    padding: 22px 16px;
    text-align: center;
}

.operational-alert-panel__empty strong {
    color: #334155;
    font-size: 14px;
    font-weight: 600;
}

.operational-alert-panel__empty span {
    color: #94a3b8;
    font-size: 13px;
}

.operational-alert-panel__list {
    max-height: 220px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
}

.operational-alert-panel__event {
    display: grid;
    grid-template-columns:
        72px
        minmax(0, 1fr)
        auto
        auto;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 8px 14px;
    border-bottom: 1px solid #e5e7eb;
}

.operational-alert-panel__event:last-child {
    border-bottom: 0;
}

.operational-alert-panel__time {
    color: #64748b;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.operational-alert-panel__summary {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    white-space: nowrap;
}

.operational-alert-panel__tag {
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
}

.operational-alert-panel__tag.is-bunching {
    color: #b91c1c;
    background: #fee2e2;
}

.operational-alert-panel__tag.is-large-gap {
    color: #b45309;
    background: #fef3c7;
}

.operational-alert-panel__tag.is-recovered {
    color: #15803d;
    background: #dcfce7;
}

.operational-alert-panel__message {
    flex: 0 0 auto;
    color: #1e293b;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.4;
}

.operational-alert-panel__detail {
    min-width: 0;
    overflow: hidden;
    color: #64748b;
    font-size: 13px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.operational-alert-panel__view-button {
    padding: 5px 10px;
    color: #2563eb;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    transition:
        color 150ms ease,
        background-color 150ms ease,
        border-color 150ms ease;
}

.operational-alert-panel__view-button:hover {
    color: #ffffff;
    background: #2563eb;
    border-color: #2563eb;
}

.operational-alert-panel__view-button:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
}

@media (max-width: 640px) {
    .operational-alert-panel {
        right: 12px;
        bottom: 48px;
        left: 12px;
        width: auto;
        max-width: none;
    }

    .operational-alert-panel__list {
        max-height: 150px;
    }

        .operational-alert-panel__event {
        grid-template-columns:
            64px
            minmax(0, 1fr)
            auto
            auto;
        gap: 7px;
        padding: 8px 10px;
    }

    .operational-alert-panel__time,
    .operational-alert-panel__detail {
        font-size: 11px;
    }

    .operational-alert-panel__message {
        font-size: 12px;
    }

    .operational-alert-panel__tag,
    .operational-alert-panel__view-button {
        padding: 3px 6px;
        font-size: 11px;
    }

    .operational-alert-panel.is-collapsed {
    transform: translateX(calc(100% + 12px));
}
}

</style>