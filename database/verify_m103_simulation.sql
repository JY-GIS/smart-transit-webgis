/*
 * M103 后端车辆模拟前置验证
 *
 * 目标：
 * 1. 验证 route_000185 的线路几何可以用于线性参考；
 * 2. 验证 39 个站点能够按照 stop_sequence 映射到线路；
 * 3. 暴露闭环线路使用 ST_LineLocatePoint 时可能出现的歧义，
 *    不修改 routes、stops、route_stops 中的任何数据。
 *
 * 坐标系说明：
 * - 数据库存储坐标系为 EPSG:4326，经纬度单位是“度”；
 * - 长度、沿线距离和投影偏移统一在 EPSG:32650（WGS 84 / UTM 50N）中计算，
 *   单位为米。深圳位于 UTM 50N 分区内。
 */

BEGIN TRANSACTION READ ONLY;

-- ============================================================
-- 1. 复核当前真实表结构和 geometry 元数据
-- ============================================================

SELECT
    table_name,
    ordinal_position,
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('routes', 'route_stops', 'stops')
ORDER BY table_name, ordinal_position;

SELECT
    f_table_name AS table_name,
    f_geometry_column AS geometry_column,
    type AS geometry_type,
    srid
FROM public.geometry_columns
WHERE f_table_schema = 'public'
  AND f_table_name IN ('routes', 'stops')
ORDER BY f_table_name;

-- ============================================================
-- 2. 验证 route_000185 是否存在
--
-- route_exists 必须为 true，route_row_count 必须为 1。
-- route_id 是主键，正常情况下不可能出现多条同 ID 记录。
-- ============================================================

SELECT
    EXISTS (
        SELECT 1
        FROM public.routes
        WHERE route_id = 'route_000185'
    ) AS route_exists,
    COUNT(*) AS route_row_count,
    MIN(fid) AS fid,
    MIN(rname) AS route_name
FROM public.routes
WHERE route_id = 'route_000185';

-- ============================================================
-- 3. 验证原始 geometry 和 ST_LineMerge 结果
--
-- ST_NumGeometries：返回 MultiLineString 中包含的子几何数量。
-- ST_LineMerge：把首尾相接的线段合并为尽可能长的 LineString。
--
-- 后续 ST_LineLocatePoint / ST_LineInterpolatePoint 都要求可用的
-- LineString，因此 merged_geometry_type 必须为 ST_LineString。
-- 如果原始 MultiLineString 存在互不连通的片段，ST_LineMerge 仍可能
-- 返回 MultiLineString，此时不能直接开始后端车辆模拟。
-- ============================================================

WITH selected_route AS (
    SELECT
        route_id,
        geom,
        ST_LineMerge(geom) AS merged_geom
    FROM public.routes
    WHERE route_id = 'route_000185'
)
SELECT
    route_id,
    ST_GeometryType(geom) AS source_geometry_type,
    ST_SRID(geom) AS source_srid,
    ST_IsValid(geom) AS source_geometry_valid,
    ST_IsEmpty(geom) AS source_geometry_empty,
    ST_NumGeometries(geom) AS source_geometry_count,
    ST_GeometryType(merged_geom) AS merged_geometry_type,
    ST_IsValid(merged_geom) AS merged_geometry_valid,
    ST_IsEmpty(merged_geom) AS merged_geometry_empty,
    ST_NPoints(merged_geom) AS merged_point_count,
    CASE
        WHEN ST_GeometryType(merged_geom) = 'ST_LineString'
        THEN true
        ELSE false
    END AS merged_line_usable
FROM selected_route;

-- ============================================================
-- 4. 验证线路长度、首尾距离和闭环特征
--
-- ST_Transform：把经纬度转换到米制投影坐标系。
-- ST_Length：在 EPSG:32650 中计算线路总长度，结果单位为米。
-- ST_Distance：计算线路起点和终点之间的直线距离。
-- ST_IsClosed：只在起点与终点坐标完全相等时返回 true。
--
-- M103 的首尾点可能非常接近但并非逐位完全相等，因此：
-- - is_closed_exactly 可能为 false；
-- - endpoint_distance_meters 才是判断其是否“近似闭环”的主要依据。
-- 这里额外给出 5 米阈值，但不会修改或吸附原始 geometry。
-- ============================================================

