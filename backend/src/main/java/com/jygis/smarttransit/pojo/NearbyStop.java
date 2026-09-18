package com.jygis.smarttransit.pojo;

import lombok.Data;

@Data
public class NearbyStop {

    private String stopId;

    private String stopName;

    private Double longitude;

    private Double latitude;

    private Double distanceMeters;
}