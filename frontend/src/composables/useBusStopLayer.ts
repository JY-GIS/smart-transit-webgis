import * as Cesium from 'cesium'
import type {
    BusRouteStopRelation,
    BusStopRecord,
} from '@/types/busStop'

import { TRANSIT_CONFIG } from '@/config/transit.config'

// 公交站点图层。
// 只管理站点数据和站点 Entity，不管理线路选择状态。
export function useBusStopLayer() {
    const stopsById = new Map<string, BusStopRecord>()

    const routeStopsByRouteId = new Map<string, BusRouteStopRelation[]>()

    let busStopDataSource:
        | Cesium.CustomDataSource
        | undefined

    // 标记静态数据是否已经读取完成。
    let dataLoaded = false

    async function fetchJson<T>(url: string): Promise<T> {
        const response = await fetch(url)

        if (!response.ok) {
            throw new Error(`公交站点数据加载失败:${url},HTTP ${response.status}`)
        }

        return response.json() as Promise<T>
    }

    function buildIndexes(stops: BusStopRecord[], routeStops: BusRouteStopRelation[]) {
        stopsById.clear()
        routeStopsByRouteId.clear()

        for (const stop of stops) {
            if (stopsById.has(stop.stop_id)) {
                throw new Error(`发现重复 stop_id：${stop.stop_id}`)
            }

            stopsById.set(stop.stop_id, stop)
        }

        for (const relation of routeStops) {
            if (!stopsById.has(relation.stop_id)) {
                throw new Error(
                    `route_stops.json 引用了不存在的 stop_id:${relation.stop_id}`,
                )
            }

            const relations = routeStopsByRouteId.get(relation.route_id) ?? []

            relations.push(relation)

            routeStopsByRouteId.set(relation.route_id, relations)
        }

        for (const relations of routeStopsByRouteId.values()) {
            relations.sort((a, b) => a.stop_sequence - b.stop_sequence)
        }
    }

    async function loadBusStops(viewer: Cesium.Viewer) {
        if (!dataLoaded) {
            const [stops, routeStops] = await Promise.all([
                fetchJson<BusStopRecord[]>(TRANSIT_CONFIG.stopsUrl),
                fetchJson<BusRouteStopRelation[]>(TRANSIT_CONFIG.routeStopsUrl),
            ])

            buildIndexes(stops, routeStops)

            dataLoaded = true

            console.info(`公交站点数据加载完成：${stops.length} 条站点记录`)

            console.info(`公交线路—站点关系加载完成：${routeStops.length} 条`)
        }

        if (!busStopDataSource) {
            busStopDataSource = new Cesium.CustomDataSource('bus-stop-layer')

            viewer.dataSources.add(busStopDataSource)
        }

        return busStopDataSource
    }

    function clearRouteStops() {
        if (!busStopDataSource) return

        busStopDataSource.entities.removeAll()
    }

    function showRouteStops(routeId: string) {
        if (!dataLoaded || !busStopDataSource) {
            throw new Error('公交站点数据尚未加载，不能显示线路站点')
        }

        clearRouteStops()

        const relations = routeStopsByRouteId.get(routeId) ?? []

        if (relations.length === 0) {
            console.info(`当前线路没有可显示的站点：${routeId}`)

            return 0
        }

        for (const relation of relations) {
            const stop = stopsById.get(relation.stop_id)

            if (!stop) continue

            busStopDataSource.entities.add({
                id: `bus-stop-${stop.stop_id}`,
                name: stop.stop_name,
                position:
                    Cesium.Cartesian3.fromDegrees(stop.longitude, stop.latitude),
                point: {
                    pixelSize: 14,
                    color: Cesium.Color.BLUEVIOLET,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 3,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: 0,
                },
            })
        }
        console.info(`公交站点显示完成：${routeId},${relations.length} 个站点`)

        return relations.length
    }

    function cleanup(viewer?: Cesium.Viewer) {
        clearRouteStops()

        if (busStopDataSource && viewer && !viewer.isDestroyed()) {
            viewer.dataSources.remove(busStopDataSource, true)
        }

        busStopDataSource = undefined
        stopsById.clear()
        routeStopsByRouteId.clear()
        dataLoaded = false
    }

    return {
        loadBusStops,
        showRouteStops,
        clearRouteStops,
        cleanup,
    }
}