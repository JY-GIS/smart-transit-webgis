package com.jygis.smarttransit.mapper;

import com.jygis.smarttransit.pojo.RouteStop;
import com.jygis.smarttransit.pojo.RouteStopDetail;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RouteStopMapper {

    List<RouteStop> findAll();

    List<RouteStopDetail> findStopsByRouteId(
            @Param("routeId") String routeId
    );
}