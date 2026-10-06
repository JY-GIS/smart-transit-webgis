rollback;

begin;

-- 静态道路采用全量快照，每次导入都与当前 GeoJSON 保持一致
truncate table public.city_roads;

insert into public.city_roads (
    osm_id,
    code,
    fclass,
    name,
    ref,
    oneway,
    maxspeed,
    layer,
    bridge,
    tunnel,
    geom
)
select
    osm_id::bigint,
    code::integer,
    trim(fclass),
    nullif(trim(name), ''),
    nullif(trim(ref), ''),
    upper(trim(oneway)),
    maxspeed::integer,
    layer::integer,
    trim(bridge)::boolean,
    trim(tunnel)::boolean,
    geom::geometry(MultiLineString, 4326)
from public.city_roads_import_raw;

commit;

-- 检查最终道路数量
select count(*) as city_road_count
from public.city_roads;

-- 检查道路分类数量
select
    fclass,
    count(*) as road_count
from public.city_roads
group by fclass
order by road_count desc;

-- 检查最终几何类型和坐标系
select
    ST_GeometryType(geom) as geometry_type,
    ST_SRID(geom) as srid,
    count(*) as road_count
from public.city_roads
group by
    ST_GeometryType(geom),
    ST_SRID(geom);