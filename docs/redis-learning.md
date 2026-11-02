# Redis 入门：线路站点查询缓存

## 实验目标

目标接口为 `GET /api/routes/{routeId}/stops`。只缓存单条线路的站点查询结果，正式数据仍保存在 PostGIS。线路列表、全量线路站点、车辆实时状态与历史轨迹不参与本次缓存。

已记录的缓存前参考：`route_000010`，预热后串行请求 20 次，平均 2.59465 ms、最小 1.8049 ms、最大 9.0551 ms。这是客户端初步计时，不能作为并发容量或数据库查询次数的证据。

## 数据如何流动

```text
Controller
  → RouteStopServiceImpl
      → Redis GET
          命中：JSON → List<RouteStopDetail> → 返回
          未命中：Mapper → PostGIS → List<RouteStopDetail>
                               → JSON → Redis SET（同时设置 TTL）
                               → 返回
```

Java 中的 `StringRedisTemplate` 负责读写字符串，`ObjectMapper` 负责站点列表与 JSON 的相互转换。Redis 中保存的是 String 类型，其内容是一段 JSON 文本。

- Key：`transit:route:route_000010:stops:v1`，其中 `v1` 表示缓存结构版本。
- Value：该线路的站点列表 JSON，包含中文名称、经纬度和站序。
- TTL：默认 600 秒；读取缓存不会重新延长有效期。
- 空站点列表暂不缓存。
- Redis 读取失败时直接查询数据库；写入失败时仍返回已经查到的数据。

## 1. 启动并验证 Redis

首次创建本地 Redis 容器，在 PowerShell 中执行：

```powershell
docker run -d --name smart-transit-redis -p 127.0.0.1:6379:6379 redis:8
```

容器已存在时无需重复创建。以后容器停止时，执行：

```powershell
docker start smart-transit-redis
docker exec smart-transit-redis redis-cli PING
```

应返回 `PONG`。

## 2. 启用实验配置

默认配置关闭缓存，保持原有数据库查询行为。`redis-lab` Profile 开启缓存。该 Profile 中的 Service 和 Mapper 日志目前为 `INFO`，便于计时；需要观察缓存命中和 SQL 时，将 `application-redis-lab.yml` 的两个日志级别改为 `DEBUG`：

```yaml
logging:
  level:
    com.jygis.smarttransit.service.impl.RouteStopServiceImpl: DEBUG
    com.jygis.smarttransit.mapper.RouteStopMapper: DEBUG
```

停止原来运行在 8080 端口的后端。在原有数据库密码环境变量有效的 PowerShell 窗口中执行：

```powershell
Set-Location D:\smart-transit-webgis\backend
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=redis-lab'
```

如果换了 PowerShell 窗口，仍需按项目原有启动方式设置 `SMART_TRANSIT_DB_PASSWORD`；根目录 `.env` 不会由 Maven 自动载入。

使用 IDE 启动时，将 Active profiles 设置为 `redis-lab`，并重新加载 Maven 依赖。

可配置项：

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `spring.data.redis.host` | `127.0.0.1` | 本机 Redis 地址 |
| `spring.data.redis.port` | `6379` | Redis 端口 |
| `spring.data.redis.connect-timeout` | `2s` | 连接建立超时 |
| `spring.data.redis.timeout` | `1s` | 命令超时 |
| `transit.cache.route-stops.enabled` | `false` | 缓存开关，实验 Profile 为 `true` |
| `transit.cache.route-stops.ttl-seconds` | `600` | 写入时的有效秒数，必须为正数 |

环境变量 `TRANSIT_ROUTE_STOPS_CACHE_ENABLED=true` 也可以在默认 Profile 下开启缓存，但不会自动开启 DEBUG 日志。云端容器连接 Redis 时应配置实际服务地址，而不是沿用本机回环地址。

## 3. 连续请求两次，观察数据库查询

确认已按上一节将两个日志级别改为 `DEBUG`，并重启后端。在另一个 PowerShell 窗口中执行：

```powershell
$url = 'http://localhost:8080/api/routes/route_000010/stops'

# 仅删除本实验接口对应的一个键，让下一次请求从未命中开始。
docker exec smart-transit-redis redis-cli DEL transit:route:route_000010:stops:v1

$first = Invoke-RestMethod $url
$second = Invoke-RestMethod $url
$first.data.Count
$second.data.Count
```

在后端日志中应看到：

1. 第一次：`线路站点缓存未命中，查询数据库`，随后出现此 Mapper 的 SQL 日志。
2. 第二次：`线路站点缓存命中`，此次请求不再调用该 Mapper 查询。

观察的是 `RouteStopMapper.findStopsByRouteId`。后台车辆仿真仍可能执行其他 SQL，不应把其他数据库活动误认为缓存未生效。

查看真正写入的缓存：

```powershell
docker exec smart-transit-redis redis-cli --raw GET transit:route:route_000010:stops:v1
docker exec smart-transit-redis redis-cli TTL transit:route:route_000010:stops:v1
docker exec smart-transit-redis redis-cli TYPE transit:route:route_000010:stops:v1
```

