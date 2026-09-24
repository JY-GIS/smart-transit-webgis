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

        // 当前车辆运动状态
        VehicleMotionStatus motionStatus,

        // 当前实际速度，单位为米/秒
        double currentSpeedMetersPerSecond,

        // 同线路、同运行方向上距离当前车辆最近的前车编号
        String frontVehicleId,

        // 当前车辆到前车的线路沿线距离
        Double distanceToFrontVehicleMeters,

        // 最近已经经过的站点
        VehicleStopSnapshot previousStop,

        // 沿运行方向即将到达的站点
        VehicleStopSnapshot nextStop,

        // 距离下一站的线路距离
        Double distanceToNextStopMeters
) {
    /**
     * 返回补充了车辆运行状态的新快照。
     * VehiclePositionSnapshot 是不可变 record，因此通过 with 方法创建包含新状态的完整快照。
     */
    public VehiclePositionSnapshot withMotionState(
            VehicleMotionStatus newMotionStatus,
            double newCurrentSpeedMetersPerSecond
    ) {
        return new VehiclePositionSnapshot(
                vehicleId,
                routeId,
                routeFid,
                longitude,
                latitude,
                distanceMeters,
                totalDistanceMeters,
                routeProgressPercent,
                newMotionStatus,
                newCurrentSpeedMetersPerSecond,
                frontVehicleId,
                distanceToFrontVehicleMeters,
                previousStop,
                nextStop,
                distanceToNextStopMeters
        );
    }

    /**
     * 返回补充了前车关系的新快照。
     * record 是不可变对象，不能直接修改已有字段。因此使用 with 方法创建一个新快照，同时保留车辆原有位置数据。
     */
    public VehiclePositionSnapshot withFrontVehicle(
            String newFrontVehicleId,
            Double newDistanceToFrontVehicleMeters
    ) {
        return new VehiclePositionSnapshot(
                vehicleId,
                routeId,
                routeFid,
                longitude,
                latitude,
                distanceMeters,
                totalDistanceMeters,
                routeProgressPercent,
                motionStatus,
                currentSpeedMetersPerSecond,
                newFrontVehicleId,
                newDistanceToFrontVehicleMeters,
                previousStop,
                nextStop,
                distanceToNextStopMeters
        );
    }
}