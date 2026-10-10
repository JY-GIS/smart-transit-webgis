<script setup lang="ts">
import { ref } from 'vue'
import PoiCategoryChart from '@/components/transit/PoiCategoryChart.vue'
import { TRANSIT_CONFIG } from '@/config/transit.config'

import type {
    PoiAnalysisStatus,
    PoiCategorySummary,
    PoiType,
    PoiTypeVisibility,
} from '@/types/poi'

const props = defineProps<{
    summary: PoiCategorySummary | null
    status: PoiAnalysisStatus
    errorMessage: string | null
    radiusMeters: number
    pointsVisible: boolean
    typeVisibility: PoiTypeVisibility
}>()

const emit = defineEmits<{
    clear: []
    radiusInput: [radiusMeters: number]
    radiusChange: [radiusMeters: number]
    pointsVisibleChange: [visible: boolean]
    focusType: [poiType: PoiType]
}>()

const isCollapsed = ref(false)
function toggleCollapsed() {
    isCollapsed.value = !isCollapsed.value
}

// 从滑动条事件中读取当前半径
function getRadiusFromEvent(event: Event): number {
    return Number((event.target as HTMLInputElement).value)
}

// 拖动过程中只通知父页面更新半径数字，不发送查询请求
function handleRadiusInput(event: Event) {
    emit('radiusInput', getRadiusFromEvent(event))
}

// 用户松开滑动条后，通知父页面使用最终半径重新查询
function handleRadiusChange(event: Event) {
    emit('radiusChange', getRadiusFromEvent(event))
}

// 点击常用半径后立即更新数字并重新查询
function selectRadiusPreset(radiusMeters: number) {
    emit('radiusInput', radiusMeters)
    emit('radiusChange', radiusMeters)
}

// 读取复选框状态，并通知父页面统一显示或隐藏全部POI点
function handlePointsVisibleChange(event: Event) {
    const checkbox = event.target as HTMLInputElement

    emit('pointsVisibleChange', checkbox.checked)
}
</script>

<template>
    <transition name="poi-panel">
        <aside v-if="props.status !== 'idle'" class="poi-panel" :class="{ 'is-collapsed': isCollapsed }" @click.stop>
            <header class="poi-panel__header">
                <div>
                    <span class="poi-panel__label">
                        POI 服务分析
                    </span>

                    <h2 class="poi-panel__title">
                        {{ props.radiusMeters }} 米服务范围
                        <span v-if="props.status === 'success' && props.summary">
                            · {{ props.summary.totalCount }} 个
                        </span>
                    </h2>
                </div>

                <div class="poi-panel__actions">
                    <button
                        type="button"
                        class="poi-panel__toggle"
                        :aria-label="isCollapsed ? '展开POI分析面板' : '收起POI分析面板'"
                        :title="isCollapsed ? '展开' : '收起'"
                        @click="toggleCollapsed"
                    >
                        {{ isCollapsed ? '+' : '−' }}
                    </button>

                    <button
                        type="button"
                        class="poi-panel__close"
                        aria-label="清除POI分析"
                        title="关闭查询"
                        @click="emit('clear')"
                    >
                        ×
                    </button>
                </div>
            </header>

            <div v-show="!isCollapsed" class="poi-panel__body">
                <section class="poi-panel__radius">
                    <div class="poi-panel__radius-header">
                        <span>分析半径</span>

                        <strong>{{ props.radiusMeters }} 米</strong>
                    </div>

                    <input
                        class="poi-panel__range"
                        type="range"
                        :min="TRANSIT_CONFIG.poiAnalysis.minRadiusMeters"
                        :max="TRANSIT_CONFIG.poiAnalysis.maxRadiusMeters"
                        :step="TRANSIT_CONFIG.poiAnalysis.radiusStepMeters"
                        :value="props.radiusMeters"
                        aria-label="POI分析半径"
                        @input="handleRadiusInput"
                        @change="handleRadiusChange"
                    />

                    <div class="poi-panel__range-scale">
                        <span>{{ TRANSIT_CONFIG.poiAnalysis.minRadiusMeters }}</span>

                        <span>{{ TRANSIT_CONFIG.poiAnalysis.maxRadiusMeters }}</span>
                    </div>

                    <div class="poi-panel__presets">
                        <button
                            v-for="radius in TRANSIT_CONFIG.poiAnalysis.radiusPresets"
                            :key="radius"
                            type="button"
                            class="poi-panel__preset"
                            :class="{ 'is-active': props.radiusMeters === radius }"
                            @click="selectRadiusPreset(radius)"
                        >
                            {{ radius }} 米
                        </button>
                    </div>
                </section>

                <label class="poi-panel__visibility">
                    <input type="checkbox" :checked="props.pointsVisible" @change="handlePointsVisibleChange"/>
                    <span>显示地图POI点位</span>
                </label>

                <div v-if="props.status === 'zero-radius'" class="poi-panel__message">
                    当前半径为0米，请调整滑动条或选择常用范围
                </div>

                <div v-else-if="props.status === 'loading'" class="poi-panel__message">
                    正在统计周边服务设施……
                </div>

                <div v-else-if="props.status === 'error'" class="poi-panel__message poi-panel__message--error">
                    {{ props.errorMessage ?? 'POI分类统计失败' }}
                </div>

                <div v-else-if="props.status === 'empty'" class="poi-panel__message">
                    当前范围内没有可分析的POI
                </div>

                <template v-else-if="props.status === 'success' && props.summary">
                    <div class="poi-panel__chart">
                        <PoiCategoryChart
                            :summary="props.summary"
                            :type-visibility="props.typeVisibility"
                            @focus-type="emit('focusType', $event)"
                        />
                    </div>
                </template>
            </div>
        </aside>
    </transition>
