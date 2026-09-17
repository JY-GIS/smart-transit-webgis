package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.mapper.RouteMapper;
import com.jygis.smarttransit.pojo.Route;
import com.jygis.smarttransit.service.RouteService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

@Service
@RequiredArgsConstructor
public class RouteServiceImpl implements RouteService {

    private final RouteMapper routeMapper;

    private final ObjectMapper objectMapper;

    @Override
    public List<Route> findAll() {
        return routeMapper.findAll();
    }

    @Override
    public JsonNode findGeoJson() {
        String geoJson = routeMapper.findGeoJson();

        try {
            return objectMapper.readTree(geoJson);
        } catch (JacksonException e) {
            throw new IllegalStateException("线路 GeoJSON 转换失败", e);
        }
    }
}
