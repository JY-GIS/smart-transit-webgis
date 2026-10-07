// POI六类业务代码必须与后端 pois_type 约束保持一致。
export type PoiType =
    | 'medical'
    | 'education'
    | 'shopping'
    | 'dining'
    | 'leisure'
    | 'transport'

// 一类POI在界面中使用的中文名称和颜色。
export interface PoiCategoryDefinition {
    label: string
    color: string
}

// 六类POI分别是否允许显示在地图上。
export type PoiTypeVisibility = Record<PoiType, boolean>

// 后端附近POI接口返回的一条点位记录。
export interface NearbyPoiRecord {
    poiId: number
    name: string

    sourceCategory: string
    sourceSubcategory: string
    poiType: PoiType

    longitude: number
    latitude: number
    distanceMeters: number
}

// POI 分析使用的查询中心。
export interface PoiQueryCenter {
    longitude: number
    latitude: number
}

// 后端附近 POI 分类统计结果。
export interface PoiCategorySummary {
    totalCount: number

    medicalCount: number
    educationCount: number
    shoppingCount: number
    diningCount: number
    leisureCount: number
    transportCount: number
}

// POI 分类统计请求状态。
export type PoiAnalysisStatus =
    | 'idle'
    | 'loading'
    | 'success'
    | 'empty'
    | 'zero-radius'
    | 'error'