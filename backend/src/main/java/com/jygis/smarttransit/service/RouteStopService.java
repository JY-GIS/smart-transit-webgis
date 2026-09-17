package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.RouteStop;
import com.jygis.smarttransit.pojo.RouteStopDetail;

import java.util.List;

public interface RouteStopService {

    List<RouteStop> findAll();

    List<RouteStopDetail> findStopsByRouteId(String routeId);
}