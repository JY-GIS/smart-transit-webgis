<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import { REALTIME_VEHICLE_STATUS_STYLES } from '@/config/realtimeVehicleStatus.config'
import type {
    RouteTrajectoryQuery,
    RouteTrajectoryReplay,
    TrajectoryReplayMode,
    VehicleHistoryAvailability,
    VehicleHistoryQueryStatus,
    VehicleHistoryRouteAvailability,
    VehicleTrajectory,
    VehicleTrajectoryQuery,
} from '@/types/vehicleTrajectory'

const props = defineProps<{
    mode: TrajectoryReplayMode
    vehicles: VehicleHistoryAvailability[]
    routes: VehicleHistoryRouteAvailability[]

    availabilityStatus: VehicleHistoryQueryStatus
    availabilityErrorMessage: string | null

    trajectory: VehicleTrajectory | null
    trajectoryStatus: VehicleHistoryQueryStatus
    trajectoryErrorMessage: string | null

    routeReplay: RouteTrajectoryReplay | null
    routeReplayStatus: VehicleHistoryQueryStatus
    routeReplayErrorMessage: string | null

    trajectoryLoaded: boolean
    isPlaying: boolean
    playbackSpeed: number
    cameraTrackingEnabled: boolean
    trackedRouteVehicleId: string | null
}>()

const emit = defineEmits<{
    close: []
    'change-mode': [mode: TrajectoryReplayMode]
    'query-vehicle': [query: VehicleTrajectoryQuery]
    'query-route': [query: RouteTrajectoryQuery]
    'retry-availability': []
    'clear-trajectory': []

    play: []
    pause: []
    reset: []

    'change-speed': [speed: number]
    'change-camera-tracking': [enabled: boolean]
    'change-route-tracking': [vehicleId: string | null]
}>()

const selectedVehicleId = ref('')
const selectedRouteId = ref('')

const startTimeText = ref('')
const endTimeText = ref('')

const formErrorMessage = ref<string | null>(null)

const activePresetMinutes =
    ref<number | null>(TRANSIT_CONFIG.vehicleHistory.defaultQueryRangeMinutes)

const presetMinutes = [5, 15, 30] as const

const selectedVehicle = computed(() => {
    return props.vehicles.find((vehicle) => vehicle.vehicleId === selectedVehicleId.value) ?? null
})

const selectedRoute =
    computed(
        (): VehicleHistoryRouteAvailability | null => {
            return (
                props.routes.find(
                    (route) => route.routeId === selectedRouteId.value,
                ) ?? null
            )
        },
    )

const selectedAvailability = computed(() => {
    return props.mode === 'vehicle' ? selectedVehicle.value : selectedRoute.value
})

const activeQueryStatus = computed(() => {
    return props.mode === 'vehicle' ? props.trajectoryStatus : props.routeReplayStatus
})

const activeErrorMessage = computed(() => {
    return props.mode === 'vehicle' ? props.trajectoryErrorMessage : props.routeReplayErrorMessage
})

const minimumTimeText = computed(() => {
    const availability = selectedAvailability.value

    if (!availability) {
        return ''
    }

    return formatDateTimeLocal(new Date(availability.firstRecordedAt))
})

const maximumTimeText = computed(() => {
    const availability = selectedAvailability.value

    if (!availability) {
        return ''
    }

    return formatDateTimeLocal(new Date(availability.lastRecordedAt))
})

const queryButtonDisabled = computed(() => {
    return (
        props.availabilityStatus !== 'success' ||
        activeQueryStatus.value === 'loading' ||
        selectedAvailability.value === null
    )
})

// 把数字补成两位。 例如：9 → 09
function padTwoDigits(value: number): string {
    return String(value).padStart(2, '0')
}

/**
 * 将Date转换成datetime-local输入框需要的本地时间格式。
 *
 * datetime-local：它显示用户所在地区的本地时间，但文本中不包含时区。
 *
 * 这里不能直接使用toISOString，因为toISOString返回UTC时间，显示到输入框后会少8小时。
 */
function formatDateTimeLocal(date: Date): string {
    if (!Number.isFinite(date.getTime())) {
        return ''
    }

    return (
        `${date.getFullYear()}-` +
        `${padTwoDigits(date.getMonth() + 1)}-` +
        `${padTwoDigits(date.getDate())}T` +
        `${padTwoDigits(date.getHours())}:` +
        `${padTwoDigits(date.getMinutes())}:` +
        `${padTwoDigits(date.getSeconds())}`
    )
}

