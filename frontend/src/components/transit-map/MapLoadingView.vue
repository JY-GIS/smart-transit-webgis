<script setup lang="ts">
import { computed } from 'vue'

type MapLoadingStatus =
    | 'initializing'
    | 'loading'
    | 'ready'
    | 'degraded'
    | 'error'

const props = defineProps<{
    status: MapLoadingStatus
    stage: string
    issues: string[]
}>()

const emit = defineEmits<{
    retry: []
    continue: []
}>()

const statusTitle = computed(() => {
    if (props.status === 'degraded') return '部分资源加载较慢'
    if (props.status === 'error') return '地图初始化失败'
    if (props.status === 'ready') return '地图准备完成'

    return '正在准备智慧公交地图'
})

const isLoading = computed(() => {
    return props.status === 'initializing' || props.status === 'loading'
})
</script>

<template>
    <section
        class="map-loading-panel"
        :class="`is-${status}`"
        role="status"
        aria-live="polite"
    >
        <div class="map-loading-panel__card">
            <div
                class="map-loading-panel__visual"
                :class="{ 'is-animated': isLoading }"
                aria-hidden="true"
            >
                <span class="map-loading-panel__orbit"></span>

                <span class="map-loading-panel__globe">
                    <span class="map-loading-panel__globe-line"></span>
                </span>

                <span class="map-loading-panel__bus">
                    <svg viewBox="0 0 24 24">
                        <rect
                            x="5"
                            y="3"
                            width="14"
                            height="16"
                            rx="3"
                        />
                        <path d="M7 8h10M8 19v2M16 19v2" />
                        <circle cx="8.5" cy="15.5" r="1" />
                        <circle cx="15.5" cy="15.5" r="1" />
                    </svg>
                </span>
            </div>

            <p class="map-loading-panel__location">
                FUTIAN · SHENZHEN
            </p>

            <h2>深圳市福田区智慧公交</h2>

            <p class="map-loading-panel__subtitle">
                Smart Transit WebGIS
            </p>

            <div class="map-loading-panel__status">
                <span
                    class="map-loading-panel__status-dot"
                    aria-hidden="true"
                ></span>

                <span class="map-loading-panel__status-copy">
                    <strong>{{ statusTitle }}</strong>
                    <small>{{ stage }}</small>
                </span>
            </div>

            <ul
                v-if="issues.length > 0"
                class="map-loading-panel__issues"
            >
                <li
                    v-for="issue in issues"
                    :key="issue"
                >
                    {{ issue }}
                </li>
            </ul>

            <div
                v-if="
                    status === 'degraded' ||
                    status === 'error'
                "
                class="map-loading-panel__actions"
            >
                <button
                    type="button"
                    class="map-loading-panel__button is-primary"
                    @click="emit('retry')"
                >
                    重新加载
                </button>

                <button
                    v-if="status === 'degraded'"
                    type="button"
                    class="map-loading-panel__button is-secondary"
                    @click="emit('continue')"
                >
                    降级进入
                </button>
            </div>
        </div>
    </section>
</template>

<style scoped>
.map-loading-panel {
    position: fixed;
    z-index: 1000;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    color: #17345c;
    background:
        radial-gradient(
            circle at 50% 35%,
            #ffffff 0%,
            #e8f3ff 55%,
            #d6e9fb 100%
        );
}

.map-loading-panel__card {
    width: min(440px, 100%);
    padding: 32px 36px;
    text-align: center;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(122, 170, 221, 0.38);
    border-radius: 22px;
    box-shadow:
        0 24px 70px rgba(29, 72, 125, 0.16),
        0 8px 24px rgba(29, 72, 125, 0.1);
}

.map-loading-panel__visual {
    position: relative;
    width: 112px;
    height: 112px;
    margin: 0 auto 18px;
}

.map-loading-panel__orbit {
    position: absolute;
    inset: 5px;
    border: 2px solid rgba(45, 130, 232, 0.16);
    border-top-color: #2d82e8;
    border-radius: 50%;
}

.map-loading-panel__visual.is-animated
.map-loading-panel__orbit {
    animation: map-loading-orbit 1.8s linear infinite;
}

.map-loading-panel__globe {
    position: absolute;
    inset: 17px;
    overflow: hidden;
    background:
        linear-gradient(
            145deg,
            #4aa6ef,
            #37c8d7
        );
    border: 5px solid rgba(255, 255, 255, 0.84);
    border-radius: 50%;
    box-shadow: 0 8px 24px rgba(34, 126, 205, 0.24);
}

