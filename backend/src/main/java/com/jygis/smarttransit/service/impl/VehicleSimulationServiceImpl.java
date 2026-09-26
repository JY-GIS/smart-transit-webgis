package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.mapper.VehicleSimulationMapper;
import com.jygis.smarttransit.config.VehicleSimulationProperties;
import com.jygis.smarttransit.pojo.RouteSimulationLineStrategy;
import com.jygis.smarttransit.pojo.RouteInterpolatedPosition;
import com.jygis.smarttransit.pojo.RouteSimulationInfo;
import com.jygis.smarttransit.pojo.RouteSimulationProfile;
import com.jygis.smarttransit.pojo.RouteStopMeasure;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleStopSnapshot;
import com.jygis.smarttransit.pojo.VehicleInterpolatedPosition;
import com.jygis.smarttransit.pojo.VehiclePositionQuery;
import com.jygis.smarttransit.pojo.VehicleSnapshotRequest;
import com.jygis.smarttransit.service.VehicleSimulationService;
import com.jygis.smarttransit.service.VehicleSimulationMetrics;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 单辆模拟车辆位置计算服务实现。
 *
 * 职责：
 * - 从数据库加载线路模拟档案；
 * - 校验线路和站点数据；
 * - 将原始累计里程归一化到闭环线路范围；
 * - 计算车辆所在的线路进度；
 * - 查询 PostGIS 插值坐标；
 * - 计算上一站、下一站和剩余距离；
 * - 组装不可变车辆快照。
 */
@Service
@RequiredArgsConstructor
public class VehicleSimulationServiceImpl implements VehicleSimulationService {

    private static final double DISTANCE_EPSILON_METERS = 1e-6;

    private final VehicleSimulationMapper vehicleSimulationMapper;
    private final VehicleSimulationProperties properties;
    private final VehicleSimulationMetrics simulationMetrics;

    /**
     * 加载并校验一条线路的模拟档案。
     */
    @Override
    public RouteSimulationProfile loadRouteProfile(
            String routeId
    ) {
        // 对外部输入先做参数校验,再调用 Mapper
        if (routeId == null || routeId.isBlank()) {
            throw new IllegalArgumentException("routeId 不能为空");
        }

        String normalizedRouteId = routeId.trim();

        RouteSimulationInfo routeInfo =
                vehicleSimulationMapper.findRouteSimulationInfo(
                        normalizedRouteId,
                        properties.getMaximumSnapOffsetMeters()
                );

        /*
         * 查询没有结果表示当前线路不能建立安全的模拟上下文。
         * - 可能原因 - ：
         * 1. routeId 不存在；
         * 2. ST_LineMerge 后不是 LineString；
         * 3. 线路不足两个站点；
         * 4. 首站或末站不存在唯一、安全的投影区间；
         * 5. 首站投影进度不小于末站投影进度。
         */
        if (routeInfo == null) {
            throw new IllegalArgumentException("线路无法建立安全模拟上下文：" + normalizedRouteId);
        }

        validateRouteInfo(
                normalizedRouteId,
                routeInfo
        );

        List<RouteStopMeasure> stops =
                vehicleSimulationMapper.findRouteStopMeasures(
                        normalizedRouteId,
                        routeInfo.getSourceStartProgressRatio(),
                        routeInfo.getSourceEndProgressRatio(),
                        properties.getMaximumSnapOffsetMeters()
                );

        /*
         * MyBatis 列表查询正常情况下返回空 List 而不是 null。
         * 这里仍然保留 null 检查，避免自定义 Mapper 实现或配置变化后
         * 创建出不完整的 RouteSimulationProfile。
         */
        if (stops == null) {
            throw new IllegalStateException("线路站点查询返回 null：" + normalizedRouteId);
        }

        validateStopMeasures(
                normalizedRouteId,
                routeInfo.getTotalLengthMeters(),
                stops
        );

        return new RouteSimulationProfile(
                routeInfo,
                stops
        );
    }

