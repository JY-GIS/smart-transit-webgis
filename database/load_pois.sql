begin;

-- POI 使用完整数据快照，重新导入时先清空旧数据
truncate table public.pois restart identity;

-- 将 QGIS 原始导入表映射到项目最终 POI 表
insert into public.pois (
    name,
    source_category,
    source_subcategory,
    poi_type,
    geom
)
select
    trim("名称"),
    trim("大类"),
    trim("中类"),
    trim(poi_type),
    geom::geometry(Point, 4326)
from public.futian_poi_final
order by fid;

commit;

-- 检查最终数据量
select count(*) as poi_count from public.pois;

-- 检查六类 POI 数量
select
    poi_type,
    count(*) as poi_count
from public.pois
group by poi_type
order by poi_type;

-- 检查最终几何类型和坐标系
select
    ST_GeometryType(geom) as geometry_type,
    ST_SRID(geom) as srid,
    count(*) as poi_count
from public.pois
group by
    ST_GeometryType(geom),
    ST_SRID(geom);

-- 查看部分导入结果
select
    poi_id,
    name,
    source_category,
    source_subcategory,
    poi_type,
    ST_X(geom) as longitude,
    ST_Y(geom) as latitude
from public.pois
order by poi_id
limit 10;