# Smart Transit WebGIS 数据库

本目录保存智慧公交 WebGIS 的 PostgreSQL/PostGIS 数据库结构、导入脚本和验证脚本。

当前数据库链路为：

```text
frontend/public/test-data/futian-bus-routes.geojson
frontend/public/data/transit/stops.json
frontend/public/data/transit/route_stops.json
        ↓
PostgreSQL + PostGIS
        ↓
routes / stops / route_stops
```

## 数据库连接

```text
Host:     127.0.0.1
Port:     15433
Database: smart_transit
User:     smart_transit
Schema:   public
```

数据库密码不写入本目录文件，应通过 IDEA 数据源或本机环境变量提供。

## 文件说明

| 文件 | 作用 |
|---|---|
| `create_schema.sql` | 启用 PostGIS，并创建 `routes`、`stops`、`route_stops` 三张最终表 |
| `create_indexes.sql` | 创建线路、站点空间索引和关系表反查索引 |
| `import_routes_raw.sql` | 由线路 GeoJSON 生成的线路原始数据 SQL 快照 |
| `load_routes.sql` | 将线路原始表转换并写入最终 `routes` 表 |
| `load_stops_and_route_stops.sql` | 由 `stops.json` 和 `route_stops.json` 生成的站点、关系数据导入脚本 |
| `verify_database.sql` | 检查 PostGIS、表结构、geometry 类型、SRID 和数据量 |

## 在 IntelliJ IDEA 中复现

在 IDEA 的 Database 面板中连接上面的 `smart_transit` 数据库，然后按以下顺序运行 SQL 文件：

1. `create_schema.sql`
2. `create_indexes.sql`
3. `import_routes_raw.sql`
4. `load_routes.sql`
5. `load_stops_and_route_stops.sql`
6. `verify_database.sql`

如果数据库中已经存在这些表，不要重复运行 `create_schema.sql`。建议在一个新的 `smart_transit` 数据库中按上述顺序执行。

## 数据映射

### 线路

源文件：

```text
frontend/public/test-data/futian-bus-routes.geojson
```

源字段：

```text
fid
rname
fsname
lsname
city
province
geometry
```

最终映射：

```text
fid       → routes.fid
rname     → routes.rname
fsname    → routes.fsname
lsname    → routes.lsname
city      → routes.city
province  → routes.province
geometry  → routes.geom
```

线路编号由 `fid` 派生：

```text
fid = 185
route_id = route_000185
```

线路几何类型为：

```text
MultiLineString / EPSG:4326
```

### 站点

源文件：

```text
frontend/public/data/transit/stops.json
```

源字段：

```text
stop_id
stop_name
longitude
latitude
```

站点几何由经纬度生成：

```sql
ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
```

最终几何类型为：

```text
Point / EPSG:4326
```

### 线路-站点关系

源文件：

```text
frontend/public/data/transit/route_stops.json
```

字段映射：

```text
route_id       → route_stops.route_id
stop_id        → route_stops.stop_id
stop_sequence  → route_stops.stop_sequence
```

## 预期结果

执行完成后，最终表数据量应为：

```text
routes       616
stops        4934
route_stops  4934
```

空间数据应为：

```text
routes.geom: MultiLineString / 4326
stops.geom:  Point / 4326
```

`route_stops` 中的线路和站点外键都应能匹配到对应记录。
