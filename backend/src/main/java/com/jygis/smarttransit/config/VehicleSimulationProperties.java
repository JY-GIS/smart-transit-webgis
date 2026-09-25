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
     * 定时任务两次执行之间的延迟，单位为毫秒。
     */
    @Positive
    private long tickIntervalMilliseconds;

    /**
     * 每次到站后的停留时间，单位为秒。
     */
    @Positive
    private long dwellDurationSeconds;

    /**
     * 开始进站减速的沿线距离，单位为米。
     */
    @Positive
    private double approachDistanceMeters;

    /**
     * 进站过程允许的最低速度，单位为米/秒。
     */
    @Positive
    private double minimumApproachSpeedMetersPerSecond;

    /**
     * 串车判定比例。
     */
    @DecimalMin(value = "0.0", inclusive = false)
    @DecimalMax(value = "1.0", inclusive = false)
    private double bunchingThresholdRatio;

    /**
     * 大间隔判定比例。
     */
    @DecimalMin(value = "1.0", inclusive = false)
    private double largeGapThresholdRatio;

    /**
     * 需要模拟固定延误的车辆编号。
     */
    @NotBlank
    private String delayVehicleId;

    /**
     * 指定车辆在哪一个站序触发额外停靠。
     */
    @Positive
    private int delayStopSequence;

    /**
     * 在普通停站时间之外增加的停靠秒数。
     */
    @Positive
    private long extraDwellDurationSeconds;

    // 需要同时运行的线路模拟计划
    @NotEmpty
    @Valid
    private List<RoutePlan> routes;

    /**
     * 由 VehicleSimulationTask 根据 RoutePlan 自动生成的一辆车辆初始化参数。
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

    /**
     * 一条线路的模拟计划。
     */
    @Data
    public static class RoutePlan {

        // 数据库中的线路业务编号
        @NotBlank
        private String routeId;

        // 自动生成车辆编号时使用的前缀
        @NotBlank
        private String vehicleIdPrefix;

        // 当前线路计划运行的车辆数量
        @Positive
        private int vehicleCount;

        // 当前线路模拟车辆的巡航速度
        @Positive
        private double speedMetersPerSecond;
    }
}