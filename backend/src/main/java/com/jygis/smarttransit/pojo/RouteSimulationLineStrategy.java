package com.jygis.smarttransit.pojo;

/**
 * 车辆模拟实际使用的线路几何策略。
 *
 * ORIGINAL_LINE：原始线路首末端点与首末站匹配，直接使用完整线路。
 *
 * SUBSTRING_LINE：原始线路包含首站之前或末站之后的额外部分，模拟层只使用首站投影点到末站投影点之间的有效子线。
 */
public enum RouteSimulationLineStrategy {

    // 使用完整的原始合并线路
    ORIGINAL_LINE,

    // 使用从首站投影点到末站投影点截取的有效子线
    SUBSTRING_LINE
}