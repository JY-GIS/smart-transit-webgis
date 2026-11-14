package com.jygis.smarttransit.service;

/** 高德 GCJ-02 与项目 WGS84 坐标之间的近似数值转换，不是投影或 SRID 重标记。 */
public final class Gcj02Coordinates {
    private static final double A = 6378245.0;
    private static final double EE = 0.00669342162296594323;

    private Gcj02Coordinates() { }

    public static double[] toWgs84(double longitude, double latitude) {
        double x = longitude;
        double y = latitude;
        // 迭代求逆，避免一次减偏在城市级空间查询中积累误差。
        for (int i = 0; i < 10; i++) {
            double[] projected = fromWgs84(x, y);
            double dx = projected[0] - longitude;
            double dy = projected[1] - latitude;
            x -= dx;
            y -= dy;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 1e-9) break;
        }
        return new double[] {x, y};
    }

    static double[] fromWgs84(double longitude, double latitude) {
        if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) {
            return new double[] {longitude, latitude};
        }
        double x = longitude - 105;
        double y = latitude - 35;
        double dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
        double dLon = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
        double common = (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
        dLat += common + (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
        dLat += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
        dLon += common + (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
        dLon += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
        double radLat = Math.toRadians(latitude);
        double magic = 1 - EE * Math.pow(Math.sin(radLat), 2);
        double root = Math.sqrt(magic);
        dLat = dLat * 180 / ((A * (1 - EE)) / (magic * root) * Math.PI);
        dLon = dLon * 180 / (A / root * Math.cos(radLat) * Math.PI);
        return new double[] {longitude + dLon, latitude + dLat};
    }
}
