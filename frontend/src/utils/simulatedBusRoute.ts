import * as Cesium from 'cesium'

import type { OrderedBusStop } from '@/types/busStop'
import type {
    SimulatedBusPath,
    SimulatedBusRouteStop,
    SimulatedBusStopSnapshot,
} from '@/types/simulatedBus'

// 站点投影允许的最大偏移距离。
const DEFAULT_MAX_SNAP_OFFSET_METERS = 50

// 处理浮点数比较时使用的距离容差
const DISTANCE_EPSILON_METERS = 1e-6

// 线路运行进度计算结果
export interface SimulatedBusRouteProgress {
    previousStop: SimulatedBusStopSnapshot | null
    nextStop: SimulatedBusStopSnapshot | null
    distanceToNextStopMeters: number | null
    routeProgressPercent: number
}

// 站点投影到某一条线路线段后的候选结果
interface RouteStopProjectionCandidate {
    distanceAlongRouteMeters: number
    snapOffsetMeters: number
    pathSegmentIndex: number
    segmentFraction: number
}

// 将数字限制在指定范围内
function clamp(
    value: number,
    min: number,
    max: number,
): number {
    return Math.max(min, Math.min(max, value))
}

// 根据累计距离，查找车辆所在的路径线段 - [二分查找]
function findSegmentIndex(
    path: SimulatedBusPath,
    distanceMeters: number,
): number {
    let low = 0
    let high = path.segmentLengths.length - 1

    while (low < high) {
        const middle = Math.floor((low + high) / 2)
        const segmentEndDistance = path.cumulativeDistances[middle + 1] ?? 0

        if (segmentEndDistance < distanceMeters) {
            low = middle + 1
        } else {
            high = middle
        }
    }

    return low
}

// 根据线路上的累计距离，建立车辆位置
export function getPositionAtDistance(path: SimulatedBusPath, distanceMeters: number): Cesium.Cartesian3 {
    const distance = clamp(
        distanceMeters,
        0,
        path.totalDistance,
    )

    const segmentIndex = findSegmentIndex(
        path,
        distance,
    )

    const segmentStartDistance =
        path.cumulativeDistances[segmentIndex] ?? 0

    const segmentLength =
        path.segmentLengths[segmentIndex] ?? 0

    const segmentProgress = segmentLength <= 0
        ? 0
        : (distance - segmentStartDistance) / segmentLength

    const start = path.positions[segmentIndex]

    const end = path.positions[segmentIndex + 1]

    if (!start || !end) {
        throw new Error(`线路路径线段不存在：${segmentIndex}`)
    }

    // Cartesian3.lerp 是 Cesium 的三维线性插值 API
    return Cesium.Cartesian3.lerp(
        start,
        end,
        clamp(segmentProgress, 0, 1),
        new Cesium.Cartesian3(),
    )
}

// 根据线路位置建立每一段的长度和累计距离
export function buildRoutePath(positions: Cesium.Cartesian3[]): SimulatedBusPath {
    if (positions.length < 2) {
        throw new Error('模拟车辆线路至少需要两个坐标点')
    }

    const copiedPositions = positions.map(
        (position) => Cesium.Cartesian3.clone(position),
    )

    const segmentLengths: number[] = []
    const cumulativeDistances: number[] = [0]

    for (let index = 0; index < copiedPositions.length - 1; index++) {
        const start = copiedPositions[index]

        const end = copiedPositions[index + 1]

        if (!start || !end) {
            throw new Error(`线路路径点不存在：${index}`)
        }

        const segmentLength = Cesium.Cartesian3.distance(start, end)

        if (!Number.isFinite(segmentLength)) {
            throw new Error(`线路线段长度无效：${index}`)
        }

        segmentLengths.push(segmentLength)

        const previousDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0

        cumulativeDistances.push(previousDistance + segmentLength)
    }

    const totalDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0

    if (totalDistance <= 0) {
        throw new Error('线路总长度必须大于 0')
    }

    return {
        positions: copiedPositions,
        segmentLengths,
        cumulativeDistances,
        totalDistance,
    }
}

