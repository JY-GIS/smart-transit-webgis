package com.jygis.smarttransit.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

/**
 * 后端车辆模拟配置。
 *
 * 职责：
 * - 将 application.yml 中 transit.simulation 下的配置绑定成类型明确的 Java 对象；
 * - 在应用启动时验证配置是否合法；
 * - 避免在定时任务中硬编码线路、车辆和速度；
 */
@Data
@Component
@Validated
@ConfigurationProperties(
        prefix = "transit.simulation"
)
public class VehicleSimulationProperties {

    /**
     * 是否启用后端车辆模拟。
     */
    private boolean enabled;

    /**
     * 模拟线路编号，例如 route_000185。
     */
    @NotBlank
    private String routeId;

    /**
     * 模拟车辆编号。
     */
    @NotBlank
    private String vehicleId;

    /**
     * 车辆运行速度，单位为米/秒。
     */
    @Positive
    private double speedMetersPerSecond;

    /**
     * 定时任务两次执行之间的延迟，单位为毫秒。
     */
    @Positive
    private long tickIntervalMilliseconds;
}