// 将datetime-local文本转换成Date
function parseLocalDateTime(value: string,): Date | null {
    if (!value) {
        return null
    }

    const date = new Date(value)

    if (!Number.isFinite(date.getTime())) {
        return null
    }

    return date
}

function formatDisplayTime(value: string): string {
    const date = new Date(value)

    if (!Number.isFinite(date.getTime())) {
        return '时间未知'
    }

    return new Intl.DateTimeFormat(
        'zh-CN',
        {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        },
    ).format(date)
}

function formatTrajectoryDuration(startTimeText: string, endTimeText: string): string {
    const startTime = Date.parse(startTimeText)
    const endTime = Date.parse(endTimeText)

    const durationSeconds = Math.max(0, Math.round((endTime - startTime) / 1000))

    if (durationSeconds < 60) {
        return `${durationSeconds}秒`
    }

    const minutes = Math.floor(durationSeconds / 60)

    const seconds = durationSeconds % 60

    return `${minutes}分${seconds}秒`
}

function formatSpeed(metersPerSecond: number): string {
    return `${(metersPerSecond * 3.6).toFixed(1)} km/h`
}

// 使用当前选择项的最后一条历史记录作为结束时间。
function applyPreset(minutes: number) {
    const availability = selectedAvailability.value

    if (!availability) {
        return
    }

    const firstRecordedAt = new Date(availability.firstRecordedAt)
    const lastRecordedAt = new Date(availability.lastRecordedAt)

    if (!Number.isFinite(firstRecordedAt.getTime()) || !Number.isFinite(lastRecordedAt.getTime())) {
        formErrorMessage.value = '历史时间范围无效'

        return
    }

    const desiredStartMilliseconds = lastRecordedAt.getTime() - minutes * 60 * 1000

    const actualStartMilliseconds =
        Math.max(
            firstRecordedAt.getTime(),
            desiredStartMilliseconds,
        )

    startTimeText.value = formatDateTimeLocal(new Date(actualStartMilliseconds))

    endTimeText.value = formatDateTimeLocal(lastRecordedAt)

    activePresetMinutes.value = minutes
    formErrorMessage.value = null
}

function handleCustomTimeInput() {
    activePresetMinutes.value = null
    formErrorMessage.value = null
}

/**
 * 校验当前模式的选择项和时间范围，然后通知父组件查询。
 */
function handleSubmit() {
    const availability = selectedAvailability.value

    if (!availability) {
        formErrorMessage.value = props.mode === 'vehicle' ? '请选择需要回放的车辆' : '请选择需要回放的线路'
        return
    }

    const startTime = parseLocalDateTime(startTimeText.value)

    const endTime = parseLocalDateTime(endTimeText.value)

    if (!startTime || !endTime) {
        formErrorMessage.value = '请选择有效的开始和结束时间'
        return
    }

    if (endTime.getTime() <= startTime.getTime()) {
        formErrorMessage.value = '结束时间必须晚于开始时间'
        return
    }

    const firstRecordedAt = new Date(availability.firstRecordedAt)
    const lastRecordedAt = new Date(availability.lastRecordedAt)

    if (
        startTime.getTime() < firstRecordedAt.getTime() ||
        endTime.getTime() > lastRecordedAt.getTime()
    ) {
        formErrorMessage.value = props.mode === 'vehicle'
            ? '查询时间必须位于车辆已有历史数据范围内'
            : '查询时间必须位于全部车辆的共同历史范围内'
        return
    }

    const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60_000

    if (durationMinutes > TRANSIT_CONFIG.vehicleHistory.maximumQueryRangeMinutes) {
        formErrorMessage.value =
            `查询时间不能超过` + `${TRANSIT_CONFIG.vehicleHistory.maximumQueryRangeMinutes}分钟`
        return
    }

    formErrorMessage.value = null

    if (props.mode === 'vehicle' && selectedVehicle.value) {
        emit('query-vehicle', {
            vehicleId: selectedVehicle.value.vehicleId,
            startTime,
            endTime,
        })
    } else if (props.mode === 'route' && selectedRoute.value) {
        emit('query-route', {
            routeId: selectedRoute.value.routeId,
            startTime,
            endTime,
        })
    }
}

/**
 * 根据当前播放状态发送播放或暂停事件。
 */
function handlePlayPause() {
    if (props.isPlaying) {
        emit('pause')
        return
    }

    emit('play')
}

