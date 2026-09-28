package com.jygis.smarttransit.pojo;

import java.time.Instant;
import java.util.Objects;

/**
 * 准备写入数据库的一条车辆历史位置记录。
 */
public record VehiclePositionHistoryRecord(

        String vehicleId,
        String routeId,

        /*
         * Instant：表示时间轴上的一个确定时刻，不携带“北京时间”或“UTC+8”这样的显示时区。
         * ( PostgreSQL timestamptz 和 Instant 非常适合对应 )
         */
        Instant recordedAt,

        double longitude,
        double latitude,

        double distanceMeters,
        double totalDistanceMeters,

        double routeProgressPercent,

        double speedMetersPerSecond,

        VehicleMotionStatus motionStatus,

        VehicleOperationalStatus operationalStatus
) {

    /**
     * 将当前公开车辆快照转换成数据库历史记录。
     * recordedAt 由外部统一传入，而不是在这个方法中调用 Instant.now()。
     * 原因：
     * 同一批车辆必须共享相同的采样时间。
     * 如果每转换一辆车都调用一次 Instant.now()，同一轮采样中的车辆时间会产生细微差异。
     */
    public static VehiclePositionHistoryRecord fromSnapshot(
            VehiclePositionSnapshot snapshot,
            Instant recordedAt
    ) {
        Objects.requireNonNull(snapshot, "snapshot 不能为空");

        Objects.requireNonNull(recordedAt, "recordedAt 不能为空");

        return new VehiclePositionHistoryRecord(
                snapshot.vehicleId(),
                snapshot.routeId(),
                recordedAt,
                snapshot.longitude(),
                snapshot.latitude(),
                snapshot.distanceMeters(),
                snapshot.totalDistanceMeters(),
                snapshot.routeProgressPercent(),
                snapshot.currentSpeedMetersPerSecond(),
                snapshot.motionStatus(),
                snapshot.operationalStatus()
        );
    }
}