<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { OrderedBusStop } from '@/types/busStop'

const props = defineProps<{
    stops: OrderedBusStop[]
    selectedStopId: string
}>()

const viewport = ref<HTMLElement | null>(null)

// 轨道宽度由站点数量决定
const trackStyle = computed(() => ({
    width: `${ Math.max(1, props.stops.length) * 76 }px`,
}))

/**
 * 将当前查询站移动到可视区域中央
 */
async function centerSelectedStop() {
    // nextTick：等待 Vue 将最新站点列表更新到真实 DOM
    await nextTick()

    const currentViewport = viewport.value

    if (!currentViewport) {
        return
    }

    /*
     * 不把所有站点 DOM 都保存到数组，
     * 只通过 data-selected 查找当前唯一选中项。
     */
    const selectedElement =
        currentViewport.querySelector<HTMLElement>(
            '[data-selected="true"]',
        )

    if (!selectedElement) {
        return
    }

    /*
     * 目标滚动距离：选中项左侧距离 -（容器宽度 - 选中项宽度）÷ 2
     *
     * 结果就是把选中项中心移动到容器中心。
     */
    const targetScrollLeft =
        selectedElement.offsetLeft -
        (currentViewport.clientWidth - selectedElement.offsetWidth) / 2

    /*
     * Element.scrollTo：控制某个可滚动元素的位置。
     * behavior: 'smooth' 会产生平滑滚动，不会突然跳到目标站。
     */
    currentViewport.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth',
    })
}

/**
 * 线路或当前站改变后重新居中。
 * flush: 'post' 表示等待本轮 DOM 更新完成后执行 watcher。
 */
watch(
    [
        () => props.selectedStopId,
        () => props.stops.length,
    ],
    () => {
        void centerSelectedStop()
    },
    {
        immediate: true,
        flush: 'post',
    },
)
</script>

<template>
    <section
        v-if="stops.length > 0"
        class="route-progress"
        aria-label="线路站序"
    >
        <header class="route-progress__header">
            <h3>线路站序</h3>

            <span>横向滚动查看全线</span>
        </header>

        <div
            ref="viewport"
            class="route-progress__viewport"
        >
            <div
                class="route-progress__track"
                :style="trackStyle"
            >
                <div
                    class="route-progress__line"
                    aria-hidden="true"
                ></div>

                <div
                    v-for="stop in stops"
                    :key="stop.stopId"
                    class="route-progress__stop"
                    :class="{
                        'is-selected':
                            stop.stopId === selectedStopId,
                    }"
                    :data-selected="
                        stop.stopId === selectedStopId
                            ? 'true'
                            : 'false'
                    "
                >
                    <span
                        class="route-progress__dot"
                        aria-hidden="true"
                    ></span>

                    <span class="route-progress__sequence">
                        {{ stop.stopSequence }}
                    </span>

                    <span class="route-progress__name">
                        {{ stop.stopName }}
                    </span>
                </div>
            </div>
        </div>
    </section>
</template>

<style scoped>
.route-progress {
    padding: 10px 12px 12px;
    border-top: 1px solid #e5e7eb;
}

.route-progress__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
}

.route-progress__header h3 {
    margin: 0;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
}

.route-progress__header span {
    color: #94a3b8;
    font-size: 10px;
}

.route-progress__viewport {
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-color: #cbd5e1 transparent;
    scrollbar-width: thin;
}

.route-progress__track {
    position: relative;
    display: grid;
    grid-auto-columns: 76px;
    grid-auto-flow: column;
    min-height: 88px;
}

.route-progress__line {
    position: absolute;
    top: 20px;
    right: 38px;
    left: 38px;
    height: 3px;
    background: #22c55e;
    border-radius: 999px;
}

.route-progress__line::after {
    position: absolute;
    top: -8px;
    right: -2px;
    color: #16a34a;
    content: '›';
    font-size: 20px;
    font-weight: 700;
}

.route-progress__stop {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    padding: 36px 5px 0;
    text-align: center;
}

.route-progress__dot {
    position: absolute;
    z-index: 1;
    top: 14px;
    left: 50%;
    width: 14px;
    height: 14px;
    border: 3px solid #22c55e;
    border-radius: 50%;
    background: #ffffff;
    transform: translateX(-50%);
}

.route-progress__stop.is-selected
.route-progress__dot {
    top: 12px;
    width: 18px;
    height: 18px;
    border-color: #f59e0b;
    background: #fef3c7;
    box-shadow:
        0 0 0 3px rgba(245, 158, 11, 0.18);
}

.route-progress__sequence {
    color: #94a3b8;
    font-size: 10px;
}

.route-progress__name {
    display: -webkit-box;
    margin-top: 3px;
    overflow: hidden;
    color: #475569;
    font-size: 11px;
    line-height: 1.35;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
}

.route-progress__stop.is-selected
.route-progress__sequence,
.route-progress__stop.is-selected
.route-progress__name {
    color: #d97706;
    font-weight: 700;
}
</style>