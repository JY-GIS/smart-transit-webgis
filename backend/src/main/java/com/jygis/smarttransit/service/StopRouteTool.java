package com.jygis.smarttransit.service;

import com.jygis.smarttransit.mapper.StopMapper;
import com.jygis.smarttransit.pojo.StopRouteOption;
import lombok.RequiredArgsConstructor;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

import java.util.List;

@RequiredArgsConstructor
public class StopRouteTool {
    private final StopMapper stops;
    private final List<String> stopIds;
    private List<StopRouteOption> routes = List.of();

    public List<StopRouteOption> routes() {
        return routes;
    }

    @Tool(description = "按当前附近公交站列表的序号查询经过的线路",
            returnDirect = true, resultConverter = PlaceSearchTool.PlainTextResult.class)
    public String findStopRoutes(@ToolParam(description = "站点序号，从 1 开始") int stopNumber) {
        routes = List.of();
        if (stopIds.isEmpty()) return "请先查询某个地点附近的公交站。";
        if (stopNumber < 1 || stopNumber > stopIds.size()) {
            return "请输入 1 到 " + stopIds.size() + " 之间的站点序号。";
        }

        routes = stops.findRoutesAtStop(stopIds.get(stopNumber - 1));
        if (routes.isEmpty()) return "本地数据里没有查到这个站的线路。";

        return "第 " + stopNumber + " 站 " + routes.get(0).stopName() + " 的线路，点击可查预计到站时间。";
    }
}
