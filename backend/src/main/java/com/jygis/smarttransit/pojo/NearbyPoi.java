package com.jygis.smarttransit.pojo;

import lombok.Data;

/**
 * 保存附近 POI 查询结果
 */
@Data
public class NearbyPoi {

    private Long poiId;

    private String name;

    private String sourceCategory;

    private String sourceSubcategory;

    private String poiType;

    private Double longitude;

    private Double latitude;

    private Double distanceMeters;
}