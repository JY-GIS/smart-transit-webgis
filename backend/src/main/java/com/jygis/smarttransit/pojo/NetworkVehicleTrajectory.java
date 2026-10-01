package com.jygis.smarttransit.pojo;

import java.util.Objects;

/**
 * 全网回放中的一辆车及其所属线路。
 */
public record NetworkVehicleTrajectory(

        String routeId,
        int routeFid,
        String routeName,

        VehicleTrajectory trajectory
) {
    public NetworkVehicleTrajectory {

        Objects.requireNonNull(routeId, "routeId 不能为空");
        Objects.requireNonNull(routeName, "routeName 不能为空");
        Objects.requireNonNull(trajectory, "trajectory 不能为空");

        if (routeId.isBlank()) {
            throw new IllegalArgumentException("routeId 不能为空字符串");
        }

        if (routeName.isBlank()) {
            throw new IllegalArgumentException("routeName 不能为空字符串");
        }
    }
}