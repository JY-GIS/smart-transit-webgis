package com.jygis.smarttransit.task;

import com.jygis.smarttransit.config.VehicleSimulationProperties;
import com.jygis.smarttransit.pojo.RouteSimulationProfile;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleRuntimeState;
import com.jygis.smarttransit.service.VehicleRuntimeStore;
import com.jygis.smarttransit.service.VehicleSimulationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * 后端单车模拟定时任务。
 *
 * 职责：
 * - 第一次执行时加载 M103 线路档案；
 * - 创建车辆初始状态；
 * - 后续根据真实时间差推进累计里程；
 * - 调用 VehicleSimulationService 计算最新位置；
 * - 用新状态整体替换旧状态。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class VehicleSimulationTask {

    private static final double NANOS_PER_SECOND = 1_000_000_000.0;

    private final VehicleSimulationProperties properties;

    private final VehicleSimulationService vehicleSimulationService;

    private final VehicleRuntimeStore vehicleRuntimeStore;

    /**
     * 周期推进模拟车辆。
     *
     * - fixedDelayString 表示：上一次任务执行完成后，再等待指定毫秒数，然后开始下一次执行。
     * - 这里使用 fixedDelay 而不是 fixedRate，可以避免上一次数据库查询尚未结束时，下一次任务又开始执行。
     * - initialDelayString 表示：应用启动后先等待一个 tick 周期，再执行第一次初始化。
     */
    @Scheduled(
            // 首次执行的延迟时间
            initialDelayString = "${transit.simulation.tick-interval-milliseconds}",
            // 两次执行之间的固定延迟
            fixedDelayString = "${transit.simulation.tick-interval-milliseconds}"
    )
    public void tick() {
        /*
         * enabled=false 时保留定时任务注册，
         * 但每次调用立即返回，不创建或推进车辆。
         */
        if (!properties.isEnabled()) {
            return;
        }

        String vehicleId = properties.getVehicleId();

        Instant now = Instant.now();

        try {
            VehicleRuntimeState currentState = vehicleRuntimeStore.find(vehicleId);

            if (currentState == null) {
                initializeVehicle(vehicleId, now);

                return;
            }

            advanceVehicle( currentState, now);
        } catch (RuntimeException exception) {
            log.error(
                    "模拟车辆 tick 执行失败，vehicleId={}",
                    vehicleId,
                    exception
            );
        }
    }

    /**
     * 第一次 tick 时初始化车辆。
     */
    private void initializeVehicle(
            String vehicleId,
            Instant now
    ) {
        String routeId = properties.getRouteId();

        /*
         * 线路 Profile 只在车辆初始化时加载一次。
         *
         * 后续 tick 会从 VehicleRuntimeState 中复用，不会每秒重新查询线路长度和全部站点。
         */
        RouteSimulationProfile routeProfile =
                vehicleSimulationService
                        .loadRouteProfile(
                                routeId
                        );

        double initialDistanceMeters = 0.0;

        VehiclePositionSnapshot initialSnapshot =
                vehicleSimulationService
                        .calculateSnapshot(
                                vehicleId,
                                routeProfile,
                                initialDistanceMeters
                        );

        VehicleRuntimeState initialState =
                new VehicleRuntimeState(
                        vehicleId,
                        routeProfile,
                        properties.getSpeedMetersPerSecond(),
                        initialDistanceMeters,
                        now,
                        initialSnapshot
                );

        /*
         * 所有初始化步骤成功后再保存状态。
         *
         * 如果先保存半成品，再进行位置查询，其他线程可能读取到缺少 Snapshot 的状态。
         */
        vehicleRuntimeStore.save(
                initialState
        );

        log.info(
                "模拟车辆初始化完成，vehicleId={}，routeId={}，"
                        + "speed={}m/s，routeLength={}m",
                vehicleId,
                routeId,
                initialState.speedMetersPerSecond(),
                routeProfile
                        .routeInfo()
                        .getTotalLengthMeters()
        );
    }

    /**
     * 根据旧状态和当前时间推进车辆。
     */
    private void advanceVehicle(
            VehicleRuntimeState currentState,
            Instant now
    ) {
        /*
         * Duration.between 计算两个明确时刻之间的真实时间差。
         *
         * 不能直接假定每次 tick 都正好经过 1 秒，
         * 因为：
         * - 数据库查询需要时间；
         * - JVM 可能发生 GC；
         * - 操作系统调度可能延迟；
         * - fixedDelay 从上一次任务结束后开始计时。
         */
        Duration elapsed =
                Duration.between(
                        currentState.lastUpdatedAt(),
                        now
                );

        /*
         * 系统时钟可能被人工或时间同步服务向后调整。
         * 如果时间差为 0 或负数，本次不推进，也不覆盖旧状态。
         */
        if (elapsed.isZero() || elapsed.isNegative()) {

            log.warn(
                    "模拟车辆时间没有向前推进，vehicleId={}，"
                            + "lastUpdatedAt={}，now={}",
                    currentState.vehicleId(),
                    currentState.lastUpdatedAt(),
                    now
            );

            return;
        }

        /*
         * Duration.toNanos 返回纳秒数。
         * 除以 10^9 转换成带小数的秒数。
         */
        double elapsedSeconds = elapsed.toNanos() / NANOS_PER_SECOND;

        /*
         * 车辆推进公式：新累计里程 = 旧累计里程 + 速度 × 实际时间差
         */
        double distanceDeltaMeters =
                currentState
                        .speedMetersPerSecond()
                        * elapsedSeconds;

        double nextAccumulatedDistanceMeters =
                currentState
                        .accumulatedDistanceMeters()
                        + distanceDeltaMeters;

        if (!Double.isFinite(
                nextAccumulatedDistanceMeters
        )) {
            throw new IllegalStateException(
                    "车辆累计里程溢出："
                            + currentState.vehicleId()
            );
        }

        VehiclePositionSnapshot nextSnapshot =
                vehicleSimulationService
                        .calculateSnapshot(
                                currentState.vehicleId(),
                                currentState.routeProfile(),
                                nextAccumulatedDistanceMeters
                        );

        /*
         * VehicleRuntimeState 是不可变 record。
         *
         * 每次 tick 创建完整的新对象，
         * 不修改 currentState 中的任何字段。
         */
        VehicleRuntimeState nextState =
                new VehicleRuntimeState(
                        currentState.vehicleId(),
                        currentState.routeProfile(),
                        currentState
                                .speedMetersPerSecond(),
                        nextAccumulatedDistanceMeters,
                        now,
                        nextSnapshot
                );

        /*
         * 所有计算完成后再整体替换旧状态。
         *
         * 如果 calculateSnapshot 抛出异常，
         * 代码不会运行到这里，Store 会继续保留旧状态。
         */
        vehicleRuntimeStore.save(
                nextState
        );

        /*
         * 每秒打印一次 INFO 会产生大量日志，
         * 因此普通运行过程使用 DEBUG。
         */
        log.debug(
                "模拟车辆推进完成，vehicleId={}，"
                        + "elapsedSeconds={}，"
                        + "accumulatedDistance={}m，"
                        + "routeDistance={}m，"
                        + "progress={}%",
                nextState.vehicleId(),
                elapsedSeconds,
                nextState.accumulatedDistanceMeters(),
                nextSnapshot.distanceMeters(),
                nextSnapshot.routeProgressPercent()
        );
    }
}