package com.jygis.smarttransit.pojo;

import lombok.Data;

/**
 * 根据线路进度插值得到的经纬度
 */
@Data
public class RouteInterpolatedPosition {

    // 插值位置的经度
    private Double longitude;

    // 插值位置的纬度
    private Double latitude;
}