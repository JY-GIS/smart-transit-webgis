import { Client } from '@stomp/stompjs'
import { ref } from 'vue'

import { TRANSIT_CONFIG } from '@/config/transit.config'
import type {
    RealtimeVehicleConnectionStatus,
    RealtimeVehicleMotionStatus,
    RealtimeVehicleOperationalStatus,
    RealtimeVehiclePositionSnapshot,
    RealtimeVehicleStopSnapshot,
} from '@/types/realtimeVehicle'

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 验证后端返回的车辆运动状态。
 */
function isVehicleMotionStatus(value: unknown): value is RealtimeVehicleMotionStatus {
    return (
        value === 'CRUISING' ||
        value === 'APPROACHING' ||
        value === 'DWELLING'
    )
}

/**
 * 验证后端返回的车辆运营状态。
 */
function isVehicleOperationalStatus(value: unknown,): value is RealtimeVehicleOperationalStatus {
    return (
        value === 'NORMAL' ||
        value === 'BUNCHING' ||
        value === 'LARGE_GAP'
    )
}

/**
 * 验证车辆站点快照
 * TypeScript interface 只在编译期间存在，JSON.parse 得到的数据仍然必须进行运行时检查。
 */
function isStopSnapshot(value: unknown): value is RealtimeVehicleStopSnapshot {
    if (!value || typeof value !== 'object') {
        return false
    }

    const stop = value as Record<string, unknown>

    return (
        typeof stop.stopId === 'string' &&
        typeof stop.stopName === 'string' &&
        isFiniteNumber(stop.stopSequence) &&
        isFiniteNumber(stop.distanceAlongRouteMeters)
    )
}

/**
 * 验证一辆车辆快照的关键字段。
 */
function isVehicleSnapshot(value: unknown): value is RealtimeVehiclePositionSnapshot {
    if (!value || typeof value !== 'object') {
        return false
    }

    const vehicle = value as Record<string, unknown>

    const previousStopIsValid = vehicle.previousStop === null || isStopSnapshot(vehicle.previousStop)

    const nextStopIsValid = vehicle.nextStop === null || isStopSnapshot(vehicle.nextStop)

    const distanceToNextStopIsValid = vehicle.distanceToNextStopMeters === null || isFiniteNumber(vehicle.distanceToNextStopMeters)

    const frontVehicleIdIsValid = vehicle.frontVehicleId === null || typeof vehicle.frontVehicleId === 'string'

    const distanceToFrontVehicleIsValid = vehicle.distanceToFrontVehicleMeters === null || (isFiniteNumber(vehicle.distanceToFrontVehicleMeters) && vehicle.distanceToFrontVehicleMeters >= 0)

    const referenceHeadwayIsValid = isFiniteNumber(vehicle.referenceHeadwayMeters) && vehicle.referenceHeadwayMeters > 0

    const operationalStatusIsValid = isVehicleOperationalStatus(vehicle.operationalStatus)

    const motionStatusIsValid = isVehicleMotionStatus(vehicle.motionStatus)

    const currentSpeedIsValid = isFiniteNumber(vehicle.currentSpeedMetersPerSecond) && vehicle.currentSpeedMetersPerSecond >= 0

    return (
        typeof vehicle.vehicleId === 'string' &&
        typeof vehicle.routeId === 'string' &&
        isFiniteNumber(vehicle.routeFid) &&
        isFiniteNumber(vehicle.longitude) &&
        isFiniteNumber(vehicle.latitude) &&
        isFiniteNumber(vehicle.distanceMeters) &&
        isFiniteNumber(vehicle.totalDistanceMeters) &&
        isFiniteNumber(vehicle.routeProgressPercent) &&
        motionStatusIsValid &&
        currentSpeedIsValid &&
        frontVehicleIdIsValid &&
        distanceToFrontVehicleIsValid &&
        referenceHeadwayIsValid &&
        operationalStatusIsValid &&
        previousStopIsValid &&
        nextStopIsValid &&
        distanceToNextStopIsValid
    )
}

