package com.jygis.smarttransit.service;

import com.jygis.smarttransit.pojo.PlaceSearchResult;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.tool.execution.ToolCallResultConverter;

import java.lang.reflect.Type;
import java.util.List;

public class PlaceSearchTool {
    private final PlaceSearchService places;
    private List<PlaceSearchResult> candidates = List.of();
    private int radiusMeters = 500;
    private String keywords;
    private Integer nextPage;

    public PlaceSearchTool(PlaceSearchService places) {
        this.places = places;
    }

    public List<PlaceSearchResult> candidates() {
        return candidates;
    }

    public int radiusMeters() {
        return radiusMeters;
    }

    public String keywords() {
        return keywords;
    }

    public Integer nextPage() {
        return nextPage;
    }

    @Tool(description = "按地点名称、地址或类别关键词搜索深圳福田区的候选地点",
            returnDirect = true, resultConverter = PlainTextResult.class)
    public String searchPlaces(
            @ToolParam(description = "地点名称、地址或类别关键词，例如深圳市民中心、学校、医院") String keywords,
            @ToolParam(description = "用户指定的查询半径，换算成米。未指定时省略", required = false)
            Integer requestedRadiusMeters) {
        candidates = List.of();
        this.keywords = null;
        nextPage = null;
        radiusMeters = requestedRadiusMeters == null ? 500 : requestedRadiusMeters;
        if (radiusMeters < 1 || radiusMeters > 1000) {
            return "请输入 1 到 1000 米之间的查询半径。";
        }
        try {
            var page = places.searchPage(keywords, 1);
            this.keywords = keywords.strip();
            candidates = page.places();
            nextPage = page.nextPage();
            if (candidates.isEmpty() && nextPage == null) {
                return "福田区内未找到匹配地点，请补充名称或地址。";
            }
            return "本页匹配 " + candidates.size() + " 个地点。";
        } catch (IllegalArgumentException | IllegalStateException exception) {
            return exception.getMessage();
        }
    }

    // 工具直接返回对话文本，保留换行。
    public static class PlainTextResult implements ToolCallResultConverter {
        @Override
        public String convert(Object result, Type returnType) {
            return (String) result;
        }
    }
}
