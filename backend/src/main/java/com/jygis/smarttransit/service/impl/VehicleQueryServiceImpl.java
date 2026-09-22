package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleRuntimeState;
import com.jygis.smarttransit.service.VehicleQueryService;
import com.jygis.smarttransit.service.VehicleRuntimeStore;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.stream.Collectors;

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
         * 先取得每辆车的基础位置快照
         */
        List<VehiclePositionSnapshot> baseSnapshots =
                vehicleRuntimeStore
                        .findAll()
                        .stream()
                        .map(VehicleRuntimeState::latestSnapshot)
                        .toList();

        /*
         * Collectors.groupingBy：按 routeFid 把车辆分组。
         */
        Map<Integer, List<VehiclePositionSnapshot>> snapshotsByRoute =
                baseSnapshots.stream().collect(
                        Collectors.groupingBy(VehiclePositionSnapshot::routeFid)
                );

        List<VehiclePositionSnapshot> result = new ArrayList<>(baseSnapshots.size());

        for (List<VehiclePositionSnapshot> routeSnapshots : snapshotsByRoute.values()) {
            result.addAll(attachFrontVehicleInformation(routeSnapshots));
        }

        /*
         * 分组处理会打乱原来的车辆顺序，
         * 最后按 vehicleId 排序，保证 REST 和 WebSocket 输出稳定。
         */
        result.sort(Comparator.comparing(VehiclePositionSnapshot::vehicleId));

        return List.copyOf(result);
    }

    /**
     * 为同一线路上的车辆计算前车及沿线距离。
     */
    private List<VehiclePositionSnapshot> attachFrontVehicleInformation(
            List<VehiclePositionSnapshot> routeSnapshots
    ) {
        if (routeSnapshots.isEmpty()) {
            return List.of();
        }

        /*
         * 同一线路只有一辆车时，没有可以比较的前车。
         */
        if (routeSnapshots.size() == 1) {
            VehiclePositionSnapshot onlyVehicle = routeSnapshots.get(0);

            return List.of(
                    onlyVehicle.withFrontVehicle(null, null)
            );
        }

        List<VehiclePositionSnapshot> sortedVehicles = new ArrayList<>(routeSnapshots);

        /*
         * 按车辆在线路上的累计里程从小到大排列。
         *
         * 排序后：
         * - 当前元素的下一个元素就是普通情况下的前车；
         * - 最后一个元素的前车是第一个元素，形成闭环。
         *
         * thenComparing 用于两辆车里程完全相同时稳定排序，
         * 避免每次查询得到不同的前后关系。
         */
        sortedVehicles.sort(
                Comparator
                        .comparingDouble(VehiclePositionSnapshot::distanceMeters)
                        .thenComparing(VehiclePositionSnapshot::vehicleId)
        );

        List<VehiclePositionSnapshot> result = new ArrayList<>(sortedVehicles.size());

        for (int index = 0; index < sortedVehicles.size(); index++) {

            VehiclePositionSnapshot currentVehicle = sortedVehicles.get(index);

            int frontVehicleIndex = (index + 1) % sortedVehicles.size();

            VehiclePositionSnapshot frontVehicle = sortedVehicles.get(frontVehicleIndex);

            double distanceToFrontVehicleMeters =
                    frontVehicle.distanceMeters() - currentVehicle.distanceMeters();

            if (distanceToFrontVehicleMeters < 0) {
                distanceToFrontVehicleMeters += currentVehicle.totalDistanceMeters();
            }

            result.add(
                    currentVehicle.withFrontVehicle(
                            frontVehicle.vehicleId(),
                            distanceToFrontVehicleMeters
                    )
            );
        }

        return result;
    }
}