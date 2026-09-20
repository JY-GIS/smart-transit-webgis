package com.jygis.smarttransit.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * WebSocket/STOMP 配置。
 *
 * 职责：
 * - 注册浏览器建立 WebSocket 连接时使用的握手地址；
 * - 启用 Spring 内置的 STOMP 简单消息代理；
 * - 声明客户端可以订阅的消息目的地前缀。
 *
 * 数据流：
 * 浏览器连接 /ws
 * -> 建立 WebSocket 长连接
 * -> STOMP 客户端订阅 /topic/vehicles
 * -> 接收后端广播的车辆位置
 */
@Configuration
@EnableWebSocketMessageBroker  // 启用 Spring 的 STOMP 消息基础设施
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /**
     * 配置 STOMP 消息代理。
     */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        /*
         * enableSimpleBroker("/topic") 启用 Spring 内存消息代理。
         * 客户端订阅以 /topic 开头的目的地后，消息代理会把后端发送到该目的地的消息广播给订阅者。
         *
         * enableSimpleBroker：负责维护订阅关系和广播消息。
         */
        registry.enableSimpleBroker("/topic");
    }

    /**
     * 注册 WebSocket 握手端点。
     */
    @Override
    public void registerStompEndpoints(
            StompEndpointRegistry registry
    ) {
        /*
         * addEndpoint("/ws") 注册最初建立连接的 HTTP 握手地址。
         * 握手成功后，HTTP 连接会升级为 WebSocket 长连接。
         *
         * /ws 是连接地址；
         * /topic/vehicles 是建立连接后订阅的消息目的地。
         *
         * setAllowedOriginPatterns：允许本地 Vite 开发服务器从不同端口发起握手。
         *
         * 如果不配置允许来源，localhost:5173 访问 localhost:8080 可能因为不同端口而被判定为跨源请求并拒绝握手。
         */
        registry
                .addEndpoint("/ws")
                .setAllowedOriginPatterns(
                        "http://localhost:*",
                        "http://127.0.0.1:*"
                );
    }
}