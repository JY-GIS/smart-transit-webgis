package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.service.VehicleHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.format.DateTimeParseException;

/**
 * 车辆历史轨迹查询接口。
 */
@RestController
@RequestMapping("/api/vehicles/history")
@RequiredArgsConstructor
public class VehicleHistoryController {

    private final VehicleHistoryService vehicleHistoryService;

    /**
     * 查询当前可以进行历史回放的车辆。
     * 请求示例：GET /api/vehicles/history/availability
     */
    @GetMapping("/availability")
    public Result findAvailability() {
        return Result.success(vehicleHistoryService.findAvailability());
    }

    /**
     * 查询全部车辆的同步回放数据。
     * 请求示例：
     * GET /api/vehicles/history/network/trajectories
     *     ?startTime=2026-09-29T02:00:00Z
     *     &endTime=2026-09-29T02:30:00Z
     */
    @GetMapping("/network/trajectories")
    public Result findNetworkTrajectories(
            @RequestParam(name = "startTime", required = false) String startTimeText,
            @RequestParam(name = "endTime", required = false) String endTimeText
    ) {
        try {
            Instant startTime = parseInstant(startTimeText, "startTime");
            Instant endTime = parseInstant(endTimeText, "endTime");

            return Result.success(
                    vehicleHistoryService
                            .findNetworkTrajectories(
                                    startTime,
                                    endTime
                            )
            );

        } catch (IllegalArgumentException | IllegalStateException exception) {
            return Result.error(exception.getMessage());
        }
    }

    /**
     * 查询一条线路中多辆车的同步回放数据。
     * 请求示例：
     * GET /api/vehicles/history/routes/route_000185/trajectories
     *     ?startTime=2026-09-29T02:00:00Z
     *     &endTime=2026-09-29T02:30:00Z
     */
    @GetMapping("/routes/{routeId}/trajectories")
    public Result findRouteTrajectories(
            @PathVariable("routeId") String routeId,
            @RequestParam(name = "startTime", required = false) String startTimeText,
            @RequestParam(name = "endTime", required = false) String endTimeText
    ) {
        try {
            Instant startTime = parseInstant(startTimeText, "startTime");
            Instant endTime = parseInstant(endTimeText, "endTime");

            return Result.success(
                    vehicleHistoryService
                            .findRouteTrajectories(
                                    routeId,
                                    startTime,
                                    endTime
                            )
            );

        } catch (IllegalArgumentException | IllegalStateException exception) {
            return Result.error(exception.getMessage());
        }
    }

    /**
     * 查询一辆车在指定时间范围内的轨迹。
     *
     * 请求示例：
     * GET /api/vehicles/history/simulated-bus-m103-001/trajectory
     *     ?startTime=2026-09-28T02:00:00Z
     *     &endTime=2026-09-28T02:30:00Z
     */
    @GetMapping("/{vehicleId}/trajectory")
    public Result findTrajectory(
            @PathVariable("vehicleId") String vehicleId,
            @RequestParam(name = "startTime", required = false) String startTimeText,
            @RequestParam(name = "endTime", required = false) String endTimeText
    ) {
        try {
            Instant startTime = parseInstant(startTimeText, "startTime");
            Instant endTime = parseInstant(endTimeText, "endTime");

            return Result.success(
                    vehicleHistoryService
                            .findTrajectory(
                                    vehicleId,
                                    startTime,
                                    endTime
                            )
            );

        } catch (IllegalArgumentException | IllegalStateException exception) {
            return Result.error(exception.getMessage());
        }
    }

    /**
     * 将前端传入的 ISO-8601 时间转换成 Instant。
     * Instant.parse：可以解析：2026-09-28T02:30:00Z
     */
    private Instant parseInstant(String value, String parameterName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(parameterName + " 不能为空");
        }

        try {
            return Instant.parse(value.trim());

        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException(
                    parameterName + " 必须使用ISO-8601 UTC时间，" + "例如2026-09-28T02:30:00Z"
            );
        }
    }
}