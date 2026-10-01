package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.config.VehicleHistoryProperties;
import com.jygis.smarttransit.mapper.VehicleHistoryMapper;
import com.jygis.smarttransit.pojo.VehiclePositionHistoryRecord;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleHistoryAvailability;
import com.jygis.smarttransit.pojo.VehicleTrajectory;
import com.jygis.smarttransit.pojo.VehicleTrajectoryPoint;
import com.jygis.smarttransit.pojo.RouteTrajectoryReplay;
import com.jygis.smarttransit.pojo.RouteVehicleTrajectoryPoint;
import com.jygis.smarttransit.pojo.NetworkTrajectoryReplay;
import com.jygis.smarttransit.pojo.NetworkVehicleTrajectory;
import com.jygis.smarttransit.service.VehicleHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 车辆历史轨迹服务实现。
 */
@Service
@RequiredArgsConstructor
public class VehicleHistoryServiceImpl implements VehicleHistoryService {

    private final VehicleHistoryProperties historyProperties;
    private final VehicleHistoryMapper vehicleHistoryMapper;

    /**
     * 保存当前批次中的全部车辆历史位置。
     */
    @Override
    @Transactional  // 声明事务
    public int saveSnapshots(
            List<VehiclePositionSnapshot> snapshots,
            Instant sampledAt
    ) {
        //历史记录功能关闭时，不访问数据库
        if (!historyProperties.isEnabled()) {
            return 0;
        }

        Objects.requireNonNull(snapshots, "snapshots 不能为空");

        Objects.requireNonNull(sampledAt, "sampledAt 不能为空");

        if (snapshots.isEmpty()) {
            return 0;
        }

        /*
         * findCurrentPositions已经返回当前全部模拟车辆，
         * 历史采样开启后统一保存整批快照。
         */
        List<VehiclePositionHistoryRecord> records =
                snapshots
                        .stream()
                        .map(snapshot -> VehiclePositionHistoryRecord.fromSnapshot(snapshot, sampledAt))
                        .toList();

        if (records.isEmpty()) {
            return 0;
        }

        return vehicleHistoryMapper.insertBatch(records);
    }

    /**
     * 根据配置的保留天数删除过期历史位置。
     */
    @Override
    @Transactional
    public int deleteExpiredHistory(Instant now) {
        Objects.requireNonNull(now, "now 不能为空");

        Instant cutoffTime = now.minus(Duration.ofDays(historyProperties.getRetentionDays()));

        return vehicleHistoryMapper.deleteBefore(cutoffTime);
    }

    /**
     * 查询当前拥有历史位置的车辆。
     */
    @Override
    public List<VehicleHistoryAvailability> findAvailability() {
        return vehicleHistoryMapper.findAvailability();
    }

    /**
     * 查询并组装一辆车的完整历史轨迹。
     */
    @Override
    public VehicleTrajectory findTrajectory(
            String vehicleId,
            Instant startTime,
            Instant endTime
    ) {
        String normalizedVehicleId = requireText(vehicleId, "vehicleId");

        validateQueryRange(startTime, endTime);

        List<VehicleTrajectoryPoint> points =
                vehicleHistoryMapper.findTrajectory(
                        normalizedVehicleId,
                        startTime,
                        endTime
                );

        return buildVehicleTrajectory(
                normalizedVehicleId,
                points
        );
    }

