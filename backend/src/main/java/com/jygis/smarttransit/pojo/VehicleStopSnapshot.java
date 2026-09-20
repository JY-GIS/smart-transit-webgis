package com.jygis.smarttransit.pojo;

/**
 * 车辆状态中的站点快照 - 表示车辆当前已经经过的站点或即将到达的站点
 */
public record VehicleStopSnapshot(  // Java record 适合表示不可变的数据快照

        String stopId,

        String stopName,

        int stopSequence,

        // 该站点从线路起点开始的累计里程
        double distanceAlongRouteMeters
)
  {  }