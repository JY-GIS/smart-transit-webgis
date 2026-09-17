package com.jygis.smarttransit.mapper;

import com.jygis.smarttransit.pojo.Route;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface RouteMapper {

    List<Route> findAll();

    String findGeoJson();
}