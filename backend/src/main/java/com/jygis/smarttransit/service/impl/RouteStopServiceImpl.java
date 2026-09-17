package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.mapper.RouteStopMapper;
import com.jygis.smarttransit.pojo.RouteStop;
import com.jygis.smarttransit.pojo.RouteStopDetail;
import com.jygis.smarttransit.service.RouteStopService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class RouteStopServiceImpl implements RouteStopService {

    private final RouteStopMapper routeStopMapper;

    @Override
    public List<RouteStop> findAll() {
        return routeStopMapper.findAll();
    }

    @Override
    public List<RouteStopDetail> findStopsByRouteId(String routeId) {
        return routeStopMapper.findStopsByRouteId(routeId);
    }
}