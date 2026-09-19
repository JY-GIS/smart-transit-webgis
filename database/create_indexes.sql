-- 线路空间索引
CREATE INDEX IF NOT EXISTS idx_routes_geom
    ON routes USING GIST (geom);

-- 站点空间索引
CREATE INDEX IF NOT EXISTS idx_stops_geom
    ON stops USING GIST (geom);

-- 附近站点查询使用 geom::geography，
-- 因此为相同表达式建立 GiST 表达式索引
CREATE INDEX IF NOT EXISTS idx_stops_geom_geography
    ON public.stops
        USING GIST ((geom::geography));

-- 便于根据站点反查线路
CREATE INDEX IF NOT EXISTS idx_route_stops_stop_id
    ON route_stops (stop_id);