package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.RouteSimulationProfile;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleSnapshotRequest;

import java.util.List;

/**
 * 单辆模拟车辆的位置计算服务
 *
 * 职责:
 * - 加载一条线路的模拟档案;
 * - 根据车辆累计里程计算完整位置快照;
 */
public interface VehicleSimulationService {

    /**
     * 加载指定线路的车辆模拟档案
     */
    RouteSimulationProfile loadRouteProfile(
            String routeId
    );

    /**
     * 根据累计里程计算一辆车的完整位置快照
     */
    VehiclePositionSnapshot calculateSnapshot(
            String vehicleId,
            RouteSimulationProfile profile,
            double distanceMeters
    );

    /**
     * 一次计算多辆车辆的完整位置快照。
     * - 方法内部先完成全部Java进度计算，再执行一次PostGIS批量坐标查询，最后按照vehicleId重新组装快照。
     */
    List<VehiclePositionSnapshot> calculateSnapshots(
            List<VehicleSnapshotRequest> requests
    );
}