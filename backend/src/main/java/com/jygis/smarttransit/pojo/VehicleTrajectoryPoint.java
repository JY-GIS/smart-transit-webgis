package com.jygis.smarttransit.pojo;

import lombok.Data;

import java.time.Instant;

/**
 * 历史轨迹中的一个位置点。
 * - ( 一辆车的轨迹由多个VehicleTrajectoryPoint组成，每个点都有自己的时间、坐标、速度和状态 )
 */
@Data
public class VehicleTrajectoryPoint {

    // 当前位置的采样时间
    private Instant recordedAt;

    private Double longitude;
    private Double latitude;

    private Double distanceMeters;

    private Double totalDistanceMeters;

    private Double routeProgressPercent;

    private Double speedMetersPerSecond;

    // 车辆当时处于巡航、进站还是停站
    private VehicleMotionStatus motionStatus;

    // 车辆当时的间隔是否正常
    private VehicleOperationalStatus operationalStatus;
}