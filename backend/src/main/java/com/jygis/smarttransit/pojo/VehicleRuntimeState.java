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

        if (!Double.isFinite(accumulatedDistanceMeters)
                || accumulatedDistanceMeters < 0) {

            throw new IllegalArgumentException(
                    "accumulatedDistanceMeters 必须是有限非负数"
            );
        }
    }
}