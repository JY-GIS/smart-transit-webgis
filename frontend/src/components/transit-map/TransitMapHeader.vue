<script setup lang="ts">
import type { BaseMapType, SceneDimension } from '@/composables/map/useMapDisplay'

// 接收显示所需的状态
defineProps<{
    activeBaseMap: BaseMapType
    sceneDimension: SceneDimension
    sceneDimensionToggleDisabled: boolean
    terrainEnabled: boolean
}>()

// 子组件通过自定义事件告诉父组件“用户点击了什么”
const emit = defineEmits<{
    'restore-view': []
    'toggle-base-map': []
    'toggle-scene-dimension': []
    'toggle-terrain': []
}>()
</script>

<template>
    <header class="transit-header">
        <div class="transit-brand" aria-label="深圳智慧公交">
            <span class="transit-brand__mark" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                    <path d="M6.5 4.5h11l1.5 3v9.25a1.25 1.25 0 0 1-1.25 1.25H6.25A1.25 1.25 0 0 1 5 16.75V7.5l1.5-3Z" />
                    <path d="M5 8h14M8 18v2M16 18v2M8.25 14.5h.01M15.75 14.5h.01" />
                </svg>
            </span>

            <div>
                <strong>深圳市福田区智慧公交</strong>
                <span>Smart Transit WebGIS</span>
            </div>
        </div>

        <div class="map-view-controls" aria-label="地图视图控制">
            <button
                class="map-tool-button map-tool-button--basemap is-active"
                type="button"
                :title="activeBaseMap === 'satellite' ? '切换到 OSM 道路图' : '切换到卫星影像'"
                :aria-label="activeBaseMap === 'satellite' ? '切换到 OSM 道路图' : '切换到卫星影像'"
                @click="emit('toggle-base-map')"
            >
                <svg class="map-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
                    <path d="m3 12 9 5 9-5" />
                    <path d="m3 16 9 5 9-5" />
                </svg>

                <span class="map-tool-label">
                    {{ activeBaseMap === 'satellite' ? '卫星' : 'OSM' }}
                </span>
            </button>

            <button
                class="map-tool-button map-tool-button--dimension is-active"
                type="button"
                :disabled="sceneDimensionToggleDisabled"
                :title="sceneDimensionToggleDisabled
                    ? '请先退出车辆镜头跟随'
                    : sceneDimension === '3d' ? '切换到二维地图' : '切换到三维地图'"
                :aria-label="sceneDimensionToggleDisabled
                    ? '请先退出车辆镜头跟随'
                    : sceneDimension === '3d' ? '切换到二维地图' : '切换到三维地图'"
                @click="emit('toggle-scene-dimension')"
            >
                {{ sceneDimension === '3d' ? '3D' : '2D' }}
            </button>

            <button
                class="map-tool-button map-tool-button--terrain"
                :class="{ 'is-active': terrainEnabled }"
                type="button"
                :aria-pressed="terrainEnabled"
                :title="terrainEnabled ? '关闭地形' : '开启地形'"
                :aria-label="terrainEnabled ? '关闭地形' : '开启地形'"
                @click="emit('toggle-terrain')"
            >
                <svg class="map-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m3 19 6.2-10 3.2 4.5L15.2 10 21 19H3Z" />
                    <path d="m7.4 12 1.8 1.7 1.4-1.3" />
                </svg>

                <span class="map-tool-label">
                    {{ terrainEnabled ? '地形' : '平面' }}
                </span>
            </button>

            <button
                class="restore-view-button"
                type="button"
                title="恢复默认视野"
                aria-label="恢复默认视野"
                @click="emit('restore-view')"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m4 11 8-7 8 7" />
                    <path d="M6.5 10v9.5h11V10" />
                    <path d="M9.5 19.5v-6h5v6" />
                </svg>
            </button>
        </div>
    </header>
</template>

