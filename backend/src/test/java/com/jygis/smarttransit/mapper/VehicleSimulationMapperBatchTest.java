package com.jygis.smarttransit.mapper;

import com.jygis.smarttransit.pojo.VehicleInterpolatedPosition;
import com.jygis.smarttransit.pojo.VehiclePositionQuery;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 批量车辆位置 PostGIS 查询集成测试。
 * - 验证 Mapper、XML动态 SQL、空间函数和结果映射能够共同工作
 */
@SpringBootTest(properties = "transit.simulation.enabled=false")
class VehicleSimulationMapperBatchTest {

    @Autowired
    private VehicleSimulationMapper vehicleSimulationMapper;

    @Test
    void shouldReturnEveryVehiclePositionInOneBatchQuery() {
        /*
         * 同时覆盖：
         * - 同一线路的多辆车；
         * - 多条不同线路；
         * - 完整原线进度；
         * - 类似SUBSTRING_LINE的有效区间换算。
         */
        List<VehiclePositionQuery> queries =
                List.of(
                        new VehiclePositionQuery(
                                "batch-m103-001",
                                "route_000185",
                                0,
                                1,
                                0.25
                        ),

                        new VehiclePositionQuery(
                                "batch-m103-002",
                                "route_000185",
                                0,
                                1,
                                0.75
                        ),

                        new VehiclePositionQuery(
                                "batch-m120-001",
                                "route_000193",
                                0,
                                1,
                                0.5
                        ),

                        new VehiclePositionQuery(
                                "batch-substring-like-001",
                                "route_000185",
                                0.1,
                                0.9,
                                0.5
                        )
                );

        List<VehicleInterpolatedPosition> positions =
                vehicleSimulationMapper.findPositionsAtProgress(queries);

        /*
         * 批量查询首先验证数量。
         * 少一条通常表示某个routeId没有匹配成功，多一条可能表示SQL连接产生了重复结果。
         */
        assertEquals(queries.size(), positions.size());

        Set<String> returnedVehicleIds =
                positions
                        .stream()
                        .map(VehicleInterpolatedPosition::getVehicleId)
                        .collect(Collectors.toSet());

        assertEquals(
                Set.of(
                        "batch-m103-001",
                        "batch-m103-002",
                        "batch-m120-001",
                        "batch-substring-like-001"
                ),
                returnedVehicleIds
        );

        /*
         * 每条结果都必须包含合法车辆编号和经纬度。
         * 这里不把深圳的具体坐标写死，
         * 避免测试与某一个精确浮点结果过度耦合。
         */
        for (VehicleInterpolatedPosition position : positions) {
            assertAll(
                    () -> assertNotNull(position.getVehicleId()),
                    () -> assertNotNull(position.getLongitude()),
                    () -> assertNotNull(position.getLatitude()),
                    () -> assertTrue(position.getLongitude() >= -180 && position.getLongitude() <= 180),
                    () -> assertTrue(position.getLatitude() >= -90 && position.getLatitude() <= 90)
            );
        }
    }
}
