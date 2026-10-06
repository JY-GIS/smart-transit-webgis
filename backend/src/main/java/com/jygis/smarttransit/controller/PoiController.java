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
        String validationMessage = validateQueryParameters(
                longitude,
                latitude,
                radiusMeters
        );

        if (validationMessage != null) {
            return Result.error(validationMessage);
        }

        return Result.success(
                poiService.findNearby(
                        longitude,
                        latitude,
                        radiusMeters
                )
        );
    }

    /**
     * 【★★★核心：需要达到可以自己解释并重新写出的程度】
     * 校验统计范围，并返回附近 POI 分类数量。
     */
    @GetMapping("/summary")
    public Result summarizeNearby(
            @RequestParam(name = "longitude", required = false) Double longitude,
            @RequestParam(name = "latitude", required = false) Double latitude,
            @RequestParam(name = "radiusMeters", defaultValue = "500") Double radiusMeters
    ) {
        String validationMessage = validateQueryParameters(
                longitude,
                latitude,
                radiusMeters
        );

        if (validationMessage != null) {
            return Result.error(validationMessage);
        }

        return Result.success(
                poiService.summarizeNearby(
                        longitude,
                        latitude,
                        radiusMeters
                )
        );
    }

    /**
     * 【标准写法，建议学习】
     * 统一校验附近 POI 明细和分类统计接口的空间参数。
     */
    private String validateQueryParameters(
            Double longitude,
            Double latitude,
            Double radiusMeters
    ) {
        if (longitude == null || latitude == null) {
            return "longitude、latitude 不能为空";
        }
        if (!Double.isFinite(longitude) || !Double.isFinite(latitude) || !Double.isFinite(radiusMeters)) {
            return "查询参数必须是有限数字";
        }
        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
            return "经纬度超出合法范围";
        }
        if (radiusMeters <= 0 || radiusMeters > 1000) {
            return "radiusMeters 必须大于 0 且不超过 1000";
        }
        return null;
    }
}