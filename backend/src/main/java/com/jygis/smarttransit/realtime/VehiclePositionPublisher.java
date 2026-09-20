package com.jygis.smarttransit.realtime;

import com.jygis.smarttransit.pojo.VehiclePositionSnapshot;
import com.jygis.smarttransit.service.VehicleQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 车辆实时位置发布器。
 *
 * 职责：
 * - 从 VehicleQueryService 获取当前全部车辆快照；
 * - 将快照发送到 STOMP 主题；
 * - 隔离定时任务与具体消息框架。
 *
 * 调用关系：
 * VehicleSimulationTask
 * -> VehiclePositionPublisher
 * -> VehicleQueryService
 * -> SimpMessagingTemplate
 * -> /topic/vehicles
 */
@Component
@RequiredArgsConstructor
public class VehiclePositionPublisher {

    /**
     * 客户端订阅的车辆位置主题。
     */
    private static final String VEHICLE_TOPIC = "/topic/vehicles";

    private final VehicleQueryService vehicleQueryService;

    private final SimpMessagingTemplate messagingTemplate;

    /**
     * 广播当前全部车辆位置。
     */
    public void publishCurrentPositions() {
        /*
         * 每次发送完整的车辆快照列表，而不是分别发送三条消息。
         * - 前端一次收到同一轮 tick 的全部车辆；
         * - 前端可以根据 vehicleId 更新或删除车辆；
         * - 避免三辆车分别触发三次 Cesium 渲染更新；
         */
        List<VehiclePositionSnapshot> snapshots = vehicleQueryService.findCurrentPositions();

        /*
         * SimpMessagingTemplate.convertAndSend：将 Java 对象转换成 JSON，并发送到指定 STOMP 目的地。
         *
         * Spring 会将消息交给内置 Broker， Broker 再广播给所有订阅 /topic/vehicles 的客户端。
         *
         * 如果在定时任务中直接操作 WebSocket Session：任务就必须自己维护连接、订阅关系和断线清理，会把模拟业务与通信细节耦合在一起。
         */
        messagingTemplate.convertAndSend(VEHICLE_TOPIC, snapshots);
    }
}