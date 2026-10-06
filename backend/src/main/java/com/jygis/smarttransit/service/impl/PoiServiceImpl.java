package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.mapper.PoiMapper;
import com.jygis.smarttransit.pojo.NearbyPoi;
import com.jygis.smarttransit.service.PoiService;
import com.jygis.smarttransit.pojo.PoiCategorySummary;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PoiServiceImpl implements PoiService {

    private final PoiMapper poiMapper;

    /**
     * 将查询中心和半径传给 Mapper，并返回附近 POI。
     */
    @Override
    public List<NearbyPoi> findNearby(
            Double longitude,
            Double latitude,
            Double radiusMeters
    ) {
        return poiMapper.findNearby(
                longitude,
                latitude,
                radiusMeters
        );
    }

    /**
     * 将统计范围传给 Mapper，并返回数据库聚合结果。
     */
    @Override
    public PoiCategorySummary summarizeNearby(
            Double longitude,
            Double latitude,
            Double radiusMeters
    ) {
        return poiMapper.summarizeNearby(
                longitude,
                latitude,
                radiusMeters
        );
    }
}