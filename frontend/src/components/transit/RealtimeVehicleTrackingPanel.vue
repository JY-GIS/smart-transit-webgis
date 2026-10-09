<script setup lang="ts">

defineProps<{
    vehicleId: string
    tracking: boolean
}>()

const emit = defineEmits<{
    'start-tracking': []
}>()

</script>

<template>
    <aside class="tracking-panel" @click.stop>
        <div class="tracking-panel__status">
            <span class="tracking-panel__indicator" :class="{ 'is-active': tracking }" aria-hidden="true"></span>

            <div>
                <strong>公交轨迹漫游</strong>

                <span>
                    {{ tracking ? `正在漫游 ${vehicleId}` : '跟随当前车辆实时运行' }}
                </span>
            </div>
        </div>

        <button v-if="!tracking" type="button" class="tracking-panel__button" @click="emit('start-tracking')">
            追踪此车辆
        </button>

        <span v-else class="tracking-panel__active-label">
            漫游中
        </span>
    </aside>
</template>

<style scoped>
.tracking-panel {
    position: absolute;
    z-index: 21;
    top: 116px;
    left: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 280px;
    max-width: calc(100% - 48px);
    min-height: 54px;
    padding: 10px 12px;
    color: #f4f8ff;
    background: rgba(13, 25, 42, 0.94);
    border: 1px solid rgba(255, 189, 89, 0.48);
    border-radius: 10px;
    box-sizing: border-box;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(12px);
}

.tracking-panel__status {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
}

.tracking-panel__status div {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.tracking-panel__status strong {
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
}

.tracking-panel__status span {
    margin-top: 2px;
    overflow: hidden;
    color: #9db0c4;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tracking-panel__indicator {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #7d8b96;
}

.tracking-panel__indicator.is-active {
    background: #22c55e;
    box-shadow: 0 0 9px rgba(34, 197, 94, 0.9);
}

.tracking-panel__button {
    flex: 0 0 auto;
    padding: 7px 10px;
    color: #172033;
    cursor: pointer;
    background: #ffbd59;
    border: 0;
    border-radius: 6px;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
}

.tracking-panel__button:hover {
    background: #ffd080;
}

.tracking-panel__active-label {
    flex: 0 0 auto;
    padding: 6px 10px;
    color: #86efac;
    font-size: 11px;
    font-weight: 700;
    background: rgba(34, 197, 94, 0.14);
    border: 1px solid rgba(34, 197, 94, 0.45);
    border-radius: 999px;
}
</style>