// 将一个站点投影到指定线路线段上
function projectPointToSegment(
    point: Cesium.Cartesian3,
    path: SimulatedBusPath,
    segmentIndex: number,
): RouteStopProjectionCandidate {
    const start = path.positions[segmentIndex]

    const end = path.positions[segmentIndex + 1]

    if (!start || !end) {
        throw new Error(`线路路径点不存在：${segmentIndex}`)
    }

    // 计算两个 Cartesian3 坐标之间的向量 - subtract 得到线段方向向量
    const segmentVector = Cesium.Cartesian3.subtract(
        end,
        start,
        new Cesium.Cartesian3(),
    )

    const pointVector = Cesium.Cartesian3.subtract(
        point,
        start,
        new Cesium.Cartesian3(),
    )

    // 点积可以计算站点在线段方向上的投影比例 - dot 是向量点积
    const segmentLengthSquared = Cesium.Cartesian3.dot(segmentVector, segmentVector)

    let segmentFraction = 0

    if (segmentLengthSquared > 0) {
        const projectionRatio = Cesium.Cartesian3.dot(segmentVector, pointVector) / segmentLengthSquared

        segmentFraction = clamp(projectionRatio, 0, 1)
    }

    // 根据投影比例计算线段上的投影点
    const projectedPoint = Cesium.Cartesian3.lerp(
        start,
        end,
        segmentFraction,
        new Cesium.Cartesian3(),
    )

    const segmentLength = path.segmentLengths[segmentIndex] ?? 0

    const segmentStartDistance = path.cumulativeDistances[segmentIndex] ?? 0

    return {
        distanceAlongRouteMeters: segmentStartDistance + segmentLength * segmentFraction,
        snapOffsetMeters: Cesium.Cartesian3.distance(projectedPoint, point),
        pathSegmentIndex: segmentIndex,
        segmentFraction,
    }
}

// 计算站点在全部线路线段上的投影候选
function getAllProjectionCandidates(
    point: Cesium.Cartesian3,
    path: SimulatedBusPath,
): RouteStopProjectionCandidate[] {
    return path.segmentLengths.map(
        (_segmentLength, segmentIndex) =>
            projectPointToSegment(
                point,
                path,
                segmentIndex
            ),
    )
}

/**
 * 选择一组符合站序的投影结果。
 *
 * 不能简单地对每个站点独立选择“最近线段”，
 * 因为闭环线路的去程和回程可能非常接近。
 *
 * 这里使用动态规划：
 * 在保持站点累计里程不倒退的前提下，
 * 选择投影偏移距离总和最小的一组结果。
 */