WITH selected_route AS (
    SELECT
        route_id,
        ST_LineMerge(geom) AS merged_geom
    FROM public.routes
    WHERE route_id = 'route_000185'
),
metric_route AS (
    SELECT
        route_id,
        merged_geom,
        CASE
            WHEN ST_GeometryType(merged_geom) = 'ST_LineString'
            THEN ST_Transform(merged_geom, 32650)
            ELSE NULL
        END AS metric_line
    FROM selected_route
)
SELECT
    route_id,
    ROUND(ST_Length(metric_line)::numeric, 3) AS total_length_meters,
    ROUND(
        ST_Distance(
            ST_StartPoint(metric_line),
            ST_EndPoint(metric_line)
        )::numeric,
        3
    ) AS endpoint_distance_meters,
    ST_IsClosed(metric_line) AS is_closed_exactly,
    ST_Distance(
        ST_StartPoint(metric_line),
        ST_EndPoint(metric_line)
    ) <= 5 AS is_loop_like_within_5_meters,
    ST_AsText(ST_Transform(ST_StartPoint(metric_line), 4326)) AS start_point_wgs84,
    ST_AsText(ST_Transform(ST_EndPoint(metric_line), 4326)) AS end_point_wgs84
FROM metric_route;

-- ============================================================
-- 5. 验证 M103 的站点数量和 stop_sequence
--
-- 预期：
-- - stop_count = 39
-- - distinct_sequence_count = 39
-- - min_stop_sequence = 1
-- - max_stop_sequence = 39
-- - missing_stop_reference_count = 0
-- ============================================================

SELECT
    COUNT(*) AS stop_count,
    COUNT(DISTINCT rs.stop_sequence) AS distinct_sequence_count,
    MIN(rs.stop_sequence) AS min_stop_sequence,
    MAX(rs.stop_sequence) AS max_stop_sequence,
    COUNT(*) FILTER (WHERE s.stop_id IS NULL) AS missing_stop_reference_count,
    ARRAY_AGG(rs.stop_sequence ORDER BY rs.stop_sequence) AS stop_sequence_list
FROM public.route_stops rs
LEFT JOIN public.stops s
  ON s.stop_id = rs.stop_id
WHERE rs.route_id = 'route_000185';

-- ============================================================
-- 6. 输出每个站点在线路上的投影结果
--
-- raw_progress_ratio：
--   ST_LineLocatePoint 直接返回的原始比例，范围为 0～1。
--
-- progress_ratio：
--   用于验证车辆站点进度的比例。第一站按站序锚定为 0，最后一站按
--   站序锚定为 1，中间站仍完全使用 ST_LineLocatePoint 的原始结果。
--
-- 为什么首末站需要显式锚定：
--   M103 是闭环线路，末站与起点空间位置接近。ST_LineLocatePoint 只寻找
--   空间上最近的位置，不理解 stop_sequence，也不知道某个站是“末站”。
--   因此末站的 raw_progress_ratio 可能接近 0，而不是接近 1。
--   同时输出 raw_progress_ratio 和 progress_ratio，既保留问题证据，
--   也验证基于业务站序的首末站语义；这不是修改原始数据。
--
-- snap_offset_meters：
--   原始站点到其有效线路投影点的距离。偏移越大，站点和线路几何的
--   匹配质量越差。当前前端算法使用 50 米作为最大允许值，因此这里
--   同时输出 within_50_meters，但不为了通过验证而调整站点或线路。
-- ============================================================

