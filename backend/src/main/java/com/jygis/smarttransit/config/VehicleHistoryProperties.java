package com.jygis.smarttransit.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import java.util.List;

/**
 * 车辆历史轨迹配置。
 */
@Data
@Component
@Validated
@ConfigurationProperties(prefix = "transit.history")
public class VehicleHistoryProperties {

    // 是否启用车辆历史采样
    private boolean enabled;

    // 历史位置采样间隔，单位为秒
    @Positive
    private long sampleIntervalSeconds;

    // 历史数据保留天数
    @Positive
    private int retentionDays;

    // 单次轨迹查询允许的最大时间跨度，单位为分钟 - ( 防止一次请求读取过多轨迹点 )
    @Positive
    private long maximumQueryRangeMinutes;

    // 需要记录历史轨迹的线路
    @NotEmpty
    private List<@NotBlank String> trackedRouteIds;
}