function handleCameraTrackingChange(event: Event) {
    if (event.target instanceof HTMLInputElement) {
        emit('change-camera-tracking', event.target.checked)
    }
}

function handleRouteTrackingChange(event: Event) {
    if (event.target instanceof HTMLSelectElement) {
        emit('change-route-tracking', event.target.value || null)
    }
}

// 可回放车辆加载后自动选择第一辆车。
watch(
    () => props.vehicles,
    (vehicles) => {
        if (vehicles.length === 0) {
            selectedVehicleId.value = ''
            return
        }

        if (!vehicles.some((vehicle) => vehicle.vehicleId === selectedVehicleId.value)) {
            selectedVehicleId.value = vehicles[0].vehicleId
            return
        }

        if (props.mode === 'vehicle') {
            applyPreset(TRANSIT_CONFIG.vehicleHistory.defaultQueryRangeMinutes)
        }
    },
    { immediate: true },
)

// 可回放线路加载后自动选择第一条线路。
watch(
    () => props.routes,
    (routes) => {
        if (routes.length === 0) {
            selectedRouteId.value = ''
            return
        }

        const selectedRouteStillExists =
            routes.some(
                (route) => route.routeId === selectedRouteId.value
            )

        if (!selectedRouteStillExists) {
            selectedRouteId.value = routes[0].routeId
            return
        }

        if (props.mode === 'route') {
            applyPreset(TRANSIT_CONFIG.vehicleHistory.defaultQueryRangeMinutes)
        }
    },
    {
        immediate: true,
    },
)

// 切换回放模式或查询对象后重置默认时间。
watch(
    [() => props.mode, selectedVehicleId, selectedRouteId],
    ([currentMode, currentVehicleId, currentRouteId], previousSelection) => {
        const currentId = currentMode === 'vehicle' ? currentVehicleId : currentRouteId

        if (!currentId) {
            startTimeText.value = ''
            endTimeText.value = ''
            return
        }

        applyPreset(TRANSIT_CONFIG.vehicleHistory.defaultQueryRangeMinutes)

        if (previousSelection) {
            emit('clear-trajectory')
        }
    },
)
</script>

