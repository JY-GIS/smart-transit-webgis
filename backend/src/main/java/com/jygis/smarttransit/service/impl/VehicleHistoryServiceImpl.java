package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.config.VehicleHistoryProperties;
import com.jygis.smarttransit.mapper.VehicleHistoryMapper;
import com.jygis.smarttransit.pojo.VehiclePositionHistoryRecord;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.service.VehicleHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
}