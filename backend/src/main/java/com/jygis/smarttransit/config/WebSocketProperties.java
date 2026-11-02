package com.jygis.smarttransit.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import java.util.List;

/**
 * WebSocket 握手来源配置。
 */
@Data
@Component
@Validated
@ConfigurationProperties(prefix = "transit.websocket")
public class WebSocketProperties {

    /**
     * 允许发起 STOMP/WebSocket 握手的浏览器 Origin 模式。
     */
    @NotEmpty
    private List<@NotBlank String> allowedOriginPatterns;
}
