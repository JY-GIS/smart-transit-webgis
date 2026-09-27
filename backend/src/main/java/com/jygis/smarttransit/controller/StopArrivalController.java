package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.service.StopArrivalService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 线路站点到站查询接口。
 */
@RestController
@RequestMapping("/api/stops")
@RequiredArgsConstructor
public class StopArrivalController {

    private static final int MAXIMUM_ARRIVAL_LIMIT = 10;

    private final StopArrivalService stopArrivalService;

    /**
     * 查询指定线路即将到达指定站点的车辆。
     * GET /api/stops/stop_005265/arrivals
     *     ?routeId=route_000185
     *     &limit=3
     */
    @GetMapping("/{stopId}/arrivals")
    public Result findArrivals(
            @PathVariable("stopId") String stopId,

            @RequestParam(name = "routeId", required = false) String routeId,

            @RequestParam(name = "limit", defaultValue = "3") Integer limit
    ) {
        if (stopId == null || stopId.isBlank()) {
            return Result.error("stopId 不能为空");
        }

        if (routeId == null || routeId.isBlank()) {
            return Result.error("routeId 不能为空");
        }
        if (limit == null || limit <= 0 || limit > MAXIMUM_ARRIVAL_LIMIT) {
            return Result.error("limit 必须大于 0 且不超过 " + MAXIMUM_ARRIVAL_LIMIT);
        }

        try {
            return Result.success(
                    stopArrivalService.findArrivals(routeId, stopId, limit)
            );

        } catch (IllegalArgumentException | IllegalStateException exception) {
            return Result.error(exception.getMessage());
        }
    }
}