package com.jygis.smarttransit.mapper;

import com.jygis.smarttransit.pojo.RouteInterpolatedPosition;
import com.jygis.smarttransit.pojo.RouteSimulationInfo;
import com.jygis.smarttransit.pojo.RouteStopMeasure;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 车辆模拟所需的线路空间数据访问接口。
 *
 * 职责：
 * - 查询一条线路的米制总长度；
 * - 查询线路中各站点的累计里程；
 * - 根据线路进度查询插值坐标。
 */
@Mapper
public interface VehicleSimulationMapper {

    /**
     * 查询指定线路用于模拟的基础信息
     */
    RouteSimulationInfo findRouteSimulationInfo(
            @Param("routeId") String routeId
    );

    /**
     * 查询指定线路的有序站点里程
     */
    List<RouteStopMeasure> findRouteStopMeasures(
            @Param("routeId") String routeId
    );

    /**
     * 根据线路进度比例计算实际经纬度
     */
    RouteInterpolatedPosition findPositionAtProgress(
            @Param("routeId") String routeId,
            @Param("progressRatio") Double progressRatio
    );
}