/**
 * 验证 WebSocket 消息是否为车辆快照数组。
 */
function isVehicleSnapshotArray(value: unknown): value is RealtimeVehiclePositionSnapshot[] {
    return (
        Array.isArray(value) &&
        value.every(isVehicleSnapshot)
    )
}

/**
 * 根据当前页面地址生成 WebSocket URL  (http 页面使用 ws，https 页面必须使用 wss) 
 */
function createBrokerUrl(): string {
    const webSocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    return (
        `${webSocketProtocol}//${window.location.host}` +
        TRANSIT_CONFIG.realtimeVehicles.webSocketPath
    )
}

/**
 * 后端实时车辆订阅
 */
export function useRealtimeVehicles() {
    const vehicles = ref<RealtimeVehiclePositionSnapshot[]>([])

    const connectionStatus = ref<RealtimeVehicleConnectionStatus>('idle')

    const errorMessage = ref<string | null>(null)

    const lastReceivedAt = ref<Date | null>(null)

    let stompClient: Client | undefined

    /**
     * 处理后端推送的一条 STOMP 消息。
     */
    function handleVehicleMessage(messageBody: string) {
        try {
            const parsedMessage: unknown = JSON.parse(messageBody)

            if (!isVehicleSnapshotArray(parsedMessage)) {
                throw new Error('车辆实时消息格式错误')
            }

            vehicles.value = parsedMessage
            lastReceivedAt.value = new Date()
            errorMessage.value = null

        } catch (error) {
            errorMessage.value = error instanceof Error ? error.message : '车辆实时消息解析失败'
            console.error('车辆实时消息处理失败:', error)
        }
    }

    /**
     * 建立 STOMP 连接。
     */
    function connect() {
        // 防止页面重复执行初始化时创建多条连接。
        if (stompClient?.active) {
            return
        }

        connectionStatus.value = 'connecting'
        errorMessage.value = null

        const client = new Client({
            brokerURL: createBrokerUrl(),

            // reconnectDelay：连接意外断开后自动重试
            reconnectDelay: TRANSIT_CONFIG.realtimeVehicles.reconnectDelayMilliseconds
        })

        /*
         * 订阅必须注册在 onConnect 中.
         * - onConnect 不仅在首次连接时执行，自动重连成功后也会再次执行，
         * - 因而能够重新建立 /topic/vehicles 订阅。
         */
        client.onConnect = () => {
            connectionStatus.value = 'connected'
            errorMessage.value = null

            client.subscribe(
                TRANSIT_CONFIG.realtimeVehicles.topic,
                (message) => {
                    handleVehicleMessage(message.body)
                }
            )

            if (import.meta.env.DEV) {
                console.info('车辆实时连接已建立')
            }
        }

        client.onStompError = (frame) => {
            connectionStatus.value = 'error'
            errorMessage.value = frame.headers.message ?? 'STOMP 服务返回错误'

            console.error('STOMP 服务错误：', frame.body)
        }

        client.onWebSocketError = () => {
            connectionStatus.value = 'error'
            errorMessage.value = 'WebSocket 连接失败'
        }

        client.onWebSocketClose = () => {
            connectionStatus.value = client.active ? 'disconnected' : 'idle'
        }

        stompClient = client

        client.activate()
    }

    /**
     * 关闭连接并停止自动重连。
     */
    async function disconnect(): Promise<void> {
        const client = stompClient

        stompClient = undefined

        if (client) {
            // 关闭当前连接并停止后续自动重连
            await client.deactivate()
        }

        vehicles.value = []
        lastReceivedAt.value = null
        connectionStatus.value = 'idle'
        errorMessage.value = null
    }

    return {
        vehicles,
        connectionStatus,
        errorMessage,
        lastReceivedAt,
        connect,
        disconnect,
    }
}