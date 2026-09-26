package com.jygis.smarttransit.pojo;

import java.util.Objects;

/**
 * 一辆车辆参与批量位置快照计算所需的服务层输入。
 */
public record VehicleSnapshotRequest(

        String vehicleId,

        RouteSimulationProfile routeProfile,

        double accumulatedDistanceMeters
) {

    /**
     * 在请求进入批量服务之前保证基本参数有效。
     */
    public VehicleSnapshotRequest {
        Objects.requireNonNull(vehicleId, "vehicleId 不能为空");

        Objects.requireNonNull(routeProfile, "routeProfile 不能为空");

        vehicleId = vehicleId.trim();

        if (vehicleId.isEmpty()) {
            throw new IllegalArgumentException("vehicleId 不能为空字符串");
        }

        if (!Double.isFinite(accumulatedDistanceMeters) || accumulatedDistanceMeters < 0) {
            throw new IllegalArgumentException("accumulatedDistanceMeters必须是有限非负数");
        }
    }
}