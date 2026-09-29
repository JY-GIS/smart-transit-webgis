package com.jygis.smarttransit.pojo;

import lombok.Data;

import java.time.Instant;

/**
 * 线路多车查询返回的一条历史位置。
 */
@Data
public class RouteVehicleTrajectoryPoint {

    private String vehicleId;

    private Instant recordedAt;

    private Double longitude;
    private Double latitude;

    private Double distanceMeters;

    private Double totalDistanceMeters;

    private Double routeProgressPercent;

    private Double speedMetersPerSecond;

    private VehicleMotionStatus motionStatus;

    private VehicleOperationalStatus operationalStatus;
}