    /**
     * 根据车辆累计里程计算一辆车的完整位置快照。
     */
    @Override
    public VehiclePositionSnapshot calculateSnapshot(
            String vehicleId,
            RouteSimulationProfile profile,
            double distanceMeters
    ) {
        // 单车入口也先转换成统一的服务层请求，从而复用参数校验和Java计算准备逻辑
        VehicleSnapshotRequest request =
                new VehicleSnapshotRequest(
                        vehicleId,
                        profile,
                        distanceMeters
                );

        PreparedSnapshotCalculation prepared = prepareSnapshotCalculation(request);

        RouteSimulationInfo routeInfo = prepared.routeProfile().routeInfo();

        simulationMetrics.recordPositionQuery();

        long positionQueryStartedAtNanos = System.nanoTime();

        RouteInterpolatedPosition position;

        try {
            position = vehicleSimulationMapper
                            .findPositionAtProgress(
                                    routeInfo.getRouteId(),
                                    routeInfo.getSourceStartProgressRatio(),
                                    routeInfo.getSourceEndProgressRatio(),
                                    prepared.progressRatio()
                            );
        } finally {
            simulationMetrics.recordPositionQueryDuration(
                    System.nanoTime() - positionQueryStartedAtNanos
            );
        }

        validateInterpolatedPosition(
                routeInfo.getRouteId(),
                position
        );

        return assembleSnapshot(
                prepared,
                position.getLongitude(),
                position.getLatitude()
        );
    }

    /**
     * 一次计算多辆车辆的完整位置快照。
     */
    @Override
    public List<VehiclePositionSnapshot> calculateSnapshots(
            List<VehicleSnapshotRequest> requests
    ) {
        if (requests == null) {
            throw new IllegalArgumentException("批量快照请求不能为空");
        }

        // 空批次直接返回不可变空列表，不执行无意义SQL
        if (requests.isEmpty()) {
            return List.of();
        }

        List<PreparedSnapshotCalculation> preparedCalculations = new ArrayList<>(requests.size());

        List<VehiclePositionQuery> positionQueries = new ArrayList<>(requests.size());

        Set<String> requestedVehicleIds = new HashSet<>();

        for (VehicleSnapshotRequest request : requests) {
            if (request == null) {
                throw new IllegalArgumentException("批量快照请求中存在null");
            }

            if (!requestedVehicleIds.add(request.vehicleId())) {
                throw new IllegalArgumentException(
                        "批量快照请求中vehicleId重复：" + request.vehicleId()
                );
            }

            PreparedSnapshotCalculation prepared = prepareSnapshotCalculation(request);

            RouteSimulationInfo routeInfo = prepared.routeProfile().routeInfo();

            preparedCalculations.add(prepared);

            positionQueries.add(
                    new VehiclePositionQuery(
                            prepared.vehicleId(),
                            routeInfo.getRouteId(),
                            routeInfo.getSourceStartProgressRatio(),
                            routeInfo.getSourceEndProgressRatio(),
                            prepared.progressRatio()
                    )
            );
        }

        /*
         * 整个批次只记录一次数据库位置查询。
         */
        simulationMetrics.recordPositionQuery();

        long positionQueryStartedAtNanos = System.nanoTime();

        List<VehicleInterpolatedPosition> positions;

        try {
            positions = vehicleSimulationMapper.findPositionsAtProgress(positionQueries);
        } finally {
            simulationMetrics.recordPositionQueryDuration(
                    System.nanoTime() - positionQueryStartedAtNanos
            );
        }

        if (positions == null) {
            throw new IllegalStateException("批量位置查询返回null");
        }

        // Map 按 vehicleId 建立结果索引
        Map<String, VehicleInterpolatedPosition> positionByVehicleId = new HashMap<>();

        for (VehicleInterpolatedPosition position : positions) {
            validateInterpolatedPosition(position);

            String returnedVehicleId = position.getVehicleId();

            if (!requestedVehicleIds.contains( returnedVehicleId)) {
                throw new IllegalStateException(
                        "批量位置查询返回了未请求的vehicleId：" + returnedVehicleId
                );
            }

            VehicleInterpolatedPosition previous =
                    positionByVehicleId.putIfAbsent(returnedVehicleId, position);

            if (previous != null) {
                throw new IllegalStateException(
                        "批量位置查询返回重复vehicleId：" + returnedVehicleId
                );
            }
        }

        List<VehiclePositionSnapshot> snapshots =
                new ArrayList<>( preparedCalculations.size() );

        /*
         * 按原请求准备顺序组装结果，因此最终返回列表与requests顺序一致。
         */
        for (PreparedSnapshotCalculation prepared : preparedCalculations) {
            VehicleInterpolatedPosition position =
                    positionByVehicleId.get(prepared.vehicleId());

            if (position == null) {
                throw new IllegalStateException(
                        "批量位置查询缺少车辆结果：" + prepared.vehicleId()
                );
            }

            snapshots.add(
                    assembleSnapshot(
                            prepared,
                            position.getLongitude(),
                            position.getLatitude()
                    )
            );
        }

        return List.copyOf(snapshots);
    }

