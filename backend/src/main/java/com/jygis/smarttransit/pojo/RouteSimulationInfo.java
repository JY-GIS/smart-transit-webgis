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

    // 合并线路并转换到 EPSG:32650 后计算出的总长度
    private Double totalLengthMeters;
}