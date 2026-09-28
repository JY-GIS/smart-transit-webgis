package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;

import java.time.Instant;
import java.util.List;

/**
 * 车辆历史轨迹服务。
 */
public interface VehicleHistoryService {

    /**
     * 保存指定采样时刻的一批车辆快照。
     *
     * sampledAt必须由调用方统一生成。
     *
     * @param snapshots 当前全部车辆公开快照
     * @param sampledAt 当前批次统一采样时间
     * @return 实际插入的历史记录数量
     */
    int saveSnapshots(
            List<VehiclePositionSnapshot> snapshots,
            Instant sampledAt
    );
}