<script setup lang="ts">    
import { computed } from 'vue'

import type { BusRouteProperties } from '@/types/busRoute'
import type { RouteBusStopEntityProperties } from '@/types/busStop'
import type { StopArrivalBoard, StopArrivalPrediction, StopArrivalQueryStatus } from '@/types/stopArrival'

const props = defineProps<{
    route: BusRouteProperties | null
    stop: RouteBusStopEntityProperties | null
    board: StopArrivalBoard | null
    status: StopArrivalQueryStatus
    errorMessage: string | null
}>()

const emit = defineEmits<{
    close: []
    retry: []
    selectVehicle: [vehicleId: string]
}>()

const firstArrival = computed(
    () => props.board?.arrivals[0] ?? null,
)
const followingArrivals = computed(
    () => props.board?.arrivals.slice(1) ?? [],
)

/**
 * 将秒数转换为乘客容易理解的 ETA 文案
 */
function formatEta(arrival: StopArrivalPrediction,): string {
    if (arrival.arrivalStatus === 'AT_STOP') {
        return '已到站'
    }
    if (arrival.etaSeconds < 60) {
        return '不足1分钟'
    }
    return `${Math.ceil(arrival.etaSeconds / 60)}分钟`
}

/**
 * 格式化到目标站的线路距离。
 */
function formatDistance(distanceMeters: number): string {
    if (!Number.isFinite(distanceMeters)) {
        return '距离未知'
    }
    if (distanceMeters < 1000) {
        return `${Math.round(distanceMeters)}米`
    }
    return `${(distanceMeters / 1000).toFixed(1)}公里`
}

/**
 * 将 stopsAway 转成乘客可读文案。
 *
 * 后端约定：
 * 0 表示正在目标站；
 * 1 表示目标站是下一站；
 * 2 表示到目标站还相隔两站。
 */
function formatStopsAway(arrival: StopArrivalPrediction,): string {
    if (arrival.arrivalStatus === 'AT_STOP') {
        return '已到站'
    }
    if (arrival.stopsAway === 1) {
        return '下一站'
    }
    return `${arrival.stopsAway}站`
}

/**
 * 展示本次到站牌的计算时间。
 */
function formatGeneratedAt(generatedAt: string,): string {
    const date = new Date(generatedAt)

    if (Number.isNaN(date.getTime())) {
        return '更新时间未知'
    }
    return date.toLocaleTimeString(
        'zh-CN',
        {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        },
    )
}
</script>

<template>
    <transition name="arrival-panel">
        <aside v-if="stop" class="arrival-panel" @click.stop>
            <header class="arrival-panel__header">
                <div>
                    <span class="arrival-panel__label">
                        站点到站
                    </span>

                    <h2 class="arrival-panel__route-name">
                        {{
                            board?.routeName ??
                            route?.rname ??
                            stop.routeId
                        }}
                    </h2>
                </div>

                <button type="button" class="arrival-panel__close" aria-label="关闭站点到站信息" @click="emit('close')">
                    ×
                </button>
            </header>

            <section class="arrival-panel__route">
                <div class="arrival-panel__direction">
                    <span>
                        {{ route?.fsname ?? '线路起点' }}
                    </span>

                    <span class="arrival-panel__direction-arrow" aria-hidden="true">
                        →
                    </span>

                    <span>
                        {{ route?.lsname ?? '线路终点' }}
                    </span>
                </div>

                <div class="arrival-panel__stop">
                    <span class="arrival-panel__stop-label">
                        当前等车站
                    </span>

                    <strong class="arrival-panel__stop-name">
                        {{ board?.stopName ?? stop.stopName }}
                    </strong>

                    <span class="arrival-panel__stop-sequence">
                        第
                        {{
                            board?.stopSequence ??
                            stop.stopSequence
                        }}
                        站
                    </span>
                </div>
            </section>

            <div v-if="status === 'loading'" class="arrival-panel__message">
                <span class="arrival-panel__spinner" aria-hidden="true"></span>
                正在查询即将到站车辆……
            </div>

            <div v-else-if="status === 'error'" class="arrival-panel__message arrival-panel__message--error">
                <p>
                    {{
                        errorMessage ??
                        '到站信息查询失败'
                    }}
                </p>

                <button type="button" class="arrival-panel__retry"  @click="emit('retry')">
                    重新查询
                </button>
            </div>

            <div v-else-if="status === 'empty'" class="arrival-panel__message">
                当前线路暂无即将到站车辆
            </div>

            <template v-else-if=" status === 'success' && firstArrival">
                <button type="button" class="arrival-panel__primary" @click="emit('selectVehicle', firstArrival.vehicleId)">
                    <span class="arrival-panel__primary-label">
                        最近车辆
                    </span>

                    <strong class="arrival-panel__primary-stops">
                        {{ formatStopsAway(firstArrival) }}
                    </strong>

                    <span class="arrival-panel__primary-detail">
                        {{ formatEta(firstArrival) }}
                        ·
                        {{
                            formatDistance(firstArrival.distanceToStopMeters)
                        }}
                    </span>

                    <span class="arrival-panel__vehicle-id">
                        {{ firstArrival.vehicleId }}
                    </span>
                </button>

                <section v-if="followingArrivals.length > 0" class="arrival-panel__following">
                    <h3 class="arrival-panel__section-title">
                        后续车辆
                    </h3>

                    <ol class="arrival-panel__list">
                        <li v-for="arrival in followingArrivals" :key="arrival.vehicleId">
                            <button type="button" class="arrival-panel__item" @click="emit('selectVehicle', arrival.vehicleId)">
                                <span class="arrival-panel__item-main">
                                    <strong>
                                        {{
                                            formatEta(arrival)
                                        }}
                                    </strong>

                                    <span>
                                        {{
                                            arrival.vehicleId
                                        }}
                                    </span>
                                </span>

                                <span class="arrival-panel__item-meta">
                                    {{
                                        formatStopsAway(arrival)
                                    }}
                                    ·
                                    {{
                                        formatDistance(arrival.distanceToStopMeters)
                                    }}
                                </span>
                            </button>
                        </li>
                    </ol>
                </section>

                <footer v-if="board" class="arrival-panel__footer">
                    到站数据更新于
                    {{ formatGeneratedAt(board.generatedAt) }}
                </footer>
            </template>
        </aside>
    </transition>
