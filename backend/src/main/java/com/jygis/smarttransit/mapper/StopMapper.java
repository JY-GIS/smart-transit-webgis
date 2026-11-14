package com.jygis.smarttransit.mapper;

import com.jygis.smarttransit.pojo.Stop;
import com.jygis.smarttransit.pojo.StopRouteOption;
import org.apache.ibatis.annotations.Mapper;
import com.jygis.smarttransit.pojo.NearbyStop;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface StopMapper {

    List<Stop> findAll();

    List<StopRouteOption> findRoutesAtStop(@Param("stopId") String stopId);

    /**
     * 查询指定半径内的公交站
     */
    List<NearbyStop> findNearby(
            @Param("longitude") Double longitude,
            @Param("latitude") Double latitude,
            @Param("radiusMeters") Double radiusMeters
    );
}
