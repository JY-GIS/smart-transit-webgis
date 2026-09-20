package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;

import java.util.List;

/**
 * 车辆当前状态查询服务。
 */
public interface VehicleQueryService {

    /**
     * 查询当前全部模拟车辆的位置快照。
     *
     * 返回 VehiclePositionSnapshot，而不是 VehicleRuntimeState。
     *
     * VehicleRuntimeState 包含线路档案、累计运行里程等内部模拟数据；如果直接返回它，会把后端内部结构暴露给前端，还会产生大量无用 JSON。
     */
    List<VehiclePositionSnapshot> findCurrentPositions();
}