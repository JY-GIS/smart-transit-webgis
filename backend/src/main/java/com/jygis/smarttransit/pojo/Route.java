package com.jygis.smarttransit.pojo;

import lombok.Data;

@Data
public class Route {

    private String routeId;

    private Integer fid;

    private String rname;

    private String fsname;

    private String lsname;

    private String city;

    private String province;
}
