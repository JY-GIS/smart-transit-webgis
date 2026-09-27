package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.StopArrivalBoard;

/**
 * 线路站点到站查询服务。
 */
public interface StopArrivalService {

    /**
     * 查询指定线路、指定站点即将到达的车辆。
     */
    StopArrivalBoard findArrivals(
            String routeId,
            String stopId,
            int limit
    );
}