`TYPE` 应返回 `string`。终端中文显示受编码影响，可以通过下面的 UTF-8 解码方式检查接口内容：

```powershell
$response = Invoke-WebRequest -UseBasicParsing -Uri $url
$json = [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
($json | ConvertFrom-Json).data | Format-Table
```

## 4. 验证过期与手动失效

为减少等待，可以把已有键的剩余时间临时缩短为 5 秒：

```powershell
docker exec smart-transit-redis redis-cli EXPIRE transit:route:route_000010:stops:v1 5
```

过 5 秒后先检查 `TTL`，应返回 `-2`；再请求接口，应重新查询数据库并写入一份有效期为 600 秒的新缓存。

如果手工修改或导入了 PostGIS 的线路站点数据，可删除对应缓存键，使下一次查询加载最新数据：

```powershell
docker exec smart-transit-redis redis-cli DEL transit:route:route_000010:stops:v1
```

本实验尚无线路站点编辑接口，因此未实现写业务成功后的自动失效。没有手动删除时，旧缓存可能持续到过期。以后增加编辑接口时，再将相关线路键的失效接入更新流程。

## 5. 对比与边界

缓存填充后，可以重复先前的 20 次串行请求计时，保留同样的客户端、后台负载与预热条件。优先验证相同返回内容和数据库查询减少；原接口仅约 2.59 ms，Redis 的网络与 JSON 转换成本可能使耗时改善不明显。

计时前将 `application-redis-lab.yml` 中两个日志级别都设为 `INFO`，减少日志打印干扰。在该文件中先设置 `enabled: false`，在 IDEA 重启后端，待启动和车辆初始化完成后执行下列脚本；再设置 `enabled: true`，重新启动并执行相同脚本。两组测试均保持 `redis-lab` Profile。

```powershell
$url = 'http://localhost:8080/api/routes/route_000010/stops'

# 预热 5 次；启用缓存时，也会帮助填充缓存。
1..5 | ForEach-Object {
    $null = Invoke-RestMethod $url
}

# 依次测量 20 次请求，单位为毫秒。
$times = 1..20 | ForEach-Object {
    $elapsed = Measure-Command {
        $null = Invoke-RestMethod $url
    }
    $elapsed.TotalMilliseconds
}
$times | Measure-Object -Average -Minimum -Maximum
```

2026-11-02 本机按先关闭缓存、再开启缓存的顺序，记录到以下结果：

| 模式 | 样本数 | 平均耗时 | 最小耗时 | 最大耗时 |
| --- | ---: | ---: | ---: | ---: |
| 关闭缓存 | 20 | 3.74702 ms | 2.1143 ms | 13.7161 ms |
| 开启缓存 | 20 | 3.14377 ms | 2.1508 ms | 5.0559 ms |

本轮平均耗时降低约 0.60325 ms（16.1%）。两组最小值接近，第一组较高的最大值也会抬高平均值；样本量较小，后台仍有车辆仿真负载。客户端计时包含 HTTP 访问与 PowerShell 解析，不代表服务端 SQL 耗时。该结果只能作为一次初步对比，不能据此宣称稳定的性能提升幅度或多人在线容量。

去掉 `redis-lab` Profile 并确认没有启用缓存的环境变量，重启后即可恢复默认的直接查库行为。无需删除数据或容器。

本实现是单接口入门实践，未引入缓存击穿保护。大量请求同时遇到未命中时，仍可能重复查询数据库；Redis 故障时回退数据库也不代表数据库能够承受任意流量。

## 行为测试

无需连接真实数据库或 Redis 的单元测试：

```powershell
Set-Location D:\smart-transit-webgis\backend
.\mvnw.cmd '-Dtest=RouteStopServiceImplTest' test
```

测试覆盖开关关闭、缓存命中、未命中写入及 TTL、读写故障、JSON 损坏、空结果与数据库异常。

## 本次验证记录

2026-11-02，本机真实 PostGIS 与 Redis 验证通过。临时后端使用 18082 端口及 Redis 第 15 号库，并关闭自身的车辆仿真和历史写入；测试结束后清理临时后端及单个测试键。

- 后端测试共 9 项通过，包括 8 项缓存行为测试及应用启动测试；打包成功。
- 两次请求均返回相同的 11 个站点，对应 Mapper 只执行 1 次查询。
- Redis 类型为 `string`，写入后 TTL 为 600 秒。
- 临时缩短 TTL 后，键过期，下一次请求成功重新查库。
- 写入损坏的 JSON 后，接口成功查库并修复缓存。
- 将临时后端指向没有 Redis 监听的端口，接口仍成功返回相同数据。
- 关闭缓存后，即使 Redis 地址不可用，接口也能直接查库且不尝试读取缓存。

这些结果验证了缓存的功能和回退行为，未测量吞吐量提升或多人在线容量。
