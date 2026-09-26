# 公交车辆模拟性能优化报告

## 优化前

| 指标 | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| positionQueryCount | 141 | 146 | 150 |
| tickDurationMs | 157.0102 ms | 378.0822 ms | 547.1561 ms |
| positionQueryTotalMs | 150.1606 ms | 365.7019 ms | 532.4854 ms |
| positionQueryAverageMs | 1.0723 ms | 2.5369 ms | 4.0036 ms |
| publishDurationMs | 2.7655 ms | 5.0686 ms | 8.5175 ms |
| publishIntervalMs | 1163.8265 ms | 1382.7686 ms | 1552.6347 ms |
| usedHeapMb | 42.8834 MB | 60.9778 MB | 63.4264 MB |

## 优化后

| 指标 | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| positionQueryCount | 1 | 1 | 1 |
| tickDurationMs | 19.3186 ms | 52.0584 ms | 224.2775 ms |
| positionQueryTotalMs | 17.3443 ms | 42.7729 ms | 133.7628 ms |
| positionQueryAverageMs | 17.3443 ms | 42.7729 ms | 133.7628 ms |
| publishDurationMs | 0.8917 ms | 6.0974 ms | 85.0795 ms |
| publishIntervalMs | 1030.2537 ms | 1059.6475 ms | 1364.2183 ms |
| usedHeapMb | 132.0115 MB | 212.9248 MB | 222.2924 MB |

另外单独记录：

- 有效样本数：154
- `publishSucceeded=false` 次数：0
- `ERROR` 次数：0
- `gcCount`：61 → 135，本次 GC 74 次
- `gcTimeMs`：95 → 316，本次 GC 总耗时 221 ms
- `usedHeapMb`：41.6592 MB → 59.9893 MB

## 优化前后对比

| 指标 | p50（优化前 → 优化后） | 变化 | p95（优化前 → 优化后） | 变化 | max（优化前 → 优化后） | 变化 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| positionQueryCount | 141 → 1 | -99.3% | 146 → 1 | -99.3% | 150 → 1 | -99.3% |
| tickDurationMs | 157.0102 → 19.3186 ms | -87.7% | 378.0822 → 52.0584 ms | -86.2% | 547.1561 → 224.2775 ms | -59.0% |
| positionQueryTotalMs | 150.1606 → 17.3443 ms | -88.4% | 365.7019 → 42.7729 ms | -88.3% | 532.4854 → 133.7628 ms | -74.9% |
| positionQueryAverageMs | 1.0723 → 17.3443 ms | +1517.5% | 2.5369 → 42.7729 ms | +1586.1% | 4.0036 → 133.7628 ms | +3241.0% |
| publishDurationMs | 2.7655 → 0.8917 ms | -67.8% | 5.0686 → 6.0974 ms | +20.3% | 8.5175 → 85.0795 ms | +898.9% |
| publishIntervalMs | 1163.8265 → 1030.2537 ms | -11.5% | 1382.7686 → 1059.6475 ms | -23.4% | 1552.6347 → 1364.2183 ms | -12.1% |
| usedHeapMb | 42.8834 → 132.0115 MB | +207.8% | 60.9778 → 212.9248 MB | +249.2% | 63.4264 → 222.2924 MB | +250.5% |

## 对比结论

- 核心优化有效：查询次数从约 141 次降至 1 次，`tickDurationMs` 的 p50 降低 87.7%，p95 降低 86.2%。
- 查询总耗时显著下降：`positionQueryTotalMs` 的 p50、p95 分别降低 88.4% 和 88.3%。
- `positionQueryAverageMs` 的统计口径发生变化：优化前是约 141 次查询的单次平均值，优化后只有一次批量查询，因此它等于总查询耗时，不能根据该指标的涨幅判断性能退化。
- 发布耗时的 p50 更低。虽然 p95 和 max 上升，但没有发生发布失败，当前先作为偶发尖峰继续观察。
- 批量查询增加了瞬时堆内存占用，但测试结束时堆内存能够回落，暂未发现持续增长或内存泄漏迹象，需要在更高车辆规模下继续观察。

## 312 辆车容量测试

将每条线路的模拟车辆数从 3 辆增加至 6 辆，在 52 条线路、312 辆车的场景下继续验证批量查询的性能和稳定性。

测试时间约 36 分 45 秒，共获得 204 条有效性能样本。

| 指标 | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| positionQueryCount | 1 | 1 | 1 |
| tickDurationMs | 82.8330 ms | 130.0756 ms | 217.4447 ms |
| positionQueryTotalMs | 65.5310 ms | 113.2444 ms | 195.7583 ms |
| positionQueryAverageMs | 65.5310 ms | 113.2444 ms | 195.7583 ms |
| publishDurationMs | 8.0578 ms | 10.0992 ms | 13.1882 ms |
| publishIntervalMs | 1091.3926 ms | 1138.7599 ms | 1225.5478 ms |
| usedHeapMb | 49.8078 MB | 151.6678 MB | 227.4208 MB |

另外单独记录：

- 有效样本数：204
- `routeCount`：始终为 52
- `snapshotCount`：始终为 312
- `positionQueryCount`：始终为 1
- `publishSucceeded=false` 次数：0
- `ERROR` 次数：0
- `gcCount`：19 → 782，本次 GC 763 次
- `gcTimeMs`：41 → 2596，本次 GC 总耗时 2555 ms
- 平均每次 GC 耗时约 3.35 ms
- GC 总耗时约占测试时间的 0.116%
- `usedHeapMb`：30.8462 MB → 76.2967 MB

## 156 辆车与 312 辆车对比

| 指标 | 156 辆 p50 | 312 辆 p50 | 变化 | 156 辆 p95 | 312 辆 p95 | 变化 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| positionQueryCount | 1 | 1 | 0% | 1 | 1 | 0% |
| tickDurationMs | 19.3186 ms | 82.8330 ms | +328.8% | 52.0584 ms | 130.0756 ms | +149.9% |
| positionQueryTotalMs | 17.3443 ms | 65.5310 ms | +277.8% | 42.7729 ms | 113.2444 ms | +164.8% |
| publishDurationMs | 0.8917 ms | 8.0578 ms | +803.6% | 6.0974 ms | 10.0992 ms | +65.6% |
| publishIntervalMs | 1030.2537 ms | 1091.3926 ms | +5.9% | 1059.6475 ms | 1138.7599 ms | +7.5% |
| usedHeapMb | 132.0115 MB | 49.8078 MB | -62.3% | 212.9248 MB | 151.6678 MB | -28.8% |

### 容量测试结论

- 车辆数量从 156 辆增加到 312 辆后，数据库位置查询次数仍然固定为 1 次，说明批量查询优化在车辆规模翻倍后继续有效。
- `tickDurationMs` 的 p95 从 52.0584 ms 增长至 130.0756 ms。耗时增长不是完全线性的，但绝对值仍明显低于 1 秒。
- `publishIntervalMs` 的 p95 仅增长 7.5%，312 辆车场景下仍保持在约 1.14 秒。
- GC 次数明显增加，但 GC 总耗时只占测试时长约 0.116%，暂时没有构成主要性能瓶颈。
- 堆内存最大值与 156 辆车测试接近，测试结束时内存能够回落，暂未发现持续增长或内存泄漏迹象。
- 测试期间没有前端 WebSocket 连接，因此本次结果用于评价后端车辆模拟和批量空间查询能力，不代表前端渲染性能。
