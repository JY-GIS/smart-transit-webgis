import type {
    PoiCategoryDefinition,
    PoiType,
    PoiTypeVisibility,
} from '@/types/poi'

// 控制POI分类在面板、ECharts和地图中的固定顺序。
export const POI_CATEGORY_ORDER: readonly PoiType[] = [
    'medical',
    'education',
    'shopping',
    'dining',
    'leisure',
    'transport',
]

// 六类POI统一使用ECharts默认色板，地图与图表都从这里取颜色。
export const POI_CATEGORY_CONFIG: Record<
    PoiType,
    PoiCategoryDefinition
> = {
    medical: {
        label: '医疗保健',
        color: '#ee6666',
    },
    education: {
        label: '科教文化',
        color: '#5470c6',
    },
    shopping: {
        label: '购物消费',
        color: '#fac858',
    },
    dining: {
        label: '餐饮美食',
        color: '#fc8452',
    },
    leisure: {
        label: '休闲娱乐',
        color: '#91cc75',
    },
    transport: {
        label: '交通设施',
        color: '#73c0de',
    },
}

// 第一次进入POI查询时，默认显示全部六类点位。
export const DEFAULT_POI_TYPE_VISIBILITY: PoiTypeVisibility = {
    medical: true,
    education: true,
    shopping: true,
    dining: true,
    leisure: true,
    transport: true,
}