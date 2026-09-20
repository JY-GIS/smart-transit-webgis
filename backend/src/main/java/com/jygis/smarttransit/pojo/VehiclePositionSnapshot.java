package com.jygis.smarttransit.pojo;

/**
 * 一辆模拟车辆在某一时刻的位置和线路进度快照
 */
public record VehiclePositionSnapshot(

        // 车辆业务编号，例如 simulated-bus-m103-001
        String vehicleId,

        String routeId,

        int routeFid,

        double longitude,
        double latitude,

        // 车辆从线路起点开始的累计里程
        double distanceMeters,

        double totalDistanceMeters,

        // 当前线路进度百分比，范围为 0～100
        double routeProgressPercent,

        // 最近已经经过的站点
        VehicleStopSnapshot previousStop,

        // 沿运行方向即将到达的站点
        VehicleStopSnapshot nextStop,

        // 距离下一站的线路距离
        Double distanceToNextStopMeters
) {
}