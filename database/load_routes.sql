BEGIN;

INSERT INTO public.routes (
    route_id,
    fid,
    rname,
    fsname,
    lsname,
    city,
    province,
    geom
)
SELECT
    'route_' || LPAD(fid::text, 6, '0') AS route_id,
    fid,
    rname,
    fsname,
    lsname,
    city,
    province,
    geom::geometry(MultiLineString, 4326)
FROM public.routes_import_raw
ON CONFLICT (route_id) DO NOTHING;

COMMIT;

SELECT COUNT(*) AS route_count
FROM public.routes;

SELECT
    route_id,
    fid,
    rname,
    ST_GeometryType(geom) AS geometry_type,
    ST_SRID(geom) AS srid
FROM public.routes
WHERE route_id = 'route_000185';