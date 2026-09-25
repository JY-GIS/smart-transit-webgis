package com.jygis.smarttransit.task;

import com.jygis.smarttransit.config.VehicleSimulationProperties;
import com.jygis.smarttransit.config.VehicleSimulationProperties.VehicleSeed;
import com.jygis.smarttransit.config.VehicleSimulationProperties.RoutePlan;
import com.jygis.smarttransit.pojo.RouteSimulationProfile;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleRuntimeState;
import com.jygis.smarttransit.pojo.RouteStopMeasure;
import com.jygis.smarttransit.pojo.VehicleMotionStatus;
import com.jygis.smarttransit.service.VehicleRuntimeStore;
import com.jygis.smarttransit.service.VehicleSimulationService;
import com.jygis.smarttransit.service.VehicleSimulationMetrics;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

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
 * - 支持配置多条模拟线路；
 * - 每条线路拥有独立的 RouteSimulationProfile；
 * - 每条线路根据 RoutePlan 自动生成车辆；
 * - 所有线路共用同一个 tick 时间基准；
 * - 单条线路加载失败时不阻止其他线路继续运行。
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

    private final VehicleSimulationMetrics simulationMetrics;

    /**
     * 已经加载的多条线路档案。
     * key：routeId，例如 route_000185。
     * value：当前线路的 RouteSimulationProfile，包含线路长度和有序站点里程。
     */
    private final Map<String, RouteSimulationProfile> routeProfiles = new HashMap<>();

    /**
     * 已完成的 tick 数量，只用于控制指标日志频率。
     * fixedDelay 默认串行执行，因此这里不需要 AtomicLong。
     */
    private long completedTickCount;

    /**
     * 周期推进全部配置线路中的模拟车辆。
     * - 执行顺序 - ：
     * 1. 校验多线路配置；
     * 2. 生成本轮统一时间；
     * 3. 逐条加载线路档案；
     * 4. 逐辆初始化或推进车辆；
     * 5. 全部线路处理完成后统一发布快照。
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

        // System.nanoTime 专门用于计算经过时间，不受系统时钟校准影响
        long tickStartedAtNanos = System.nanoTime();

        simulationMetrics.beginTick();

        // 全部线路、全部车辆共用同一个 now
        Instant now = Instant.now();

        try {
            validateRoutePlans();
            validateApproachConfiguration();
        } catch (RuntimeException exception) {
            log.error("模拟线路配置校验失败", exception);
            return;
        }

        // 外层循环处理线路。当前循环中的 routeProfile 只属于当前 routePlan。
        for (RoutePlan routePlan : properties.getRoutes()) {

            RouteSimulationProfile currentRouteProfile;

            try {
                currentRouteProfile = getOrLoadRouteProfile(routePlan.getRouteId());
            } catch (RuntimeException exception) {
                log.error(
                        "模拟线路档案加载失败，routeId={}",
                        routePlan.getRouteId(),
                        exception
                );
                continue;
            }

            List<VehicleSeed> vehicleSeeds = createVehicleSeeds(routePlan);
            // 内层循环只处理当前线路生成的车辆。
            for (VehicleSeed vehicleSeed : vehicleSeeds) {
                try {
                    tickVehicle(
                            vehicleSeed,
                            currentRouteProfile,
                            now
                    );
                } catch (RuntimeException exception) {
                    log.error(
                            "模拟车辆 tick 执行失败，" + "routeId={}，vehicleId={}",
                            routePlan.getRouteId(),
                            vehicleSeed.getVehicleId(),
                            exception
                    );
                }
            }
        }

        // 所有线路处理完成后再统一发布
        try {
            vehiclePositionPublisher.publishCurrentPositions();
        } catch (RuntimeException exception) {
            // WebSocket 发布失败不回滚已经推进完成的车辆状态
            log.error("车辆实时位置发布失败", exception);
        }

        completedTickCount++;

        // 每10轮输出一次，避免每秒产生一条性能日志
        if (completedTickCount % 10 == 0) {
            logTickMetrics(tickStartedAtNanos);
        }
    }

    /**
     * 输出当前区域级模拟的轻量性能指标。
     * 当前先记录：
     * - 成功加载的线路数量；
     * - 当前车辆快照数量；
     * - 本轮 PostGIS 位置查询次数；
     * - 单次 tick 总耗时；
     * - JVM 已使用堆内存；
     */
    private void logTickMetrics(long tickStartedAtNanos) {
        long tickDurationNanos = System.nanoTime() - tickStartedAtNanos;

        double tickDurationMilliseconds = tickDurationNanos / 1_000_000.0;

        Runtime runtime = Runtime.getRuntime();

        long usedHeapBytes = runtime.totalMemory() - runtime.freeMemory();

        double usedHeapMegabytes = usedHeapBytes / 1024.0 / 1024.0;

        log.info(
                "模拟 tick 指标，" + "routeCount={}，" + "snapshotCount={}，"+
                "positionQueryCount={}，" + "duration={}ms，" + "usedHeap={}MB",
                routeProfiles.size(),
                vehicleRuntimeStore.findAll().size(),
                simulationMetrics.positionQueryCount(),
                tickDurationMilliseconds,
                usedHeapMegabytes
        );
    }

    /**
     * 校验多线路配置生成的业务编号不会重复。
     */
    private void validateRoutePlans() {
        Set<String> routeIds = new HashSet<>();
        Set<String> vehicleIds = new HashSet<>();

        for (RoutePlan routePlan : properties.getRoutes()) {

            if (!routeIds.add(routePlan.getRouteId())) {
                throw new IllegalStateException("模拟线路 ID 重复：" + routePlan.getRouteId());
            }

            List<VehicleSeed> vehicleSeeds = createVehicleSeeds(routePlan);

            for (VehicleSeed vehicleSeed : vehicleSeeds) {

                if (!vehicleIds.add(vehicleSeed.getVehicleId())) {
                    throw new IllegalStateException("模拟车辆 ID 重复：" + vehicleSeed.getVehicleId());
                }
            }
        }

        // 固定延误车辆必须能由当前线路配置生成
        if (!vehicleIds.contains(properties.getDelayVehicleId())) {
            throw new IllegalStateException("固定延误车辆不在模拟计划中：" + properties.getDelayVehicleId());
        }
    }

    /**
     * 校验最低进站速度不能超过任何线路的巡航速度。
     */
    private void validateApproachConfiguration() {
        for (RoutePlan routePlan : properties.getRoutes()) {

            if (properties.getMinimumApproachSpeedMetersPerSecond()
                    > routePlan.getSpeedMetersPerSecond()
            ) {
                throw new IllegalStateException(
                        "最低进站速度不能大于线路车辆巡航速度：" + routePlan.getRouteId()
                );
            }
        }
    }

    /**
     * 加载并缓存指定线路的模拟档案。
     * 第一次收到 routeId：→ 查询数据库 → 创建 RouteSimulationProfile → 保存到 routeProfiles;
     * 后续再次收到相同 routeId：→ 直接返回缓存 → 不重复查询线路长度和全部站点。
     */
    private RouteSimulationProfile getOrLoadRouteProfile(String routeId) {
        RouteSimulationProfile cachedProfile = routeProfiles.get(routeId);

        // 先查缓存，命中后立即返回，可以减少后续代码的嵌套层级。
        if (cachedProfile != null) {
            return cachedProfile;
        }

        RouteSimulationProfile loadedProfile = vehicleSimulationService.loadRouteProfile(routeId);

        // 只有完整加载成功后才写入缓存。
        routeProfiles.put(routeId, loadedProfile);

        log.info(
                "模拟线路档案加载完成，routeId={}，" + "routeLength={}m，stopCount={}",
                routeId,
                loadedProfile.routeInfo().getTotalLengthMeters(),
                loadedProfile.stops().size()
        );

        return loadedProfile;
    }

    /**
     * 根据一条线路计划生成对应车辆的初始化参数。
     */
    private List<VehicleSeed> createVehicleSeeds(RoutePlan routePlan) {
        // 指定 ArrayList 的初始容量，可以避免添加车辆时反复扩容。
        List<VehicleSeed> vehicleSeeds = new ArrayList<>(routePlan.getVehicleCount());

        for (int vehicleIndex = 0; vehicleIndex < routePlan.getVehicleCount(); vehicleIndex++) {
            VehicleSeed vehicleSeed = new VehicleSeed();

            // %s：车辆编号前缀。 %03d：至少使用三位数字，不足时在前面补 0。
            String vehicleId =
                    "%s-%03d".formatted(
                            routePlan.getVehicleIdPrefix(),
                            vehicleIndex + 1
                    );

            double initialProgressRatio = (double) vehicleIndex / routePlan.getVehicleCount();

            vehicleSeed.setVehicleId(vehicleId);

            vehicleSeed.setSpeedMetersPerSecond(routePlan.getSpeedMetersPerSecond());

            vehicleSeed.setInitialProgressRatio(initialProgressRatio);

            vehicleSeeds.add(vehicleSeed);
        }

        /*
         * List.copyOf 返回不可增删的列表。
         *（ 车辆种子生成完成后不应再改变车辆数量，因此返回只读列表可以减少误修改 ）
         */
        return List.copyOf(vehicleSeeds);
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