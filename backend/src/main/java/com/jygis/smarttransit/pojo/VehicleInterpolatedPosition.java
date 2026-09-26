package com.jygis.smarttransit.pojo;

import lombok.Data;

/**
 * PostGIS 批量位置插值返回的一辆车辆坐标。
 * - vehicleId 是批量请求和批量结果之间的关联键。
 * - longitude、latitude 是 PostGIS 根据线路进度计算出的经纬度。
 */
@Data
public class VehicleInterpolatedPosition {

    private String vehicleId;

    private Double longitude;

    private Double latitude;
}
