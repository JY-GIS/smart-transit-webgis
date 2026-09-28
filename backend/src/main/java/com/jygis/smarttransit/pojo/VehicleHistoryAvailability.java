package com.jygis.smarttransit.pojo;

import lombok.Data;

import java.time.Instant;

/**
 * 一辆可以进行历史回放的车辆。
 */
@Data
public class VehicleHistoryAvailability {

    private String vehicleId;
    private String routeId;

    // 前端可以继续复用当前线路选择和高亮逻辑
    private Integer routeFid;

    private String routeName;

    // 当前车辆最早可以回放到什么时间
    private Instant firstRecordedAt;

    // 当前车辆最晚可以回放到什么时间
    private Instant lastRecordedAt;

    // 当前车辆一共有多少个历史位置点
    private Long pointCount;
}