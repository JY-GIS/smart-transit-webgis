package com.jygis.smarttransit.task;

import com.jygis.smarttransit.pojo.RouteSimulationProfile;
import com.jygis.smarttransit.pojo.VehicleMotionStatus;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleRuntimeState;
import com.jygis.smarttransit.pojo.VehicleSnapshotRequest;

import java.time.Instant;
import java.util.Objects;

/**
 * 等待批量位置快照查询完成的车辆状态更新。
 */
record PendingVehicleUpdate(

        String vehicleId,

        RouteSimulationProfile routeProfile,

        double speedMetersPerSecond,

        double currentSpeedMetersPerSecond,

        int targetStopIndex,

        VehicleMotionStatus motionStatus,

        Instant dwellUntil,

        double accumulatedDistanceMeters,

        Instant updatedAt,

        // 区分首次初始化和普通推进，只用于完成更新后的日志输出
        boolean initialization
) {

    PendingVehicleUpdate {
        Objects.requireNonNull(vehicleId, "vehicleId不能为空");
        Objects.requireNonNull(routeProfile, "routeProfile不能为空");
        Objects.requireNonNull(motionStatus, "motionStatus不能为空");
        Objects.requireNonNull(updatedAt, "updatedAt不能为空");
    }

    /**
     * 将等待中的状态转换成批量快照服务请求。
     */
    VehicleSnapshotRequest toSnapshotRequest() {
        return new VehicleSnapshotRequest(
                vehicleId,
                routeProfile,
                accumulatedDistanceMeters
        );
    }

    /**
     * 将批量查询返回的快照补入车辆状态。
     */
    VehicleRuntimeState toRuntimeState(VehiclePositionSnapshot snapshot) {
        Objects.requireNonNull(snapshot, "snapshot不能为空");

        if (!vehicleId.equals(snapshot.vehicleId())) {
            throw new IllegalArgumentException(
                    "快照vehicleId与等待更新的车辆不一致：" +
                    vehicleId + " != " + snapshot.vehicleId()
            );
        }

        return new VehicleRuntimeState(
                vehicleId,
                routeProfile,
                speedMetersPerSecond,
                currentSpeedMetersPerSecond,
                targetStopIndex,
                motionStatus,
                dwellUntil,
                accumulatedDistanceMeters,
                updatedAt,
                snapshot
        );
    }
}