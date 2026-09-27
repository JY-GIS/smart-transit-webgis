package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.pojo.RouteSimulationProfile;
import com.jygis.smarttransit.pojo.RouteStopMeasure;
import com.jygis.smarttransit.pojo.StopArrivalBoard;
import com.jygis.smarttransit.pojo.VehicleRuntimeState;
import com.jygis.smarttransit.pojo.StopArrivalPrediction;
import com.jygis.smarttransit.pojo.StopArrivalStatus;
import com.jygis.smarttransit.pojo.VehicleMotionStatus;
import com.jygis.smarttransit.service.StopArrivalService;
import com.jygis.smarttransit.service.VehicleRuntimeStore;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * 线路站点到站查询服务实现。
 *
 * 当前基础阶段只负责：
 * 1. 校验查询参数；
 * 2. 筛选指定线路的车辆；
 * 3. 找到用户点击的线路站点；
 * 4. 组装基础到站牌。
 *
 * 当前暂不计算车辆距离和 ETA。
 */
@Service
@RequiredArgsConstructor
public class StopArrivalServiceImpl implements StopArrivalService {

    private static final int MAXIMUM_ARRIVAL_LIMIT = 10;
    private static final double DISTANCE_EPSILON_METERS = 1e-6;

    private final VehicleRuntimeStore vehicleRuntimeStore;

    /**
     * 查询指定线路、指定站点的到站信息。
     */
    @Override
    public StopArrivalBoard findArrivals(
            String routeId,
            String stopId,
            int limit
    ) {
        String normalizedRouteId = requireText(routeId, "routeId");
        String normalizedStopId = requireText(stopId, "stopId");

        validateLimit(limit);

        List<VehicleRuntimeState> routeVehicleStates =
                vehicleRuntimeStore
                        .findAll()
                        .stream()
                        .filter(state ->
                                normalizedRouteId.equals(
                                        state
                                                .routeProfile()
                                                .routeInfo()
                                                .getRouteId()
                                )
                        )
                        .toList();

        if (routeVehicleStates.isEmpty()) {
            throw new IllegalStateException(
                    "当前线路没有运行中的模拟车辆："
                            + normalizedRouteId
            );
        }

        RouteSimulationProfile routeProfile =
                routeVehicleStates.get(0).routeProfile();

        /*
         * 后续需要使用目标站索引计算相隔站数，
         * 因此这里不仅查找站点对象，还保留它在线路列表中的索引。
         */
        int targetStopIndex = requireTargetStopIndex(routeProfile, normalizedStopId);

        RouteStopMeasure targetStop = routeProfile.stops().get(targetStopIndex);

        /*
         * 同一批到站结果只读取一次当前时间。
         */
        Instant generatedAt = Instant.now();

        List<StopArrivalPrediction> arrivals =
                routeVehicleStates
                        .stream()
                        .map(state ->
                                predictArrival(
                                        state,
                                        targetStop,
                                        targetStopIndex,
                                        generatedAt
                                )
                        )
                        .sorted(
                                Comparator
                                        .comparingLong(StopArrivalPrediction::etaSeconds)
                                        .thenComparingDouble(StopArrivalPrediction::distanceToStopMeters)
                                        .thenComparing(StopArrivalPrediction::vehicleId)
                        )
                        .limit(limit)
                        .toList();

        return new StopArrivalBoard(
                routeProfile.routeInfo().getRouteId(),
                routeProfile.routeInfo().getRouteName(),
                targetStop.getStopId(),
                targetStop.getStopName(),
                targetStop.getStopSequence(),
                generatedAt,
                arrivals
        );
    }

    /**
     * 计算一辆车辆到目标站的预测结果。
     *
     * 数据进入：
     * - 车辆当前运行状态；
     * - 目标站；
     * - 目标站在线路列表中的索引；
     * - 本次查询的统一计算时间。
     *
     * 数据离开：
     * - 一条 StopArrivalPrediction。
     */
    private StopArrivalPrediction predictArrival(
            VehicleRuntimeState state,
            RouteStopMeasure targetStop,
            int targetStopIndex,
            Instant generatedAt
    ) {
        // “车辆正在停站”不等于“车辆正在用户查询的站点停靠”
        boolean dwellingAtTargetStop = state.motionStatus() == VehicleMotionStatus.DWELLING
                        && state.targetStopIndex() == targetStopIndex;

        if (dwellingAtTargetStop) {
            return new StopArrivalPrediction(
                    state.vehicleId(),
                    0,
                    generatedAt,
                    0,
                    0,
                    StopArrivalStatus.AT_STOP,
                    state.motionStatus(),
                    state.lastUpdatedAt()
            );
        }

        boolean targetIsCurrentVehicleTarget =
                state.targetStopIndex() == targetStopIndex;

        double distanceToStopMeters =
                calculateDistanceToStop(
                        state.accumulatedDistanceMeters(),
                        state.routeProfile().routeInfo().getTotalLengthMeters(),
                        targetStop.getDistanceAlongRouteMeters(),
                        targetIsCurrentVehicleTarget
                );

        /*
         * ETA = 剩余线路距离 ÷ 巡航速度
         */
        long etaSeconds = (long) Math.ceil(distanceToStopMeters / state.speedMetersPerSecond());

        int stopsAway = calculateStopsAway(state, targetStopIndex);

        StopArrivalStatus arrivalStatus =
                targetIsCurrentVehicleTarget
                        ? StopArrivalStatus.APPROACHING
                        : StopArrivalStatus.IN_TRANSIT;

        return new StopArrivalPrediction(
                state.vehicleId(),
                etaSeconds,
                generatedAt.plusSeconds(etaSeconds),
                distanceToStopMeters,
                stopsAway,
                arrivalStatus,
                state.motionStatus(),
                state.lastUpdatedAt()
        );
    }