<template>
    <transition name="trajectory-panel">
        <aside
            class="trajectory-panel"
            @click.stop
        >
            <header class="trajectory-panel__header">
                <div>
                    <span class="trajectory-panel__label">
                        时空轨迹
                    </span>

                    <h2 class="trajectory-panel__title">
                        历史轨迹回放
                    </h2>
                </div>

                <button
                    type="button"
                    class="trajectory-panel__close"
                    aria-label="关闭历史轨迹面板"
                    @click="emit('close')"
                >
                    ×
                </button>
            </header>

            <div class="trajectory-panel__mode-switch" aria-label="历史轨迹查询模式">
                <button
                    type="button"
                    :class="{ 'is-active': props.mode === 'vehicle' }"
                    @click="emit('change-mode', 'vehicle')"
                >
                    单车回放
                </button>

                <button
                    type="button"
                    :class="{ 'is-active': props.mode === 'route' }"
                    @click="emit('change-mode', 'route')"
                >
                    线路多车
                </button>
            </div>

            <div
                v-if="props.availabilityStatus === 'loading'"
                class="trajectory-panel__message"
            >
                正在加载可回放车辆……
            </div>

            <div
                v-else-if="props.availabilityStatus === 'error'"
                class="trajectory-panel__message trajectory-panel__message--error"
            >
                <span>
                    {{
                        props.availabilityErrorMessage ??
                        '可回放车辆加载失败'
                    }}
                </span>

                <button
                    type="button"
                    class="trajectory-panel__retry"
                    @click="emit('retry-availability')"
                >
                    重新加载
                </button>
            </div>

            <div
                v-else-if="props.availabilityStatus === 'empty'"
                class="trajectory-panel__message"
            >
                当前还没有可以回放的历史数据
            </div>

            <form
                v-else-if="props.availabilityStatus === 'success'"
                class="trajectory-panel__form"
                @submit.prevent="handleSubmit"
            >
                <label v-if="props.mode === 'vehicle'" class="trajectory-panel__field">
                    <span class="trajectory-panel__field-label">
                        回放车辆
                    </span>

                    <select v-model="selectedVehicleId" class="trajectory-panel__control">
                        <option v-for="vehicle in props.vehicles" :key="vehicle.vehicleId" :value="vehicle.vehicleId">
                            {{ vehicle.vehicleId }} · {{ vehicle.routeName }}
                        </option>
                    </select>
                </label>

                <label v-else class="trajectory-panel__field">
                    <span class="trajectory-panel__field-label">
                        回放线路
                    </span>

                    <select v-model="selectedRouteId" class="trajectory-panel__control">
                        <option v-for="route in props.routes" :key="route.routeId" :value="route.routeId">
                            {{ route.routeName }} · {{ route.vehicleCount }}辆车
                        </option>
                    </select>
                </label>

                <div v-if="selectedAvailability" class="trajectory-panel__availability">
                    <span>
                        {{ props.mode === 'vehicle' ? '可用范围' : '全部车辆共同可用范围' }}
                    </span>

                    <strong>
                        {{ formatDisplayTime(selectedAvailability.firstRecordedAt) }}
                        —
                        {{ formatDisplayTime(selectedAvailability.lastRecordedAt) }}
                    </strong>

                    <small v-if="props.mode === 'vehicle'">
                        共 {{ selectedAvailability.pointCount }} 个历史点
                    </small>

                    <small v-else-if="selectedRoute">
                        {{ selectedRoute.vehicleCount }} 辆车，共 {{ selectedRoute.pointCount }} 个历史点
                    </small>
                </div>

                <fieldset class="trajectory-panel__presets">
                    <legend>
                        快捷时间范围
                    </legend>

                    <button
                        v-for="minutes in presetMinutes"
                        :key="minutes"
                        type="button"
                        class="trajectory-panel__preset"
                        :class="{
                            'is-active':
                                activePresetMinutes === minutes,
                        }"
                        @click="applyPreset(minutes)"
                    >
                        最近{{ minutes }}分钟
                    </button>
                </fieldset>

                <div class="trajectory-panel__time-grid">
                    <label class="trajectory-panel__field">
                        <span class="trajectory-panel__field-label">
                            开始时间
                        </span>

                        <input
                            v-model="startTimeText"
                            type="datetime-local"
                            step="1"
                            :min="minimumTimeText"
                            :max="maximumTimeText"
                            class="trajectory-panel__control"
                            @input="handleCustomTimeInput"
                        >
                    </label>

                    <label class="trajectory-panel__field">
                        <span class="trajectory-panel__field-label">
                            结束时间
                        </span>

                        <input
                            v-model="endTimeText"
                            type="datetime-local"
                            step="1"
                            :min="minimumTimeText"
                            :max="maximumTimeText"
                            class="trajectory-panel__control"
                            @input="handleCustomTimeInput"
                        >
                    </label>
                </div>

                <div
                    v-if="formErrorMessage"
                    class="trajectory-panel__error"
                >
                    {{ formErrorMessage }}
                </div>

                <div v-if="activeQueryStatus === 'error'" class="trajectory-panel__error">
                    {{ activeErrorMessage ?? '历史轨迹查询失败' }}
                </div>

                <button
                    type="submit"
                    class="trajectory-panel__submit"
                    :disabled="queryButtonDisabled"
                >
                    {{
                        activeQueryStatus === 'loading'
                            ? '正在查询……'
                            : '查询并加载轨迹'
                    }}
                </button>
            </form>

            <section
                v-if="props.mode === 'vehicle' && props.trajectoryStatus === 'success' && props.trajectory"
                class="trajectory-panel__summary"
            >
                <h3>
                    单车回放统计
                </h3>

                <dl class="trajectory-panel__metrics">
                    <div>
                        <dt>轨迹点</dt>

                        <dd>{{ props.trajectory.pointCount }}</dd>
                    </div>

                    <div>
                        <dt>回放时长</dt>

                        <dd>{{ formatTrajectoryDuration(props.trajectory.startTime, props.trajectory.endTime) }}</dd>
                    </div>

                    <div>
                        <dt>平均速度</dt>

                        <dd>{{ formatSpeed(props.trajectory.averageSpeedMetersPerSecond) }}</dd>
                    </div>

                    <div>
                        <dt>最高速度</dt>

                        <dd>{{ formatSpeed(props.trajectory.maximumSpeedMetersPerSecond) }}</dd>
                    </div>
                </dl>
            </section>

            <section
                v-if="props.mode === 'route' && props.routeReplayStatus === 'success' && props.routeReplay"
                class="trajectory-panel__summary"
            >
                <h3>
                    线路回放统计
                </h3>

                <dl class="trajectory-panel__metrics">
                    <div>
                        <dt>车辆数量</dt>

                        <dd>
                            {{ props.routeReplay.vehicleCount }}
                        </dd>
                    </div>

                    <div>
                        <dt>轨迹点</dt>

                        <dd>
                            {{ props.routeReplay.totalPointCount }}
                        </dd>
                    </div>

                    <div>
                        <dt>共同时间</dt>

                        <dd>
                            {{ formatTrajectoryDuration(props.routeReplay.startTime, props.routeReplay.endTime) }}
                        </dd>
                    </div>

                    <div>
                        <dt>数据不足</dt>

                        <dd>
                            {{ props.routeReplay.unavailableVehicleIds.length }}
                        </dd>
                    </div>
                </dl>

                <div v-if="props.routeReplay.unavailableVehicleIds.length > 0" class="trajectory-panel__error">
                    以下车辆在当前时间范围内数据不足：
                    {{ props.routeReplay.unavailableVehicleIds.join('、') }}
                </div>
            </section>

            <section v-if="props.trajectoryLoaded" class="trajectory-panel__summary">
                <div class="trajectory-panel__status-legend" aria-label="车辆运行状态图例">
                    <span v-for="(style, status) in REALTIME_VEHICLE_STATUS_STYLES" :key="status" class="trajectory-panel__status-item">
                        <i class="trajectory-panel__status-dot" :style="{ backgroundColor: style.color }" aria-hidden="true"></i>

                        {{ style.label }}
                    </span>
                </div>

                <div class="trajectory-panel__playback">
                    <div class="trajectory-panel__playback-buttons">
                        <button type="button" class="trajectory-panel__play-button" @click="handlePlayPause">
                            {{ props.isPlaying ? '暂停' : '播放' }}
                        </button>

                        <button type="button" class="trajectory-panel__secondary-button" @click="emit('reset')">
                            回到起点
                        </button>
                    </div>

                    <fieldset class="trajectory-panel__speed-controls">
                        <legend>
                            播放倍速
                        </legend>

                        <button
                            v-for="speed in TRANSIT_CONFIG.vehicleHistory.playbackSpeeds"
                            :key="speed"
                            type="button"
                            class="trajectory-panel__speed-button"
                            :class="{'is-active': props.playbackSpeed === speed}"
                            @click="emit('change-speed', speed)"
                        >
                            {{ speed }}×
                        </button>
                    </fieldset>

                    <label v-if="props.mode === 'vehicle'" class="trajectory-panel__tracking">
                        <input
                            type="checkbox"
                            :checked="props.cameraTrackingEnabled"
                            @change="handleCameraTrackingChange"
                        >

                        镜头跟随车辆
                    </label>

                    <label v-else class="trajectory-panel__field">
                        <span class="trajectory-panel__field-label">
                            镜头跟随
                        </span>

                        <select
                            :value="props.trackedRouteVehicleId ?? ''"
                            class="trajectory-panel__control"
                            @change="handleRouteTrackingChange"
                        >
                            <option value="">全局视角</option>
                            <option
                                v-for="trajectory in props.routeReplay?.trajectories ?? []"
                                :key="trajectory.vehicleId"
                                :value="trajectory.vehicleId"
                            >
                                {{ trajectory.vehicleId }}
                            </option>
                        </select>
                    </label>

                    <p class="trajectory-panel__timeline-tip">
                        可拖动地图底部时间轴，{{ props.mode === 'vehicle' ? '车辆' : '线路内车辆' }}会同步跳转到对应时刻
                    </p>
                </div>
            </section>
        </aside>
    </transition>
