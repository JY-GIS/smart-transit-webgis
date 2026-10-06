# Smart Transit WebGIS 数据库

本目录保存智慧公交 WebGIS 的 PostgreSQL/PostGIS 数据库结构、导入脚本和验证脚本。

公交业务数据链路为：

```text
frontend/public/test-data/futian-bus-routes.geojson
frontend/public/data/transit/stops.json
frontend/public/data/transit/route_stops.json
        ↓
PostgreSQL + PostGIS
        ↓
routes / stops / route_stops
```

城市静态道路链路为：

```text
frontend/public/test-data/futian-bus-roads.geojson
        ↓
QGIS 导入
        ↓
city_roads_import_raw
        ↓
load_city_roads.sql
        ↓
city_roads
        ↓
GeoServer
```

POI 数据链路为：

```text
D:\A_GIS_DATA\shenzhen-smart-transit\processed\futian_poi_ready.gpkg
        ↓
QGIS 导入
        ↓
futian_poi_final
        ↓
load_pois.sql
        ↓
pois
```

原始 POI 数据来自外部数据目录，不提交到 Git 仓库。

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
| `create_city_roads.sql` | 创建城市道路最终表和 GiST 空间索引 |
| `create_pois.sql` | 创建 POI 最终表、分类约束和空间索引 |
| `import_routes_raw.sql` | 由线路 GeoJSON 生成的线路原始数据 SQL 快照 |
| `load_routes.sql` | 将线路原始表转换并写入最终 `routes` 表 |
| `load_city_roads.sql` | 将 QGIS 导入的道路原始表转换并写入最终 `city_roads` 表 |
| `load_pois.sql` | 将 QGIS 导入的福田 POI 原始表转换并写入最终 `pois` 表 |
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

### 导入城市道路

公交数据库结构创建完成后，按以下顺序导入城市道路：

1. 执行 `create_city_roads.sql`
2. 使用 QGIS 将 `frontend/public/test-data/futian-bus-roads.geojson` 导入为 `public.city_roads_import_raw`
3. 执行 `load_city_roads.sql`

QGIS 导入参数：

```text
Schema:          public
Output table:    city_roads_import_raw
Primary key:     id
Geometry column: geom
Source SRID:     4326
Target SRID:     4326
Encoding:        UTF-8
```

重新导入道路时，只需使用 QGIS 替换 `city_roads_import_raw`，然后重新执行 `load_city_roads.sql`，不需要再次执行 `create_city_roads.sql`。

### 导入 POI

POI 数据按以下顺序导入：

1. 执行 `create_pois.sql`
2. 使用 QGIS 将 `futian_poi_ready.gpkg` 中的 `futian_poi_final` 导入为 `public.futian_poi_final`
3. 执行 `load_pois.sql`

QGIS 导入参数：

```text
Schema:          public
Output table:    futian_poi_final
Primary key:     fid
Geometry column: geom
Source SRID:     4326
Target SRID:     4326
Encoding:        UTF-8
```

`futian_poi_final` 是外部数据导入表，`pois` 是后端使用的最终业务表。

重新导入 POI 时，只需使用 QGIS 替换 `futian_poi_final`，然后重新执行 `load_pois.sql`，不需要再次执行 `create_pois.sql`。

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

### 城市道路

源文件：

```text
frontend/public/test-data/futian-bus-roads.geojson
```

源字段与最终字段：

```text
osm_id    → city_roads.osm_id
code      → city_roads.code
fclass    → city_roads.fclass
name      → city_roads.name
ref       → city_roads.ref
oneway    → city_roads.oneway
maxspeed  → city_roads.maxspeed
layer     → city_roads.layer
bridge    → city_roads.bridge
tunnel    → city_roads.tunnel
geometry  → city_roads.geom
```

`bridge` 和 `tunnel` 在源数据中使用 `T/F`，写入最终表时转换为 boolean。

道路几何类型为：

```text
MultiLineString / EPSG:4326
```

`city_roads` 是供 GeoServer 发布静态道路瓦片的数据表，不用于公交线路点击、选择、车辆关联或 ETA 计算。

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

### POI

源文件：

```text
D:\A_GIS_DATA\shenzhen-smart-transit\processed\futian_poi_ready.gpkg
```

原始表与最终表映射：

```text
名称       → pois.name
大类       → pois.source_category
中类       → pois.source_subcategory
poi_type   → pois.poi_type
geom       → pois.geom
```

`fid` 和 `OBJECTID` 只属于外部数据导入过程，不写入最终表。最终 `poi_id` 由 PostgreSQL 自动生成。

POI 几何类型为：

```text
Point / EPSG:4326
```

POI 只保留六类项目业务分类：

```text
medical
education
shopping
dining
leisure
transport
```

## 预期结果

执行完成后，最终表数据量应为：

```text
routes       616
stops        4934
route_stops  4934
city_roads   2941
pois         36366
```

空间数据应为：

```text
routes.geom: MultiLineString / 4326
stops.geom:  Point / 4326
city_roads.geom: MultiLineString / 4326
pois.geom:   Point / 4326
```

`route_stops` 中的线路和站点外键都应能匹配到对应记录。