WITH route_context AS (
    SELECT
        r.route_id,
        ST_Transform(ST_LineMerge(r.geom), 32650) AS metric_line
    FROM public.routes r
    WHERE r.route_id = 'route_000185'
      AND ST_GeometryType(ST_LineMerge(r.geom)) = 'ST_LineString'
),
ordered_stops AS (
    SELECT
        rs.route_id,
        rs.stop_id,
        s.stop_name,
        rs.stop_sequence,
        ST_Transform(s.geom, 32650) AS metric_stop,
        MIN(rs.stop_sequence) OVER () AS first_sequence,
        MAX(rs.stop_sequence) OVER () AS last_sequence
    FROM public.route_stops rs
    JOIN public.stops s
      ON s.stop_id = rs.stop_id
    WHERE rs.route_id = 'route_000185'
),
raw_projections AS (
    SELECT
        os.*,
        rc.metric_line,
        ST_Length(rc.metric_line) AS total_length_meters,
        ST_LineLocatePoint(
            rc.metric_line,
            os.metric_stop
        ) AS raw_progress_ratio
    FROM ordered_stops os
    CROSS JOIN route_context rc
),
effective_projections AS (
    SELECT
        *,
        CASE
            WHEN stop_sequence = first_sequence THEN 0.0
            WHEN stop_sequence = last_sequence THEN 1.0
            ELSE raw_progress_ratio
        END AS progress_ratio,
        CASE
            WHEN stop_sequence = first_sequence THEN 'FIRST_STOP_ANCHOR'
            WHEN stop_sequence = last_sequence THEN 'LAST_STOP_ANCHOR'
            ELSE 'ST_LineLocatePoint'
        END AS projection_method
    FROM raw_projections
),
projection_details AS (
    SELECT
        *,
        ST_LineInterpolatePoint(
            metric_line,
            progress_ratio
        ) AS projected_point,
        LAG(progress_ratio) OVER (
            ORDER BY stop_sequence
        ) AS previous_progress_ratio
    FROM effective_projections
)
SELECT
    stop_sequence,
    stop_id,
    stop_name,
    projection_method,
    ROUND(raw_progress_ratio::numeric, 9) AS raw_progress_ratio,
    ROUND(progress_ratio::numeric, 9) AS progress_ratio,
    ROUND(
        (total_length_meters * progress_ratio)::numeric,
        3
    ) AS distance_along_route_meters,
    ROUND(
        ST_Distance(metric_stop, projected_point)::numeric,
        3
    ) AS snap_offset_meters,
    ST_Distance(metric_stop, projected_point) <= 50 AS within_50_meters,
    ROUND(previous_progress_ratio::numeric, 9) AS previous_progress_ratio,
    CASE
        WHEN previous_progress_ratio IS NULL THEN NULL
        ELSE progress_ratio > previous_progress_ratio
    END AS progress_strictly_increases,
    ROUND(
        ST_X(ST_Transform(projected_point, 4326))::numeric,
        8
    ) AS projected_longitude,
    ROUND(
        ST_Y(ST_Transform(projected_point, 4326))::numeric,
        8
    ) AS projected_latitude
FROM projection_details
ORDER BY stop_sequence;

-- ============================================================
-- 7. 汇总原始独立投影的验证结果
--
-- middle_progress_strictly_increasing 只检查中间站点使用
-- ST_LineLocatePoint 得到的进度是否按 stop_sequence 严格递增。
-- 首末站的锚定不会掩盖中间站点可能存在的回退或重复。
--
-- original_independent_projection_success 只有在原始独立投影的所有
-- 核心条件均满足时才为 true。M103 在这里保留失败结果是有价值的：
-- 它直接展示 ST_LineLocatePoint 不理解公交站序所造成的闭环歧义。
-- 如果为 false，应结合本结果集中的失败项和上一节的逐站明细排查，
-- 不应直接修改原始线路或站点数据来“让验证通过”。
-- ============================================================

