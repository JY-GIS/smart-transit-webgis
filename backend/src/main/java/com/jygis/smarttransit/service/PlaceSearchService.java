package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.PlaceSearchResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/** 输入提示和关键词搜索共用的地点服务，后续也可封装为 Agent 工具。 */
@Service
public class PlaceSearchService {
    private static final String FUTIAN_ADCODE = "440304";

    private final String key;
    private final ObjectMapper mapper;
    private final HttpClient client;

    @Autowired
    public PlaceSearchService(@Value("${transit.amap.key:}") String key, ObjectMapper mapper) {
        this(key, mapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2)).build());
    }

    PlaceSearchService(String key, ObjectMapper mapper, HttpClient client) {
        this.key = key;
        this.mapper = mapper;
        this.client = client;
    }

    public List<PlaceSearchResult> suggestions(String keywords) {
        return query(keywords, true, 1, 10).places();
    }

    public List<PlaceSearchResult> search(String keywords) {
        return query(keywords, false, 1, 10).places();
    }

    public SearchPage searchPage(String keywords, int page) {
        if (page < 1) throw new IllegalArgumentException("页码必须大于 0");
        return query(keywords, false, page, 5);
    }

    private SearchPage query(String keywords, boolean suggest, int page, int pageSize) {
        String normalized = keywords == null ? "" : keywords.strip();
        if (normalized.isEmpty() || normalized.length() > 80) {
            throw new IllegalArgumentException("请输入 1～80 个字符的地点或地址");
        }
        if (key.isBlank()) {
            throw new IllegalStateException("地点搜索尚未配置，请在后端设置 AMAP_WEB_SERVICE_KEY");
        }
        try {
            String path = suggest ? "/v3/assistant/inputtips" : "/v5/place/text";
            String parameters = suggest
                    ? "&city=440300&citylimit=true&datatype=poi"
                    : "&region=" + FUTIAN_ADCODE + "&city_limit=true&page_size=" + pageSize + "&page_num=" + page;
            URI uri = URI.create("https://restapi.amap.com" + path + "?key=" + encode(key)
                    + "&keywords=" + encode(normalized) + parameters + "&output=json");
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(5)).GET().build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200) {
                throw new IllegalStateException("地点服务暂时不可用，请稍后重试");
            }
            return parse(response.body(), suggest, page, pageSize);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("地点搜索已中断，请重试");
        } catch (IOException exception) {
            // 不返回异常原文：HTTP 异常可能包含带 Key 的请求 URL。
            throw new IllegalStateException("地点服务连接失败或超时，请稍后重试");
        } catch (JacksonException exception) {
            throw new IllegalStateException("地点服务返回格式异常，请稍后重试");
        }
    }

    private SearchPage parse(String body, boolean suggest, int page, int pageSize) {
        JsonNode root = mapper.readTree(body);
        if (root == null || !root.isObject()) {
            throw new IllegalStateException("地点服务返回格式异常，请稍后重试");
        }
        if (!"1".equals(text(root, "status"))) {
            throw new IllegalStateException("高德地点查询失败，请检查 Key、接口权限或调用额度");
        }
        JsonNode items = root.path(suggest ? "tips" : "pois");
        if (!items.isArray()) {
            throw new IllegalStateException("地点服务返回格式异常，请稍后重试");
        }
        List<PlaceSearchResult> results = new ArrayList<>();
        for (JsonNode item : items) {
            String adcode = text(item, "adcode");
            if (!FUTIAN_ADCODE.equals(adcode)) continue;
            String name = text(item, "name");
            if (name.isBlank()) continue;
            double[] coordinates = parseLocation(text(item, "location"));
            if (coordinates == null && !suggest) continue;
            String district = suggest ? text(item, "district")
                    : text(item, "pname") + text(item, "cityname") + text(item, "adname");
            results.add(new PlaceSearchResult(text(item, "id"), name, district, text(item, "address"), adcode,
                    coordinates == null ? null : coordinates[0], coordinates == null ? null : coordinates[1]));
        }
        // 用高德原始页判断是否还有后续页，过滤掉的地点不影响翻页。
        Integer nextPage = !suggest && items.size() == pageSize && page < Integer.MAX_VALUE ? page + 1 : null;
        return new SearchPage(results, nextPage);
    }

    public record SearchPage(List<PlaceSearchResult> places, Integer nextPage) { }

    private static double[] parseLocation(String location) {
        String[] parts = location.split(",");
        if (parts.length != 2) return null;
        try {
            double longitude = Double.parseDouble(parts[0]);
            double latitude = Double.parseDouble(parts[1]);
            if (!Double.isFinite(longitude) || !Double.isFinite(latitude)
                    || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
            return Gcj02Coordinates.toWgs84(longitude, latitude);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isString() ? value.asString() : "";
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
