package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleRuntimeState;
import com.jygis.smarttransit.service.VehicleQueryService;
import com.jygis.smarttransit.service.VehicleRuntimeStore;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;

/**
 * 车辆当前状态查询服务实现。
 *
 * 职责：
 * - 从 VehicleRuntimeStore 读取全部车辆内部状态；
 * - 提取每辆车最新的公开位置快照；
 * - 按 vehicleId 排序，保证接口返回顺序稳定。
 */
@Service
@RequiredArgsConstructor
public class VehicleQueryServiceImpl implements VehicleQueryService {

    private final VehicleRuntimeStore vehicleRuntimeStore;

    @Override
    public List<VehiclePositionSnapshot> findCurrentPositions() {
        /*
         * map：把内部 VehicleRuntimeState 转换成对外 VehiclePositionSnapshot。
         * sorted：按车辆编号排序，避免 ConcurrentHashMap 的无序结果导致接口每次返回顺序不同。
         * toList：收集成不可修改的 List。
         *
         * 如果省略 map 而直接返回 VehicleRuntimeState：
         * RouteSimulationProfile 和完整站点列表也可能被序列化，
         * 不仅泄漏内部结构，还会显著增大响应数据量。
         */
        return vehicleRuntimeStore
                .findAll()
                .stream()
                .map(VehicleRuntimeState::latestSnapshot)
                .sorted(Comparator.comparing(VehiclePositionSnapshot::vehicleId))
                .toList();
    }
}