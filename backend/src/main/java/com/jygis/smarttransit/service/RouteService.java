package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.Route;
import tools.jackson.databind.JsonNode;

import java.util.List;

public interface RouteService {

    List<Route> findAll();

    JsonNode findGeoJson();
}
