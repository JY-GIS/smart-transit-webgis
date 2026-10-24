import * as Cesium from 'cesium'
import { SHADER_CONFIG } from '@/config/shader.config'
import directionalArrowsShaderSource from '@/shaders/transitRoute/directionalArrows.glsl?raw'

const routeArrowConfig = SHADER_CONFIG.routeDirectionArrows

// 根据线路顶点计算近似线路长度，用来保持不同线路的箭头间距接近一致。
function calculateRouteLengthMeters(positions: Cesium.Cartesian3[]) {
    let totalLengthMeters = 0

    for (let index = 1; index < positions.length; index += 1) {
        totalLengthMeters += Cesium.Cartesian3.distance(positions[index - 1], positions[index])
    }

    return totalLengthMeters
}

// 根据当前线路段长度创建独立材质，并向 GLSL 提供动画和颜色参数。
function createRouteArrowMaterial(repeat: number) {
    return new Cesium.Material({
        fabric: {
            source: directionalArrowsShaderSource,

            uniforms: {
                u_time: 0,
                u_repeat: repeat,
                u_speed: routeArrowConfig.speed,
                u_routeColor: Cesium.Color.fromCssColorString(routeArrowConfig.routeColor).withAlpha(routeArrowConfig.routeAlpha),
                u_centerColor: Cesium.Color.fromCssColorString(routeArrowConfig.centerColor),
                u_guideColor: Cesium.Color.fromCssColorString(routeArrowConfig.guideColor),
                u_arrowColor: Cesium.Color.fromCssColorString(routeArrowConfig.arrowColor),
            },
        },

        translucent: true,
    })
}

// 管理选中线路方向箭头的创建、动画更新和资源清理。
export function useRouteDirectionArrowLayer() {
    let routeArrowViewer:
        | Cesium.Viewer
        | undefined

    let routeArrowPrimitives: Cesium.GroundPolylinePrimitive[] = []
    let routeArrowMaterials: Cesium.Material[] = []

    let removeArrowAnimationListener:
        | (() => void)
        | undefined

    function clearRouteDirectionArrows() {
        removeArrowAnimationListener?.()
        removeArrowAnimationListener = undefined

        const currentViewer = routeArrowViewer

        if (currentViewer && !currentViewer.isDestroyed()) {
            for (const primitive of routeArrowPrimitives) {
                if (!primitive.isDestroyed()) {
                    currentViewer.scene.primitives.remove(primitive)
                }
            }

            currentViewer.scene.requestRender()
        }

        for (const material of routeArrowMaterials) {
            if (!material.isDestroyed()) {
                material.destroy()
            }
        }

        routeArrowPrimitives = []
        routeArrowMaterials = []
        routeArrowViewer = undefined
    }

    // 读取选中线路的全部片段，为每个片段创建贴地动态箭头。
    function showRouteDirectionArrows(
        viewer: Cesium.Viewer,
        sourceEntities: Cesium.Entity[],
        time: Cesium.JulianDate,
    ) {
        clearRouteDirectionArrows()

        if (!Cesium.GroundPolylinePrimitive.isSupported(viewer.scene)) {
            console.warn('当前 WebGL 环境不支持贴地动态线路箭头')
            return
        }

        routeArrowViewer = viewer

        for (const sourceEntity of sourceEntities) {
            const positions = sourceEntity.polyline?.positions?.getValue(time)

            if (!positions || positions.length < 2) {
                continue
            }

            const routeLengthMeters = calculateRouteLengthMeters(positions)

            const repeat = Math.max(
                1,
                Math.round(routeLengthMeters / routeArrowConfig.spacingMeters),
            )

            const material = createRouteArrowMaterial(repeat)

            const geometry =
                new Cesium.GroundPolylineGeometry({
                    positions,
                    width: routeArrowConfig.width,
                    arcType: Cesium.ArcType.GEODESIC,
                })

            const primitive =
                new Cesium.GroundPolylinePrimitive({
                    geometryInstances:
                        new Cesium.GeometryInstance({
                            geometry,
                        }),

                    appearance:
                        new Cesium
                            .PolylineMaterialAppearance({
                                material,
                                translucent: true,
                            }),

                    classificationType: Cesium.ClassificationType.TERRAIN,

                    allowPicking: false,
                    asynchronous: true,
                })

            viewer.scene.primitives.add(primitive)

            routeArrowMaterials.push(material)

            routeArrowPrimitives.push(primitive)
        }

        if (routeArrowMaterials.length === 0) {
            routeArrowViewer = undefined
            return
        }

        const animationStartTime = performance.now()

        removeArrowAnimationListener = viewer.scene.preRender.addEventListener(() => {
            const elapsedSeconds = (performance.now() - animationStartTime) / 1000

            for (const material of routeArrowMaterials) {
                material.uniforms.u_time = elapsedSeconds
            }

            viewer.scene.requestRender()
        })

        viewer.scene.requestRender()
    }

    return {
        showRouteDirectionArrows,
        clearRouteDirectionArrows,
    }
}