function selectMonotonicProjections(candidatesByStop: RouteStopProjectionCandidate[][]): RouteStopProjectionCandidate[] {
    if (candidatesByStop.length === 0) {
        return []
    }

    const costRows: number[][] = []
    const previousRows: number[][] = []

    for (let stopIndex = 0; stopIndex < candidatesByStop.length; stopIndex++) {
        const candidates = candidatesByStop[stopIndex] ?? []

        const costs = candidates.map(
            () => Number.POSITIVE_INFINITY
        )

        const previousIndices = candidates.map(
            () => -1
        )

        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
            const candidate = candidates[candidateIndex]

            if (!candidate) {
                continue
            }

            if (stopIndex === 0) {
                costs[candidateIndex] = candidate.snapOffsetMeters * candidate.snapOffsetMeters

                continue
            }

            const previousCandidates =
                candidatesByStop[stopIndex - 1] ?? []

            const previousCosts =
                costRows[stopIndex - 1] ?? []

            for (
                let previousIndex = 0;
                previousIndex < previousCandidates.length;
                previousIndex++
            ) {
                const previousCandidate =
                    previousCandidates[previousIndex]

                const previousCost =
                    previousCosts[previousIndex] ??
                    Number.POSITIVE_INFINITY

                if (!previousCandidate) {
                    continue
                }

                // 站序必须沿线路方向前进
                if (
                    previousCandidate.distanceAlongRouteMeters >
                    candidate.distanceAlongRouteMeters + DISTANCE_EPSILON_METERS
                ) {
                    continue
                }

                const currentCost = previousCost + candidate.snapOffsetMeters * candidate.snapOffsetMeters

                if (currentCost < costs[candidateIndex]) {
                    costs[candidateIndex] = currentCost

                    previousIndices[candidateIndex] = previousIndex
                }
            }
        }

        costRows.push(costs)
        previousRows.push(previousIndices)
    }

    const lastCosts = costRows[costRows.length - 1] ?? []

    let selectedIndex = -1
    let selectedCost = Number.POSITIVE_INFINITY

    for (
        let index = 0;
        index < lastCosts.length;
        index++
    ) {
        const cost = lastCosts[index] ?? Infinity

        if (cost < selectedCost) {
            selectedCost = cost
            selectedIndex = index
        }
    }

    if (selectedIndex < 0) {
        throw new Error(
            '站点无法按照线路方向完成映射',
        )
    }

    const selectedProjections: RouteStopProjectionCandidate[] =
        new Array(candidatesByStop.length)

    for (
        let stopIndex =
            candidatesByStop.length - 1;
        stopIndex >= 0;
        stopIndex--
    ) {
        const candidates =
            candidatesByStop[stopIndex] ?? []

        const selectedCandidate =
            candidates[selectedIndex]

        if (!selectedCandidate) {
            throw new Error(
                `站点投影结果不存在：${stopIndex}`,
            )
        }

        selectedProjections[stopIndex] =
            selectedCandidate

        selectedIndex =
            previousRows[stopIndex]?.[
            selectedIndex
            ] ?? -1

        if (
            stopIndex > 0 &&
            selectedIndex < 0
        ) {
            throw new Error(
                '站点投影回溯失败',
            )
        }
    }

    return selectedProjections
}

/**
 * 将有序站点映射到线路累计距离。
 *
 * 这是车辆加载阶段调用的一次性预处理函数。
 */
export function mapStopsToRoute(
    path: SimulatedBusPath,
    orderedStops: OrderedBusStop[],
    options: {
        maxSnapOffsetMeters?: number
    } = {},
): SimulatedBusRouteStop[] {
    if (orderedStops.length === 0) {
        return []
    }

    /**
     * 这里不重新按照经纬度排序。
     *
     * 站点顺序必须来自 stop_sequence，
     * 如果顺序不正确，应尽早报错。
     */
    for (
        let index = 1;
        index < orderedStops.length;
        index++
    ) {
        const previousStop =
            orderedStops[index - 1]

        const currentStop =
            orderedStops[index]

        if (
            !previousStop ||
            !currentStop
        ) {
            continue
        }

        if (
            currentStop.stopSequence <=
            previousStop.stopSequence
        ) {
            throw new Error(
                '线路站点 stopSequence 不是严格递增的',
            )
        }
    }

    const candidatesByStop =
        orderedStops.map(
            (stop, stopIndex) => {
                const stopPosition =
                    Cesium.Cartesian3.fromDegrees(
                        stop.longitude,
                        stop.latitude,
                    )

                /**
                 * 闭环线路的第一站和最后一站
                 * 分别固定在路径起点和终点附近，
                 * 可以减少首尾同名站点产生的方向歧义。
                 */
                if (stopIndex === 0) {
                    return [
                        projectPointToSegment(
                            stopPosition,
                            path,
                            0,
                        ),
                    ]
                }

                if (
                    stopIndex ===
                    orderedStops.length - 1
                ) {
                    return [
                        projectPointToSegment(
                            stopPosition,
                            path,
                            path.segmentLengths.length - 1,
                        ),
                    ]
                }

                return getAllProjectionCandidates(
                    stopPosition,
                    path,
                )
            },
        )

    const selectedProjections =
        selectMonotonicProjections(
            candidatesByStop,
        )

    const maxSnapOffset =
        options.maxSnapOffsetMeters ??
        DEFAULT_MAX_SNAP_OFFSET_METERS

    return orderedStops.map(
        (stop, stopIndex) => {
            const projection =
                selectedProjections[stopIndex]

            if (!projection) {
                throw new Error(
                    `站点投影结果不存在：${stop.stopId}`,
                )
            }

            if (
                projection.snapOffsetMeters >
                maxSnapOffset
            ) {
                throw new Error(
                    `站点距离线路过远：${stop.stopName}，偏移 ${projection.snapOffsetMeters.toFixed(2)} 米`,
                )
            }

            return {
                stopId: stop.stopId,
                stopName: stop.stopName,
                stopSequence: stop.stopSequence,
                longitude: stop.longitude,
                latitude: stop.latitude,
                distanceAlongRouteMeters:
                    projection.distanceAlongRouteMeters,
                snapOffsetMeters:
                    projection.snapOffsetMeters,
                pathSegmentIndex:
                    projection.pathSegmentIndex,
                segmentFraction:
                    projection.segmentFraction,
            }
        },
    )
}