    /**
     * 完成不依赖数据库的车辆快照准备计算。
     * - 批量化的关键不是简单把SQL换成foreach，而是先把“Java状态计算”和“数据库坐标查询”拆开。
     */
    private PreparedSnapshotCalculation prepareSnapshotCalculation(
            VehicleSnapshotRequest request
    ) {
        RouteSimulationProfile profile = request.routeProfile();

        RouteSimulationInfo routeInfo = profile.routeInfo();

        double totalDistanceMeters = requireValidTotalDistance(routeInfo);

        double normalizedDistanceMeters =
                normalizeLoopDistance(
                        request.accumulatedDistanceMeters(),
                        totalDistanceMeters
                );

        double progressRatio = normalizedDistanceMeters / totalDistanceMeters;

        return new PreparedSnapshotCalculation(
                request.vehicleId(),
                profile,
                normalizedDistanceMeters,
                totalDistanceMeters,
                progressRatio
        );
    }

    /**
     * 使用已经准备好的Java计算结果和数据库坐标组装完整快照。
     */
    private VehiclePositionSnapshot assembleSnapshot(
            PreparedSnapshotCalculation prepared,
            double longitude, double latitude
    ) {
        RouteSimulationProfile profile = prepared.routeProfile();

        RouteSimulationInfo routeInfo = profile.routeInfo();

        double normalizedDistanceMeters = prepared.normalizedDistanceMeters();

        double totalDistanceMeters = prepared.totalDistanceMeters();

        double routeProgressPercent = prepared.progressRatio() * 100.0;

        RouteStopMeasure previousStop =
                findPreviousStop(profile.stops(), normalizedDistanceMeters);

        RouteStopMeasure nextStop =
                findNextStop(profile.stops(), normalizedDistanceMeters);

        boolean nextStopWrapped = false;

        if (nextStop == null && !profile.stops().isEmpty()) {

            nextStop = findFirstStopByDistance(profile.stops());

            nextStopWrapped = nextStop != null;
        }

        Double distanceToNextStopMeters =
                calculateDistanceToNextStop(
                        normalizedDistanceMeters,
                        totalDistanceMeters,
                        nextStop,
                        nextStopWrapped
                );

        return new VehiclePositionSnapshot(
                prepared.vehicleId(),
                routeInfo.getRouteId(),
                routeInfo.getRouteFid(),
                longitude,
                latitude,
                normalizedDistanceMeters,
                totalDistanceMeters,
                routeProgressPercent,
                null,
                0,
                null,
                null,
                null,
                null,
                toStopSnapshot(previousStop),
                toStopSnapshot(nextStop),
                distanceToNextStopMeters
        );
    }

