<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { BusRouteProperties } from '@/types/busRoute'
import type { OrderedBusStop } from '@/types/busStop'
import type { RealtimeVehiclePositionSnapshot } from '@/types/realtimeVehicle'

type RouteStopDisplayState =
    | 'passed'
    | 'previous'
    | 'next'
    | 'upcoming'

const props = defineProps<{
    vehicle: RealtimeVehiclePositionSnapshot
    route: BusRouteProperties | null
    stops: OrderedBusStop[]
}>()

const collapsed = ref(false)

const viewport = ref<HTMLElement | null>(null)

const routeTitle = computed(() => props.route?.rname ?? props.vehicle.routeId)

// 使用首末站组成线路方向说明。
const routeDirection = computed(() => {
    const firstStop = props.stops[0]
    const lastStop = props.stops[props.stops.length - 1]

    if (!firstStop || !lastStop) return ''

    return `${firstStop.stopName} → ${lastStop.stopName}`
})

// 格式化下一站距离
const nextStopDistanceText = computed(() => {
    const distanceMeters = props.vehicle.distanceToNextStopMeters
    if (distanceMeters === null) return '—'
    return `${distanceMeters.toFixed(0)} 米`
})

// 根据上一站和下一站的线路里程，计算车辆在当前站间区段中的进度
const currentSegmentProgress = computed(() => {
    const previousStop = props.vehicle.previousStop
    const nextStop = props.vehicle.nextStop
    const distanceToNextStopMeters = props.vehicle.distanceToNextStopMeters

    if (!previousStop || !nextStop || distanceToNextStopMeters === null) {
        return 0
    }

    let nextStopDistanceMeters = nextStop.distanceAlongRouteMeters

    if (nextStopDistanceMeters <= previousStop.distanceAlongRouteMeters) {
        nextStopDistanceMeters += props.vehicle.totalDistanceMeters
    }

    const segmentLengthMeters = nextStopDistanceMeters - previousStop.distanceAlongRouteMeters

    if (segmentLengthMeters <= 0) return 0

    return Math.min(
        1,
        Math.max(0, 1 - distanceToNextStopMeters / segmentLengthMeters),
    )
})

// 将车辆当前站间进度转换为横向站序中的百分比位置
const vehicleMarkerLeftPercent = computed(() => {
    const stopCount = props.stops.length

    if (stopCount === 0) return 0
    if (stopCount === 1) return 50

    const previousStopId = props.vehicle.previousStop?.stopId
    const nextStopId = props.vehicle.nextStop?.stopId

    const previousIndex =
        props.stops.findIndex(
            (stop) => stop.stopId === previousStopId,
        )

    const nextIndex =
        props.stops.findIndex(
            (stop) => stop.stopId === nextStopId,
        )

    const edgePercent = 50 / stopCount
    const usablePercent = 100 - edgePercent * 2

    if (previousIndex < 0) {
        const initialIndex = Math.max(0, nextIndex)

        return (edgePercent + usablePercent * initialIndex / (stopCount - 1))
    }

    if (nextIndex > previousIndex) {
        const markerIndex = previousIndex + (nextIndex - previousIndex) * currentSegmentProgress.value

        return (edgePercent + usablePercent * markerIndex / (stopCount - 1))
    }

    return 100 - edgePercent
})

// 将车辆位置和站点数量传给CSS
const trackStyle = computed<Record<string, string>>(() => {
    const stopCount = Math.max(1, props.stops.length)
    const edgePercent = 50 / stopCount

    return {
        width: `max(100%, ${stopCount * 116}px)`,
        gridTemplateColumns: `repeat(${stopCount}, minmax(116px, 1fr))`,
        '--track-edge': `${edgePercent}%`,
        '--vehicle-left': `${vehicleMarkerLeftPercent.value}%`,
    }
})

// 判断一个站点相对于当前车辆的展示状态
function getStopState(stop: OrderedBusStop): RouteStopDisplayState {
    const previousStop = props.vehicle.previousStop
    const nextStop = props.vehicle.nextStop

    if (stop.stopId === nextStop?.stopId) return 'next'
    if (stop.stopId === previousStop?.stopId) return 'previous'

    if (!previousStop || !nextStop) return 'upcoming'

    const isRouteWrapping = nextStop.stopSequence <= previousStop.stopSequence

    if (!isRouteWrapping && stop.stopSequence < previousStop.stopSequence) {
        return 'passed'
    }

    if (
        isRouteWrapping &&
        stop.stopSequence > nextStop.stopSequence &&
        stop.stopSequence < previousStop.stopSequence
    ) {
        return 'passed'
    }

    return 'upcoming'
}

