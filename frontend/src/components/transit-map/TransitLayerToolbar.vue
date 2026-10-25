<script setup lang="ts">

import type { RealtimeVehicleRenderMode } from '@/types/realtimeVehicle'

// 左侧工具栏只接收按钮显示所需的状态
defineProps<{
    historyModeEnabled: boolean
    realtimeRoamingModeEnabled: boolean
    nearbyQueryEnabled: boolean
    busRoutesVisible: boolean
    whiteModelVisible: boolean
    realtimeVehicleRenderMode: RealtimeVehicleRenderMode
}>()

// 点击按钮后只发送操作意图由 TransitMapView 完成
const emit = defineEmits<{
    'toggle-history-mode': []
    'toggle-realtime-roaming-mode': []
    'toggle-nearby-query': []
    'toggle-bus-routes': []
    'toggle-white-model': []
    'toggle-realtime-vehicle-render-mode': []
}>()

</script>

<template>
    <nav class="layer-controls" aria-label="公交地图功能">
        <button
            class="layer-control-button"
            :class="{ 'is-active': historyModeEnabled }"
            type="button"
            :aria-pressed="historyModeEnabled"
            @click="emit('toggle-history-mode')"
        >
            <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
                <path d="M4 4v4.68h4.68M12 7v5l3 2" />
            </svg>

            <span class="layer-control-copy">
                <strong>历史回放</strong>
                <small>{{ historyModeEnabled ? '回放模式已开启' : '车辆轨迹查询' }}</small>
            </span>
        </button>

        <button
            class="layer-control-button"
            :class="{ 'is-active': realtimeRoamingModeEnabled }"
            type="button"
            :aria-pressed="realtimeRoamingModeEnabled"
            @click="emit('toggle-realtime-roaming-mode')"
        >
            <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 18c3.2-5.8 5.8-3.2 8.4-8.5C14.8 6.7 16.7 5 20 5" />
                <circle cx="5" cy="18" r="2" />
                <circle cx="20" cy="5" r="2" />
                <path d="m14.5 17 2.5 2.5L21 15" />
            </svg>

            <span class="layer-control-copy">
                <strong>公交漫游</strong>
                <small>{{ realtimeRoamingModeEnabled ? '车辆跟随中' : '实时车辆跟随' }}</small>
            </span>
        </button>

        <button
            class="layer-control-button"
            :class="{ 'is-active': nearbyQueryEnabled }"
            type="button"
            :aria-pressed="nearbyQueryEnabled"
            @click="emit('toggle-nearby-query')"
        >
            <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
            </svg>

            <span class="layer-control-copy">
                <strong>附近站点</strong>
                <small>{{ nearbyQueryEnabled ? '点击地图选点' : '空间范围查询' }}</small>
            </span>
        </button>

        <button
            class="layer-control-button"
            :class="{ 'is-active': busRoutesVisible }"
            type="button"
            :aria-pressed="busRoutesVisible"
            @click="emit('toggle-bus-routes')"
        >
            <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="5" width="16" height="13" rx="3" />
                <path d="M7 9h10M8 18v2M16 18v2M8 14h.01M16 14h.01" />
            </svg>

            <span class="layer-control-copy">
                <strong>公交线路</strong>
                <small>{{ busRoutesVisible ? '线路图层已显示' : '线路图层已隐藏' }}</small>
            </span>
        </button>

        <button
            class="layer-control-button"
            :class="{ 'is-active': whiteModelVisible }"
            type="button"
            :aria-pressed="whiteModelVisible"
            @click="emit('toggle-white-model')"
        >
            <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20V8l5-3v15M9 20V4l6-2v18M15 20V8l5 3v9M2 20h20" />
                <path d="M6.5 10h.01M6.5 13h.01M12 7h.01M12 11h.01M18 13h.01" />
            </svg>

            <span class="layer-control-copy">
                <strong>城市白膜</strong>
                <small>{{ whiteModelVisible ? '建筑模型已显示' : '建筑模型已隐藏' }}</small>
            </span>
        </button>

        <button
            class="layer-control-button"
            :class="{ 'is-active': realtimeVehicleRenderMode === 'auto' }"
            type="button"
            :aria-pressed="realtimeVehicleRenderMode === 'auto'"
            :disabled="historyModeEnabled"
            @click="emit('toggle-realtime-vehicle-render-mode')"
        >
            <svg class="layer-control-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 3 8 4-8 4-8-4 8-4Z" />
                <path d="m4 11 8 4 8-4M4 15l8 4 8-4" />
            </svg>

            <span class="layer-control-copy">
                <strong>车辆 LOD</strong>
                <small>{{ realtimeVehicleRenderMode === 'auto' ? '自动LOD' : '全部点' }}</small>
            </span>
        </button>
    </nav>
</template>

<style scoped>
.layer-controls {
    display: flex;
    width: 165px;
    flex: 0 0 165px;
    flex-direction: column;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid #dbe4f0;
    border-radius: 14px;
    box-shadow: 0 6px 22px rgba(28, 51, 86, 0.08);
}

.layer-control-button {
    position: relative;
    display: flex;
    width: 100%;
    min-height: 74px;
    align-items: center;
    gap: 13px;
    padding: 12px 16px;
    color: #53647c;
    background: transparent;
    border: 0;
    border-bottom: 1px solid #edf1f6;
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: color 160ms ease, background-color 160ms ease;
}

.layer-control-button:hover {
    color: #246fde;
    background: #f5f9ff;
}

.layer-control-button.is-active {
    color: #1670ed;
    background: #eef6ff;
}

.layer-control-button.is-active::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    content: "";
    background: #2478ed;
    border-radius: 0 4px 4px 0;
}

.layer-control-button:disabled {
    opacity: 0.48;
    cursor: not-allowed;
}

.layer-control-icon {
    width: 25px;
    height: 25px;
    flex: 0 0 25px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.layer-control-copy {
    min-width: 0;
}

.layer-control-copy strong,
.layer-control-copy small {
    display: block;
}

.layer-control-copy strong {
    font-size: 15px;
    line-height: 1.3;
}

.layer-control-copy small {
    margin-top: 4px;
    overflow: hidden;
    color: #93a0b2;
    font-size: 11px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@media (max-width: 960px) {
    .layer-control-copy small {
        display: none;
    }

    .layer-controls {
        width: 76px;
        flex-basis: 76px;
    }

    .layer-control-button {
        min-height: 70px;
        flex-direction: column;
        justify-content: center;
        gap: 5px;
        padding: 10px 6px;
        text-align: center;
    }

    .layer-control-copy strong {
        font-size: 12px;
    }
}

@media (max-width: 680px) {
    .layer-controls {
        position: fixed;
        z-index: 60;
        right: 6px;
        bottom: 6px;
        left: 6px;
        display: grid;
        width: auto;
        height: 60px;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        border-radius: 12px;
    }

    .layer-control-button {
        min-height: 0;
        height: 58px;
        border-right: 1px solid #edf1f6;
        border-bottom: 0;
    }

    .layer-control-button.is-active::before {
        inset: auto 8px 0;
        width: auto;
        height: 3px;
        border-radius: 3px 3px 0 0;
    }

    .layer-control-icon {
        width: 21px;
        height: 21px;
    }

    .layer-control-copy strong {
        font-size: 10px;
    }
}
</style>
