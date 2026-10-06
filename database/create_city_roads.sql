begin;

-- 城市静态道路表：后续由 GeoServer 读取并发布为 WMTS
create table public.city_roads (
   osm_id bigint primary key,
   code integer not null,
   fclass varchar(32) not null,
   name text,
   ref text,
   oneway char(1) not null,
   maxspeed integer not null,
   layer integer not null,
   bridge boolean not null,
   tunnel boolean not null,
   geom geometry(MultiLineString, 4326) not null,

   constraint city_roads_oneway_check check (oneway in ('B', 'F')),

   constraint city_roads_maxspeed_check check (maxspeed >= 0),

   constraint city_roads_geom_not_empty_check check (not ST_IsEmpty(geom)),

   constraint city_roads_geom_valid_check check (ST_IsValid(geom))
);

-- GeoServer 根据地图范围查询道路时使用
create index idx_city_roads_geom
    on public.city_roads
        using gist (geom);

commit;