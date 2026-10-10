<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

import { POI_CATEGORY_CONFIG, POI_CATEGORY_ORDER } from '@/config/poi.config'
import type {
    PoiCategorySummary,
    PoiType,
    PoiTypeVisibility,
} from '@/types/poi'

interface PoiChartItem {
    value: number
    name: string
    poiType: PoiType
    itemStyle: {
        color: string
        opacity: number
    }
}

const props = defineProps<{
    summary: PoiCategorySummary
    typeVisibility: PoiTypeVisibility
}>()

const emit = defineEmits<{
    focusType: [poiType: PoiType]
}>()

const chartElement = ref<HTMLDivElement | null>(null)

let chart: echarts.ECharts | undefined
let resizeObserver: ResizeObserver | undefined

// 把后端分类统计结果转换成ECharts饼图需要的数据
const chartData = computed<PoiChartItem[]>(() => {
    const categoryCounts: Record<PoiType, number> = {
        medical: props.summary.medicalCount,
        education: props.summary.educationCount,
        shopping: props.summary.shoppingCount,
        dining: props.summary.diningCount,
        leisure: props.summary.leisureCount,
        transport: props.summary.transportCount,
    }

    return POI_CATEGORY_ORDER.map((poiType) => ({
        value: categoryCounts[poiType],
        name: POI_CATEGORY_CONFIG[poiType].label,
        poiType,
        itemStyle: {
            color: POI_CATEGORY_CONFIG[poiType].color,
            opacity: props.typeVisibility[poiType] ? 1 : 0.25,
        },
    }))
})

function createChartOption(): echarts.EChartsOption {
    const totalCount = props.summary.totalCount

    return {
        legend: {
            show: true,
            selectedMode: false,
            orient: 'vertical',
            left: '45%',
            top: 'middle',
            itemWidth: 8,
            itemHeight: 8,
            itemGap: 8,
            icon: 'roundRect',
            textStyle: {
                color: '#475569',
                fontSize: 10,
                rich: {
                    name: {
                        width: 58,
                        color: '#475569',
                        fontSize: 10,
                    },
                    value: {
                        width: 30,
                        align: 'right',
                        color: '#172033',
                        fontFamily: 'Consolas, monospace',
                        fontSize: 10,
                        fontWeight: 600,
                    },
                    percent: {
                        width: 40,
                        align: 'right',
                        color: '#64748b',
                        fontFamily: 'Consolas, monospace',
                        fontSize: 10,
                    },
                },
            },
            formatter: (name: string) => {
                const item = chartData.value.find((category) => category.name === name)
                const value = item?.value ?? 0
                const percent = totalCount > 0
                    ? (value / totalCount * 100).toFixed(1)
                    : '0.0'

                return `{name|${name}}{value|${value}}{percent|${percent}%}`
            },
        },
        tooltip: {
            trigger: 'item',
            formatter: '{b}<br/>{c} 个（{d}%）',
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            borderColor: '#cbd5e1',
            textStyle: {
                color: '#172033',
                fontSize: 12,
            },
        },
        series: [
            {
                type: 'pie',
                silent: true,
                radius: ['46%', '70%'],
                center: ['24%', '50%'],
                animation: false,
                label: {
                    show: true,
                    position: 'center',
                    formatter: `{total|${totalCount}}\n{name|POI总数}`,
                    rich: {
                        total: {
                            color: '#2563eb',
                            fontSize: 22,
                            fontWeight: 'bold',
                            lineHeight: 28,
                        },
                        name: {
                            color: '#64748b',
                            fontSize: 10,
                            lineHeight: 15,
                        },
                    },
                },
                labelLine: {
                    show: false,
                },
                data: [
                    {
                        value: 1,
                        itemStyle: {
                            color: '#e2e8f0',
                        },
                    },
                ],
            },
            {
                type: 'pie',
                radius: ['48%', '68%'],
                center: ['24%', '50%'],
                padAngle: 2,
                animation: false,
                itemStyle: {
                    borderColor: '#ffffff',
                    borderWidth: 1,
                    borderRadius: 5,
                },
                label: {
                    show: false,
                },
                labelLine: {
                    show: false,
                },
                emphasis: {
                    scale: true,
                    scaleSize: 4,
                    itemStyle: {
                        shadowBlur: 8,
                        shadowColor: 'rgba(115, 192, 222, 0.3)',
                    },
                },
                data: chartData.value,
            },
        ],
    }
}

// 使用最新统计数据和分类显示状态更新图表
function renderChart() {
    if (!chart) {
        return
    }

    chart.setOption(createChartOption(), true)
}

function handleChartClick(parameters: { data?: unknown }) {
    const chartItem = parameters.data as PoiChartItem

    emit('focusType', chartItem.poiType)
}

// 面板尺寸变化后通知ECharts重新计算画布尺寸
function handleChartResize() {
    chart?.resize()
}

// 组件挂载后创建ECharts实例，并绑定点击和尺寸监听
onMounted(() => {
    if (!chartElement.value) {
        return
    }

    chart = echarts.init(chartElement.value)
    chart.on('click', handleChartClick)
    renderChart()

    resizeObserver = new ResizeObserver(handleChartResize)
    resizeObserver.observe(chartElement.value)
})

// 统计数据或分类显示状态变化后，重新绘制图表
watch(chartData, () => {
    renderChart()
})

// 组件卸载前释放监听器和ECharts实例，避免内存泄漏
onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = undefined

    chart?.off('click', handleChartClick)
    chart?.dispose()
    chart = undefined
})
</script>

<template>
    <div
        ref="chartElement"
        class="poi-category-chart"
        role="img"
        aria-label="POI分类数量饼图"
    />
</template>

<style scoped>
.poi-category-chart {
    width: 100%;
    height: 180px;
    cursor: pointer;
}
</style>
