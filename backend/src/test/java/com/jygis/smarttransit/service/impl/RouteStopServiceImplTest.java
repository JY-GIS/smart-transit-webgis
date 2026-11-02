package com.jygis.smarttransit.service.impl;

import com.jygis.smarttransit.config.RouteStopCacheProperties;
import com.jygis.smarttransit.mapper.RouteStopMapper;
import com.jygis.smarttransit.pojo.RouteStopDetail;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RouteStopServiceImplTest {

    private static final String ROUTE_ID = "route_000010";
    private static final String KEY = "transit:route:" + ROUTE_ID + ":stops:v1";

    private final RouteStopMapper mapper = mock(RouteStopMapper.class);
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final JsonMapper json = JsonMapper.builder().build();
    private final RouteStopCacheProperties properties = new RouteStopCacheProperties();
    private RouteStopServiceImpl service;
    private List<RouteStopDetail> stops;

    @BeforeEach
    void setUp() {
        properties.setEnabled(true);
        when(redis.opsForValue()).thenReturn(values);
        RouteStopDetail stop = new RouteStopDetail();
        stop.setRouteId(ROUTE_ID);
        stop.setStopId("stop_000307");
        stop.setStopName("深圳少儿图书馆(公交站)");
        stop.setLongitude(114.09389583);
        stop.setLatitude(22.55183017);
        stop.setStopSequence(1);
        stops = List.of(stop);
        service = new RouteStopServiceImpl(mapper, redis, json, properties);
    }

    @Test
    void disabledCacheQueriesDatabaseWithoutAccessingRedis() {
        properties.setEnabled(false);
        when(mapper.findStopsByRouteId(ROUTE_ID)).thenReturn(stops);

        assertEquals(stops, service.findStopsByRouteId(ROUTE_ID));

        verifyNoInteractions(redis);
    }

    @Test
    void hitReturnsTypedStopsWithChineseAndCoordinatesWithoutQueryingDatabase() {
        when(values.get(KEY)).thenReturn(json.writeValueAsString(stops));

        assertEquals(stops, service.findStopsByRouteId(ROUTE_ID));

        verifyNoInteractions(mapper);
        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void missQueriesDatabaseAndStoresJsonWithConfiguredTtl() {
        properties.setTtlSeconds(42);
        when(mapper.findStopsByRouteId(ROUTE_ID)).thenReturn(stops);

        assertEquals(stops, service.findStopsByRouteId(ROUTE_ID));

        verify(mapper).findStopsByRouteId(ROUTE_ID);
        verify(values).set(KEY, json.writeValueAsString(stops), Duration.ofSeconds(42));
    }

    @Test
    void redisReadFailureFallsBackWithoutAttemptingCacheWrite() {
        when(values.get(KEY)).thenThrow(new RedisConnectionFailureException("offline"));
        when(mapper.findStopsByRouteId(ROUTE_ID)).thenReturn(stops);

        assertEquals(stops, service.findStopsByRouteId(ROUTE_ID));

        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void redisWriteFailureStillReturnsDatabaseResult() {
        when(mapper.findStopsByRouteId(ROUTE_ID)).thenReturn(stops);
        doThrow(new RedisConnectionFailureException("offline"))
                .when(values).set(eq(KEY), anyString(), any(Duration.class));

        assertEquals(stops, service.findStopsByRouteId(ROUTE_ID));
    }

    @Test
    void malformedJsonIsReplacedWithDatabaseResult() {
        when(values.get(KEY)).thenReturn("broken-json");
        when(mapper.findStopsByRouteId(ROUTE_ID)).thenReturn(stops);

        assertEquals(stops, service.findStopsByRouteId(ROUTE_ID));

        verify(values).set(KEY, json.writeValueAsString(stops), Duration.ofSeconds(600));
    }

    @Test
    void emptyDatabaseResultDoesNotCreateCacheEntry() {
        when(mapper.findStopsByRouteId(ROUTE_ID)).thenReturn(List.of());

        assertTrue(service.findStopsByRouteId(ROUTE_ID).isEmpty());

        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void databaseFailureIsNotSwallowedOrCached() {
        var failure = new DataAccessResourceFailureException("database unavailable");
        when(mapper.findStopsByRouteId(ROUTE_ID)).thenThrow(failure);

        assertSame(failure, assertThrows(DataAccessResourceFailureException.class,
                () -> service.findStopsByRouteId(ROUTE_ID)));

        verify(values, never()).set(anyString(), anyString(), any(Duration.class));
    }
}
