-- 线路空间索引
CREATE INDEX idx_routes_geom
    ON routes USING GIST (geom);

-- 站点空间索引
CREATE INDEX idx_stops_geom
    ON stops USING GIST (geom);

-- 便于根据站点反查线路
CREATE INDEX idx_route_stops_stop_id
    ON route_stops (stop_id);