.map-loading-panel__globe::before,
.map-loading-panel__globe::after,
.map-loading-panel__globe-line {
    position: absolute;
    content: '';
    border: 1px solid rgba(255, 255, 255, 0.62);
    border-radius: 50%;
}

.map-loading-panel__globe::before {
    inset: 8px 23px;
}

.map-loading-panel__globe::after {
    inset: 29px 4px;
}

.map-loading-panel__globe-line {
    top: 50%;
    right: 4px;
    left: 4px;
    border-radius: 0;
}

.map-loading-panel__bus {
    position: absolute;
    right: 2px;
    bottom: 5px;
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    color: #237ce5;
    background: #ffffff;
    border: 1px solid #d4e7fb;
    border-radius: 12px;
    box-shadow: 0 7px 18px rgba(25, 95, 168, 0.2);
}

.map-loading-panel__bus svg {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.map-loading-panel__location {
    margin: 0 0 8px;
    color: #2c7dde;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.22em;
}

.map-loading-panel h2 {
    margin: 0;
    color: #163154;
    font-size: clamp(22px, 3vw, 28px);
    line-height: 1.25;
}

.map-loading-panel__subtitle {
    margin: 7px 0 22px;
    color: #7890ad;
    font-size: 13px;
    letter-spacing: 0.12em;
}

.map-loading-panel__status {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 14px 16px;
    text-align: left;
    background: #edf6ff;
    border: 1px solid #d3e7fb;
    border-radius: 14px;
}

.map-loading-panel__status-dot {
    width: 10px;
    height: 10px;
    flex: 0 0 auto;
    background: #2d82e8;
    border-radius: 50%;
    box-shadow: 0 0 0 5px rgba(45, 130, 232, 0.12);
}

.is-loading .map-loading-panel__status-dot,
.is-initializing .map-loading-panel__status-dot {
    animation: map-loading-pulse 1.2s ease-in-out infinite;
}

.is-degraded .map-loading-panel__status-dot {
    background: #ed9a1d;
    box-shadow: 0 0 0 5px rgba(237, 154, 29, 0.14);
}

.is-error .map-loading-panel__status-dot {
    background: #e75252;
    box-shadow: 0 0 0 5px rgba(231, 82, 82, 0.14);
}

.map-loading-panel__status-copy {
    display: grid;
    gap: 3px;
}

.map-loading-panel__status-copy strong {
    color: #244568;
    font-size: 14px;
}

.map-loading-panel__status-copy small {
    color: #6f87a2;
    font-size: 12px;
}

.map-loading-panel__issues {
    display: grid;
    gap: 7px;
    margin: 14px 0 0;
    padding: 12px 14px 12px 30px;
    color: #946112;
    font-size: 12px;
    text-align: left;
    background: #fff8e9;
    border: 1px solid #f3dcae;
    border-radius: 12px;
}

.is-error .map-loading-panel__issues {
    color: #a84444;
    background: #fff1f1;
    border-color: #f0c8c8;
}

.map-loading-panel__actions {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 18px;
}

.map-loading-panel__button {
    min-width: 108px;
    padding: 10px 16px;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    border-radius: 10px;
    transition:
        transform 160ms ease,
        box-shadow 160ms ease,
        background 160ms ease;
}

.map-loading-panel__button:hover {
    transform: translateY(-1px);
}

.map-loading-panel__button.is-primary {
    color: #ffffff;
    background: #267ee5;
    border: 1px solid #267ee5;
    box-shadow: 0 7px 16px rgba(38, 126, 229, 0.22);
}

.map-loading-panel__button.is-secondary {
    color: #416184;
    background: #eef5fc;
    border: 1px solid #d8e6f4;
}

@keyframes map-loading-orbit {
    to {
        transform: rotate(360deg);
    }
}

@keyframes map-loading-pulse {
    50% {
        opacity: 0.5;
        transform: scale(0.75);
    }
}

@media (max-width: 600px) {
    .map-loading-panel {
        padding: 14px;
    }

    .map-loading-panel__card {
        padding: 26px 20px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .map-loading-panel__orbit,
    .map-loading-panel__status-dot {
        animation: none !important;
    }
}
</style>