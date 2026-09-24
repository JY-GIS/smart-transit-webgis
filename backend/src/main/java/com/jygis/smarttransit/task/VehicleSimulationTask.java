package com.jygis.smarttransit.task;

import com.jygis.smarttransit.config.VehicleSimulationProperties;
import com.jygis.smarttransit.config.VehicleSimulationProperties.VehicleSeed;
import com.jygis.smarttransit.pojo.RouteSimulationProfile;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleRuntimeState;
import com.jygis.smarttransit.pojo.RouteStopMeasure;
import com.jygis.smarttransit.pojo.VehicleMotionStatus;
import com.jygis.smarttransit.service.VehicleRuntimeStore;
import com.jygis.smarttransit.service.VehicleSimulationService;
import com.jygis.smarttransit.realtime.VehiclePositionPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.List;

/**
 * 后端多车辆模拟定时任务。
 *
 * 职责：
 * - 第一次执行时加载 M103 线路档案；
 * - 创建车辆初始状态；
 * - 后续根据真实时间差推进累计里程；
 * - 调用 VehicleSimulationService 计算最新位置；
 * - 用新状态整体替换旧状态。
 *
 * 当前阶段：
 * - 一条线路；
 * - 三辆车辆；
 * - 每辆车具有独立速度和累计里程；
 * - 所有车辆共享同一个 RouteSimulationProfile。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class VehicleSimulationTask {

    private static final double NANOS_PER_SECOND = 1_000_000_000.0;

    private static final double DISTANCE_EPSILON_METERS = 1e-6;

    private final VehicleSimulationProperties properties;

    private final VehicleSimulationService vehicleSimulationService;

    private final VehicleRuntimeStore vehicleRuntimeStore;

    private final VehiclePositionPublisher vehiclePositionPublisher;

    /**
     * 当前任务已经加载的线路模拟档案。
     */
    private RouteSimulationProfile routeProfile;

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
        if (!properties.isEnabled()) {
            return;
        }

        /*
         * 全部车辆使用同一个 now。
         *
         * 如果在循环内分别调用 Instant.now()，三辆车会得到略有差异的时间基准。
         * 统一时刻可以确保相同速度的车辆只保留业务上的位置差异。
         */
        Instant now = Instant.now();

        RouteSimulationProfile currentRouteProfile;

        try {
            validateVehicleIds();
            validateApproachConfiguration();

            currentRouteProfile = getOrLoadRouteProfile();
        } catch (RuntimeException exception) {
            /*
             * 线路 Profile 是全部车辆的共同依赖。
             * 加载失败时，本次所有车辆都不能继续计算。
             */
            log.error(
                    "模拟线路档案加载失败，routeId={}",
                    properties.getRouteId(),
                    exception
            );

            return;
        }

        for (VehicleSeed vehicleSeed : properties.getVehicles()) {

            try {
                tickVehicle(
                        vehicleSeed,
                        currentRouteProfile,
                        now
                );
            } catch (RuntimeException exception) {
                /*
                 * 单辆车失败时只记录该车辆错误，循环继续推进其他车辆。
                 */
                log.error("模拟车辆 tick 执行失败，vehicleId={}", vehicleSeed.getVehicleId(), exception);
            }
        }

        /*
         * 必须等本轮所有车辆完成初始化或推进后再统一发布。
         */
        try {
            vehiclePositionPublisher.publishCurrentPositions();
        } catch (RuntimeException exception) {
            /*
             * WebSocket 发布失败不回滚已经计算完成的车辆状态
             */
            log.error("车辆实时位置发布失败", exception);
        }
    }

    /**
     * 校验配置中的 vehicleId 不重复。
     */
    private void validateVehicleIds() {
        Set<String> vehicleIds = new HashSet<>();

        for (VehicleSeed vehicleSeed : properties.getVehicles()) {

            String vehicleId = vehicleSeed.getVehicleId();

            if (!vehicleIds.add(vehicleId)) {
                throw new IllegalStateException("模拟车辆 ID 重复：" + vehicleId);
            }
        }
    }

    /**
     * 校验进站速度配置与车辆巡航速度之间的关系。
     */
    private void validateApproachConfiguration() {
        for (VehicleSeed vehicleSeed : properties.getVehicles()) {

            if (properties.getMinimumApproachSpeedMetersPerSecond()
                    > vehicleSeed.getSpeedMetersPerSecond()) {

                throw new IllegalStateException(
                        "最低进站速度不能大于车辆巡航速度：" + vehicleSeed.getVehicleId()
                );
            }
        }
    }

    /**
     * 第一次使用时加载线路档案，后续直接复用。
     */
    private RouteSimulationProfile getOrLoadRouteProfile() {
        if (routeProfile == null) {
            routeProfile = vehicleSimulationService.loadRouteProfile(properties.getRouteId());

            log.info(
                    "模拟线路档案加载完成，routeId={}，" + "routeLength={}m，stopCount={}",
                    properties.getRouteId(),
                    routeProfile.routeInfo().getTotalLengthMeters(),
                    routeProfile.stops().size()
            );
        }

        return routeProfile;
    }

    /**
     * 初始化或推进一辆车。
     */
    private void tickVehicle(
            VehicleSeed vehicleSeed,
            RouteSimulationProfile currentRouteProfile,
            Instant now
    ) {
        String vehicleId = vehicleSeed.getVehicleId();

        VehicleRuntimeState currentState = vehicleRuntimeStore.find(vehicleId);

        if (currentState == null) {
            initializeVehicle(
                    vehicleSeed,
                    currentRouteProfile,
                    now
            );

            return;
        }

        advanceVehicle(currentState, now);
    }
    /**
     * 按 VehicleSeed 的初始进度创建一辆车。
     */
    private void initializeVehicle(
            VehicleSeed vehicleSeed,
            RouteSimulationProfile currentRouteProfile,
            Instant now
    ) {
        double totalLengthMeters = currentRouteProfile.routeInfo().getTotalLengthMeters();

        /*
         * 初始里程 = 线路总长度 × 初始进度比例
         */
        double initialDistanceMeters = totalLengthMeters * vehicleSeed.getInitialProgressRatio();

        /*
         * 确定车辆启动时面对的目标站。
         */
        int initialTargetStopIndex =
                findInitialTargetStopIndex(
                        currentRouteProfile.stops(),
                        initialDistanceMeters
                );


        VehiclePositionSnapshot initialSnapshot =
                vehicleSimulationService
                        .calculateSnapshot(
                                vehicleSeed.getVehicleId(),
                                currentRouteProfile,
                                initialDistanceMeters
                        );

        VehicleRuntimeState initialState =
                new VehicleRuntimeState(
                        vehicleSeed.getVehicleId(),
                        currentRouteProfile,
                        vehicleSeed.getSpeedMetersPerSecond(),
                        vehicleSeed.getSpeedMetersPerSecond(),
                        initialTargetStopIndex,
                        VehicleMotionStatus.CRUISING,
                        null,
                        initialDistanceMeters,
                        now,
                        initialSnapshot
                );

        vehicleRuntimeStore.save(initialState);

        log.info(
                "模拟车辆初始化完成，vehicleId={}，"
                        + "routeId={}，speed={}m/s，"
                        + "motionStatus={}，"
                        + "targetStopSequence={}，"
                        + "targetStopName={}，"
                        + "initialProgress={}%，"
                        + "initialDistance={}m",
                initialState.vehicleId(),
                currentRouteProfile.routeInfo().getRouteId(),
                initialState.speedMetersPerSecond(),
                initialState.motionStatus(),
                initialState.targetStop().getStopSequence(),
                initialState.targetStop().getStopName(),
                vehicleSeed.getInitialProgressRatio() * 100.0,
                initialDistanceMeters
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
         * 停站车辆不能继续执行后面的里程推进公式，否则即使状态为 DWELLING，累计里程仍然会增加。
         */
        if (currentState.motionStatus() == VehicleMotionStatus.DWELLING) {

            advanceDwellingVehicle(
                    currentState,
                    now
            );

            return;
        }

        double elapsedSeconds = elapsed.toNanos() / NANOS_PER_SECOND;

        /*
         * 先计算目标站的累计里程和剩余沿线距离，再根据剩余距离决定本 tick 的状态与速度。
         */
        double targetAccumulatedDistanceMeters =
                calculateTargetAccumulatedDistance(
                        currentState.accumulatedDistanceMeters(),
                        currentState
                                .routeProfile()
                                .routeInfo()
                                .getTotalLengthMeters(),
                        currentState
                                .targetStop()
                                .getDistanceAlongRouteMeters()
                );

        double distanceToTargetStopMeters =
                Math.max(
                        0,
                        targetAccumulatedDistanceMeters - currentState.accumulatedDistanceMeters()
                );

        /*
         * 距离大于配置的减速区间：CRUISING；
         * 距离小于等于配置的减速区间：APPROACHING。
         */
        boolean approaching =
                distanceToTargetStopMeters <= properties.getApproachDistanceMeters();

        VehicleMotionStatus movingMotionStatus =
                approaching
                        ? VehicleMotionStatus.APPROACHING
                        : VehicleMotionStatus.CRUISING;

        /*
         * 进站区间内使用动态速度，进站区间外使用车辆配置的巡航速度。
         */
        double movementSpeedMetersPerSecond =
                approaching
                        ? calculateApproachSpeed(currentState.speedMetersPerSecond(), distanceToTargetStopMeters)
                        : currentState.speedMetersPerSecond();

        double requestedDistanceDeltaMeters = movementSpeedMetersPerSecond * elapsedSeconds;

        /*
         * 即使减速后本次位移仍可能超过剩余距离，所以继续使用到站吸附限制。
         */
        boolean reachesTargetStop =
                (requestedDistanceDeltaMeters + DISTANCE_EPSILON_METERS) >= distanceToTargetStopMeters;

        double actualDistanceDeltaMeters =
                reachesTargetStop
                        ? distanceToTargetStopMeters
                        : requestedDistanceDeltaMeters;

        double nextAccumulatedDistanceMeters =
                currentState.accumulatedDistanceMeters() + actualDistanceDeltaMeters;

        if (!Double.isFinite(nextAccumulatedDistanceMeters)) {
            throw new IllegalStateException("车辆累计里程溢出：" + currentState.vehicleId());
        }

        /*
         * 到达目标站后先进入 DWELLING，不能立即把目标切换到下一站。
         */
        VehicleMotionStatus nextMotionStatus =
                reachesTargetStop ? VehicleMotionStatus.DWELLING : movingMotionStatus;

        /*
         * 固定延误同时满足三个条件才会触发：
         * 1. 车辆本次确实到达了目标站；
         * 2. 当前车辆是配置指定的延误车辆；
         * 3. 当前目标站是配置指定的延误站点；
         */
        boolean fixedDelayApplies =
                reachesTargetStop &&
                currentState.vehicleId().equals(properties.getDelayVehicleId()) &&
                currentState.targetStop().getStopSequence() == properties.getDelayStopSequence();

        /*
         * 普通车辆只使用基础停站时间。指定车辆到达指定站点时，再加上额外延误时间。
         */
        long nextDwellDurationSeconds = properties.getDwellDurationSeconds();

        if (fixedDelayApplies) {
            nextDwellDurationSeconds += properties.getExtraDwellDurationSeconds();
        }

        /*
         * dwellUntil 保存明确的停站结束时刻。
         * 后续 tick 只需要比较 now 与 dwellUntil，不需要自己累计已经停靠了多少秒。
         */
        Instant nextDwellUntil =
                reachesTargetStop
                        ? now.plusSeconds(nextDwellDurationSeconds)
                        : null;
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
                        currentState.speedMetersPerSecond(),
                        reachesTargetStop ? 0 : movementSpeedMetersPerSecond,
                        currentState.targetStopIndex(),
                        nextMotionStatus,
                        nextDwellUntil,
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

        if (reachesTargetStop) {
            log.info(
                    "模拟车辆到站，vehicleId={}，"
                            + "stopSequence={}，"
                            + "stopName={}，"
                            + "dwellUntil={}",
                    nextState.vehicleId(),
                    nextState.targetStop().getStopSequence(),
                    nextState.targetStop().getStopName(),
                    nextState.dwellUntil()
            );
        }

        /*
         * 每秒打印一次 INFO 会产生大量日志，
         * 因此普通运行过程使用 DEBUG。
         */
        log.debug(
                "模拟车辆推进完成，vehicleId={}，"
                        + "elapsedSeconds={}，"
                        + "actualDistanceDelta={}m，"
                        + "reachesTargetStop={}，"
                        + "motionStatus={}，"
                        + "currentSpeed={}m/s，"
                        + "accumulatedDistance={}m，"
                        + "routeDistance={}m，"
                        + "progress={}%，"
                        + "targetStopSequence={}，"
                        + "targetStopName={}",
                nextState.vehicleId(),
                elapsedSeconds,
                actualDistanceDeltaMeters,
                reachesTargetStop,
                nextState.motionStatus(),
                nextState.currentSpeedMetersPerSecond(),
                nextState.accumulatedDistanceMeters(),
                nextSnapshot.distanceMeters(),
                nextSnapshot.routeProgressPercent(),
                nextState.targetStop().getStopSequence(),
                nextState.targetStop().getStopName()
        );
    }

    /**
     * 推进一辆正在站点停留的车辆。
     */
    private void advanceDwellingVehicle(
            VehicleRuntimeState currentState,
            Instant now
    ) {
        /*
         * 当前时刻仍早于停站结束时刻
         */
        if (now.isBefore(currentState.dwellUntil())) {

            VehicleRuntimeState nextDwellingState =
                    new VehicleRuntimeState(
                            currentState.vehicleId(),
                            currentState.routeProfile(),
                            currentState.speedMetersPerSecond(),
                            0,
                            currentState.targetStopIndex(),
                            VehicleMotionStatus.DWELLING,
                            currentState.dwellUntil(),
                            currentState.accumulatedDistanceMeters(),
                            now,
                            currentState.latestSnapshot()
                    );

            vehicleRuntimeStore.save(
                    nextDwellingState
            );

            log.debug(
                    "模拟车辆继续停站，vehicleId={}，"
                            + "stopSequence={}，"
                            + "dwellUntil={}",
                    nextDwellingState.vehicleId(),
                    nextDwellingState
                            .targetStop()
                            .getStopSequence(),
                    nextDwellingState.dwellUntil()
            );

            return;
        }

        /*
         * 停站时间结束后，才把目标索引切换到下一站。
         *（ % 负责将最后一个站点索引回到 0 ）
         */
        int nextTargetStopIndex =
                (currentState.targetStopIndex() + 1)
                        % currentState
                            .routeProfile()
                            .stops()
                            .size();

        VehicleRuntimeState departureState =
                new VehicleRuntimeState(
                        currentState.vehicleId(),
                        currentState.routeProfile(),
                        currentState.speedMetersPerSecond(),
                        currentState.speedMetersPerSecond(),
                        nextTargetStopIndex,
                        VehicleMotionStatus.CRUISING,
                        null,
                        currentState.accumulatedDistanceMeters(),
                        now,
                        currentState.latestSnapshot()
                );

        vehicleRuntimeStore.save(
                departureState
        );

        log.info(
                "模拟车辆结束停站，vehicleId={}，"
                        + "nextStopSequence={}，"
                        + "nextStopName={}",
                departureState.vehicleId(),
                departureState.targetStop().getStopSequence(),
                departureState.targetStop().getStopName()
        );
    }

    /**
     * 根据距目标站的沿线距离计算进站速度。
     */
    private double calculateApproachSpeed(
            double cruiseSpeedMetersPerSecond,
            double distanceToTargetStopMeters
    ) {
        /*
         * 线性距离比例： 当前速度 = 巡航速度 × 剩余距离 ÷ 减速区间长度
         */
        double proportionalSpeedMetersPerSecond =
                cruiseSpeedMetersPerSecond * distanceToTargetStopMeters / properties.getApproachDistanceMeters();
        /*
         * 最低速度避免车辆速度无限接近 0，导致永远无法满足到站条件。
         */
        return Math.max(
                properties.getMinimumApproachSpeedMetersPerSecond(),
                proportionalSpeedMetersPerSecond
        );
    }

    /**
     * 把站点的单圈里程转换为车辆当前圈次中的累计里程。
     *
     * 例：
     * - 线路总长：18000m
     * - 车辆累计里程：19000m
     * - 目标站单圈里程：2000m
     *
     * 目标站对应的累计里程应为：18000 + 2000 = 20000m
     */
    private double calculateTargetAccumulatedDistance(
            double currentAccumulatedDistanceMeters,
            double totalDistanceMeters,
            double targetRouteDistanceMeters
    ) {
        // Math.floor(current / total) 得到车辆已经进入的圈次。
        double cycleStartDistanceMeters =
                Math.floor(currentAccumulatedDistanceMeters / totalDistanceMeters) * totalDistanceMeters;

        double targetAccumulatedDistanceMeters =
                cycleStartDistanceMeters + targetRouteDistanceMeters;

        /*
         * 如果计算出的目标已经明显位于车辆身后，说明这个目标属于下一圈。
         */
        if (targetAccumulatedDistanceMeters < currentAccumulatedDistanceMeters - DISTANCE_EPSILON_METERS) {

            targetAccumulatedDistanceMeters += totalDistanceMeters;
        }

        return targetAccumulatedDistanceMeters;
    }

    /**
     * 查找车辆初始位置所在或前方的第一个站点。
     */
    private int findInitialTargetStopIndex(
            List<RouteStopMeasure> stops,
            double initialDistanceMeters
    ) {
        if (stops.isEmpty()) {
            throw new IllegalStateException("模拟线路没有可用站点");
        }

        for (int index = 0; index < stops.size(); index++) {
            double stopDistanceMeters = stops.get(index).getDistanceAlongRouteMeters();

            // 减去极小误差，可以让初始位置恰好等于站点里程时，仍然选中当前站点，而不是误选下一站。
            if (stopDistanceMeters >= initialDistanceMeters - DISTANCE_EPSILON_METERS) {
                return index;
            }
        }

        return 0;
    }
}