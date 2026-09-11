import * as Cesium from 'cesium'
import type { BusRouteProperties } from '@/types/busRoute'
import { TRANSIT_CONFIG } from '@/config/transit.config'

// 公交线路图层：负责 GeoJSON 加载、属性读取和业务索引。
// 不直接合并 MultiLineString 几何，而是用 fid 将同一业务线路的多个 Entity 逻辑聚合。
export function readBusRouteProperties(
    entity: Cesium.Entity,
    time: Cesium.JulianDate,
): BusRouteProperties | null {
    // Cesium 的 properties 是 PropertyBag，需要在当前时间点取出普通对象。
    const values = entity.properties?.getValue(time) as
        | Record<string, unknown>
        | undefined

    if (!values) {
        return null
    }

    const fid = Number(values.fid)

    if (!Number.isFinite(fid)) {
        return null
    }

    // GeoJSON 属性类型可能不稳定，面板统一按字符串展示空值和数字。
    const toText = (value: unknown) => {
        if (value === null || value === undefined) {
            return ''
        }

        return String(value)
    }

    return {
        fid,
        rname: toText(values.rname),
        fsname: toText(values.fsname),
        lsname: toText(values.lsname),
        city: toText(values.city),
        province: toText(values.province),
    }
}

export function useBusRouteLayer() {
    // 一个 fid 可能对应多个线段 Entity，保留数组可以兼容原始 MultiLineString。
    const routeEntitiesByFid = new Map<number, Cesium.Entity[]>()

    function indexRouteEntities(
        dataSource: Cesium.GeoJsonDataSource,
        time: Cesium.JulianDate,
    ) {
        routeEntitiesByFid.clear()

        // 建立 fid → Entity[] 索引，后续点击任意片段时可以高亮整条业务线路。
        for (const entity of dataSource.entities.values) {
            if (!entity.polyline) {
                continue
            }

            const properties = readBusRouteProperties(entity, time)

            if (!properties) {
                continue
            }

            const entities = routeEntitiesByFid.get(properties.fid) ?? []

            entities.push(entity)

            routeEntitiesByFid.set(properties.fid, entities)
        }
    }

    async function loadBusRoutes(viewer: Cesium.Viewer) {
        // GeoJSONDataSource 会保留每个要素的 properties，并为线要素创建 Entity。
        const dataSource = await Cesium.GeoJsonDataSource.load(
            TRANSIT_CONFIG.routesUrl,
            {
                stroke: Cesium.Color.GOLD.withAlpha(
                    TRANSIT_CONFIG.routeStyle.strokeAlpha,
                ),
                strokeWidth: TRANSIT_CONFIG.routeStyle.strokeWidth,
                clampToGround: TRANSIT_CONFIG.routeStyle.clampToGround,
            },
        )

        // 线路贴地分类到地形表面；这里不改变原始 Entity 的几何结构。
        for (const entity of dataSource.entities.values) {
            if (entity.polyline) {
                entity.polyline.classificationType =
                    new Cesium.ConstantProperty(
                        Cesium.ClassificationType.TERRAIN,
                    )
            }
        }

        viewer.dataSources.add(dataSource)

        // 图层加入 Viewer 后再建立索引，保证索引对象与当前数据源一致。
        indexRouteEntities(
            dataSource,
            viewer.clock.currentTime,
        )

        console.info(
            `福田公交线路加载完成：${dataSource.entities.values.length} 个线段 Entity`,
        )

        console.info(
            `公交业务线路索引完成：${routeEntitiesByFid.size} 条`,
        )

        return dataSource
    }

    return {
        routeEntitiesByFid,
        loadBusRoutes,
        indexRouteEntities,
    }
}
