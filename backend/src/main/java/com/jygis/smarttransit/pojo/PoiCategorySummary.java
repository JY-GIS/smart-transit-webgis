package com.jygis.smarttransit.pojo;

import lombok.Data;

/**
 * 保存指定服务范围内的 POI 总数和六类业务数量。
 */
@Data
public class PoiCategorySummary {

    private Long totalCount;

    private Long medicalCount;

    private Long educationCount;

    private Long shoppingCount;

    private Long diningCount;

    private Long leisureCount;

    private Long transportCount;
}