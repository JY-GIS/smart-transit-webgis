package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.Stop;
import com.jygis.smarttransit.pojo.NearbyStop;
import java.util.List;

public interface StopService {

    List<Stop> findAll();

    /**
     * 查询指定范围内的公交站
     */
    List<NearbyStop> findNearby(
            Double longitude,
            Double latitude,
            Double radiusMeters
    );
}