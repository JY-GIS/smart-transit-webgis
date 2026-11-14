package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.mapper.StopMapper;
import com.jygis.smarttransit.pojo.PlaceSearchResult;
import com.jygis.smarttransit.pojo.StopRouteOption;
import com.jygis.smarttransit.service.PlaceSearchService;
import com.jygis.smarttransit.service.PlaceSearchTool;
import com.jygis.smarttransit.service.StopRouteTool;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.deepseek.DeepSeekChatModel;
import org.springframework.ai.deepseek.DeepSeekChatOptions;
import org.springframework.ai.deepseek.api.DeepSeekApi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import java.util.List;

@RestController
@RequestMapping("/api/assistant")
public class TransitAssistantController {
    private final ChatClient chatClient;
    private final PlaceSearchService places;
    private final StopMapper stops;

    public TransitAssistantController(@Value("${DEEPSEEK_API_KEY:}") String key, PlaceSearchService places, StopMapper stops) {
        this.places = places;
        this.stops = stops;
        if (key.isBlank()) {
            chatClient = null;
            return;
        }

        var requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(5000);
        requestFactory.setReadTimeout(20000);
        var api = DeepSeekApi.builder()
                .apiKey(key)
                .restClientBuilder(RestClient.builder().requestFactory(requestFactory))
                .build();
        var options = DeepSeekChatOptions.builder()
                .model("deepseek-flash").disableThinking().maxTokens(512).build();
        var model = DeepSeekChatModel.builder().deepSeekApi(api).options(options).build();
        chatClient = ChatClient.create(model);
    }

    @PostMapping("/chat")
    public Result chat(@RequestBody ChatRequest request) {
        String message = request.message();
        if (message == null || message.isBlank() || message.length() > 500) {
            return Result.error("请输入 1 到 500 个字符的问题。");
        }
        if (chatClient == null) {
            return Result.error("请配置后端的 DEEPSEEK_API_KEY，再重启后端。");
        }

        try {
            // 工具实例只服务当前请求，候选地点不会在对话之间共享。
            var placeSearchTool = new PlaceSearchTool(places);
            List<String> stopIds = request.stopIds() == null ? List.of() : request.stopIds();
            var stopRouteTool = new StopRouteTool(stops, stopIds);
            String reply = chatClient.prompt()
                    .system("""
                            你是深圳福田公交地图的助手，用简体中文简洁回答。
                            用户要求搜索地点、地址或某地点附近的公交站时，调用 searchPlaces 一次。
                            “学校”“医院”等类别也是有效搜索关键词。单独输入类别，或问“福田区有哪些学校”等问题时，
                            直接用类别关键词调用 searchPlaces，例如传入“学校”，无需追问具体名称。
                            传入地点名称或地址。有指定半径时换算成米一并传入，未指定时省略。
                            用户可以点选候选地点，再点击按钮查询附近公交站。
                            用户按序号追问当前列表的站点线路时，调用 findStopRoutes，无需再问地点。
                            用户按序号询问站点到站时间时，也调用 findStopRoutes，让用户选择线路查询预计到站时间。
                            当前附近公交站列表共有 %d 项。
                            """.formatted(stopIds.size()))
                    .user(message)
                    .tools(placeSearchTool, stopRouteTool)
                    .call().content();
            return reply == null || reply.isBlank()
                    ? Result.error("模型没有返回回复，请重试。")
                    : Result.success(new ChatReply(reply, placeSearchTool.candidates(),
                            placeSearchTool.radiusMeters(), stopRouteTool.routes(),
                            placeSearchTool.keywords(), placeSearchTool.nextPage()));
        } catch (RuntimeException exception) {
            return Result.error("模型请求失败，请稍后重试。");
        }
    }

    public record ChatRequest(String message, List<String> stopIds) { }
    public record ChatReply(String text, List<PlaceSearchResult> places, int radiusMeters,
                            List<StopRouteOption> routes, String keywords, Integer nextPage) { }
}
