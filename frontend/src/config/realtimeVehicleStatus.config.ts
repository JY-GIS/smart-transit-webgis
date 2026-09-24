import type { RealtimeVehicleMotionStatus } from '@/types/realtimeVehicle'

/**
 * 一个车辆运行状态对应的前端展示样式。
 */
export interface RealtimeVehicleStatusStyle {
    // 面板显示的中文名称
    label: string

    // 地图车辆和面板文字共用的颜色
    color: string
}

/**
 * 实时车辆状态展示配置。
 * 地图车辆和面板文字必须从同一份配置读取颜色，避免两处分别硬编码后出现颜色不一致。
 */
export const REALTIME_VEHICLE_STATUS_STYLES: Record<RealtimeVehicleMotionStatus, RealtimeVehicleStatusStyle> = {
    CRUISING: {
        label: '行驶中',
        color: '#2F80ED',
    },

    APPROACHING: {
        label: '减速中',
        color: '#FB8C00',
    },

    DWELLING: {
        label: '停靠中',
        color: '#d4090f',
    },
}