</template>

<style scoped>
.poi-panel {
    position: absolute;
    top: 180px;
    left: 20px;
    z-index: 20;
    width: 300px;
    max-width: calc(100% - 48px);
    overflow: hidden;
    color: var(--transit-panel-text);
    background: var(--transit-panel-bg);
    border: 1px solid var(--transit-panel-border);
    border-radius: 12px;
    box-shadow: var(--transit-panel-shadow);
}

.poi-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--transit-panel-divider);
}

.poi-panel__label {
    color: #7c3aed;
    font-size: 13px;
    letter-spacing: 0.08em;
}

.poi-panel__title {
    margin: 5px 0 0;
    color: var(--transit-panel-text);
    font-size: 18px;
    line-height: 1.4;
}

.poi-panel__actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.poi-panel__toggle,
.poi-panel__close {
    width: 28px;
    height: 28px;
    padding: 0;
    color: var(--transit-panel-muted);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: 6px;
}

.poi-panel__toggle {
    font-size: 19px;
    line-height: 28px;
}

.poi-panel__close {
    font-size: 24px;
    line-height: 24px;
}

.poi-panel__toggle:hover,
.poi-panel__close:hover {
    color: #7c3aed;
    background: #f5f3ff;
}

.poi-panel__body {
    max-height: calc(100vh - 270px);
    overflow-y: auto;
}

.poi-panel__radius {
    padding: 14px 16px;
    border-bottom: 1px solid var(--transit-panel-divider);
}

.poi-panel__radius-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    color: var(--transit-panel-muted);
    font-size: 13px;
}

.poi-panel__radius-header strong {
    color: var(--transit-panel-text);
    font-size: 14px;
}

.poi-panel__range {
    width: 100%;
    cursor: pointer;
    accent-color: #a78bfa;
}

.poi-panel__range-scale {
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
    color: var(--transit-panel-faint);
    font-size: 11px;
}

.poi-panel__presets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 10px;
}

.poi-panel__preset {
    padding: 6px 4px;
    color: var(--transit-panel-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    background: var(--transit-panel-soft);
    border: 1px solid var(--transit-panel-divider);
    border-radius: 6px;
}

.poi-panel__preset:hover,
.poi-panel__preset.is-active {
    color: #6d28d9;
    background: #ede9fe;
    border-color: #a78bfa;
}

.poi-panel__visibility {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 16px;
    color: var(--transit-panel-text);
    font-size: 13px;
    cursor: pointer;
    border-bottom: 1px solid var(--transit-panel-divider);
}

.poi-panel__visibility input {
    width: 15px;
    height: 15px;
    margin: 0;
    cursor: pointer;
    accent-color: #a78bfa;
}

.poi-panel__message {
    padding: 16px;
    color: var(--transit-panel-muted);
    font-size: 14px;
}

.poi-panel__message--error {
    color: var(--transit-panel-danger);
}

.poi-panel__chart {
    padding: 0 8px 10px;
}

.poi-panel-enter-active,
.poi-panel-leave-active {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.poi-panel-enter-from,
.poi-panel-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}
</style>
