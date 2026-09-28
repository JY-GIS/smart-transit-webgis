/*
 * 车辆历史位置表。
 */
create table if not exists vehicle_position_history (
    vehicle_id varchar(64) not null,
    route_id varchar(32) not null references routes(route_id) on delete restrict,
    -- timestamptz：表示时间轴上的确定时刻。( 涉及前后端传输、历史记录和跨时区的业务时间，优先使用 timestamptz )
    recorded_at timestamptz not null,
    geom geometry(Point, 4326) not null,
    distance_meters double precision NOT NULL,
    total_distance_meters double precision NOT NULL,
    route_progress_percent double precision NOT NULL,
    speed_meters_per_second double precision NOT NULL,
    motion_status varchar(16) NOT NULL,
    operational_status varchar(16) NOT NULL,

    primary key (vehicle_id, recorded_at),
    check ( total_distance_meters > 0 ),
    check ( distance_meters >= 0 and distance_meters <= total_distance_meters ),
    CHECK ( route_progress_percent >= 0 AND route_progress_percent <= 100 ),
    CHECK ( speed_meters_per_second >= 0 ),
    CHECK ( motion_status IN ('CRUISING','APPROACHING','DWELLING') ),
    CHECK ( operational_status IN ('NORMAL','BUNCHING','LARGE_GAP') )
);

/*
 * 支持后续按照线路查询哪些车辆存在历史记录。
 */
create index if not exists idx_vehicle_position_history_route_time
    on vehicle_position_history (route_id, recorded_at);

/*
 * 支持定期清理过期数据：delete from vehicle_position_history where recorded_at < ?;
 */
create index if not exists idx_vehicle_position_history_recorded_at
    on vehicle_position_history (recorded_at);