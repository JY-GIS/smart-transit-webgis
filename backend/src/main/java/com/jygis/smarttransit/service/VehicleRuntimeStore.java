package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.VehicleRuntimeState;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 后端车辆当前运行状态存储。
 *
 * 职责：
 * - 按 vehicleId 保存每辆车的最新运行状态；
 * - 允许定时任务写入新状态；
 * - 允许其他线程读取完整旧状态或完整新状态。
 */
@Component
public class VehicleRuntimeStore {

    /**
     * ConcurrentHashMap 支持多个线程安全地读取和更新 Map
     */
    private final ConcurrentMap<String, VehicleRuntimeState>
            states = new ConcurrentHashMap<>();

    /**
     * 根据车辆编号读取当前运行状态。
     * 没有对应车辆时返回 null。
     */
    public VehicleRuntimeState find(
            String vehicleId
    ) {
        if (vehicleId == null) {
            return null;
        }

        return states.get(vehicleId);
    }

    /**
     * 保存或整体替换车辆状态。
     * 相同 vehicleId 已存在时，put 会用新状态替换旧状态。
     */
    public void save(
            VehicleRuntimeState state
    ) {
        Objects.requireNonNull(
                state,
                "state 不能为空"
        );

        states.put(
                state.vehicleId(),
                state
        );
    }
}