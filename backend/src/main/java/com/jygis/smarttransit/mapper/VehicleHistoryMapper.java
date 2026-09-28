package com.jygis.smarttransit.mapper;

import com.jygis.smarttransit.pojo.VehiclePositionHistoryRecord;
import com.jygis.smarttransit.pojo.VehicleHistoryAvailability;
import com.jygis.smarttransit.pojo.VehicleTrajectoryPoint;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.time.Instant;

/**
 * 车辆历史位置数据访问接口。
 */
@Mapper
public interface VehicleHistoryMapper {

    /**
     * 一次批量插入同一采样时刻的多辆车辆历史位置。
     * @return 实际插入的数据库行数
     */
    int insertBatch(
            @Param("records") List<VehiclePositionHistoryRecord> records
    );

    /**
     * 查询当前有哪些车辆拥有历史记录。
     * 返回内容包括：
     * - 车辆编号；- 所属线路；- 最早和最晚记录时间；- 历史点数量。
     */
    List<VehicleHistoryAvailability> findAvailability();

    /**
     * 查询一辆车在指定时间范围内的轨迹点。
     */
    List<VehicleTrajectoryPoint> findTrajectory(
            @Param("vehicleId") String vehicleId,
            @Param("startTime") Instant startTime,
            @Param("endTime") Instant endTime
    );
}