// 将下一站平滑移动到横向可视区域中央
async function centerNextStop() {
    await nextTick()

    const currentViewport = viewport.value

    if (!currentViewport || collapsed.value) return

    const nextStopElement = currentViewport.querySelector<HTMLElement>('[data-next="true"]')

    if (!nextStopElement) return

    const targetScrollLeft = nextStopElement.offsetLeft - (currentViewport.clientWidth - nextStopElement.offsetWidth) / 2

    currentViewport.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth',
    })
}

function toggleCollapsed() {
    collapsed.value = !collapsed.value
}

watch(
    [
        () => props.vehicle.nextStop?.stopId,
        () => props.stops.length,
        () => collapsed.value,
    ],
    () => {
        void centerNextStop()
    },
    {
        immediate: true,
        flush: 'post',
    },
)
</script>

<template>
    <section v-if="stops.length > 0" class="realtime-route-progress" :class="{ 'is-collapsed': collapsed }" @click.stop>
        <header class="realtime-route-progress__header">
            <div class="realtime-route-progress__identity">
                <span class="realtime-route-progress__route">
                    {{ routeTitle }}
                </span>

                <div>
                    <strong>{{ routeDirection }}</strong>

                    <span>
                        {{ vehicle.vehicleId }}
                        ·
                        当前线路进度
                        {{ vehicle.routeProgressPercent.toFixed(1) }}%
                    </span>
                </div>
            </div>

            <div class="realtime-route-progress__next">
                <span>下一站</span>

                <strong>
                    {{ vehicle.nextStop?.stopName ?? '暂无下一站' }}
                </strong>

                <span class="realtime-route-progress__distance">
                    {{ nextStopDistanceText }}
                </span>
            </div>

            <button
                type="button"
                class="realtime-route-progress__toggle"
                :aria-expanded="!collapsed"
                @click="toggleCollapsed"
            >
                {{ collapsed ? '展开站序' : '收起站序' }}
            </button>
        </header>

        <div v-if="!collapsed" ref="viewport" class="realtime-route-progress__viewport">
            <div class="realtime-route-progress__track" :style="trackStyle">
                <div class="realtime-route-progress__line"></div>

                <div class="realtime-route-progress__completed-line"></div>

                <div
                    class="realtime-route-progress__vehicle"
                    aria-label="当前车辆位置"
                >
                    <span>🚌</span>

                    <small>行驶中</small>
                </div>

                <div
                    v-for="stop in stops"
                    :key="`${stop.stopId}-${stop.stopSequence}`"
                    class="realtime-route-progress__stop"
                    :class="`is-${getStopState(stop)}`"
                    :data-next="getStopState(stop) === 'next' ? 'true' : 'false'"
                >
                    <span class="realtime-route-progress__dot">
                        <template v-if="getStopState(stop) === 'passed'">
                            ✓
                        </template>
                    </span>

                    <span class="realtime-route-progress__sequence">
                        {{ String(stop.stopSequence).padStart(2, '0') }}
                    </span>

                    <strong>
                        {{ stop.stopName }}
                    </strong>

                    <small v-if="getStopState(stop) === 'passed'">
                        已通过
                    </small>

                    <small v-else-if="getStopState(stop) === 'previous'">
                        上一站
                    </small>

                    <small v-else-if="getStopState(stop) === 'next'">
                        下一站
                    </small>

                    <small v-else>
                        未到达
                    </small>
                </div>
            </div>
        </div>
    </section>
</template>

<style scoped>
.realtime-route-progress {
    position: absolute;
    z-index: 22;
    right: 24px;
    bottom: 24px;
    left: 24px;
    overflow: hidden;
    color: #e8f5ff;
    background: rgba(8, 22, 37, 0.96);
    border: 1px solid rgba(83, 192, 220, 0.42);
    border-radius: 12px;
    box-shadow: 0 -12px 34px rgba(0, 0, 0, 0.34);
    backdrop-filter: blur(14px);
}

.realtime-route-progress__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 24px;
    min-height: 68px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(145, 184, 205, 0.18);
}

.realtime-route-progress__identity,
.realtime-route-progress__next {
    display: flex;
    align-items: center;
    gap: 12px;
}

.realtime-route-progress__identity > div {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 4px;
}