    /**
     * 校验数据库返回的线路基础信息。
     */
    private void validateRouteInfo(
            String requestedRouteId,
            RouteSimulationInfo routeInfo
    ) {
        if (routeInfo.getRouteId() == null
                || !routeInfo.getRouteId().equals(requestedRouteId)) {

            throw new IllegalStateException(
                    "线路查询结果与请求 routeId 不一致："
                            + requestedRouteId
            );
        }

        if (routeInfo.getRouteFid() == null) {
            throw new IllegalStateException(
                    "线路缺少 routeFid："
                            + requestedRouteId
            );
        }

        RouteSimulationLineStrategy lineStrategy = routeInfo.getLineStrategy();

        if (lineStrategy == null) {
            throw new IllegalStateException(
                    "线路缺少模拟几何策略：" + requestedRouteId
            );
        }

        Double sourceStartProgressRatio = routeInfo.getSourceStartProgressRatio();

        Double sourceEndProgressRatio = routeInfo.getSourceEndProgressRatio();

        if (sourceStartProgressRatio == null
                || sourceEndProgressRatio == null
                || !Double.isFinite(sourceStartProgressRatio)
                || !Double.isFinite(sourceEndProgressRatio)
                || sourceStartProgressRatio < 0
                || sourceEndProgressRatio > 1
                || sourceStartProgressRatio >= sourceEndProgressRatio
        ) {
            throw new IllegalStateException(
                    "线路有效区间进度无效：" + requestedRouteId
            );
        }

        if (lineStrategy == RouteSimulationLineStrategy.ORIGINAL_LINE &&
                (
                    Math.abs(sourceStartProgressRatio) > DISTANCE_EPSILON_METERS ||
                    Math.abs(sourceEndProgressRatio - 1.0) > DISTANCE_EPSILON_METERS
                )
        ) {
            throw new IllegalStateException(
                    "完整线路策略的原始进度不是 0～1：" + requestedRouteId
            );
        }

        requireValidTotalDistance(routeInfo);
    }

    /**
     * 读取并校验线路总长度。
     */
    private double requireValidTotalDistance(
            RouteSimulationInfo routeInfo
    ) {
        if (routeInfo == null) {
            throw new IllegalStateException(
                    "routeInfo 不能为空"
            );
        }

        Double totalLengthMeters =
                routeInfo.getTotalLengthMeters();

        if (totalLengthMeters == null
                || !Double.isFinite(totalLengthMeters)
                || totalLengthMeters <= 0) {

            throw new IllegalStateException(
                    "线路总长度无效："
                            + routeInfo.getRouteId()
            );
        }

        return totalLengthMeters;
    }

