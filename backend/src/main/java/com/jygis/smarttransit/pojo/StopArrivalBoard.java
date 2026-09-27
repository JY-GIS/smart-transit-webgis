package com.jygis.smarttransit.pojo;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * 一个 “线路站点 ”的完整到站查询结果。
 */
public record StopArrivalBoard(

        String routeId,

        String routeName,

        String stopId,

        String stopName,

        int stopSequence,

        // 本次整块到站牌的计算时刻。
        Instant generatedAt,

        // 按 ETA 从小到大排序的到站车辆。
        List<StopArrivalPrediction> arrivals

) {

    public StopArrivalBoard {

        Objects.requireNonNull(routeId, "routeId 不能为空");
        Objects.requireNonNull(routeName, "routeName 不能为空");
        Objects.requireNonNull(stopId, "stopId 不能为空");
        Objects.requireNonNull(stopName, "stopName 不能为空");
        Objects.requireNonNull(generatedAt, "generatedAt 不能为空");
        Objects.requireNonNull(arrivals, "arrivals 不能为空");

        if (routeId.isBlank()) {
            throw new IllegalArgumentException("routeId 不能为空字符串");
        }
        if (routeName.isBlank()) {
            throw new IllegalArgumentException("routeName 不能为空字符串");
        }
        if (stopId.isBlank()) {
            throw new IllegalArgumentException("stopId 不能为空字符串");
        }
        if (stopName.isBlank()) {
            throw new IllegalArgumentException("stopName 不能为空字符串");
        }
        if (stopSequence <= 0) {
            throw new IllegalArgumentException("stopSequence 必须大于 0");
        }

        arrivals = List.copyOf(arrivals);
    }
}