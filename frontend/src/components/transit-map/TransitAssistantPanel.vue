<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { TRANSIT_CONFIG } from '@/config/transit.config'
import { useStopArrivals } from '@/composables/transit-network/useStopArrivals'
import type { NearbyBusStopRecord } from '@/types/busStop'
import type { PlaceSearchResult } from '@/types/placeSearch'
import type { RealtimeVehiclePositionSnapshot } from '@/types/realtimeVehicle'
import type { StopArrivalQuery } from '@/types/stopArrival'

const props = defineProps<{
    mapReady: boolean
    nearbyStops: NearbyBusStopRecord[]
    vehicles: RealtimeVehiclePositionSnapshot[]
}>()
const emit = defineEmits<{
    close: []
    select: [place: PlaceSearchResult]
    nearby: [place: PlaceSearchResult, radiusMeters: number]
    selectVehicle: [vehicleId: string]
}>()
type StopRouteOption = StopArrivalQuery & { routeName: string }
type ChatReply = {
    text: string
    places: PlaceSearchResult[]
    radiusMeters?: number
    routes?: StopRouteOption[]
    keywords?: string | null
    nextPage?: number | null
    loadingPlaces?: boolean
    placesError?: string
}
const draft = ref('')
const messages = ref<({ role: 'user'; text: string } | ({ role: 'assistant' } & ChatReply))[]>([])
const messageList = ref<HTMLElement | null>(null)
const sending = ref(false)
const error = ref('')
const selectedPlace = ref<PlaceSearchResult | null>(null)
const radiusMeters = TRANSIT_CONFIG.nearbyQuery.defaultRadiusMeters
const selectedRoute = ref<StopRouteOption | null>(null)
const { arrivalBoard, arrivalQueryStatus, arrivalErrorMessage, queryArrivals, cleanup } = useStopArrivals()
const firstArrival = computed(() => arrivalBoard.value?.arrivals[0])
const canLocateVehicle = computed(() =>
    props.mapReady && props.vehicles.some(vehicle => vehicle.vehicleId === firstArrival.value?.vehicleId),
)

onBeforeUnmount(cleanup)

async function showArrival(route: StopRouteOption) {
    selectedRoute.value = route
    await queryArrivals({ routeId: route.routeId, stopId: route.stopId, limit: 1 })
}

function selectPlace(place: PlaceSearchResult) {
    selectedPlace.value = place
    emit('select', place)
}

async function loadMorePlaces(message: ChatReply) {
    if (!message.keywords || !message.nextPage || message.loadingPlaces) return
    message.loadingPlaces = true
    message.placesError = ''

    try {
        const params = new URLSearchParams({ keywords: message.keywords, page: String(message.nextPage) })
        const response = await fetch(`/api/places/search/page?${params}`)
        if (!response.ok) throw new Error('地点查询失败，请重试。')
        const result = await response.json() as {
            code: number
            msg: string
            data: { places: PlaceSearchResult[]; nextPage: number | null }
        }
        if (result.code !== 1) throw new Error(result.msg)
        message.places.push(...result.data.places)
        message.nextPage = result.data.nextPage
    } catch (reason) {
        message.placesError = reason instanceof Error ? reason.message : '地点查询失败，请重试。'
    } finally {
        message.loadingPlaces = false
    }
}

async function scrollToLatest() {
    await nextTick()
    const list = messageList.value
    if (list) list.scrollTop = list.scrollHeight
}

async function sendMessage() {
    const message = draft.value.trim()
    if (!message || sending.value) return

    messages.value.push({ role: 'user', text: message })
    draft.value = ''
    selectedPlace.value = null
    sending.value = true
    error.value = ''
    void scrollToLatest()

    try {
        const response = await fetch('/api/assistant/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, stopIds: props.nearbyStops.map(stop => stop.stopId) }),
        })
        if (!response.ok) throw new Error('请求失败，请稍后重试。')
        const result = await response.json() as { code: number; msg: string; data: ChatReply }
        if (result.code !== 1) throw new Error(result.msg)
        messages.value.push({ role: 'assistant', ...result.data })
    } catch (reason) {
        error.value = reason instanceof Error ? reason.message : '请求失败，请稍后重试。'
        if (!draft.value) draft.value = message
    } finally {
        sending.value = false
        void scrollToLatest()
    }
}
</script>

