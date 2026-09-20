package com.jygis.smarttransit.pojo;

import lombok.Data;

/**
 * 某个站点在线路上的里程映射结果
 */
@Data
public class RouteStopMeasure {

    private String routeId;

    private String stopId;

    private String stopName;

    private Integer stopSequence;

    // 站点在线路上的进度比例，范围通常为 0～1
    private Double progressRatio;

    // 站点从线路起点开始的累计里程
    private Double distanceAlongRouteMeters;

    // 原始站点到线路投影点的距离
    private Double snapOffsetMeters;
}