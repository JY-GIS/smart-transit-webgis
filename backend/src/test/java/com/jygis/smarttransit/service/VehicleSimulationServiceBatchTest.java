package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.RouteSimulationProfile;
import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.pojo.VehicleSnapshotRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 批量车辆完整位置快照服务集成测试。
 */
@SpringBootTest(properties = "transit.simulation.enabled=false")
class VehicleSimulationServiceBatchTest {

    @Autowired
    private VehicleSimulationService vehicleSimulationService;

    @Autowired
    private VehicleSimulationMetrics simulationMetrics;

    @Test
    void shouldCalculateMultipleSnapshotsWithOnePositionQuery() {
        RouteSimulationProfile m103Profile =
                vehicleSimulationService.loadRouteProfile("route_000185");

        RouteSimulationProfile m120Profile =
                vehicleSimulationService.loadRouteProfile("route_000193");

        List<VehicleSnapshotRequest> requests =
                List.of(
                        new VehicleSnapshotRequest(
                                "batch-service-m103-001",
                                m103Profile,
                                0
                        ),

                        new VehicleSnapshotRequest(
                                "batch-service-m103-002",
                                m103Profile,
                                m103Profile
                                        .routeInfo()
                                        .getTotalLengthMeters()
                                        * 0.25
                        ),

                        new VehicleSnapshotRequest(
                                "batch-service-m103-003",
                                m103Profile,
                                m103Profile
                                        .routeInfo()
                                        .getTotalLengthMeters()
                                        * 0.75
                        ),

                        new VehicleSnapshotRequest(
                                "batch-service-m120-001",
                                m120Profile,
                                m120Profile
                                        .routeInfo()
                                        .getTotalLengthMeters()
                                        * 0.5
                        )
                );

        /*
         * loadRouteProfile不属于车辆位置查询，但这里仍在正式调用前明确重置当前tick指标。
         */
        simulationMetrics.beginTick();

        List<VehiclePositionSnapshot> snapshots = vehicleSimulationService.calculateSnapshots(requests);

        assertEquals(requests.size(), snapshots.size());

        assertEquals(1, simulationMetrics.positionQueryCount());

        assertTrue(simulationMetrics.positionQueryDurationMilliseconds() > 0);

        assertEquals(
                List.of(
                        "batch-service-m103-001",
                        "batch-service-m103-002",
                        "batch-service-m103-003",
                        "batch-service-m120-001"
                ),
                snapshots
                        .stream()
                        .map(VehiclePositionSnapshot::vehicleId)
                        .toList()
        );

        for (VehiclePositionSnapshot snapshot : snapshots) {
            assertNotNull(snapshot.routeId());

            assertTrue(snapshot.longitude() >= -180 && snapshot.longitude() <= 180);

            assertTrue(snapshot.latitude() >= -90 && snapshot.latitude() <= 90);

            assertTrue(snapshot.routeProgressPercent() >= 0 && snapshot.routeProgressPercent() <= 100);

            assertNotNull(snapshot.nextStop());
        }
    }
}