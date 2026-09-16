-- 启用 PostGIS 扩展
CREATE EXTENSION IF NOT EXISTS postgis;

-- 公交线路表
CREATE TABLE routes (
    route_id varchar(32) PRIMARY KEY,
    fid integer NOT NULL UNIQUE,
    rname text NOT NULL,
    fsname text NOT NULL,
    lsname text NOT NULL,
    city text NOT NULL,
    province text NOT NULL,
    geom geometry(MultiLineString, 4326) NOT NULL
);

-- 公交站点表
CREATE TABLE stops (
   stop_id varchar(32) PRIMARY KEY,
   stop_name text NOT NULL,
   longitude double precision NOT NULL
       CHECK (longitude BETWEEN -180 AND 180),
   latitude double precision NOT NULL
       CHECK (latitude BETWEEN -90 AND 90),
   geom geometry(Point, 4326) NOT NULL
);


-- 线路与站点关系表
CREATE TABLE route_stops (
    route_id varchar(32) NOT NULL
     REFERENCES routes(route_id)
         ON DELETE RESTRICT,

    stop_id varchar(32) NOT NULL
     REFERENCES stops(stop_id)
         ON DELETE RESTRICT,

    stop_sequence integer NOT NULL
     CHECK (stop_sequence > 0),

    PRIMARY KEY (route_id, stop_sequence)
);