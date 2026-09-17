package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.service.RouteStopService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/route-stops")
@RequiredArgsConstructor
public class RouteStopController {

    private final RouteStopService routeStopService;

    @GetMapping
    public Result findAll() {
        return Result.success(routeStopService.findAll());
    }
}