    /**
     * 计算车辆到目标站相隔多少站。
     */
    private int calculateStopsAway(
            VehicleRuntimeState state,
            int targetStopIndex
    ) {
        int stopCount = state
                        .routeProfile()
                        .stops()
                        .size();

        return (
                targetStopIndex - state.targetStopIndex() + stopCount
        ) % stopCount + 1;
    }

    /**
     * 计算车辆沿运行方向到目标站的剩余线路距离。
     *
     * @param accumulatedDistanceMeters 车辆启动以来的累计里程
     * @param totalLengthMeters 闭环线路一圈的总长度
     * @param targetDistanceAlongRouteMeters 目标站在线路单圈内的里程
     * @param targetIsCurrentVehicleTarget 目标站是否为车辆当前正在前往的站
     * @return 沿运行方向到目标站的剩余距离
     */
    static double calculateDistanceToStop(
            double accumulatedDistanceMeters,
            double totalLengthMeters,
            double targetDistanceAlongRouteMeters,
            boolean targetIsCurrentVehicleTarget
    ) {
        validateDistanceParameters(
                accumulatedDistanceMeters,
                totalLengthMeters,
                targetDistanceAlongRouteMeters
        );

        double currentDistanceWithinLoop = accumulatedDistanceMeters % totalLengthMeters;

        // 有些线路的最后一站里程可能刚好等于线路总长。
        double targetDistanceWithinLoop = targetDistanceAlongRouteMeters % totalLengthMeters;

        double remainingDistanceMeters = targetDistanceWithinLoop - currentDistanceWithinLoop;

        if (remainingDistanceMeters < -DISTANCE_EPSILON_METERS) {
            remainingDistanceMeters += totalLengthMeters;
        }

        if (Math.abs(remainingDistanceMeters) <= DISTANCE_EPSILON_METERS) {
            return targetIsCurrentVehicleTarget ? 0 : totalLengthMeters;
        }

        return remainingDistanceMeters;
    }

    /**
     * 校验剩余距离计算所需的基础数据。
     */
    private static void validateDistanceParameters(
            double accumulatedDistanceMeters,
            double totalLengthMeters,
            double targetDistanceAlongRouteMeters
    ) {
        if (!Double.isFinite(accumulatedDistanceMeters) || accumulatedDistanceMeters < 0) {
            throw new IllegalArgumentException("accumulatedDistanceMeters 必须是有限非负数");
        }

        if (!Double.isFinite(totalLengthMeters) || totalLengthMeters <= 0) {
            throw new IllegalArgumentException("totalLengthMeters 必须是有限正数");
        }

        if (!Double.isFinite(targetDistanceAlongRouteMeters)
            || targetDistanceAlongRouteMeters < 0 || targetDistanceAlongRouteMeters > totalLengthMeters
        ) {
            throw new IllegalArgumentException("目标站里程必须位于线路范围内");
        }
    }

    /**
     * 查找目标站在线路站点列表中的索引。
     */
    private int requireTargetStopIndex(
            RouteSimulationProfile routeProfile,
            String stopId
    ) {
        List<RouteStopMeasure> routeStops = routeProfile.stops();

        for (int index = 0; index < routeStops.size(); index++) {

            RouteStopMeasure routeStop = routeStops.get(index);

            if (stopId.equals(routeStop.getStopId())) {
                return index;
            }
        }

        throw new IllegalArgumentException(
                "站点不属于当前线路：" + routeProfile.routeInfo().getRouteId() + " / " + stopId
        );
    }

    /**
     * 校验并清理字符串参数。
     */
    private String requireText(String value, String parameterName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(parameterName + " 不能为空");
        }

        return value.trim();
    }

    /**
     * 校验最多返回多少辆车。
     */
    private void validateLimit(int limit) {
        if (limit <= 0 || limit > MAXIMUM_ARRIVAL_LIMIT) {
            throw new IllegalArgumentException("limit 必须大于 0 且不超过 " + MAXIMUM_ARRIVAL_LIMIT);
        }
    }
}