</template>

<style scoped>
.trajectory-panel {
    position: absolute;
    top: 70px;
    left: 24px;
    z-index: 30;
    width: 380px;
    max-width: calc(100% - 48px);
    max-height: calc(100% - 250px);
    overflow-y: auto;
    color: #f4f8ff;
    background: rgba(13, 25, 42, 0.96);
    border: 1px solid rgba(81, 214, 255, 0.58);
    border-radius: 12px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(12px);
}

.trajectory-panel__header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 14px 16px 10px;
    background: rgba(13, 25, 42, 0.98);
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.trajectory-panel__label {
    color: #72d8ff;
    font-size: 13px;
    letter-spacing: 0.08em;
}

.trajectory-panel__title {
    margin: 5px 0 0;
    color: #ffffff;
    font-size: 18px;
}

.trajectory-panel__close {
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

.trajectory-panel__close:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
}

.trajectory-panel__mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 12px 16px 0;
}

.trajectory-panel__mode-switch button {
    padding: 8px 10px;
    color: #a9bdcc;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
}

.trajectory-panel__mode-switch button.is-active {
    color: #ffffff;
    background: rgba(81, 214, 255, 0.2);
    border-color: #51d6ff;
}

.trajectory-panel__message {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    color: #bcd0df;
    font-size: 14px;
}

