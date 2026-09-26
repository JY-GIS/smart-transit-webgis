package com.jygis.smarttransit.service;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

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
        positionQueryDurationNanos.set(0);
    }

    // 每次调用 findPositionAtProgress 前记录一次
    public void recordPositionQuery() {
        positionQueryCount.incrementAndGet();
    }

    // 返回当前 tick 的位置查询次数
    public int positionQueryCount() {
        return positionQueryCount.get();
    }

    // AtomicLong：提供线程安全的 long类型累加 - 性能耗时先使用纳秒 long保存，最终输出时再转换成毫秒
    private final AtomicLong positionQueryDurationNanos = new AtomicLong();

    // 一轮 tick可能执行多次 PostGIS查询。每次查询结束后，把本次耗时累加到当前 tick的总耗时中
    public void recordPositionQueryDuration(long durationNanos) {
        if (durationNanos < 0) {
            throw new IllegalArgumentException("查询耗时不能小于0");
        }
        positionQueryDurationNanos.addAndGet(durationNanos);
    }

    // System.nanoTime记录的是纳秒，除以1,000,000转换成毫秒 - Console最终输出毫秒
    public double positionQueryDurationMilliseconds() {
        return positionQueryDurationNanos.get() / 1_000_000.0;
    }
}