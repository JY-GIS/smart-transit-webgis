
export const SHADER_CONFIG = {

    // 选中公交线路的动态方向箭头。
    routeDirectionArrows: {
        width: 7,

        // 一个完整箭头周期期望占据的屏幕长度。
        patternLengthPixels: 30,

        // 避免镜头过近时产生数量过多的小箭头。
        minimumPatternLengthMeters: 5,

        // 保留当前远景下大约110米的最大箭头间距。
        maximumPatternLengthMeters: 110,

        speed: 0.52,

        routeColor: '#10556d',
        routeAlpha: 0.78,

        centerColor: '#0e8db2',
        guideColor: '#44ceec',
        arrowColor: '#d8fbff',
    },
} as const