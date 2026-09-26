package com.jygis.smarttransit.pojo;

import java.util.Objects;

/**
 * 一辆车辆在当前 tick 中提交给 PostGIS 的位置插值请求。
 *
 * 批量优化前：一辆车调用一次 Mapper；
 * 批量优化后：先为全部车辆创建 VehiclePositionQuery，再把整个 List 一次性交给 Mapper；
 */
public record VehiclePositionQuery(

        String vehicleId,

        String routeId,

        // 当前有效模拟子线在原始线路上的起点进度 - ( ORIGINAL_LINE 通常为 0 )
        double sourceStartProgressRatio,

        // 当前有效模拟子线在原始线路上的终点进度 - ( ORIGINAL_LINE 通常为 1 )
        double sourceEndProgressRatio,

        // 车辆在当前有效模拟线路上的进度，范围为 0～1
        double progressRatio
) {

    /**
     * 在不可变对象真正创建之前统一校验和整理所有参数。
     *  - 在数据进入批量查询边界时立即拒绝非法值。
     *（ 如果不在这里校验，一个错误进度可能导致整批SQL失败，使其他本来正常的车辆也无法取得坐标 ）
     */
    public VehiclePositionQuery {
        Objects.requireNonNull(vehicleId,"vehicleId 不能为空");

        Objects.requireNonNull(routeId,"routeId 不能为空");

        vehicleId = vehicleId.trim();
        routeId = routeId.trim();

        if (vehicleId.isEmpty()) {
            throw new IllegalArgumentException("vehicleId 不能为空字符串");
        }

        if (routeId.isEmpty()) {
            throw new IllegalArgumentException("routeId 不能为空字符串");
        }

        if (!Double.isFinite(sourceStartProgressRatio)
                || !Double.isFinite(sourceEndProgressRatio)
                || sourceStartProgressRatio < 0 || sourceEndProgressRatio > 1
                || sourceStartProgressRatio >= sourceEndProgressRatio) {

            throw new IllegalArgumentException("线路原始进度区间无效：" + routeId);
        }

        if (!Double.isFinite(progressRatio) || progressRatio < 0 || progressRatio > 1) {

            throw new IllegalArgumentException("车辆进度必须是0～1之间的有限数字：" + vehicleId);
        }
    }
}
