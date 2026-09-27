package com.jygis.smarttransit.pojo;

/**
 * 一辆车辆相对于用户所查询站点的到站状态。
 */
public enum StopArrivalStatus {

    // 车辆正在用户查询的目标站停靠
    AT_STOP,

    // 下一站即将到达
    APPROACHING,

    // 车辆到达目标站前还需要经过其他站点
    IN_TRANSIT
}