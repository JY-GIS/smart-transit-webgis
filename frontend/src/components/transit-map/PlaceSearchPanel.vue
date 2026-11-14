<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { usePlaceSearch } from '@/composables/map/usePlaceSearch'
import { hasPlaceCoordinates, type PlaceSearchResult } from '@/types/placeSearch'

const props = defineProps<{ mapReady: boolean }>()
const emit = defineEmits<{
    select: [place: PlaceSearchResult]
    nearby: [place: PlaceSearchResult, radiusMeters: number]
    clear: []
}>()
const { keywords, results, status, error, search, suggest, reset } = usePlaceSearch()
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const expanded = ref(false)
const selected = ref<PlaceSearchResult | null>(null)
const radius = ref(500)
const activeIndex = ref(-1)
const composing = ref(false)

function handleInput(event: Event) {
    keywords.value = (event.target as HTMLInputElement).value
    if (selected.value) {
        selected.value = null
        emit('clear')
    }
    activeIndex.value = -1
    expanded.value = true
    if (composing.value) reset()
    else suggest()
}

function submit() {
    if (composing.value) return
    expanded.value = true
    activeIndex.value = -1
    void search()
}

function choose(place: PlaceSearchResult) {
    if (!props.mapReady) return
    if (!hasPlaceCoordinates(place)) {
        if (selected.value) {
            selected.value = null
            emit('clear')
        }
        keywords.value = place.name
        submit()
        return
    }
    reset()
    keywords.value = place.name
    selected.value = place
    expanded.value = false
    activeIndex.value = -1
    emit('select', place)
}

function clear() {
    reset()
    keywords.value = ''
    selected.value = null
    expanded.value = false
    activeIndex.value = -1
    emit('clear')
    input.value?.focus()
}