<template>
    <aside id="transit-assistant" class="assistant-panel" aria-labelledby="transit-assistant-title">
        <header>
            <h2 id="transit-assistant-title">公交助手</h2>
            <button class="close-button" type="button" aria-label="关闭公交助手" @click="emit('close')">×</button>
        </header>

        <div ref="messageList" class="messages" role="log" aria-label="对话记录">
            <p v-if="!messages.length" class="empty-message">例如，查深圳市民中心附近 800 米的公交站。</p>
            <div v-for="(message, index) in messages" :key="index" :class="message.role + '-message'">
                {{ message.text }}
                <ul v-if="message.role === 'assistant' && message.places.length" class="place-list">
                    <li v-for="(place, placeIndex) in message.places" :key="placeIndex">
                        <button type="button" :disabled="!mapReady" :aria-pressed="selectedPlace === place"
                            @click="selectPlace(place)">
                            <strong>{{ place.name }}</strong>
                            <small>{{ place.district }} {{ place.address }}</small>
                        </button>
                        <button v-if="selectedPlace === place" class="nearby-button" type="button"
                            :disabled="!mapReady" @click="emit('nearby', place, message.radiusMeters ?? radiusMeters)">
                            查附近 {{ message.radiusMeters ?? radiusMeters }} 米公交站
                        </button>
                    </li>
                </ul>
                <template v-if="message.role === 'assistant' && message.nextPage">
                    <button class="more-places" type="button" :disabled="message.loadingPlaces"
                        aria-label="再加载 5 条地点" title="再加载 5 条地点" @click="loadMorePlaces(message)">
                        <span aria-hidden="true">{{ message.loadingPlaces ? '…' : '⬇️' }}</span>
                    </button>
                    <p v-if="message.placesError" class="error-message" role="alert">{{ message.placesError }}</p>
                </template>
                <ul v-if="message.role === 'assistant' && message.routes?.length" class="place-list">
                    <li v-for="route in message.routes" :key="route.routeId">
                        <button type="button" :aria-pressed="selectedRoute === route" @click="showArrival(route)">
                            <strong>{{ route.routeName }}</strong>
                            <small>查询到站时间</small>
                        </button>
                        <div v-if="selectedRoute === route" class="arrival-result" role="status">
                            <span v-if="arrivalQueryStatus === 'loading'">正在查询…</span>
                            <span v-else-if="arrivalQueryStatus === 'error'">{{ arrivalErrorMessage }}</span>
                            <span v-else-if="firstArrival?.etaSeconds === 0">车辆正在停靠。</span>
                            <span v-else-if="firstArrival">
                                下一辆车预计 {{ firstArrival.etaSeconds }} 秒后到站。
                            </span>
                            <span v-else>暂无到站预测。</span>
                        </div>
                        <button v-if="selectedRoute === route && firstArrival" class="nearby-button" type="button"
                            :disabled="!canLocateVehicle" @click="emit('selectVehicle', firstArrival.vehicleId)">
                            {{ canLocateVehicle ? '在地图上定位车辆' : '暂无车辆位置' }}
                        </button>
                    </li>
                </ul>
            </div>
            <p v-if="sending" class="empty-message" role="status">正在等待回复…</p>
            <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        </div>

        <form class="composer" @submit.prevent="sendMessage">
            <input v-model="draft" aria-label="公交问题" placeholder="输入公交问题" maxlength="500" />
            <button type="submit" :disabled="sending || !draft.trim()">发送</button>
        </form>
    </aside>
</template>

<style scoped>
.assistant-panel {
    position: absolute;
    z-index: 44;
    top: 76px;
    left: 16px;
    width: min(320px, calc(100% - 32px));
    height: min(320px, calc(100% - 92px));
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #dbe4f0;
    border-radius: 12px;
    box-shadow: 0 5px 20px #1c33561a;
    color: #24364f;
}

header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #edf1f6;
}

h2 { margin: 0; font-size: 16px; }
.close-button { border: 0; background: transparent; color: inherit; font-size: 22px; cursor: pointer; }

.messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 14px;
    font-size: 14px;
}

.empty-message { margin: 0; color: var(--transit-panel-muted); }

.error-message { margin: 0; color: var(--transit-panel-danger); }

.user-message, .assistant-message {
    width: fit-content;
    max-width: 85%;
    margin: 0 0 8px auto;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--transit-panel-primary-soft);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}

.assistant-message {
    margin-left: 0;
    background: var(--transit-panel-soft);
}

.place-list {
    display: grid;
    gap: 6px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
}

.place-list button {
    display: grid;
    width: 100%;
    gap: 4px;
    padding: 8px;
    border: 1px solid #dbe4f0;
    border-radius: 8px;
    background: #fff;
    color: inherit;
    text-align: left;
    cursor: pointer;
}

.place-list button:disabled { opacity: 0.5; cursor: default; }
.place-list button[aria-pressed="true"] { border-color: var(--transit-panel-primary); }
.place-list .nearby-button {
    margin-top: 4px;
    color: var(--transit-panel-primary);
    background: var(--transit-panel-primary-soft);
}
.place-list small { color: var(--transit-panel-muted); }
.more-places {
    display: block;
    margin: 6px auto 0;
    width: 40px;
    height: 30px;
    border: 1px solid #dbe4f0;
    border-radius: 8px;
    background: #fff;
    color: var(--transit-panel-primary);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
}
.more-places:disabled { opacity: 0.5; cursor: default; }
.arrival-result { margin: 4px 0; color: var(--transit-panel-muted); font-size: 13px; }

.composer {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid #edf1f6;
}

.composer input, .composer button {
    padding: 7px 10px;
    border: 1px solid #dbe4f0;
    border-radius: 8px;
    font: inherit;
}

.composer input { min-width: 0; flex: 1; }
.composer button { background: var(--transit-panel-primary); color: #fff; cursor: pointer; }
.composer button:disabled { opacity: 0.5; cursor: default; }
</style>
