package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.mapper.VehicleSimulationMapper;
import com.jygis.smarttransit.pojo.RouteInterpolatedPosition;
import com.jygis.smarttransit.pojo.RouteSimulationInfo;
import com.jygis.smarttransit.pojo.RouteSimulationProfile;
import com.jygis.smarttransit.pojo.RouteStopMeasure;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleStopSnapshot;
import com.jygis.smarttransit.service.VehicleSimulationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

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
                        normalizedRouteId
                );

        /*
         * 单条 MyBatis 查询没有结果时返回 null。
         *
         * 可能原因：
         * 1. routeId 不存在；
         * 2. ST_LineMerge 后不是 LineString；
         * 3. 当前线路 geometry 不适合线性参考。
         */
        if (routeInfo == null) {
            throw new IllegalArgumentException("线路不存在或线路 geometry 无法用于模拟：" + normalizedRouteId);
        }

        validateRouteInfo(
                normalizedRouteId,
                routeInfo
        );

        List<RouteStopMeasure> stops =
                vehicleSimulationMapper.findRouteStopMeasures(
                        normalizedRouteId
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
     * 根据车辆累计里程计算完整位置快照。
     */
    @Override
    public VehiclePositionSnapshot calculateSnapshot(
            String vehicleId,
            RouteSimulationProfile profile,
            double distanceMeters
    ) {
        if (vehicleId == null || vehicleId.isBlank()) {
            throw new IllegalArgumentException("vehicleId 不能为空");
        }

        if (profile == null) {
            throw new IllegalArgumentException("profile 不能为空");
        }

        if (!Double.isFinite(distanceMeters)) {
            throw new IllegalArgumentException("distanceMeters 必须是有限数字");
        }

        if (distanceMeters < 0) {
            throw new IllegalArgumentException("distanceMeters 不能小于 0");
        }

        RouteSimulationInfo routeInfo = profile.routeInfo();

        double totalDistanceMeters = requireValidTotalDistance(routeInfo);

        /*
         * 当累计里程超过一圈总长度时，使用取模得到车辆在当前圈中的位置
         */
        double normalizedDistanceMeters =
                normalizeLoopDistance(
                        distanceMeters,
                        totalDistanceMeters
                );

        double progressRatio =
                normalizedDistanceMeters
                        / totalDistanceMeters;

        double routeProgressPercent =
                progressRatio * 100.0;

        /*
         * 将业务层计算出的进度交给 PostGIS，
         * 由 ST_LineInterpolatePoint 返回实际经纬度。
         */
        RouteInterpolatedPosition position =
                vehicleSimulationMapper.findPositionAtProgress(
                        routeInfo.getRouteId(),
                        progressRatio
                );

        validateInterpolatedPosition(
                routeInfo.getRouteId(),
                position
        );

        /*
         * findRouteStopMeasures 已按公交站序执行单调约束投影，
         * loadRouteProfile 也会拒绝进度或里程不递增的数据。
         *
         * 当前仍保留线性扫描，避免在本次投影修复中顺带重构上一站/下一站查找逻辑。
         */
        RouteStopMeasure previousStop =
                findPreviousStop(
                        profile.stops(),
                        normalizedDistanceMeters
                );

        RouteStopMeasure nextStop =
                findNextStop(
                        profile.stops(),
                        normalizedDistanceMeters
                );

        /*
         * 对闭环线路来说，如果当前位置之后没有普通下一站，
         * 下一站应回到里程最小的第一个站点。
         */
        boolean nextStopWrapped = false;

        if (nextStop == null && !profile.stops().isEmpty()) {
            nextStop = findFirstStopByDistance(
                    profile.stops()
            );

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
                vehicleId.trim(),
                routeInfo.getRouteId(),
                routeInfo.getRouteFid(),
                position.getLongitude(),
                position.getLatitude(),
                normalizedDistanceMeters,
                totalDistanceMeters,
                routeProgressPercent,
                null,
                0,
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
}
