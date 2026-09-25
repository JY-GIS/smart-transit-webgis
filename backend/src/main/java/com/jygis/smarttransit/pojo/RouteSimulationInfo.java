package com.jygis.smarttransit.pojo;

import lombok.Data;

/**
 * 车辆模拟所需的线路基础信息
 */
@Data
public class RouteSimulationInfo {

    private String routeId;

    private Integer routeFid;

    private String routeName;

    // 当前线路实际采用的模拟几何策略
    private RouteSimulationLineStrategy lineStrategy;

    // 有效模拟子线在原始合并线路上的起始进度。
    private Double sourceStartProgressRatio;

    // 有效模拟子线在原始合并线路上的结束进度
    private Double sourceEndProgressRatio;

    // 当前有效模拟线路的总长度，单位为米
    private Double totalLengthMeters;
}