WITH selected_route AS (
    SELECT
        r.route_id,
        r.geom,
        ST_LineMerge(r.geom) AS merged_geom
    FROM public.routes r
    WHERE r.route_id = 'route_000185'
),
route_context AS (
    SELECT
        route_id,
        geom,
        merged_geom,
        CASE
            WHEN ST_GeometryType(merged_geom) = 'ST_LineString'
            THEN ST_Transform(merged_geom, 32650)
            ELSE NULL
        END AS metric_line
    FROM selected_route
),
ordered_stops AS (
    SELECT
        rs.route_id,
        rs.stop_id,
        rs.stop_sequence,
        s.geom AS stop_geom,
        MIN(rs.stop_sequence) OVER () AS first_sequence,
        MAX(rs.stop_sequence) OVER () AS last_sequence
    FROM public.route_stops rs
    LEFT JOIN public.stops s
      ON s.stop_id = rs.stop_id
    WHERE rs.route_id = 'route_000185'
),
raw_projections AS (
    SELECT
        os.*,
        rc.metric_line,
        ST_Length(rc.metric_line) AS total_length_meters,
        CASE
            WHEN os.stop_geom IS NOT NULL
             AND rc.metric_line IS NOT NULL
            THEN ST_Transform(os.stop_geom, 32650)
            ELSE NULL
        END AS metric_stop,
        CASE
            WHEN os.stop_geom IS NOT NULL
             AND rc.metric_line IS NOT NULL
            THEN ST_LineLocatePoint(
                rc.metric_line,
                ST_Transform(os.stop_geom, 32650)
            )
            ELSE NULL
        END AS raw_progress_ratio
    FROM ordered_stops os
    LEFT JOIN route_context rc
      ON rc.route_id = os.route_id
),
effective_projections AS (
    SELECT
        *,
        CASE
            WHEN stop_sequence = first_sequence THEN 0.0
            WHEN stop_sequence = last_sequence THEN 1.0
            ELSE raw_progress_ratio
        END AS progress_ratio
    FROM raw_projections
),
progress_checks AS (
    SELECT
        *,
        LAG(progress_ratio) OVER (
            ORDER BY stop_sequence
        ) AS previous_progress_ratio
    FROM effective_projections
),
route_summary AS (
    SELECT
        EXISTS (
            SELECT 1
            FROM public.routes
            WHERE route_id = 'route_000185'
        ) AS route_exists,
        COALESCE(
            BOOL_OR(ST_NumGeometries(geom) >= 1),
            false
        ) AS source_has_geometry,
        COALESCE(
            BOOL_OR(
                ST_GeometryType(merged_geom) = 'ST_LineString'
            ),
            false
        ) AS merged_is_linestring,
        COALESCE(
            BOOL_OR(ST_Length(metric_line) > 0),
            false
        ) AS route_has_positive_length,
        COALESCE(
            BOOL_OR(
                CASE
                    WHEN metric_line IS NULL THEN false
                    ELSE ST_Distance(
                        ST_StartPoint(metric_line),
                        ST_EndPoint(metric_line)
                    ) <= 5
                END
            ),
            false
        ) AS endpoints_within_5_meters,
        MAX(ST_Length(metric_line)) AS total_length_meters,
        MAX(
            CASE
                WHEN metric_line IS NULL THEN NULL
                ELSE ST_Distance(
                    ST_StartPoint(metric_line),
                    ST_EndPoint(metric_line)
                )
            END
        ) AS endpoint_distance_meters
    FROM route_context
),
stop_summary AS (
    SELECT
        COUNT(*) AS stop_count,
        COUNT(DISTINCT stop_sequence) AS distinct_sequence_count,
        MIN(stop_sequence) AS min_stop_sequence,
        MAX(stop_sequence) AS max_stop_sequence,
        COUNT(*) FILTER (
            WHERE stop_geom IS NULL
        ) AS missing_stop_reference_count,
        COUNT(*) FILTER (
            WHERE raw_progress_ratio IS NULL
        ) AS missing_projection_count,
        COALESCE(
            BOOL_AND(
                progress_ratio > previous_progress_ratio
            ) FILTER (
                WHERE stop_sequence > first_sequence
                  AND stop_sequence < last_sequence
            ),
            false
        ) AS middle_progress_strictly_increasing,
        COUNT(*) FILTER (
            WHERE stop_sequence > first_sequence
              AND stop_sequence < last_sequence
              AND progress_ratio <= previous_progress_ratio
        ) AS non_increasing_middle_stop_count,
        ARRAY_AGG(
            stop_sequence
            ORDER BY stop_sequence
        ) FILTER (
            WHERE stop_sequence > first_sequence
              AND stop_sequence < last_sequence
              AND progress_ratio <= previous_progress_ratio
        ) AS non_increasing_stop_sequence_list,
        COUNT(*) FILTER (
            WHERE metric_stop IS NOT NULL
              AND metric_line IS NOT NULL
              AND ST_Distance(
                    metric_stop,
                    ST_LineInterpolatePoint(
                        metric_line,
                        progress_ratio
                    )
                  ) > 50
        ) AS snap_offset_over_50m_count,
        MAX(
            CASE
                WHEN metric_stop IS NOT NULL
                 AND metric_line IS NOT NULL
                THEN ST_Distance(
                    metric_stop,
                    ST_LineInterpolatePoint(
                        metric_line,
                        progress_ratio
                    )
                )
                ELSE NULL
            END
        ) AS max_snap_offset_meters
    FROM progress_checks
)
SELECT
    rs.route_exists,
    rs.source_has_geometry,
    rs.merged_is_linestring,
    rs.route_has_positive_length,
    ROUND(rs.total_length_meters::numeric, 3) AS total_length_meters,
    ROUND(rs.endpoint_distance_meters::numeric, 3) AS endpoint_distance_meters,
    rs.endpoints_within_5_meters,
    ss.stop_count,
    ss.distinct_sequence_count,
    ss.min_stop_sequence,
    ss.max_stop_sequence,
    ss.missing_stop_reference_count,
    ss.missing_projection_count,
    ss.middle_progress_strictly_increasing,
    ss.non_increasing_middle_stop_count,
    ss.non_increasing_stop_sequence_list,
    ss.snap_offset_over_50m_count,
    ROUND(ss.max_snap_offset_meters::numeric, 3) AS max_snap_offset_meters,
    (
        rs.route_exists
        AND rs.source_has_geometry
        AND rs.merged_is_linestring
        AND rs.route_has_positive_length
        AND rs.endpoints_within_5_meters
        AND ss.stop_count = 39
        AND ss.distinct_sequence_count = 39
        AND ss.min_stop_sequence = 1
        AND ss.max_stop_sequence = 39
        AND ss.missing_stop_reference_count = 0
        AND ss.missing_projection_count = 0
        AND ss.middle_progress_strictly_increasing
        AND ss.snap_offset_over_50m_count = 0
    ) AS original_independent_projection_success
