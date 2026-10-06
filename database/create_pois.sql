begin;

-- POI 最终表：保存公交站点周边服务分析需要的兴趣点
create table public.pois (
     poi_id bigint generated always as identity primary key,
     name text not null,
     source_category text not null,
     source_subcategory text not null,
     poi_type varchar(20) not null,
     geom geometry(Point, 4326) not null,

    -- 只允许项目约定的六类 POI，防止出现前后端不认识的分类代码
     constraint pois_type_check check (
         poi_type in (
                      'medical',
                      'education',
                      'shopping',
                      'dining',
                      'leisure',
                      'transport'
             )
         ),

    -- 空几何无法参加站点周边距离查询
     constraint pois_geom_not_empty_check check (
         not ST_IsEmpty(geom)
     )
);

-- 地图范围查询、点与边界判断使用 geometry 空间索引
create index idx_pois_geom
    on public.pois
        using gist (geom);

-- 站点周边 300/500/800 米查询使用 geom::geography，
-- 因此为相同表达式建立空间索引
create index idx_pois_geom_geography
    on public.pois
        using gist ((geom::geography));

commit;