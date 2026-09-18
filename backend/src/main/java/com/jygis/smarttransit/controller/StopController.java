package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.service.StopService;
import org.springframework.web.bind.annotation.RequestParam;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stops")
@RequiredArgsConstructor
public class StopController {

    private final StopService stopService;

    @GetMapping
    public Result findAll() {
        return Result.success(stopService.findAll());
    }

    /**
     * 查询附近公交站
     */
    @GetMapping("/nearby")
    public Result findNearby(
            @RequestParam(name = "longitude", required = false) Double longitude,
            @RequestParam(name = "latitude", required = false) Double latitude,
            @RequestParam(name = "radiusMeters", defaultValue = "500") Double radiusMeters
    ) {
        if (longitude == null || latitude == null || radiusMeters == null) {
            return Result.error("longitude、latitude、radiusMeters 不能为空");
        }

        if (!Double.isFinite(longitude) || !Double.isFinite(latitude) || !Double.isFinite(radiusMeters)) {
            return Result.error("查询参数必须是有限数字");
        }

        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
            return Result.error("经纬度超出合法范围");
        }

        /*
         * 限制最大半径防止一次查询返回过多数据
         */
        if (radiusMeters <= 0 || radiusMeters > 5000) {
            return Result.error(
                    "radiusMeters 必须大于 0 且不超过 5000"
            );
        }

        return Result.success(
                stopService.findNearby(
                        longitude,
                        latitude,
                        radiusMeters
                )
        );
    }
}