FROM route_summary rs
CROSS JOIN stop_summary ss;

-- ============================================================
-- 8. 按 stop_sequence 约束的递归单调投影逐站明细
--
-- 与第 6 节的原始独立投影不同，本节从第一站开始按站序递归：
-- - 第一站锚定为全局 progress 0；
-- - 中间站只使用上一站之后、50 米范围内的有序线段候选；
-- - 最后一站根据动态 stop_count 判断并锚定为全局 progress 1。
--
-- 为什么不直接在整个剩余 LineString 上再次调用 ST_LineLocatePoint：
-- 第 6 站在返程线段上的几何距离更近，会直接跳到线路后半段。这里将
-- 线路拆成有序线段，把每个线段内部的局部比例按累计线段长度换算为
-- 整条线路的全局 progress，再选择最早的合理候选区间。
--
-- raw_progress_ratio 继续保留，便于直接比较独立投影与单调投影。
-- ============================================================

WITH RECURSIVE route_context AS (
    SELECT
        r.route_id,
        ST_Transform(
            ST_LineMerge(r.geom),
            32650
        ) AS metric_line
    FROM public.routes r
    WHERE r.route_id = 'route_000185'
      AND ST_GeometryType(
            ST_LineMerge(r.geom)
          ) = 'ST_LineString'
),
route_segments AS (
    SELECT
        rc.route_id,
        dump.path[1] AS segment_index,
        dump.geom AS segment_geom,
        ST_Length(dump.geom) AS segment_length_meters,
        COALESCE(
            SUM(ST_Length(dump.geom)) OVER (
                ORDER BY dump.path[1]
                ROWS BETWEEN UNBOUNDED PRECEDING
                    AND 1 PRECEDING
            ),
            0.0
        ) AS segment_start_distance_meters
    FROM route_context rc
    CROSS JOIN LATERAL
        ST_DumpSegments(rc.metric_line) AS dump
),
ordered_stops AS (
    SELECT
        rs.route_id,
        rs.stop_id,
        s.stop_name,
        rs.stop_sequence,
        ST_Transform(s.geom, 32650) AS metric_stop,
        rc.metric_line,
        ST_Length(rc.metric_line) AS total_length_meters,
        ST_LineLocatePoint(
            rc.metric_line,
            ST_Transform(s.geom, 32650)
        ) AS raw_progress_ratio,
        ROW_NUMBER() OVER (
            ORDER BY rs.stop_sequence
        ) AS stop_order,
        COUNT(*) OVER () AS stop_count
    FROM public.route_stops rs
    JOIN public.stops s
      ON s.stop_id = rs.stop_id
    JOIN route_context rc
      ON rc.route_id = rs.route_id
    WHERE rs.route_id = 'route_000185'
),
monotonic_stops AS (
    SELECT
        os.*,
        0.0::double precision AS progress_ratio
    FROM ordered_stops os
    WHERE os.stop_order = 1

    UNION ALL

    SELECT
        os.*,
        CASE
            WHEN os.stop_order = os.stop_count
                THEN 1.0::double precision
            WHEN previous.progress_ratio >= 1.0
                THEN 1.0::double precision
            ELSE candidate.progress_ratio
        END AS progress_ratio
    FROM monotonic_stops previous
    JOIN ordered_stops os
      ON os.stop_order = previous.stop_order + 1
    LEFT JOIN LATERAL (
        WITH candidate_segments AS (
            SELECT
                (
                    segment.segment_start_distance_meters
                    + segment.segment_length_meters
                    * ST_LineLocatePoint(
                        segment.segment_geom,
                        os.metric_stop
                    )
                ) / previous.total_length_meters
                    AS progress_ratio,
                ST_Distance(
                    segment.segment_geom,
                    os.metric_stop
                ) AS snap_offset_meters,
                segment.segment_index
                    - ROW_NUMBER() OVER (
                        ORDER BY segment.segment_index
                    ) AS candidate_group
            FROM route_segments segment
            WHERE ST_DWithin(
                    segment.segment_geom,
                    os.metric_stop,
                    50.0
                )
              AND (
                    segment.segment_start_distance_meters
                    + segment.segment_length_meters
                    * ST_LineLocatePoint(
                        segment.segment_geom,
                        os.metric_stop
                    )
                  ) / previous.total_length_meters
                    > previous.progress_ratio
        ),
        ranked_candidates AS (
            SELECT
                candidate_segments.*,
                MIN(progress_ratio) OVER (
                    PARTITION BY candidate_group
                ) AS candidate_group_start
            FROM candidate_segments
        )
        SELECT progress_ratio
        FROM ranked_candidates
        ORDER BY
            candidate_group_start,
            snap_offset_meters,
            progress_ratio
        LIMIT 1
    ) candidate
      ON os.stop_order < os.stop_count
),
projection_checks AS (
    SELECT
        ms.*,
        ms.total_length_meters
            * ms.progress_ratio
            AS distance_along_route_meters,
        ST_Distance(
            ms.metric_stop,
            ST_LineInterpolatePoint(
                ms.metric_line,
                ms.progress_ratio
            )
        ) AS snap_offset_meters,
        LAG(ms.progress_ratio) OVER (
            ORDER BY ms.stop_sequence
        ) AS previous_progress_ratio,
        LAG(
            ms.total_length_meters * ms.progress_ratio
        ) OVER (
            ORDER BY ms.stop_sequence
        ) AS previous_distance_along_route_meters
    FROM monotonic_stops ms
)
SELECT
    stop_sequence,
    stop_id,
    stop_name,
    ROUND(raw_progress_ratio::numeric, 9)
        AS original_raw_progress_ratio,
    ROUND(progress_ratio::numeric, 9)
        AS progress_ratio,
    ROUND(distance_along_route_meters::numeric, 3)
        AS distance_along_route_meters,
    ROUND(snap_offset_meters::numeric, 3)
        AS snap_offset_meters,
    CASE
        WHEN previous_progress_ratio IS NULL THEN NULL
        ELSE progress_ratio > previous_progress_ratio
    END AS progress_strictly_increases,
    CASE
        WHEN previous_distance_along_route_meters IS NULL THEN NULL
        ELSE distance_along_route_meters
            > previous_distance_along_route_meters
    END AS distance_strictly_increases