</template>


<style scoped>
.arrival-panel {
    position: absolute;
    z-index: 20;
    top: 180px;
    left: 24px;
    width: 360px;
    max-width: calc(100% - 48px);
    overflow: hidden;
    color: #f4f8ff;
    background: rgba(13, 25, 42, 0.95);
    border: 1px solid rgba(255, 190, 72, 0.58);
    border-radius: 14px;
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(14px);
}

.arrival-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 15px 16px 13px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.arrival-panel__label {
    color: #ffbd59;
    font-size: 13px;
    letter-spacing: 0.08em;
}

.arrival-panel__route-name {
    margin: 5px 0 0;
    color: #ffffff;
    font-size: 22px;
    line-height: 1.3;
}

.arrival-panel__close {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: #d7e8f4;
    background: transparent;
    cursor: pointer;
    font: inherit;
    font-size: 24px;
    line-height: 26px;
}

.arrival-panel__close:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
}

.arrival-panel__route {
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.arrival-panel__direction {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    color: #c9d9e7;
    font-size: 14px;
    line-height: 1.4;
}

.arrival-panel__direction span:first-child {
    text-align: right;
}

.arrival-panel__direction-arrow {
    color: #ffbd59;
    font-size: 18px;
}

.arrival-panel__stop {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px 8px;
    margin-top: 13px;
}

.arrival-panel__stop-label {
    width: 100%;
    color: #91a6b9;
    font-size: 12px;
}

.arrival-panel__stop-name {
    color: #ffffff;
    font-size: 18px;
    overflow-wrap: anywhere;
}

.arrival-panel__stop-sequence {
    color: #ffbd59;
    font-size: 13px;
}

.arrival-panel__message {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 150px;
    padding: 24px;
    color: #b8cad9;
    font-size: 14px;
    text-align: center;
}

.arrival-panel__message--error {
    flex-direction: column;
    color: #ffb1a8;
}

.arrival-panel__message p {
    margin: 0;
}

.arrival-panel__spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(114, 216, 255, 0.25);
    border-top-color: #72d8ff;
    border-radius: 50%;
    animation: arrival-panel-spin 0.8s linear infinite;
}

.arrival-panel__retry {
    padding: 7px 12px;
    border: 1px solid rgba(255, 177, 168, 0.55);
    border-radius: 6px;
    color: #ffd2cd;
    background: rgba(255, 120, 105, 0.12);
    cursor: pointer;
    font: inherit;
}

.arrival-panel__primary {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: calc(100% - 32px);
    margin: 16px;
    padding: 18px 16px;
    border: 1px solid rgba(255, 190, 72, 0.38);
    border-radius: 12px;
    color: inherit;
    background:
        linear-gradient(
            135deg,
            rgba(255, 177, 67, 0.18),
            rgba(58, 203, 255, 0.08)
        );
    cursor: pointer;
    font: inherit;
    transition:
        border-color 160ms ease,
        transform 160ms ease,
        background-color 160ms ease;
}

.arrival-panel__primary:hover {
    border-color: rgba(255, 190, 72, 0.78);
    transform: translateY(-1px);
}

.arrival-panel__primary-label {
    color: #9db0c4;
    font-size: 12px;
    letter-spacing: 0.06em;
}

.arrival-panel__primary-stops {
    margin-top: 5px;
    color: #ffbd59;
    font-size: 32px;
    font-weight: 600;
    line-height: 1.25;
}

.arrival-panel__primary-detail {
    margin-top: 2px;
    color: #f5fbff;
    font-size: 16px;
}

.arrival-panel__vehicle-id {
    margin-top: 9px;
    color: #94abc0;
    font-size: 12px;
    overflow-wrap: anywhere;
}

.arrival-panel__following {
    padding: 0 16px 14px;
}

.arrival-panel__section-title {
    margin: 0 0 8px;
    color: #b7c8d8;
    font-size: 13px;
    font-weight: 500;
}

.arrival-panel__list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.arrival-panel__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 8px;
    color: inherit;
    background: rgba(255, 255, 255, 0.035);
    cursor: pointer;
    font: inherit;
    text-align: left;
}

.arrival-panel__item:hover {
    border-color: rgba(114, 216, 255, 0.45);
    background: rgba(114, 216, 255, 0.08);
}

.arrival-panel__item-main {
    display: grid;
    gap: 3px;
    min-width: 0;
}

.arrival-panel__item-main strong {
    color: #ffffff;
    font-size: 15px;
}

.arrival-panel__item-main span {
    color: #8fa5b8;
    font-size: 11px;
    overflow-wrap: anywhere;
}

.arrival-panel__item-meta {
    flex: 0 0 auto;
    color: #ffbd59;
    font-size: 13px;
}

.arrival-panel__footer {
    padding: 10px 16px 13px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: #73899d;
    font-size: 11px;
    text-align: right;
}

.arrival-panel-enter-active,
.arrival-panel-leave-active {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.arrival-panel-enter-from,
.arrival-panel-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}

@keyframes arrival-panel-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 640px) {
    .arrival-panel {
        top: 210px;
        right: 12px;
        left: 12px;
        width: auto;
        max-width: none;
    }
}
</style>