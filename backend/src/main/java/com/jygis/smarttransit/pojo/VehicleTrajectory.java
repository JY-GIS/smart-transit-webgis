package com.jygis.smarttransit.pojo;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * 一辆车在一段时间内的完整历史轨迹。
 */
public record VehicleTrajectory(

        String vehicleId,

        // 实际返回的第一个轨迹点时间
        Instant startTime,

        // 实际返回的最后一个轨迹点时间
        Instant endTime,

        int pointCount,

        double averageSpeedMetersPerSecond,

        double maximumSpeedMetersPerSecond,

        List<VehicleTrajectoryPoint> points
) {
    public VehicleTrajectory {

        Objects.requireNonNull(vehicleId, "vehicleId 不能为空");
        Objects.requireNonNull(startTime, "startTime 不能为空");
        Objects.requireNonNull(endTime, "endTime 不能为空");
        Objects.requireNonNull(points, "points 不能为空");

        if (vehicleId.isBlank()) {
            throw new IllegalArgumentException("vehicleId 不能为空字符串");
        }

        if (pointCount != points.size()) {
            throw new IllegalArgumentException("pointCount 必须与轨迹点数量一致");
        }

        if (pointCount < 2) {
            throw new IllegalArgumentException("历史轨迹至少需要两个位置点");
        }

        if (endTime.isBefore(startTime)) {
            throw new IllegalArgumentException("endTime 不能早于 startTime");
        }

        if (!Double.isFinite(averageSpeedMetersPerSecond) || averageSpeedMetersPerSecond < 0) {
            throw new IllegalArgumentException("平均速度必须是有限非负数");
        }

        if (!Double.isFinite(maximumSpeedMetersPerSecond) || maximumSpeedMetersPerSecond < 0) {
            throw new IllegalArgumentException("最大速度必须是有限非负数");
        }

        points = List.copyOf(points);
    }
}