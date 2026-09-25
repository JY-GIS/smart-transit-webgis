package com.jygis.smarttransit.service;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * 单次车辆模拟 tick 的轻量运行指标。
 */
@Component
public class VehicleSimulationMetrics {

    // 当前 tick 已尝试执行的 PostGIS 车辆位置查询数量
    private final AtomicInteger positionQueryCount = new AtomicInteger();

    // 开始新一轮 tick 时清零
    public void beginTick() {
        positionQueryCount.set(0);
    }

    // 每次调用 findPositionAtProgress 前记录一次
    public void recordPositionQuery() {
        positionQueryCount.incrementAndGet();
    }

    // 返回当前 tick 的位置查询次数
    public int positionQueryCount() {
        return positionQueryCount.get();
    }
}