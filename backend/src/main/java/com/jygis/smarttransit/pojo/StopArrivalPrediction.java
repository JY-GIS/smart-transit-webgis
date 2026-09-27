package com.jygis.smarttransit.pojo;

import java.time.Instant;
import java.util.Objects;

/**
 * 一辆车辆到达指定线路站点的预测结果。
 */
public record StopArrivalPrediction(

        String vehicleId,

        // 预计还有多少秒到达目标站。
        long etaSeconds,

        // 预计到站的绝对时间。
        Instant predictedArrivalAt,

        // 车辆沿线路前进方向到目标站的剩余距离。
        double distanceToStopMeters,

        /*
         * 到达目标站前还相隔多少站。
         *
         * 0：车辆正在目标站停靠；
         * 1：目标站是车辆下一站；
         * 2：中间还隔着一个站，以此类推。
         */
        int stopsAway,

        // 车辆相对于当前查询站点的状态。
        StopArrivalStatus arrivalStatus,

        // 车辆自身当前的运动状态。
        VehicleMotionStatus motionStatus,

        // 计算本条结果时使用的车辆状态更新时间。
        Instant snapshotUpdatedAt

) {

    public StopArrivalPrediction {

        Objects.requireNonNull(vehicleId, "vehicleId 不能为空");
        Objects.requireNonNull(predictedArrivalAt, "predictedArrivalAt 不能为空");
        Objects.requireNonNull(arrivalStatus, "arrivalStatus 不能为空");
        Objects.requireNonNull(motionStatus, "motionStatus 不能为空");
        Objects.requireNonNull(snapshotUpdatedAt, "snapshotUpdatedAt 不能为空");

        if (vehicleId.isBlank()) {
            throw new IllegalArgumentException("vehicleId 不能为空字符串");
        }

        if (etaSeconds < 0) {
            throw new IllegalArgumentException("etaSeconds 不能小于 0");
        }

        if (!Double.isFinite(distanceToStopMeters) || distanceToStopMeters < 0) {
            throw new IllegalArgumentException("distanceToStopMeters 必须是有限非负数");
        }

        if (stopsAway < 0) {
            throw new IllegalArgumentException("stopsAway 不能小于 0");
        }

        /*
         * 正在目标站停靠时：
         * - ETA 必须为 0；
         * - 剩余距离必须为 0；
         * - 相隔站数必须为 0；
         */
        if (arrivalStatus == StopArrivalStatus.AT_STOP &&
                (etaSeconds != 0 || distanceToStopMeters != 0 || stopsAway != 0)
        ) {
            throw new IllegalArgumentException("AT_STOP 状态的 ETA、剩余距离和相隔站数必须全部为 0");
        }
    }
}