    /**
     * 查询一条线路中多辆车的同步回放数据。
     */
    @Override
    public RouteTrajectoryReplay findRouteTrajectories(
            String routeId,
            Instant startTime,
            Instant endTime
    ) {
        String normalizedRouteId = requireText(routeId, "routeId");

        validateQueryRange(startTime, endTime);

        List<VehicleHistoryAvailability> availableVehicles =
                vehicleHistoryMapper.findAvailabilityByRoute(normalizedRouteId);

        if (availableVehicles.isEmpty()) {
            throw new IllegalStateException("当前线路没有可以回放的历史车辆");
        }

        List<RouteVehicleTrajectoryPoint> queriedPoints =
                vehicleHistoryMapper
                        .findRouteTrajectoryPoints(
                                normalizedRouteId,
                                startTime,
                                endTime
                        );

        Map<String, List<VehicleTrajectoryPoint>>
                pointsByVehicle = new LinkedHashMap<>();

        for (VehicleHistoryAvailability vehicle : availableVehicles) {
            pointsByVehicle.put(
                    vehicle.getVehicleId(),
                    new ArrayList<>()
            );
        }

        for (RouteVehicleTrajectoryPoint queriedPoint : queriedPoints) {
            List<VehicleTrajectoryPoint> vehiclePoints =
                    pointsByVehicle
                            .computeIfAbsent(
                                    queriedPoint.getVehicleId(),
                                    ignored -> new ArrayList<>()
                            );

            vehiclePoints.add(toVehicleTrajectoryPoint(queriedPoint));
        }

        List<VehicleTrajectory> trajectories = new ArrayList<>();

        List<String> unavailableVehicleIds = new ArrayList<>();

        for (
                Map.Entry<String, List<VehicleTrajectoryPoint>> entry
                : pointsByVehicle.entrySet()
        ) {
            String vehicleId = entry.getKey();

            List<VehicleTrajectoryPoint> vehiclePoints = entry.getValue();

            if (vehiclePoints.size() < 2) {
                unavailableVehicleIds.add(vehicleId);
                continue;
            }

            trajectories.add(buildVehicleTrajectory(vehicleId, vehiclePoints));
        }

        if (trajectories.isEmpty()) {
            throw new IllegalStateException("指定时间范围内没有可以回放的线路轨迹");
        }

        Instant playbackStartTime =
                trajectories
                        .stream()
                        .map(VehicleTrajectory::startTime)
                        .max(Instant::compareTo)
                        .orElseThrow();

        Instant playbackEndTime =
                trajectories
                        .stream()
                        .map(VehicleTrajectory::endTime)
                        .min(Instant::compareTo)
                        .orElseThrow();

        if (!playbackEndTime.isAfter(playbackStartTime)) {
            throw new IllegalStateException("当前车辆之间没有共同的回放时间范围");
        }

        int totalPointCount =
                trajectories
                        .stream()
                        .mapToInt(VehicleTrajectory::pointCount)
                        .sum();

        VehicleHistoryAvailability routeInformation = availableVehicles.get(0);

        return new RouteTrajectoryReplay(
                normalizedRouteId,
                routeInformation.getRouteFid(),
                routeInformation.getRouteName(),
                playbackStartTime,
                playbackEndTime,
                trajectories.size(),
                totalPointCount,
                trajectories,
                unavailableVehicleIds
        );
    }

    /**
     * 查询并组装全部车辆的同步回放数据。
     */
    @Override
    public NetworkTrajectoryReplay findNetworkTrajectories(
            Instant startTime,
            Instant endTime
    ) {
        validateQueryRange(startTime, endTime);

        List<VehicleHistoryAvailability> availableVehicles =
                vehicleHistoryMapper.findAvailability();

        if (availableVehicles.isEmpty()) {
            throw new IllegalStateException("当前没有可以回放的历史车辆");
        }

        Map<String, List<VehicleTrajectoryPoint>>
                pointsByVehicle = new LinkedHashMap<>();

        for (VehicleHistoryAvailability vehicle : availableVehicles) {
            pointsByVehicle.put(
                    vehicle.getVehicleId(),
                    new ArrayList<>()
            );
        }

        List<RouteVehicleTrajectoryPoint> queriedPoints =
                vehicleHistoryMapper.findAllTrajectoryPoints(startTime, endTime);

        for (RouteVehicleTrajectoryPoint queriedPoint : queriedPoints) {
            pointsByVehicle
                    .get(queriedPoint.getVehicleId())
                    .add(toVehicleTrajectoryPoint(queriedPoint));
        }

        List<NetworkVehicleTrajectory> trajectories = new ArrayList<>();

        List<String> unavailableVehicleIds = new ArrayList<>();

        for (VehicleHistoryAvailability vehicle : availableVehicles) {
            String vehicleId = vehicle.getVehicleId();

            List<VehicleTrajectoryPoint> vehiclePoints =
                    pointsByVehicle.get(vehicleId);

            if (vehiclePoints.size() < 2) {
                unavailableVehicleIds.add(vehicleId);
                continue;
            }

            VehicleTrajectory trajectory =
                    buildVehicleTrajectory(
                            vehicleId,
                            vehiclePoints
                    );

            trajectories.add(
                    new NetworkVehicleTrajectory(
                            vehicle.getRouteId(),
                            vehicle.getRouteFid(),
                            vehicle.getRouteName(),
                            trajectory
                    )
            );
        }

        if (trajectories.isEmpty()) {
            throw new IllegalStateException("指定时间范围内没有可以回放的全网轨迹");
        }

        int routeCount =
                (int) trajectories
                        .stream()
                        .map(NetworkVehicleTrajectory::routeId)
                        .distinct()
                        .count();

        int totalPointCount =
                trajectories
                        .stream()
                        .map(NetworkVehicleTrajectory::trajectory)
                        .mapToInt(VehicleTrajectory::pointCount)
                        .sum();

        return new NetworkTrajectoryReplay(
                startTime,
                endTime,
                routeCount,
                trajectories.size(),
                totalPointCount,
                trajectories,
                unavailableVehicleIds
        );
    }

