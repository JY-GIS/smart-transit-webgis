package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.config.VehicleSimulationProperties;
import com.jygis.smarttransit.pojo.VehicleOperationalStatus;
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
    private final VehicleSimulationProperties properties;

    @Override
    public List<VehiclePositionSnapshot> findCurrentPositions() {
        /*
         * latestSnapshot 保存稳定的几何位置结果；
         * motionStatus 和 currentSpeed 属于实时运行状态。
         *
         * 在查询出口将两部分组合成最终公开快照，REST 和 WebSocket 因而使用同一份数据。
         */
        List<VehiclePositionSnapshot> baseSnapshots =
                vehicleRuntimeStore
                        .findAll()
                        .stream()
                        .map(state ->
                                state
                                    .latestSnapshot()
                                    .withMotionState(state.motionStatus(), state.currentSpeedMetersPerSecond())
                        )
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
     * 为同一线路上的车辆计算前车、沿线距离和运营状态。
     */
    private List<VehiclePositionSnapshot> attachFrontVehicleInformation(
            List<VehiclePositionSnapshot> routeSnapshots
    ) {
        if (routeSnapshots.isEmpty()) {
            return List.of();
        }

        // 参考正常间隔 = 闭环线路总长度 ÷ 计划车辆数
        double referenceHeadwayMeters = calculateReferenceHeadwayMeters(routeSnapshots);

        /*
         * 只有一辆有效车辆时无法确定前车距离。
         */
        if (routeSnapshots.size() == 1) {
            VehiclePositionSnapshot onlyVehicle = routeSnapshots.get(0);

            return List.of(
                    onlyVehicle.withHeadwayInformation(
                            null,
                            null,
                            referenceHeadwayMeters,
                            VehicleOperationalStatus.NORMAL
                    )
            );
        }

        List<VehiclePositionSnapshot> sortedVehicles = new ArrayList<>(routeSnapshots);

        /*
         * 按车辆在线路上的累计里程升序排列。排序后，下一个元素就是当前车辆的前车。
         * thenComparing 是稳定的第二排序条件：如果两辆车恰好位于相同里程，使用 vehicleId 固定前后关系。
         */
        sortedVehicles.sort(
                Comparator
                        .comparingDouble(VehiclePositionSnapshot::distanceMeters)
                        .thenComparing(VehiclePositionSnapshot::vehicleId)
        );

        List<VehiclePositionSnapshot> result = new ArrayList<>(sortedVehicles.size());

        for (int index = 0; index < sortedVehicles.size(); index++) {
            VehiclePositionSnapshot currentVehicle = sortedVehicles.get(index);

            // 取模运算让最后一辆车的下一个索引回到 0，从而表达闭环线路上的首尾关系。
            int frontVehicleIndex = (index + 1) % sortedVehicles.size();

            VehiclePositionSnapshot frontVehicle = sortedVehicles.get(frontVehicleIndex);

            double distanceToFrontVehicleMeters =
                    frontVehicle.distanceMeters() - currentVehicle.distanceMeters();

            if (distanceToFrontVehicleMeters < 0) {
                distanceToFrontVehicleMeters += currentVehicle.totalDistanceMeters();
            }

            VehicleOperationalStatus operationalStatus =
                    determineOperationalStatus(
                            distanceToFrontVehicleMeters,
                            referenceHeadwayMeters
                    );

            result.add(
                    currentVehicle.withHeadwayInformation(
                            frontVehicle.vehicleId(),
                            distanceToFrontVehicleMeters,
                            referenceHeadwayMeters,
                            operationalStatus
                    )
            );
        }

        return result;
    }

    /**
     * 计算当前线路的参考正常间隔。
     */
    private double calculateReferenceHeadwayMeters(
            List<VehiclePositionSnapshot> routeSnapshots
    ) {
        double totalDistanceMeters = routeSnapshots.get(0).totalDistanceMeters();

        int plannedVehicleCount = properties.getVehicles().size();

        return totalDistanceMeters / plannedVehicleCount;
    }

    /**
     * 根据实际间隔与参考正常间隔判断运营状态。
     */
    private VehicleOperationalStatus determineOperationalStatus(
            double actualHeadwayMeters,
            double referenceHeadwayMeters
    ) {
        double headwayRatio = actualHeadwayMeters / referenceHeadwayMeters;

        if (headwayRatio < properties.getBunchingThresholdRatio()) {

            return VehicleOperationalStatus.BUNCHING;
        }

        if (headwayRatio > properties.getLargeGapThresholdRatio()) {

            return VehicleOperationalStatus.LARGE_GAP;
        }

        return VehicleOperationalStatus.NORMAL;
    }
}