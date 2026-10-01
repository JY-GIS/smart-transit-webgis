package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleHistoryAvailability;
import com.jygis.smarttransit.pojo.VehicleTrajectory;
import com.jygis.smarttransit.pojo.RouteTrajectoryReplay;
import com.jygis.smarttransit.pojo.NetworkTrajectoryReplay;

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

    /**
     * 删除超过配置保留天数的历史位置。
     *
     * @param now 当前清理时间
     * @return 实际删除的历史记录数量
     */
    int deleteExpiredHistory(Instant now);

    /**
     * 查询当前拥有历史数据、可以进行回放的车辆。
     */
    List<VehicleHistoryAvailability> findAvailability();

    /**
     * 查询一辆车在指定时间范围内的完整轨迹。
     */
    VehicleTrajectory findTrajectory(
            String vehicleId,
            Instant startTime,
            Instant endTime
    );

    /**
     * 查询一条线路中多辆车的同步回放数据。
     */
    RouteTrajectoryReplay findRouteTrajectories(
            String routeId,
            Instant startTime,
            Instant endTime
    );

    /**
     * 查询全部车辆的同步回放数据。
     */
    NetworkTrajectoryReplay findNetworkTrajectories(
            Instant startTime,
            Instant endTime
    );
}