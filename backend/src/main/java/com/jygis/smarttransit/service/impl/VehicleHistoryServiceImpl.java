package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.config.VehicleHistoryProperties;
import com.jygis.smarttransit.mapper.VehicleHistoryMapper;
import com.jygis.smarttransit.pojo.VehiclePositionHistoryRecord;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleHistoryAvailability;
import com.jygis.smarttransit.pojo.VehicleTrajectory;
import com.jygis.smarttransit.pojo.VehicleTrajectoryPoint;
import com.jygis.smarttransit.service.VehicleHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * 车辆历史轨迹服务实现。
 */
@Service
@RequiredArgsConstructor
public class VehicleHistoryServiceImpl implements VehicleHistoryService {

    private final VehicleHistoryProperties historyProperties;
    private final VehicleHistoryMapper vehicleHistoryMapper;

    /**
     * 保存当前批次中需要记录的车辆。
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
         * Set：这里只关心“某个routeId是否在白名单中”，不关心配置里的原始顺序。
         * Set.contains通常适合成员判断。
         */
        Set<String> trackedRouteIds = Set.copyOf(historyProperties.getTrackedRouteIds());

        /*
         * 先筛选受监控线路，再转换数据库记录。
         */
        List<VehiclePositionHistoryRecord> records =
                snapshots
                        .stream()
                        .filter(snapshot ->
                                trackedRouteIds.contains(snapshot.routeId())
                        )
                        .map(snapshot ->
                                VehiclePositionHistoryRecord.fromSnapshot(snapshot, sampledAt)
                        )
                        .toList();

        if (records.isEmpty()) {
            return 0;
        }

        return vehicleHistoryMapper.insertBatch(records);
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

        if (points.size() < 2) {
            throw new IllegalStateException("指定时间范围内没有足够的轨迹点");
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
                normalizedVehicleId,
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