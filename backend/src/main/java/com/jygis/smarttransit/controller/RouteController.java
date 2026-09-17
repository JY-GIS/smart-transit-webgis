package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.service.RouteService;
import com.jygis.smarttransit.service.RouteStopService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/routes")
@RequiredArgsConstructor
public class RouteController {

    private final RouteService routeService;

    private final RouteStopService routeStopService;

    @GetMapping
    public Result findAll() {
        return Result.success(routeService.findAll());
    }

    @GetMapping("/{routeId}/stops")
    public Result findStopsByRouteId(
            @PathVariable String routeId
    ) {
        return Result.success(
                routeStopService.findStopsByRouteId(routeId)
        );
    }

    @GetMapping("/geojson")
    public JsonNode findGeoJson() {
        return routeService.findGeoJson();
    }
}
