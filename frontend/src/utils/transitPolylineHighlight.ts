import * as Cesium from 'cesium'

/**
 * 地图中“需要重点显示的公交线”统一使用这份样式。
 */

// 点击线路与历史轨迹共同使用相同宽度。
export const TRANSIT_POLYLINE_HIGHLIGHT_WIDTH = 10

// 贴地高亮底层负责勾勒线路轮廓。
export const TRANSIT_GROUND_ROUTE_OUTLINE_WIDTH = 10

// 贴地高亮上层负责显示线路主体。
export const TRANSIT_GROUND_ROUTE_CORE_WIDTH = 7

export const TRANSIT_GROUND_ROUTE_OUTLINE_COLOR = Cesium.Color.fromCssColorString('#063f5c').withAlpha(0.82)

export const TRANSIT_GROUND_ROUTE_CORE_COLOR = Cesium.Color.fromCssColorString('#39e7ff').withAlpha(0.98)

// 青色是现有点击线路使用的颜色，不改变原来的颜色设计。
const TRANSIT_POLYLINE_HIGHLIGHT_COLOR = Cesium.Color.CYAN

/**
 * 创建带光晕的线路高亮材质。
 */
export function createTransitPolylineHighlightMaterial(alpha = 1, glowPower = 0.35,): Cesium.PolylineGlowMaterialProperty {
    return new Cesium.PolylineGlowMaterialProperty({
        color: TRANSIT_POLYLINE_HIGHLIGHT_COLOR.withAlpha(alpha),
        glowPower,
        taperPower: 1,
    })
}