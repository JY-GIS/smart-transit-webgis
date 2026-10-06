package com.jygis.smarttransit.mapper;

import com.jygis.smarttransit.pojo.NearbyPoi;
import com.jygis.smarttransit.pojo.PoiCategorySummary;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface PoiMapper {

    /**
     * 查询指定经纬度和半径范围内的 POI。
     */
    List<NearbyPoi> findNearby(
            @Param("longitude") Double longitude,
            @Param("latitude") Double latitude,
            @Param("radiusMeters") Double radiusMeters
    );

    /**
     * 统计指定经纬度和半径范围内的六类 POI 数量。
     */
    PoiCategorySummary summarizeNearby(
            @Param("longitude") Double longitude,
            @Param("latitude") Double latitude,
            @Param("radiusMeters") Double radiusMeters
    );
}