.trajectory-panel__message--error,
.trajectory-panel__error {
    color: #ffaaa0;
}

.trajectory-panel__retry {
    align-self: flex-start;
    padding: 7px 12px;
    color: #e8f8ff;
    cursor: pointer;
    background: rgba(81, 214, 255, 0.14);
    border: 1px solid rgba(81, 214, 255, 0.5);
    border-radius: 6px;
}

.trajectory-panel__form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
}

.trajectory-panel__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.trajectory-panel__field-label,
.trajectory-panel__presets legend {
    color: #bcd0df;
    font-size: 13px;
}

.trajectory-panel__control {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 10px;
    color: #f4f8ff;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    font: inherit;
}

.trajectory-panel__control:focus {
    border-color: #51d6ff;
    outline: none;
}

.trajectory-panel__availability {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    color: #bcd0df;
    background: rgba(81, 214, 255, 0.08);
    border-radius: 7px;
    font-size: 12px;
}

.trajectory-panel__availability strong {
    color: #ffffff;
    font-weight: 500;
}

.trajectory-panel__presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
}

.trajectory-panel__presets legend {
    width: 100%;
    margin-bottom: 6px;
}

.trajectory-panel__preset {
    padding: 7px 10px;
    color: #c7d7e4;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 6px;
}

.trajectory-panel__preset.is-active {
    color: #ffffff;
    background: rgba(81, 214, 255, 0.2);
    border-color: #51d6ff;
}

.trajectory-panel__time-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
}

.trajectory-panel__error {
    font-size: 13px;
    line-height: 1.5;
}

.trajectory-panel__submit {
    padding: 10px 14px;
    color: #052235;
    font-weight: 600;
    cursor: pointer;
    background: #51d6ff;
    border: 0;
    border-radius: 7px;
}

.trajectory-panel__submit:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.trajectory-panel__summary {
    padding: 0 16px 16px;
}

.trajectory-panel__summary h3 {
    margin: 0 0 10px;
    color: #ffffff;
    font-size: 15px;
}

.trajectory-panel__metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0;
}

.trajectory-panel__metrics div {
    padding: 9px 10px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 7px;
}

.trajectory-panel__metrics dt {
    color: #94aabd;
    font-size: 12px;
}

.trajectory-panel__metrics dd {
    margin: 4px 0 0;
    color: #ffffff;
    font-size: 14px;
}

.trajectory-panel__status-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin-top: 12px;
    color: #c5d6e3;
    font-size: 12px;
}

.trajectory-panel__status-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.trajectory-panel__status-dot {
    width: 9px;
    height: 9px;
    border: 2px solid rgba(255, 255, 255, 0.82);
    border-radius: 50%;
}

.trajectory-panel-enter-active,
.trajectory-panel-leave-active {
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.trajectory-panel-enter-from,
.trajectory-panel-leave-to {
    opacity: 0;
    transform: translateX(-10px);
}

.trajectory-panel__playback {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.trajectory-panel__playback-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.trajectory-panel__play-button,
.trajectory-panel__secondary-button,
.trajectory-panel__speed-button {
    padding: 8px 10px;
    color: #eaf8ff;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
}

.trajectory-panel__play-button {
    color: #052235;
    font-weight: 600;
    background: #51d6ff;
    border-color: #51d6ff;
}

.trajectory-panel__speed-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 0;
    padding: 0;
    border: 0;
}

.trajectory-panel__speed-controls legend {
    width: 100%;
    margin-bottom: 5px;
    color: #94aabd;
    font-size: 12px;
}

.trajectory-panel__speed-button.is-active {
    color: #ffffff;
    background: rgba(81, 214, 255, 0.2);
    border-color: #51d6ff;
}

.trajectory-panel__tracking {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #c5d6e3;
    font-size: 13px;
    cursor: pointer;
}

.trajectory-panel__tracking input {
    accent-color: #51d6ff;
}

.trajectory-panel__timeline-tip {
    margin: 0;
    color: #8198aa;
    font-size: 12px;
    line-height: 1.5;
}

@media (max-width: 640px) {
    .trajectory-panel {
        top: 210px;
        right: 12px;
        left: 12px;
        width: auto;
        max-width: none;
        max-height: calc(100% - 270px);
    }
}
</style>
