package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.service.VehicleQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 模拟车辆查询接口。
 *
 * 职责：
 * - 接收车辆相关的 HTTP 请求；
 * - 调用 VehicleQueryService 获取当前车辆快照；
 * - 使用项目统一的 Result 格式返回 JSON；
 */
@RestController
@RequestMapping("/api/vehicles")
@RequiredArgsConstructor
public class VehicleController {

    private final VehicleQueryService vehicleQueryService;

    /**
     * 查询全部模拟车辆的最新位置。
     */
    @GetMapping("/current")
    public Result findCurrentPositions() {
        return Result.success(vehicleQueryService.findCurrentPositions());
    }
}