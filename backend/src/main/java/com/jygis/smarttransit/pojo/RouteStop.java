package com.jygis.smarttransit.pojo;

import lombok.Data;

@Data
public class RouteStop {

    private String routeId;

    private String stopId;

    private Integer stopSequence;
}