.realtime-route-progress__identity strong {
    overflow: hidden;
    color: #f4fbff;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.realtime-route-progress__identity div span,
.realtime-route-progress__next > span:first-child {
    color: #8ea9bb;
    font-size: 12px;
}

.realtime-route-progress__route {
    flex: 0 0 auto;
    padding: 7px 10px;
    color: #052a35;
    background: #42ddf7;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 700;
}

.realtime-route-progress__next {
    padding-left: 24px;
    border-left: 1px solid rgba(145, 184, 205, 0.22);
}

.realtime-route-progress__next strong {
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
}

.realtime-route-progress__distance {
    padding: 4px 8px;
    color: #ffcb78;
    background: rgba(255, 181, 74, 0.12);
    border-radius: 999px;
    font-size: 12px;
}

.realtime-route-progress__toggle {
    padding: 8px 11px;
    color: #9ec8dc;
    cursor: pointer;
    background: rgba(31, 57, 76, 0.72);
    border: 1px solid rgba(126, 174, 199, 0.32);
    border-radius: 7px;
    font: inherit;
    font-size: 12px;
}

.realtime-route-progress__toggle:hover {
    color: #ffffff;
    background: rgba(42, 75, 97, 0.86);
}

.realtime-route-progress.is-collapsed
.realtime-route-progress__header {
    border-bottom: 0;
}

.realtime-route-progress__viewport {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px 26px 12px;
    scrollbar-color: rgba(117, 154, 175, 0.55) transparent;
    scrollbar-width: thin;
}

.realtime-route-progress__track {
    position: relative;
    display: grid;
    min-height: 102px;
}

.realtime-route-progress__line,
.realtime-route-progress__completed-line {
    position: absolute;
    top: 28px;
    left: var(--track-edge);
    height: 4px;
    border-radius: 999px;
}

.realtime-route-progress__line {
    right: var(--track-edge);
    background: rgba(132, 157, 171, 0.34);
}

.realtime-route-progress__completed-line {
    width: calc(var(--vehicle-left) - var(--track-edge));
    background: linear-gradient(90deg, #24bd91, #3edcf7);
}

.realtime-route-progress__vehicle {
    position: absolute;
    z-index: 4;
    top: -5px;
    left: var(--vehicle-left);
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #ffe3b2;
    transform: translateX(-50%);
    transition: left 0.8s linear;
}

.realtime-route-progress__vehicle span {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    background: #ffad36;
    border-radius: 50%;
    box-shadow: 0 0 16px rgba(255, 173, 54, 0.7);
    font-size: 18px;
}

.realtime-route-progress__vehicle small {
    margin-top: 3px;
    padding: 2px 6px;
    color: #ffcc7c;
    background: rgba(8, 22, 37, 0.94);
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
}

.realtime-route-progress__stop {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    padding: 0 6px;
    color: #a9bbc7;
    text-align: center;
}

.realtime-route-progress__dot {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    margin: 19px 0 4px;
    color: #08251d;
    background: #6e8795;
    border: 4px solid #122d3c;
    border-radius: 50%;
    font-size: 10px;
}

.realtime-route-progress__sequence,
.realtime-route-progress__stop small {
    color: #7892a3;
    font-size: 10px;
}

.realtime-route-progress__stop strong {
    display: -webkit-box;
    margin-top: 2px;
    overflow: hidden;
    color: #a9bbc7;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.35;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
}

.realtime-route-progress__stop.is-passed
.realtime-route-progress__dot,
.realtime-route-progress__stop.is-previous
.realtime-route-progress__dot {
    background: #39d19f;
}

.realtime-route-progress__stop.is-passed strong,
.realtime-route-progress__stop.is-previous strong {
    color: #bcebdc;
}

.realtime-route-progress__stop.is-next
.realtime-route-progress__dot {
    width: 24px;
    height: 24px;
    margin-top: 16px;
    background: #ffb54a;
    border-color: #3b2e1c;
    box-shadow:
        0 0 0 5px rgba(255, 181, 74, 0.16),
        0 0 18px rgba(255, 181, 74, 0.65);
}

.realtime-route-progress__stop.is-next strong,
.realtime-route-progress__stop.is-next small {
    color: #ffd694;
    font-weight: 700;
}

@media (max-width: 720px) {
    .realtime-route-progress {
        right: 12px;
        bottom: 12px;
        left: 12px;
    }

    .realtime-route-progress__header {
        grid-template-columns: 1fr;
        gap: 8px;
    }

    .realtime-route-progress__next {
        padding-top: 8px;
        padding-left: 0;
        border-top: 1px solid rgba(145, 184, 205, 0.18);
        border-left: 0;
    }
    .realtime-route-progress__toggle {
        justify-self: end;
    }
}
</style>