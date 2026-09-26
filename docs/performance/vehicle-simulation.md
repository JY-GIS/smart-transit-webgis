\# 公交车辆模拟性能优化报告



\## 优化前



| 指标 | p50 | p95 | max |

| --- | ---: | ---: | ---: |

| positionQueryCount | 141 | 146 | 150 |

| tickDurationMs | 157.0102 ms | 378.0822 ms | 547.1561 ms |

| positionQueryTotalMs | 150.1606 ms | 365.7019 ms | 532.4854 ms |

| positionQueryAverageMs | 1.0723 ms | 2.5369 ms | 4.0036 ms |

| publishDurationMs | 2.7655 ms | 5.0686 ms | 8.5175 ms |

| publishIntervalMs | 1163.8265 ms | 1382.7686 ms | 1552.6347 ms |

| usedHeapMb | 42.8834 MB | 60.9778 MB | 63.4264 MB |



\## 优化后



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



\- 有效样本数：154

\- `publishSucceeded=false` 次数：0

\- `ERROR` 次数：0

\- `gcCount`：61 → 135，本次 GC 74 次

\- `gcTimeMs`：95 → 316，本次 GC 总耗时 221 ms

\- `usedHeapMb`：41.6592 MB → 59.9893 MB



\## 优化前后对比



| 指标 | p50（优化前 → 优化后） | 变化 | p95（优化前 → 优化后） | 变化 | max（优化前 → 优化后） | 变化 |

| --- | ---: | ---: | ---: | ---: | ---: | ---: |

| positionQueryCount | 141 → 1 | -99.3% | 146 → 1 | -99.3% | 150 → 1 | -99.3% |

| tickDurationMs | 157.0102 → 19.3186 ms | -87.7% | 378.0822 → 52.0584 ms | -86.2% | 547.1561 → 224.2775 ms | -59.0% |

| positionQueryTotalMs | 150.1606 → 17.3443 ms | -88.4% | 365.7019 → 42.7729 ms | -88.3% | 532.4854 → 133.7628 ms | -74.9% |

| positionQueryAverageMs | 1.0723 → 17.3443 ms | +1517.5% | 2.5369 → 42.7729 ms | +1586.1% | 4.0036 → 133.7628 ms | +3241.0% |

| publishDurationMs | 2.7655 → 0.8917 ms | -67.8% | 5.0686 → 6.0974 ms | +20.3% | 8.5175 → 85.0795 ms | +898.9% |

| publishIntervalMs | 1163.8265 → 1030.2537 ms | -11.5% | 1382.7686 → 1059.6475 ms | -23.4% | 1552.6347 → 1364.2183 ms | -12.1% |

| usedHeapMb | 42.8834 → 132.0115 MB | +207.8% | 60.9778 → 212.9248 MB | +249.2% | 63.4264 → 222.2924 MB | +250.5% |



\## 对比结论



\- 核心优化有效：查询次数从约 141 次降至 1 次，`tickDurationMs` 的 p50 降低 87.7%，p95 降低 86.2%。

\- 查询总耗时显著下降：`positionQueryTotalMs` 的 p50、p95 分别降低 88.4% 和 88.3%。

\- `positionQueryAverageMs` 的统计口径发生变化：优化前是约 141 次查询的单次平均值，优化后只有一次批量查询，因此它等于总查询耗时，不能根据该指标的涨幅判断性能退化。

\- 发布耗时的 p50 更低。虽然 p95 和 max 上升，但没有发生发布失败，当前先作为偶发尖峰继续观察。

\- 批量查询增加了瞬时堆内存占用，但测试结束时堆内存能够回落，暂未发现持续增长或内存泄漏迹象，需要在更高车辆规模下继续观察。

