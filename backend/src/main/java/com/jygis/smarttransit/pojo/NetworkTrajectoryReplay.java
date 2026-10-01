package com.jygis.smarttransit.pojo;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * 全部历史车辆在同一时间范围内的回放数据。
 */
public record NetworkTrajectoryReplay(

        Instant startTime,
        Instant endTime,

        int routeCount,

        int vehicleCount,

        int totalPointCount,

        List<NetworkVehicleTrajectory> trajectories,

        List<String> unavailableVehicleIds
) {
    public NetworkTrajectoryReplay {

        Objects.requireNonNull(startTime, "startTime 不能为空");
        Objects.requireNonNull(endTime, "endTime 不能为空");
        Objects.requireNonNull(trajectories, "trajectories 不能为空");
        Objects.requireNonNull(unavailableVehicleIds, "unavailableVehicleIds 不能为空");

        if (!endTime.isAfter(startTime)) {
            throw new IllegalArgumentException("全网回放结束时间必须晚于开始时间");
        }

        if (vehicleCount != trajectories.size()) {
            throw new IllegalArgumentException("vehicleCount 必须与轨迹数量一致");
        }

        long actualRouteCount =
                trajectories
                        .stream()
                        .map(NetworkVehicleTrajectory::routeId)
                        .distinct()
                        .count();

        if (routeCount != actualRouteCount) {
            throw new IllegalArgumentException("routeCount 必须与实际线路数量一致");
        }

        int actualPointCount =
                trajectories
                        .stream()
                        .map(NetworkVehicleTrajectory::trajectory)
                        .mapToInt(VehicleTrajectory::pointCount)
                        .sum();

        if (totalPointCount != actualPointCount) {
            throw new IllegalArgumentException("totalPointCount 必须与实际轨迹点数量一致");
        }

        trajectories = List.copyOf(trajectories);
        unavailableVehicleIds = List.copyOf(unavailableVehicleIds);
    }
}