package com.jygis.smarttransit.pojo;

import java.util.List;
import java.util.Objects;

/**
 * 一条线路用于车辆模拟的完整只读档案。
 *
 * 职责：
 * - 组合线路基础信息；
 * - 组合按站序排列的站点里程；
 * - 避免车辆每次位置计算时重复查询线路长度和全部站点。
 */
public record RouteSimulationProfile(

        RouteSimulationInfo routeInfo,

        List<RouteStopMeasure> stops
) {

    /**
     * record 的紧凑构造方法。
     *
     * 【★★：需要理解并能够查文档使用】
     *
     * 紧凑构造方法不需要重复写完整参数列表。
     * 在构造对象前，可以统一校验和规范化 record 组件。
     */
    public RouteSimulationProfile {

        /*
         * Objects.requireNonNull 在对象创建边界立即拒绝 null
         */
        Objects.requireNonNull(
                routeInfo,
                "routeInfo 不能为空"
        );

        Objects.requireNonNull(
                stops,
                "stops 不能为空"
        );

        /*
         * List.copyOf 创建一个不可增删的列表副本
         * - List.copyOf 只保证列表结构不可修改
         */
        stops = List.copyOf(stops);
    }
}