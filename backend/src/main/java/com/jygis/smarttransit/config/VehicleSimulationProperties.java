package com.jygis.smarttransit.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import java.util.List;

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
     * 定时任务两次执行之间的延迟，单位为毫秒。
     */
    @Positive
    private long tickIntervalMilliseconds;

    /**
     * 需要运行的车辆配置列表。
     */
    @NotEmpty // @NotEmpty 保证列表至少有一辆车
    @Valid    // @Valid 保证 Spring 不仅校验 vehicles 列表本身，还会继续校验每一个 VehicleSeed 中的字段
    private List<VehicleSeed> vehicles;

    /**
     * 一辆模拟车辆的初始化配置。
     */
    @Data
    public static class VehicleSeed {

        /**
         * 车辆业务唯一编号。
         */
        @NotBlank
        private String vehicleId;

        /**
         * 车辆速度，单位为米/秒。
         */
        @Positive
        private double speedMetersPerSecond;

        /**
         * 车辆初始线路进度，范围为： 0 <= initialProgressRatio < 1
         * 使用不同初始比例，可以让多辆车从线路上的不同位置开始，避免全部车辆重叠在线路起点。
         */
        @DecimalMin(value = "0.0", inclusive = true)
        @DecimalMax(value = "1.0", inclusive = false)
        private double initialProgressRatio;
    }
}