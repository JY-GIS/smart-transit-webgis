package com.jygis.smarttransit.pojo;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * 一条线路中多辆车的同步回放数据。
 */
public record RouteTrajectoryReplay(

        String routeId,
        Integer routeFid,
        String routeName,

        Instant startTime,
        Instant endTime,

        int vehicleCount,

        int totalPointCount,

        // 每辆车各自的完整历史轨迹
        List<VehicleTrajectory> trajectories,

        // 在所选时间范围内不足两个轨迹点的车辆
        List<String> unavailableVehicleIds
) {
    public RouteTrajectoryReplay {
        Objects.requireNonNull(routeId, "routeId 不能为空");
        Objects.requireNonNull(routeFid, "routeFid 不能为空");
        Objects.requireNonNull(routeName, "routeName 不能为空");
        Objects.requireNonNull(startTime, "startTime 不能为空");
        Objects.requireNonNull(endTime, "endTime 不能为空");
        Objects.requireNonNull(trajectories, "trajectories 不能为空");
        Objects.requireNonNull(unavailableVehicleIds, "unavailableVehicleIds 不能为空");

        if (routeId.isBlank()) {
            throw new IllegalArgumentException("routeId 不能为空字符串");
        }
        if (routeName.isBlank()) {
            throw new IllegalArgumentException("routeName 不能为空字符串");
        }
        if (!endTime.isAfter(startTime)) {
            throw new IllegalArgumentException("多车回放结束时间必须晚于开始时间");
        }
        if (vehicleCount != trajectories.size()) {
            throw new IllegalArgumentException("vehicleCount 必须与轨迹数量一致");
        }

        int actualTotalPointCount =
                trajectories
                        .stream()
                        .mapToInt(VehicleTrajectory::pointCount)
                        .sum();

        if (totalPointCount != actualTotalPointCount) {
            throw new IllegalArgumentException("totalPointCount 必须与实际轨迹点数量一致");
        }

        trajectories = List.copyOf(trajectories);

        unavailableVehicleIds = List.copyOf(unavailableVehicleIds);
    }
}