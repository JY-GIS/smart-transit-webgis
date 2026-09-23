package com.jygis.smarttransit.pojo;

/**
 * 模拟车辆当前的运动状态。
 */
public enum VehicleMotionStatus {

    // 车辆正在以巡航速度驶向目标站
    CRUISING,

    // 车辆已经到达目标站，正在等待停站结束
    DWELLING
}