    /**
     * 校验站点查询结果中与车辆计算直接相关的字段。
     */
    private void validateStopMeasures(
            String routeId,
            double totalLengthMeters,
            List<RouteStopMeasure> stops
    ) {
        int previousSequence = Integer.MIN_VALUE;
        Double previousProgressRatio = null;
        Double previousStopDistance = null;

        for (RouteStopMeasure stop : stops) {
            if (stop == null) {
                throw new IllegalStateException(
                        "线路站点列表中存在 null："
                                + routeId
                );
            }

            if (stop.getRouteId() == null
                    || !stop.getRouteId().equals(routeId)) {

                throw new IllegalStateException(
                        "站点记录的 routeId 与线路不一致："
                                + stop.getStopId()
                );
            }

            if (stop.getStopId() == null
                    || stop.getStopId().isBlank()) {

                throw new IllegalStateException(
                        "线路中存在缺少 stopId 的站点："
                                + routeId
                );
            }

            Integer stopSequence =
                    stop.getStopSequence();

            if (stopSequence == null
                    || stopSequence <= previousSequence) {

                throw new IllegalStateException(
                        "stopSequence 不是严格递增："
                                + routeId
                );
            }

            previousSequence = stopSequence;

            Double progressRatio =
                    stop.getProgressRatio();

            if (progressRatio == null
                    || !Double.isFinite(progressRatio)
                    || progressRatio < 0
                    || progressRatio > 1) {

                throw new IllegalStateException(
                        "站点 progressRatio 无效："
                                + stop.getStopId()
                );
            }

            /*
             * stopSequence 递增并不能证明车辆沿线路的停靠顺序正确。
             * 递归投影结果还必须保证 progressRatio 严格递增。
             */
            if (previousProgressRatio != null
                    && progressRatio <= previousProgressRatio) {

                throw new IllegalStateException(
                        "站点 progressRatio 未按 stopSequence 严格递增："
                                + stop.getStopId()
                );
            }

            previousProgressRatio = progressRatio;

            Double stopDistance =
                    stop.getDistanceAlongRouteMeters();

            if (stopDistance == null
                    || !Double.isFinite(stopDistance)
                    || stopDistance < 0
                    || stopDistance
                    > totalLengthMeters
                    + DISTANCE_EPSILON_METERS) {

                throw new IllegalStateException(
                        "站点沿线里程无效："
                                + stop.getStopId()
                );
            }

            if (previousStopDistance != null
                    && stopDistance <= previousStopDistance) {

                throw new IllegalStateException(
                        "站点沿线里程未按 stopSequence 严格递增："
                                + stop.getStopId()
                );
            }

            previousStopDistance = stopDistance;

            Double snapOffset =
                    stop.getSnapOffsetMeters();

            if (snapOffset == null
                    || !Double.isFinite(snapOffset)
                    || snapOffset < 0) {

                throw new IllegalStateException(
                        "站点投影偏移无效："
                                + stop.getStopId()
                );
            }

            // SQL 候选筛选和 Java 最终校验共同使用同一个配置值
            if (snapOffset > properties.getMaximumSnapOffsetMeters() + DISTANCE_EPSILON_METERS) {

                throw new IllegalStateException(
                        "站点距离有效模拟线路过远："
                                + stop.getStopId() + "，snapOffset=" + snapOffset
                );
            }
        }

        if (!stops.isEmpty()) {
            RouteStopMeasure firstStop = stops.get(0);
            RouteStopMeasure lastStop = stops.get(stops.size() - 1);

            /*
             * 第一站和最后一站使用动态列表边界验证，
             * 不依赖 M103 当前恰好有 39 个站点。
             */
            if (firstStop.getProgressRatio() != 0.0
                    || Math.abs(firstStop.getDistanceAlongRouteMeters())
                    > DISTANCE_EPSILON_METERS) {

                throw new IllegalStateException(
                        "线路第一站没有锚定在线路起点：" + routeId
                );
            }

            if (lastStop.getProgressRatio() != 1.0
                    || Math.abs(
                            lastStop.getDistanceAlongRouteMeters()
                                    - totalLengthMeters
                    ) > DISTANCE_EPSILON_METERS) {

                throw new IllegalStateException(
                        "线路最后一站没有锚定在线路终点：" + routeId
                );
            }
        }
    }

    /**
     * 校验 PostGIS 插值得到的经纬度。
     */
    private void validateInterpolatedPosition(
            String routeId,
            RouteInterpolatedPosition position
    ) {
        if (position == null
                || position.getLongitude() == null
                || position.getLatitude() == null) {

            throw new IllegalStateException(
                    "线路位置插值没有返回坐标："
                            + routeId
            );
        }

        double longitude =
                position.getLongitude();

        double latitude =
                position.getLatitude();

        if (!Double.isFinite(longitude)
                || !Double.isFinite(latitude)) {

            throw new IllegalStateException(
                    "线路位置插值返回非有限坐标："
                            + routeId
            );
        }

        if (longitude < -180
                || longitude > 180
                || latitude < -90
                || latitude > 90) {

            throw new IllegalStateException(
                    "线路位置插值返回非法经纬度："
                            + routeId
            );
        }
    }

