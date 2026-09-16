-- 检查 PostGIS 是否启用
SELECT postgis_full_version();

-- 检查三张表
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('routes', 'stops', 'route_stops')
ORDER BY table_name;

-- 检查 geometry 类型和 SRID
SELECT
    f_table_name,
    f_geometry_column,
    type,
    srid
FROM public.geometry_columns
WHERE f_table_schema = 'public'
  AND f_table_name IN ('routes', 'stops')
ORDER BY f_table_name;

-- 检查表当前是否为空
SELECT 'routes' AS table_name, COUNT(*) AS row_count
FROM routes

UNION ALL

SELECT 'stops', COUNT(*)
FROM stops

UNION ALL

SELECT 'route_stops', COUNT(*)
FROM route_stops;