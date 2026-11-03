package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.config.RouteStopCacheProperties;
import com.jygis.smarttransit.mapper.RouteStopMapper;
import com.jygis.smarttransit.pojo.RouteStop;
import com.jygis.smarttransit.pojo.RouteStopDetail;
import com.jygis.smarttransit.service.RouteStopService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.concurrent.locks.ReentrantLock;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class RouteStopServiceImpl implements RouteStopService {

    private final RouteStopMapper routeStopMapper;

    private final StringRedisTemplate redisTemplate;

    private final ObjectMapper objectMapper;

    private final RouteStopCacheProperties cacheProperties;

    private final ReentrantLock cacheRebuildLock = new ReentrantLock();

    private static final TypeReference<List<RouteStopDetail>> STOP_LIST_TYPE =
            new TypeReference<>() {};

    @Override
    public List<RouteStop> findAll() {
        return routeStopMapper.findAll();
    }

    @Override
    public List<RouteStopDetail> findStopsByRouteId(String routeId) {
        if (!cacheProperties.isEnabled()) {
            return routeStopMapper.findStopsByRouteId(routeId);
        }

        // 与 learn: 前缀的手工练习数据隔离；v1 表示当前缓存数据结构版本。
        String key = "transit:route:" + routeId + ":stops:v1";

        try {
            // 相对于 Redis 命令行 ： GET transit:route:route_000010:stops:v1
            String cachedJson = redisTemplate.opsForValue().get(key);
            if (cachedJson != null) {
                List<RouteStopDetail> cachedStops = objectMapper.readValue(cachedJson, STOP_LIST_TYPE);
                if (cachedStops != null) {
                    log.debug("线路站点缓存命中：key={}, stopCount={}", key, cachedStops.size());
                    return cachedStops;
                }
            }
        } catch (DataAccessException exception) {
            // 连接失败或超时后直接查库，避免本次请求继续尝试写入不可用的 Redis。
            log.warn("线路站点缓存读取失败，回退数据库：key={}, cause={}",
                    key, exception.getClass().getSimpleName());
            return routeStopMapper.findStopsByRouteId(routeId);
        } catch (JacksonException exception) {
            // 数据格式损坏时重新查库，并用正确的 JSON 覆盖旧缓存。
            log.warn("线路站点缓存 JSON 无效，重新查询数据库：key={}", key);
        }

        log.debug("准备获取缓存重建锁：key={}", key);
        cacheRebuildLock.lock();
        try {
            log.debug("已获取缓存重建锁：key={}", key);
            try {
                String cachedJson = redisTemplate.opsForValue().get(key);
                if (cachedJson != null) {
                    List<RouteStopDetail> cachedStops =
                            objectMapper.readValue(cachedJson, STOP_LIST_TYPE);
                    if (cachedStops != null) {
                        log.debug("锁内二次检查命中缓存：key={}", key);
                        return cachedStops;
                    }
                }
            } catch (DataAccessException | JacksonException exception) {
                log.warn("锁内读取缓存失败，继续查询数据库：key={}, cause={}",
                        key, exception.getClass().getSimpleName());
            }

            log.debug("线路站点缓存未命中，查询数据库：key={}", key);
            // 数据库异常应正常向上传递，不能当成缓存故障吞掉。
            List<RouteStopDetail> stops = routeStopMapper.findStopsByRouteId(routeId);

            // 空列表会转换成 "[]"，同样属于有效缓存；短 TTL 让新导入的站点更快可见。
            long ttlSeconds = stops.isEmpty()
                    ? cacheProperties.getEmptyTtlSeconds()
                    : cacheProperties.getTtlSeconds();
            try {
                // 转为 JSON 字符串，再以一次 SET 同时写入内容与有效期。
                String json = objectMapper.writeValueAsString(stops);
                redisTemplate.opsForValue().set(key, json, Duration.ofSeconds(ttlSeconds));
                log.debug("线路站点缓存已写入：key={}, stopCount={}, ttlSeconds={}",
                        key, stops.size(), ttlSeconds);
            } catch (DataAccessException | JacksonException exception) {
                // 查询已经成功，缓存写入失败不应使接口失败。
                log.warn("线路站点缓存写入失败，返回数据库结果：key={}, cause={}",
                        key, exception.getClass().getSimpleName());
            }
            return stops;
        } finally {
            // 释放锁
            cacheRebuildLock.unlock();
        }
    }

}
