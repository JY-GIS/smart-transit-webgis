<script setup lang="ts">
import type { BusRouteProperties } from '@/types/busRoute'

// 纯展示组件：只接收当前线路属性，通过 close 事件通知父组件清除选择状态。
defineProps<{
    route: BusRouteProperties | null
}>()

const emit = defineEmits<{
    close: []
}>()
</script>

<template>
    <!-- route 为空时不渲染面板，避免遮挡地图；切换线路时复用同一面板。 -->
    <transition name="route-panel">
        <aside
            v-if="route"
            class="route-panel"
            @click.stop
        >
            <div class="route-panel__header">
                <span class="route-panel__label">公交线路</span>

                <button
                    type="button"
                    class="route-panel__close"
                    aria-label="关闭线路信息"
                    @click="emit('close')"
                >
                    ×
                </button>
            </div>

            <h2 class="route-panel__title">
                {{ route.rname }}
            </h2>

            <div class="route-panel__body">
                <div class="route-panel__field">
                    <span>线路编号</span>
                    <strong>{{ route.fid }}</strong>
                </div>

                <div class="route-panel__field">
                    <span>起点</span>
                    <strong>{{ route.fsname }}</strong>
                </div>

                <div class="route-panel__field">
                    <span>终点</span>
                    <strong>{{ route.lsname }}</strong>
                </div>

                <div class="route-panel__field">
                    <span>城市</span>
                    <strong>{{ route.city }}</strong>
                </div>

                <div class="route-panel__field">
                    <span>省份</span>
                    <strong>{{ route.province }}</strong>
                </div>
            </div>
        </aside>
    </transition>
</template>

<style scoped>
.route-panel {
    position: absolute;
    top: 180px;
    left: 24px;
    right: auto;
    z-index: 20;
    width: 260px;
    max-width: calc(100% - 48px);
    overflow: hidden;
    color: #f4f8ff;
    background: rgba(13, 25, 42, 0.94);
    border: 1px solid rgba(108, 214, 255, 0.45);
    border-radius: 12px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.38);
    backdrop-filter: blur(12px);
}

.route-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.route-panel__label {
    color: #72d8ff;
    font-size: 13px;
    letter-spacing: 0.08em;
}

.route-panel__close {
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

.route-panel__close:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
}

.route-panel__title {
    margin: 0;
    padding: 16px;
    color: #ffffff;
    font-size: 20px;
    line-height: 1.45;
    overflow-wrap: anywhere;
}

.route-panel__body {
    padding: 0 16px 16px;
}

.route-panel__field {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 14px;
    line-height: 1.5;
}

.route-panel__field span {
    color: #9db0c4;
}

.route-panel__field strong {
    color: #f5fbff;
    font-weight: 500;
    overflow-wrap: anywhere;
}

.route-panel-enter-active,
.route-panel-leave-active {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.route-panel-enter-from,
.route-panel-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}
</style>