    /**
     * 将线路批量查询模型转换成现有单车轨迹点。
     */
    private VehicleTrajectoryPoint toVehicleTrajectoryPoint(
            RouteVehicleTrajectoryPoint source
    ) {
        VehicleTrajectoryPoint target = new VehicleTrajectoryPoint();

        target.setRecordedAt(source.getRecordedAt());

        target.setLongitude(source.getLongitude());
        target.setLatitude(source.getLatitude());

        target.setDistanceMeters(source.getDistanceMeters());
        target.setTotalDistanceMeters(source.getTotalDistanceMeters());
        target.setRouteProgressPercent(source.getRouteProgressPercent());
        target.setSpeedMetersPerSecond(source.getSpeedMetersPerSecond());

        target.setMotionStatus(source.getMotionStatus());
        target.setOperationalStatus(source.getOperationalStatus());

        return target;
    }

    /**
     * 根据一辆车的历史位置组装完整轨迹。
     */
    private VehicleTrajectory buildVehicleTrajectory(
            String vehicleId,
            List<VehicleTrajectoryPoint> points
    ) {
        if (points.size() < 2) {
            throw new IllegalStateException("车辆 " + vehicleId + " 没有足够的轨迹点");
        }

        VehicleTrajectoryPoint firstPoint = points.get(0);
        VehicleTrajectoryPoint lastPoint = points.get(points.size() - 1);

        double averageSpeedMetersPerSecond =
                points
                        .stream()
                        .mapToDouble(VehicleTrajectoryPoint::getSpeedMetersPerSecond)
                        .average()
                        .orElse(0);

        double maximumSpeedMetersPerSecond =
                points
                        .stream()
                        .mapToDouble(VehicleTrajectoryPoint::getSpeedMetersPerSecond)
                        .max()
                        .orElse(0);

        return new VehicleTrajectory(
                vehicleId,
                firstPoint.getRecordedAt(),
                lastPoint.getRecordedAt(),
                points.size(),
                averageSpeedMetersPerSecond,
                maximumSpeedMetersPerSecond,
                points
        );
    }

    /**
     * 检查文本参数，并去除首尾空格。
     */
    private String requireText(String value, String parameterName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(parameterName + " 不能为空");
        }
        return value.trim();
    }

    /**
     * 检查轨迹查询时间范围。
     */
    private void validateQueryRange(Instant startTime, Instant endTime) {
        if (startTime == null) {
            throw new IllegalArgumentException("startTime 不能为空");
        }
        if (endTime == null) {
            throw new IllegalArgumentException("endTime 不能为空");
        }

        /*
         * Duration.between：计算两个时间点之间相隔多久。
         */
        Duration queryDuration = Duration.between(startTime, endTime);

        if (queryDuration.isZero() || queryDuration.isNegative()) {
            throw new IllegalArgumentException("endTime 必须晚于 startTime");
        }

        Duration maximumDuration = Duration.ofMinutes(historyProperties.getMaximumQueryRangeMinutes());

        if (queryDuration.compareTo(maximumDuration) > 0) {
            throw new IllegalArgumentException(
                    "轨迹查询时间范围不能超过 " + historyProperties.getMaximumQueryRangeMinutes() + " 分钟"
            );
        }
    }
}