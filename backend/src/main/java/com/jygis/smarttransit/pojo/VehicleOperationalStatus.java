package com.jygis.smarttransit.pojo;

/**
 * 公交车辆当前的运营间隔状态。
 */
public enum VehicleOperationalStatus {

    // 当前车辆到前车的沿线距离处于正常范围
    NORMAL,

    // 当前车辆距离前车过近，存在串车现象
    BUNCHING,

    // 当前车辆距离前车过远，形成大间隔
    LARGE_GAP
}