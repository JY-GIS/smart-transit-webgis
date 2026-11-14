package com.jygis.smarttransit.pojo;

/** 对外统一使用 WGS84；无坐标的输入提示需继续搜索，不能直接定位。 */
public record PlaceSearchResult(
        String id, String name, String district, String address, String adcode,
        Double longitude, Double latitude) {
}