<style scoped>
.transit-header {
    position: relative;
    z-index: 30;
    display: flex;
    height: 76px;
    flex: 0 0 76px;
    align-items: center;
    justify-content: space-between;
    margin: 8px 10px 8px;
    padding: 0 18px 0 26px;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid rgba(219, 228, 240, 0.9);
    border-radius: 14px;
    box-shadow: 0 5px 18px rgba(37, 64, 109, 0.08);
}

.transit-brand {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 14px;
}

.transit-brand__mark {
    display: grid;
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    place-items: center;
    color: #2478ed;
    background: #eef6ff;
    border-radius: 12px;
}

.transit-brand__mark svg {
    width: 45px;
    height: 45px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.transit-brand strong,
.transit-brand span {
    display: block;
}

.transit-brand strong {
    color: #13223a;
    font-size: 24px;
    line-height: 1.2;
    letter-spacing: 0.03em;
}

.transit-brand span {
    margin-top: 3px;
    color: #8492a8;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.map-view-controls {
    display: flex;
    align-items: center;
    gap: 10px;
}

.map-tool-button {
    display: flex;
    width: 58px;
    height: 48px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 0;
    color: var(--transit-panel-text);
    background: var(--transit-panel-bg);
    border: 1px solid var(--transit-panel-border);
    border-radius: 6px;
    box-shadow: none;
    cursor: pointer;
    font: inherit;
    transition: background-color 160ms ease, border-color 160ms ease;
}

.map-tool-button.is-active {
    color: #185fc7;
    background: #f7fbff;
    border-color: #a9c9f8;
    box-shadow: inset 0 -3px 0 #2478ed;
}

.map-tool-button--dimension {
    font-size: 16px;
    font-weight: 750;
}

.map-tool-button:hover {
    color: var(--transit-panel-primary);
    background: var(--transit-panel-primary-soft);
    border-color: #93c5fd;
}

.map-tool-button:disabled {
    opacity: 0.48;
    cursor: not-allowed;
}

.map-tool-button:disabled:hover {
    color: var(--transit-panel-text);
    background: var(--transit-panel-bg);
    border-color: var(--transit-panel-border);
}

.map-tool-button:focus-visible {
    outline: 2px solid var(--transit-panel-primary);
    outline-offset: 2px;
}

.map-tool-icon {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.map-tool-label {
    font-size: 11px;
    line-height: 1;
}

.restore-view-button {
    display: grid;
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    padding: 0;
    place-items: center;
    color: #185fc7;
    cursor: pointer;
    background: #f7fbff;
    border: 1px solid #a9c9f8;
    border-radius: 50%;
    box-shadow: 0 5px 16px rgba(37, 120, 237, 0.18);
    transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.restore-view-button:hover {
    color: #ffffff;
    background: #2478ed;
    border-color: #2478ed;
    transform: translateY(-1px);
}

.restore-view-button:active {
    transform: translateY(0);
}

.restore-view-button:focus-visible {
    outline: 2px solid #2478ed;
    outline-offset: 3px;
}

.restore-view-button svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
}

@media (max-width: 960px) {
    .transit-header {
        padding-left: 18px;
    }

    .transit-brand strong {
        font-size: 20px;
    }

    .transit-brand span {
        display: none;
    }
}

@media (max-width: 680px) {
    .transit-header {
        height: 62px;
        flex-basis: 62px;
        margin: 6px;
        padding: 0 10px 0 12px;
    }

    .transit-brand__mark {
        width: 36px;
        height: 36px;
        flex-basis: 36px;
    }

    .transit-brand__mark svg {
        width: 24px;
        height: 24px;
    }

    .transit-brand strong {
        font-size: 16px;
    }

    .map-view-controls {
        gap: 5px;
        margin-right: 0;
    }

    .map-tool-button {
        width: 42px;
        height: 40px;
    }

    .map-tool-button--basemap {
        display: none;
    }

    .restore-view-button {
        width: 40px;
        height: 40px;
        flex-basis: 40px;
    }
}
</style>