    /**
     * 校验PostGIS批量查询返回的一辆车辆坐标。
     */
    private void validateInterpolatedPosition(VehicleInterpolatedPosition position) {
        if (position == null) {
            throw new IllegalStateException("批量位置查询结果中存在null");
        }

        String vehicleId = position.getVehicleId();

        if (vehicleId == null || vehicleId.isBlank()) {
            throw new IllegalStateException("批量位置查询结果缺少vehicleId");
        }

        Double longitude = position.getLongitude();
        Double latitude = position.getLatitude();

        if (longitude == null || latitude == null) {
            throw new IllegalStateException(
                    "批量位置查询没有返回坐标：" + vehicleId
            );
        }

        if (!Double.isFinite(longitude) || !Double.isFinite(latitude)) {
            throw new IllegalStateException(
                    "批量位置查询返回非有限坐标：" + vehicleId
            );
        }

        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
            throw new IllegalStateException(
                    "批量位置查询返回非法经纬度：" + vehicleId
            );
        }
    }

    /**
     * 将累计里程归一化到当前闭环中的里程。
     */
    private double normalizeLoopDistance(
            double distanceMeters,
            double totalDistanceMeters
    ) {
        /*
         * Java 的 % 对非负 double 返回非负余数。
         * 当前方法调用前已经拒绝负数。
         */
        return distanceMeters % totalDistanceMeters;
    }

    /**
     * 在线性扫描中选择当前位置之前、里程最大的站点。
     *
     * 当前不依赖 List 的里程排序，只比较每个站点的实际里程值。
     */
    private RouteStopMeasure findPreviousStop(
            List<RouteStopMeasure> stops,
            double distanceMeters
    ) {
        RouteStopMeasure previousStop = null;

        for (RouteStopMeasure stop : stops) {
            double stopDistance =
                    stop.getDistanceAlongRouteMeters();

            if (stopDistance
                    <= distanceMeters
                    + DISTANCE_EPSILON_METERS) {

                if (previousStop == null
                        || stopDistance
                        > previousStop
                        .getDistanceAlongRouteMeters()) {

                    previousStop = stop;
                }
            }
        }

        return previousStop;
    }

    /**
     * 在线性扫描中选择当前位置之后、里程最小的站点。
     */
    private RouteStopMeasure findNextStop(
            List<RouteStopMeasure> stops,
            double distanceMeters
    ) {
        RouteStopMeasure nextStop = null;

        for (RouteStopMeasure stop : stops) {
            double stopDistance =
                    stop.getDistanceAlongRouteMeters();

            if (stopDistance
                    > distanceMeters
                    + DISTANCE_EPSILON_METERS) {

                if (nextStop == null
                        || stopDistance
                        < nextStop
                        .getDistanceAlongRouteMeters()) {

                    nextStop = stop;
                }
            }
        }

        return nextStop;
    }

    /**
     * 找到沿线里程最小的站点，用于闭环回到线路开头。
     */
    private RouteStopMeasure findFirstStopByDistance(
            List<RouteStopMeasure> stops
    ) {
        RouteStopMeasure firstStop = null;

        for (RouteStopMeasure stop : stops) {
            if (firstStop == null
                    || stop.getDistanceAlongRouteMeters()
                    < firstStop
                    .getDistanceAlongRouteMeters()) {

                firstStop = stop;
            }
        }

        return firstStop;
    }

    /**
     * 计算当前位置到下一站的沿线距离。
     */
    private Double calculateDistanceToNextStop(
            double distanceMeters,
            double totalDistanceMeters,
            RouteStopMeasure nextStop,
            boolean wrapped
    ) {
        if (nextStop == null) {
            return null;
        }

        double nextStopDistance =
                nextStop.getDistanceAlongRouteMeters();

        if (!wrapped) {
            return Math.max(
                    0,
                    nextStopDistance - distanceMeters
            );
        }

        return Math.max(
                0,
                totalDistanceMeters
                        - distanceMeters
                        + nextStopDistance
        );
    }

    /**
     * 将 Mapper 查询对象转换成不可变站点快照。
     */
    private VehicleStopSnapshot toStopSnapshot(
            RouteStopMeasure stop
    ) {
        if (stop == null) {
            return null;
        }

        return new VehicleStopSnapshot(
                stop.getStopId(),
                stop.getStopName(),
                stop.getStopSequence(),
                stop.getDistanceAlongRouteMeters()
        );
    }

    /**
     * 服务内部使用的快照准备结果。
     * 只保存已经完成的纯Java计算结果，不属于Controller、Mapper或WebSocket的公开DTO。
     * 使用private record可以限制它只在当前服务实现中使用。
     */
    private record PreparedSnapshotCalculation(

            String vehicleId,

            RouteSimulationProfile routeProfile,

            double normalizedDistanceMeters,

            double totalDistanceMeters,

            double progressRatio
    ) {
    }
}
