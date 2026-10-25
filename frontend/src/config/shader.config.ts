
export const SHADER_CONFIG = {

    // 选中公交线路的动态方向箭头。
    routeDirectionArrows: {
        width: 7,

        // 一个箭头循环在屏幕上的像素
        patternLengthPixels: 30,

        // 最近距离的缩小长度
        minimumPatternLengthMeters: 5,

        // 最远距离的长度
        maximumPatternLengthMeters: 110,

        speed: 0.52,

        routeColor: '#10556d',
        routeAlpha: 0.78,

        centerColor: '#0e8db2',
        guideColor: '#44ceec',
        arrowColor: '#d8fbff',
    },
} as const