/**
 * 将内部线路站点转换为实时状态快照。
 */
function toStopSnapshot(
    stop: SimulatedBusRouteStop,
): SimulatedBusStopSnapshot {
    return {
        stopId: stop.stopId,
        stopName: stop.stopName,
        stopSequence: stop.stopSequence,
        distanceAlongRouteMeters:
            stop.distanceAlongRouteMeters,
    }
}

/**
 * 根据车辆累计里程查找上一站。
 *
 * 返回第一个“严格大于当前距离”的站点下标，
 * 它前面的站点就是 previousStop。
 */
function findNextStopIndex(
    stops: SimulatedBusRouteStop[],
    distanceMeters: number,
): number {
    let low = 0
    let high = stops.length

    while (low < high) {
        const middle = Math.floor(
            (low + high) / 2,
        )

        const stop =
            stops[middle]

        if (
            stop &&
            stop.distanceAlongRouteMeters <=
            distanceMeters +
            DISTANCE_EPSILON_METERS
        ) {
            low = middle + 1
        } else {
            high = middle
        }
    }

    return low
}

/**
 * 根据车辆当前累计里程，计算上下站、距离下一站和线路进度。
 *
 * 这个函数会在车辆每次 tick 时调用，
 * 但只对已经预处理好的站点数组做二分查找。
 *
 * 因此不会每帧重新计算站点到线路的投影。
 */
export function getRouteProgress(
    path: SimulatedBusPath,
    stops: SimulatedBusRouteStop[],
    distanceMeters: number,
): SimulatedBusRouteProgress {
    const distance = clamp(
        distanceMeters,
        0,
        path.totalDistance,
    )

    const routeProgressPercent =
        path.totalDistance <= 0
            ? 0
            : clamp(
                (distance /
                    path.totalDistance) *
                100,
                0,
                100,
            )

    if (stops.length === 0) {
        return {
            previousStop: null,
            nextStop: null,
            distanceToNextStopMeters: null,
            routeProgressPercent,
        }
    }

    const nextStopIndex =
        findNextStopIndex(
            stops,
            distance,
        )

    const previousStop =
        stops[nextStopIndex - 1]

    const nextStop =
        stops[nextStopIndex]

    return {
        previousStop: previousStop
            ? toStopSnapshot(previousStop)
            : null,

        nextStop: nextStop
            ? toStopSnapshot(nextStop)
            : null,

        distanceToNextStopMeters: nextStop
            ? Math.max(
                0,
                nextStop.distanceAlongRouteMeters -
                distance,
            )
            : null,

        routeProgressPercent,
    }
}


