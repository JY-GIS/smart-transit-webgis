package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.service.PoiService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pois")
@RequiredArgsConstructor
public class PoiController {

    private final PoiService poiService;

    /**
     * 校验查询中心和半径，然后查询附近 POI。
     */
    @GetMapping("/nearby")
    public Result findNearby(
            @RequestParam(name = "longitude", required = false) Double longitude,
            @RequestParam(name = "latitude", required = false) Double latitude,
            @RequestParam(name = "radiusMeters", defaultValue = "500") Double radiusMeters
    ) {
        if (longitude == null || latitude == null) {
            return Result.error("longitude、latitude 不能为空");
        }

        if (!Double.isFinite(longitude) || !Double.isFinite(latitude) || !Double.isFinite(radiusMeters)) {
            return Result.error("查询参数必须是有限数字");
        }

        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
            return Result.error("经纬度超出合法范围");
        }

        if (radiusMeters <= 0 || radiusMeters > 1000) {
            return Result.error("radiusMeters 必须大于 0 且不超过 1000");
        }

        return Result.success(
                poiService.findNearby(
                        longitude,
                        latitude,
                        radiusMeters
                )
        );
    }
}