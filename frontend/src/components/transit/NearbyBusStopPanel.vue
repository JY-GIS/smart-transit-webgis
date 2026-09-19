<script setup lang="ts">
import type {
    NearbyBusStopRecord,
    NearbyQueryStatus,
} from '@/types/busStop'

// defineProps 用于接收父组件传入的只读数据
const props = defineProps<{
    stops: NearbyBusStopRecord[]
    status: NearbyQueryStatus
    errorMessage: string | null
    radiusMeters: number
}>()

// defineEmits 用于让子组件通知父组件执行清除操作
const emit = defineEmits<{
    clear: []
}>()

function formatDistance(distanceMeters: number): string {
    if (!Number.isFinite(distanceMeters)) {
        return '距离未知'
    }

    if (distanceMeters < 1000) {
        return `${Math.round(distanceMeters)}米`
    }

    return `${(distanceMeters / 1000).toFixed(2)} 千米`
}
</script>

<template>
    <transition name="nearby-panel">
        <aside
            v-if="props.status !== 'idle'"
            class="nearby-panel"
            @click.stop
        >
            <div class="nearby-panel__header">
                <div>
                    <span class="nearby-panel__label">
                        附近公交站
                    </span>

                    <h2 class="nearby-panel__title">
                        {{ props.radiusMeters }} 米范围
                    </h2>
                </div>

                <button
                    type="button"
                    class="nearby-panel__close"
                    aria-label="清除附近公交站查询"
                    @click="emit('clear')"
                >
                    ×
                </button>
            </div>

            <div
                v-if="props.status === 'loading'"
                class="nearby-panel__message"
            >
                正在查询附近公交站……
            </div>

            <div
                v-else-if="props.status === 'error'"
                class="nearby-panel__message nearby-panel__message--error"
            >
                {{ props.errorMessage ?? '附近公交站查询失败' }}
            </div>

            <div
                v-else-if="props.status === 'empty'"
                class="nearby-panel__message"
            >
                当前范围内没有公交站
            </div>

            <template v-else-if="props.status === 'success'">
                <div class="nearby-panel__summary">
                    共找到 {{ props.stops.length }} 个公交站
                </div>

                <ol class="nearby-panel__list">
                    <li
                        v-for="stop in props.stops"
                        :key="stop.stopId"
                        class="nearby-panel__item"
                    >
                        <span class="nearby-panel__stop-name">
                            {{ stop.stopName }}
                        </span>

                        <strong class="nearby-panel__distance">
                            {{ formatDistance(stop.distanceMeters) }}
                        </strong>
                    </li>
                </ol>
            </template>
        </aside>
    </transition>
</template>


<style scoped>
.nearby-panel {
    position: absolute;
    top: 180px;
    right: 24px;
    z-index: 20;
    width: 300px;
    max-width: calc(100% - 48px);
    max-height: 420px;
    overflow: hidden;
    color: #f4f8ff;
    background: rgba(13, 25, 42, 0.94);
    border: 1px solid rgba(81, 214, 255, 0.55);
    border-radius: 12px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.38);
    backdrop-filter: blur(12px);
}

.nearby-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.nearby-panel__label {
    color: #72d8ff;
    font-size: 13px;
    letter-spacing: 0.08em;
}

.nearby-panel__title {
    margin: 5px 0 0;
    color: #ffffff;
    font-size: 18px;
    line-height: 1.4;
}

.nearby-panel__close {
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

.nearby-panel__close:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
}

.nearby-panel__summary,
.nearby-panel__message {
    padding: 14px 16px;
    color: #bcd0df;
    font-size: 14px;
    line-height: 1.5;
}

.nearby-panel__message--error {
    color: #ffaaa0;
}

.nearby-panel__list {
    max-height: 320px;
    margin: 0;
    padding: 0 16px 12px 36px;
    overflow-y: auto;
}

.nearby-panel__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 14px;
}

.nearby-panel__stop-name {
    overflow-wrap: anywhere;
}

.nearby-panel__distance {
    flex: 0 0 auto;
    color: #72d8ff;
    font-weight: 500;
}

.nearby-panel-enter-active,
.nearby-panel-leave-active {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.nearby-panel-enter-from,
.nearby-panel-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}
</style>