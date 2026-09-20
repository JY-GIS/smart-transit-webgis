package com.jygis.smarttransit.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Spring 定时任务配置。
 *
 * 职责：
 * - 开启 Spring 对 @Scheduled 的扫描和执行能力。
 *
 * 谁调用它：
 * - Spring 在应用启动时读取该配置；
 * - 后续带有 @Scheduled 的任务方法会被自动注册。
 *
 * 如果没有 @EnableScheduling，即使方法上写了 @Scheduled，也不会被周期执行。
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}