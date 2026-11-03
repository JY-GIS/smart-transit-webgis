package com.jygis.smarttransit.config;

import jakarta.validation.constraints.Positive;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

/** 线路站点缓存配置；默认关闭，便于保留原始查询行为。 */
@Data
@Component
@Validated
@ConfigurationProperties(prefix = "transit.cache.route-stops")
public class RouteStopCacheProperties {

    private boolean enabled;

    @Positive
    private long ttlSeconds = 600;

    // 查不到站点时也缓存空列表，但用更短的有效期。
    @Positive
    private long emptyTtlSeconds = 30;
}
