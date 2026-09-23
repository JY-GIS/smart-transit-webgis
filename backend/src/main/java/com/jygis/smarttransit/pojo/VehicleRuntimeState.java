package com.jygis.smarttransit.pojo;

import java.time.Instant;
import java.util.Objects;

/**
 * 一辆车辆在后端模拟引擎中的内部运行状态。
 *
 * 职责：
 * - 保存车辆运行所需的稳定线路档案；
 * - 保存速度和累计运行里程；
 * - 保存上一次更新时间；
 * - 保存最新的对外位置快照。
 */
public record VehicleRuntimeState(

        String vehicleId,

        RouteSimulationProfile routeProfile,

        /**
         * 车辆速度，单位为米/秒。
         */
        double speedMetersPerSecond,

        /**
         * 当前目标站在 RouteSimulationProfile.stops 中的列表索引。
         */
        int targetStopIndex,

        /**
         * 车辆当前运动状态。
         */
        VehicleMotionStatus motionStatus,

        /**
         * 停站结束时刻。
         */
        Instant dwellUntil,

        /**
         * 从模拟启动后累计运行的总里程，单位为米。
         */
        double accumulatedDistanceMeters,

        /**
         * 当前状态最后一次更新时间。
         */
        Instant lastUpdatedAt,

        /**
         * 当前车辆最新的对外位置快照。
         */
        VehiclePositionSnapshot latestSnapshot
) {

    /**
     * 保证 VehicleRuntimeState 创建后始终满足基本约束。
     */
    public VehicleRuntimeState {
        Objects.requireNonNull(
                vehicleId,
                "vehicleId 不能为空"
        );

        Objects.requireNonNull(
                routeProfile,
                "routeProfile 不能为空"
        );

        Objects.requireNonNull(
                motionStatus,
                "motionStatus 不能为空"
        );

        Objects.requireNonNull(
                lastUpdatedAt,
                "lastUpdatedAt 不能为空"
        );

        Objects.requireNonNull(
                latestSnapshot,
                "latestSnapshot 不能为空"
        );

        if (vehicleId.isBlank()) {
            throw new IllegalArgumentException(
                    "vehicleId 不能为空字符串"
            );
        }

        if (!Double.isFinite(speedMetersPerSecond)
                || speedMetersPerSecond <= 0) {

            throw new IllegalArgumentException(
                    "speedMetersPerSecond 必须是有限正数"
            );
        }

        if (routeProfile.stops().isEmpty()) {
            throw new IllegalArgumentException("车辆运行线路不能没有站点");
        }

        if (targetStopIndex < 0 || targetStopIndex >= routeProfile.stops().size()) {

            throw new IllegalArgumentException(
                    "targetStopIndex 超出线路站点范围"
            );
        }

        /*
         * 运行状态和停站结束时间必须保持一致
         */
        if (motionStatus == VehicleMotionStatus.CRUISING && dwellUntil != null) {

            throw new IllegalArgumentException(
                    "CRUISING 状态不能提供 dwellUntil"  // CRUISING 不应该携带停站结束时间
            );
        }

        if (motionStatus == VehicleMotionStatus.DWELLING
                && dwellUntil == null) {

            throw new IllegalArgumentException(
                    "DWELLING 状态必须提供 dwellUntil"  // DWELLING 必须知道什么时候结束停站
            );
        }

        if (!Double.isFinite(accumulatedDistanceMeters)
                || accumulatedDistanceMeters < 0) {

            throw new IllegalArgumentException(
                    "accumulatedDistanceMeters 必须是有限非负数"
            );
        }
    }

    /**
     * 根据内部索引返回当前目标站。
     */
    public RouteStopMeasure targetStop() {
        return routeProfile
                .stops()
                .get(targetStopIndex);
    }
}