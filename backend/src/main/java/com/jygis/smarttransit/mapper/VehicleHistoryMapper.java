package com.jygis.smarttransit.mapper;

import com.jygis.smarttransit.pojo.VehiclePositionHistoryRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

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
}