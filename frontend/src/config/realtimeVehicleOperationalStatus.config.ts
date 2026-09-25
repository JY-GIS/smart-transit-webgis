import type { RealtimeVehicleOperationalStatus } from '@/types/realtimeVehicle'

/**
 * 运营状态对应的前端展示样式。
 */
export interface RealtimeVehicleOperationalStatusStyle {
    label: string
    color: string
}

/**
 * 运营状态的统一中文名称和颜色。
 */
export const REALTIME_VEHICLE_OPERATIONAL_STATUS_STYLES: Record<RealtimeVehicleOperationalStatus, RealtimeVehicleOperationalStatusStyle> = {
    NORMAL: {
        label: '正常',
        color: '#22C55E',
    },

    BUNCHING: {
        label: '串车',
        color: '#EF4444',
    },

    LARGE_GAP: {
        label: '大间隔',
        color: '#F59E0B',
    },
}