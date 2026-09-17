package com.jygis.smarttransit.pojo;

import lombok.Data;

@Data
public class RouteStopDetail {

    private String routeId;

    private String stopId;

    private String stopName;

    private Double longitude;

    private Double latitude;

    private Integer stopSequence;
}