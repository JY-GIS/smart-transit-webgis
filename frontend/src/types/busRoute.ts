// 面板和交互层使用的公交线路业务属性。
// 几何仍由 Cesium Entity 管理，业务对象通过 fid 与一个或多个 Entity 关联。
export interface BusRouteProperties {
    /** 业务线路唯一标识，用于 fid → Entity[] 索引。 */
    fid: number
    /** 线路名称，例如“深圳34路”。 */
    rname: string
    /** 首站名称。 */
    fsname: string
    /** 末站名称。 */
    lsname: string
    /** 所属城市。 */
    city: string
    /** 所属省份。 */
    province: string
}
