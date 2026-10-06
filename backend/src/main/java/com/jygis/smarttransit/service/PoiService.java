package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.NearbyPoi;

import java.util.List;

public interface PoiService {

    /**
     * 查询指定经纬度和半径范围内的 POI。
     */
    List<NearbyPoi> findNearby(
            Double longitude,
            Double latitude,
            Double radiusMeters
    );
}