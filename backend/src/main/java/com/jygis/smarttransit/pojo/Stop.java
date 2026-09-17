package com.jygis.smarttransit.pojo;

import lombok.Data;

@Data
public class Stop {

    private String stopId;

    private String stopName;

    private Double longitude;

    private Double latitude;
}