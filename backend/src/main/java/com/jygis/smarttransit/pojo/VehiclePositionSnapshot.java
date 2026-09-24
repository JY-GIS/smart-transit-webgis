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

        // 当前线路在计划车辆数量下的参考正常间隔
        Double referenceHeadwayMeters,

        // 根据实际间隔与参考间隔判断出的运营状态
        VehicleOperationalStatus operationalStatus,

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
                referenceHeadwayMeters,
                operationalStatus,
                previousStop,
                nextStop,
                distanceToNextStopMeters
        );
    }
    /**
     * 返回补充了前车关系和运营间隔分析结果的新快照。
     * 使用 with 方法创建一个新快照：
     * - 保留车辆位置、速度和站点信息；
     * - 替换前车、间隔、参考间隔和运营状态。
     */
    public VehiclePositionSnapshot withHeadwayInformation(
            String newFrontVehicleId,
            Double newDistanceToFrontVehicleMeters,
            Double newReferenceHeadwayMeters,
            VehicleOperationalStatus newOperationalStatus
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
                newReferenceHeadwayMeters,
                newOperationalStatus,
                previousStop,
                nextStop,
                distanceToNextStopMeters
        );
    }
}