FROM projection_checks
ORDER BY stop_sequence;

-- ============================================================
-- 9. 递归单调投影汇总与靠站状态机前置条件
--
-- 50 米沿用项目原验证脚本中的站点匹配质量阈值。
-- 若 offset_over_50m_stop_count 大于 0，不会调整 progress 掩盖问题；
-- offending_stops 会明确列出需要继续检查的站点。
-- ============================================================

WITH RECURSIVE route_context AS (
    SELECT
        r.route_id,
        ST_Transform(
            ST_LineMerge(r.geom),
            32650
        ) AS metric_line
    FROM public.routes r
    WHERE r.route_id = 'route_000185'
      AND ST_GeometryType(
            ST_LineMerge(r.geom)
          ) = 'ST_LineString'
),
route_segments AS (
    SELECT
        rc.route_id,
        dump.path[1] AS segment_index,
        dump.geom AS segment_geom,
        ST_Length(dump.geom) AS segment_length_meters,
        COALESCE(
            SUM(ST_Length(dump.geom)) OVER (
                ORDER BY dump.path[1]
                ROWS BETWEEN UNBOUNDED PRECEDING
                    AND 1 PRECEDING
            ),
            0.0
        ) AS segment_start_distance_meters
    FROM route_context rc
    CROSS JOIN LATERAL
        ST_DumpSegments(rc.metric_line) AS dump
),
ordered_stops AS (
    SELECT
        rs.route_id,
        rs.stop_id,
        s.stop_name,
        rs.stop_sequence,
        ST_Transform(s.geom, 32650) AS metric_stop,
        rc.metric_line,
        ST_Length(rc.metric_line) AS total_length_meters,
        ROW_NUMBER() OVER (
            ORDER BY rs.stop_sequence
        ) AS stop_order,
        COUNT(*) OVER () AS stop_count
    FROM public.route_stops rs
    JOIN public.stops s
      ON s.stop_id = rs.stop_id
    JOIN route_context rc
      ON rc.route_id = rs.route_id
    WHERE rs.route_id = 'route_000185'
),
monotonic_stops AS (
    SELECT
        os.*,
        0.0::double precision AS progress_ratio
    FROM ordered_stops os
    WHERE os.stop_order = 1

    UNION ALL

    SELECT
        os.*,
        CASE
            WHEN os.stop_order = os.stop_count
                THEN 1.0::double precision
            WHEN previous.progress_ratio >= 1.0
                THEN 1.0::double precision
            ELSE candidate.progress_ratio
        END AS progress_ratio
    FROM monotonic_stops previous
    JOIN ordered_stops os
      ON os.stop_order = previous.stop_order + 1
    LEFT JOIN LATERAL (
        WITH candidate_segments AS (
            SELECT
                (
                    segment.segment_start_distance_meters
                    + segment.segment_length_meters
                    * ST_LineLocatePoint(
                        segment.segment_geom,
                        os.metric_stop
                    )
                ) / previous.total_length_meters
                    AS progress_ratio,
                ST_Distance(
                    segment.segment_geom,
                    os.metric_stop
                ) AS snap_offset_meters,
                segment.segment_index
                    - ROW_NUMBER() OVER (
                        ORDER BY segment.segment_index
                    ) AS candidate_group
            FROM route_segments segment
            WHERE ST_DWithin(
                    segment.segment_geom,
                    os.metric_stop,
                    50.0
                )
              AND (
                    segment.segment_start_distance_meters
                    + segment.segment_length_meters
                    * ST_LineLocatePoint(
                        segment.segment_geom,
                        os.metric_stop
                    )
                  ) / previous.total_length_meters
                    > previous.progress_ratio
        ),
        ranked_candidates AS (
            SELECT
                candidate_segments.*,
                MIN(progress_ratio) OVER (
                    PARTITION BY candidate_group
                ) AS candidate_group_start
            FROM candidate_segments
        )
        SELECT progress_ratio
        FROM ranked_candidates
        ORDER BY
            candidate_group_start,
            snap_offset_meters,
            progress_ratio
        LIMIT 1
    ) candidate
      ON os.stop_order < os.stop_count
),
projection_checks AS (
    SELECT
        ms.*,
        ms.total_length_meters
            * ms.progress_ratio
            AS distance_along_route_meters,
        ST_Distance(
            ms.metric_stop,
            ST_LineInterpolatePoint(
                ms.metric_line,
                ms.progress_ratio
            )
        ) AS snap_offset_meters,
        LAG(ms.progress_ratio) OVER (
            ORDER BY ms.stop_sequence
        ) AS previous_progress_ratio,
        LAG(
            ms.total_length_meters * ms.progress_ratio
        ) OVER (
            ORDER BY ms.stop_sequence
        ) AS previous_distance_along_route_meters
    FROM monotonic_stops ms
),
projection_summary AS (
    SELECT
        COUNT(*) AS stop_count,
        COUNT(*) FILTER (
            WHERE previous_progress_ratio IS NOT NULL
              AND (
                    progress_ratio <= previous_progress_ratio
                    OR distance_along_route_meters
                        <= previous_distance_along_route_meters
                  )
        ) AS non_monotonic_stop_count,
        MAX(snap_offset_meters) AS max_snap_offset_meters,
        AVG(snap_offset_meters) AS avg_snap_offset_meters,
        COUNT(*) FILTER (
            WHERE snap_offset_meters > 50
        ) AS offset_over_50m_stop_count,
        ARRAY_AGG(
            FORMAT(
                '%s:%s(%sm)',
                stop_sequence,
                stop_name,
                ROUND(snap_offset_meters::numeric, 3)
            )
            ORDER BY stop_sequence
        ) FILTER (
            WHERE snap_offset_meters > 50
        ) AS offending_stops,
        MIN(progress_ratio) FILTER (
            WHERE stop_order = 1
        ) AS first_progress_ratio,
        MAX(progress_ratio) FILTER (
            WHERE stop_order = stop_count
        ) AS last_progress_ratio,
        MIN(distance_along_route_meters) FILTER (
            WHERE stop_order = 1
        ) AS first_distance_meters,
        MAX(distance_along_route_meters) FILTER (
            WHERE stop_order = stop_count
        ) AS last_distance_meters,
        MAX(total_length_meters) AS total_length_meters
    FROM projection_checks
)
SELECT
    stop_count,
    non_monotonic_stop_count,
    ROUND(max_snap_offset_meters::numeric, 3)
        AS max_snap_offset_meters,
    ROUND(avg_snap_offset_meters::numeric, 3)
        AS avg_snap_offset_meters,
    offset_over_50m_stop_count,
    offending_stops,
    ROUND(first_progress_ratio::numeric, 9)
        AS first_progress_ratio,
    ROUND(last_progress_ratio::numeric, 9)
        AS last_progress_ratio,
    ROUND(first_distance_meters::numeric, 3)
        AS first_distance_meters,
    ROUND(last_distance_meters::numeric, 3)
        AS last_distance_meters,
    ROUND(total_length_meters::numeric, 3)
        AS total_length_meters,
    (
        non_monotonic_stop_count = 0
        AND first_progress_ratio = 0
        AND last_progress_ratio = 1
        AND first_distance_meters = 0
        AND ABS(
            last_distance_meters - total_length_meters
        ) <= 0.001
        AND offset_over_50m_stop_count = 0
    ) AS ready_for_stop_state_machine
FROM projection_summary;

COMMIT;