function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing || composing.value) return
    if (event.key === 'Escape') {
        expanded.value = false
        return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        expanded.value = true
        if (results.value.length) {
            const count = results.value.length
            activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : count - 1) + count) % count
            root.value?.querySelector(`#place-option-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' })
        }
    } else if (event.key === 'Enter' && expanded.value && activeIndex.value >= 0) {
        event.preventDefault()
        const place = results.value[activeIndex.value]
        if (place) choose(place)
    }
}

function onOutsideClick(event: PointerEvent) {
    if (event.target instanceof Node && !root.value?.contains(event.target)) expanded.value = false
}
onMounted(() => document.addEventListener('pointerdown', onOutsideClick))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsideClick))
</script>

<template>
    <section ref="root" class="place-search" aria-label="地点搜索" @click.stop @pointerdown.stop>
        <form class="place-search__form" @submit.prevent="submit">
            <span class="place-search__city">福田区</span>
            <input
                id="place-search-input" ref="input" :value="keywords"
                role="combobox" aria-label="搜索地点或地址" autocomplete="off" maxlength="80"
                aria-autocomplete="list" aria-controls="place-search-results"
                :aria-expanded="expanded" :aria-activedescendant="activeIndex >= 0 ? `place-option-${activeIndex}` : undefined"
                placeholder="搜索地点或地址，如市民中心"
                @input="handleInput" @focus="expanded = true" @keydown="handleKeydown"
                @compositionstart="composing = true; reset()"
                @compositionend="composing = false; handleInput($event)"
            />
            <button v-if="keywords" class="place-search__clear" type="button" aria-label="清除地点搜索" @click="clear">×</button>
            <button class="place-search__submit" type="submit" aria-label="搜索地点" :disabled="!keywords.trim()">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            </button>
        </form>

        <div v-if="expanded && keywords.trim()" class="place-search__dropdown">
            <div class="place-search__caption">地点搜索 · 福田区</div>
            <div v-if="status === 'loading'" class="place-search__message" role="status">正在查找地点…</div>
            <div v-else-if="status === 'error'" class="place-search__message place-search__message--error" role="alert">
                {{ error }}
                <button type="button" @click="submit">重试</button>
            </div>
            <div v-else-if="status === 'empty'" class="place-search__message" role="status">福田区内未找到匹配地点，请尝试更完整的名称或地址。</div>
            <ul id="place-search-results" role="listbox" aria-label="候选地点" class="place-search__results">
                <li v-for="(place, index) in results" :id="`place-option-${index}`" :key="`${place.id}-${index}`"
                    role="option" :aria-selected="activeIndex === index">
                    <button type="button" class="place-search__result" :class="{ 'is-active': activeIndex === index }"
                        :disabled="!mapReady" @click="choose(place)">
                        <span class="place-search__pin" aria-hidden="true">⌖</span>
                        <span class="place-search__result-copy">
                            <strong>{{ place.name }}</strong>
                            <small>{{ place.district }} {{ place.address }}</small>
                            <small v-if="!hasPlaceCoordinates(place)" class="place-search__more">点击继续搜索具体位置</small>
                        </span>
                    </button>
                </li>
            </ul>
            <div v-if="status === 'idle'" class="place-search__message">输入后自动联想，按 Enter 搜索完整结果。</div>
            <div class="place-search__source">地点信息来自高德地图</div>
        </div>

        <div v-if="selected && !expanded" class="place-search__selection">
            <div class="place-search__selected-heading"><span>已定位地点</span><button type="button" aria-label="关闭已选地点" @click="clear">×</button></div>
            <strong class="place-search__selected-name">{{ selected.name }}</strong>
            <p>{{ selected.district }} {{ selected.address }}</p>
            <div class="place-search__radius" role="group" aria-label="附近公交查询半径">
                <span>查询半径</span>
                <button v-for="meters in [300, 500, 800]" :key="meters" type="button"
                    :class="{ 'is-active': radius === meters }" :aria-pressed="radius === meters" @click="radius = meters">{{ meters }} 米</button>
            </div>
            <button class="place-search__nearby" type="button" :disabled="!mapReady" @click="emit('nearby', selected, radius)">查询附近公交站</button>
            <div class="place-search__source">地点信息来自高德地图 · 公交站来自本地数据</div>
        </div>
    </section>
</template>

<style scoped>
.place-search { position: absolute; z-index: 45; top: 16px; left: 16px; width: 370px; max-width: calc(100% - 32px); color: #24364f; font-size: 13px; }
.place-search__form { display: flex; height: 48px; align-items: center; padding-left: 14px; background: #fff; border: 1px solid #dbe4f0; border-radius: 12px; box-shadow: 0 5px 20px #1c33561a; }
.place-search__form:focus-within { border-color: #2478ed; box-shadow: 0 0 0 3px #2478ed1a; }
.place-search__city { flex-shrink: 0; padding-right: 12px; margin-right: 10px; border-right: 1px solid #e3eaf3; color: #60738b; font-size: 12px; }
input { min-width: 0; width: 100%; height: 100%; border: 0; outline: 0; color: #24364f; background: transparent; font: inherit; }
input::placeholder { color: #91a0b3; font-size: 12px; }
button { font: inherit; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .5; }
button:focus-visible { outline: 2px solid #2478ed; outline-offset: -2px; }
.place-search__clear, .place-search__selected-heading button { padding: 4px 8px; color: #8291a4; font-size: 22px; background: transparent; border: 0; }
.place-search__submit { flex: 0 0 44px; display: grid; height: 100%; place-items: center; color: #2478ed; border: 0; background: transparent; }
.place-search__submit svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.place-search__dropdown, .place-search__selection { margin-top: 8px; overflow: hidden; background: #fff; border: 1px solid #dbe4f0; border-radius: 12px; box-shadow: 0 6px 22px #1c33561a; }
.place-search__caption { padding: 12px 14px 10px; color: #7b8ba0; border-bottom: 1px solid #edf1f6; font-size: 11px; }
.place-search__results { margin: 0; padding: 0; list-style: none; max-height: min(330px, 40vh); overflow-y: auto; }
.place-search__result { display: flex; gap: 10px; width: 100%; padding: 13px 14px; border: 0; border-bottom: 1px solid #f0f3f8; background: #fff; color: inherit; text-align: left; }
.place-search__result:hover, .place-search__result.is-active { background: #eef6ff; }
.place-search__pin { font-size: 23px; color: #2478ed; }
.place-search__result-copy { display: flex; min-width: 0; gap: 5px; flex-direction: column; }
.place-search__result-copy strong { font-size: 14px; font-weight: 600; }
.place-search__result-copy small { color: #8291a4; line-height: 1.5; overflow-wrap: anywhere; }
.place-search__result-copy .place-search__more { color: #2478ed; }
.place-search__message { padding: 16px; color: #718198; line-height: 1.7; }
.place-search__message--error { color: #b65b36; }
.place-search__message button { display: block; margin-top: 8px; padding: 4px 12px; color: #2478ed; background: #eef6ff; border: 0; border-radius: 5px; }
.place-search__source { padding: 10px 14px; color: #91a0b3; background: #f8fafd; font-size: 10px; }
.place-search__selection { padding: 12px 14px 0; }
.place-search__selected-heading { display: flex; align-items: center; justify-content: space-between; color: #2478ed; font-size: 11px; }
.place-search__selected-name { display: block; margin-top: 4px; font-size: 17px; }
.place-search__selection p { margin: 8px 0 12px; color: #8291a4; line-height: 1.6; }
.place-search__radius { display: flex; align-items: center; gap: 8px; margin: 14px 0; }
.place-search__radius span { margin-right: auto; color: #718198; font-size: 12px; }
.place-search__radius button { padding: 5px 8px; border: 1px solid #e3eaf3; border-radius: 6px; background: #fff; color: #718198; font-size: 12px; }
.place-search__radius button.is-active { border-color: #b8d4ff; background: #eef6ff; color: #2478ed; }
.place-search__nearby { width: 100%; padding: 10px; border: 0; border-radius: 8px; background: #2478ed; color: #fff; }
.place-search__selection .place-search__source { margin: 12px -14px 0; }
@media (max-width: 680px) { .place-search { top: 10px; left: 10px; width: 350px; max-width: calc(100% - 20px); } .place-search__selection { max-height: 29vh; overflow-y: auto; } .place-search__results { max-height: 25vh; } }
</style>
