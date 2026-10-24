import * as Cesium from 'cesium'
import { SHADER_CONFIG } from '@/config/shader.config'
import directionalArrowsShaderSource from '@/shaders/transitRoute/directionalArrows.glsl?raw'

const routeArrowConfig = SHADER_CONFIG.routeDirectionArrows

type RouteArrowSegment = {
    positions: Cesium.Cartesian3[]
    routeLengthMeters: number
    primitive: Cesium.GroundPolylinePrimitive
    material: Cesium.Material
}

// 根据线路顶点计算近似线路长度，用来保持不同线路的箭头间距接近一致。
function calculateRouteLengthMeters(positions: Cesium.Cartesian3[]) {
    let totalLengthMeters = 0

    for (let index = 1; index < positions.length; index += 1) {
        totalLengthMeters += Cesium.Cartesian3.distance(positions[index - 1], positions[index])
    }

    return totalLengthMeters
}

// 找到当前线路片段中距离相机最近的顶点，用它估算画面中的米/像素比例。
function findClosestRoutePosition(
    positions: Cesium.Cartesian3[],
    cameraPosition: Cesium.Cartesian3,
) {
    let closestPosition = positions[0]
    let minimumDistanceSquared = Number.POSITIVE_INFINITY

    for (const position of positions) {
        const distanceSquared = Cesium.Cartesian3.distanceSquared(position, cameraPosition)

        if (distanceSquared < minimumDistanceSquared) {
            minimumDistanceSquared = distanceSquared
            closestPosition = position
        }
    }

    return closestPosition
}

// 根据当前线路段长度创建独立材质，并向 GLSL 提供动画和颜色参数。
function createRouteArrowMaterial() {
    return new Cesium.Material({
        fabric: {
            source: directionalArrowsShaderSource,

            uniforms: {
                u_time: 0,
                u_repeat: 1,
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

    let routeArrowSegments: RouteArrowSegment[] = []

    let removeArrowAnimationListener:
        | (() => void)
        | undefined

    let removeCameraMoveEndListener:
        | (() => void)
        | undefined

    // 根据相机距离把期望的像素长度换算成米，并更新每段线路的箭头重复次数。
    function updateRouteArrowRepeatByCamera(viewer: Cesium.Viewer) {
        const scene = viewer.scene
        const camera = viewer.camera

        for (const segment of routeArrowSegments) {
            const closestPosition = findClosestRoutePosition(segment.positions, camera.positionWC)

            const referenceSphere = new Cesium.BoundingSphere(closestPosition, 0)

            // 返回参考位置附近一个屏幕像素大约对应多少米。
            const metersPerPixel =
                camera.getPixelSize(
                    referenceSphere,
                    scene.drawingBufferWidth,
                    scene.drawingBufferHeight,
                )

            const expectedPatternLengthMeters = metersPerPixel * routeArrowConfig.patternLengthPixels

            const patternLengthMeters =
                Cesium.Math.clamp(
                    expectedPatternLengthMeters,
                    routeArrowConfig.minimumPatternLengthMeters,
                    routeArrowConfig.maximumPatternLengthMeters,
                )

            segment.material.uniforms.u_repeat = Math.max(
                1,
                segment.routeLengthMeters / patternLengthMeters
            )
        }
    }

    // 清除箭头 Primitive、材质和相机相关事件监听器。
    function clearRouteDirectionArrows() {
        removeCameraMoveEndListener?.()
        removeCameraMoveEndListener = undefined
        removeArrowAnimationListener?.()
        removeArrowAnimationListener = undefined

        const currentViewer = routeArrowViewer

        for (const segment of routeArrowSegments) {
            if (
                currentViewer &&
                !currentViewer.isDestroyed() &&
                !segment.primitive.isDestroyed()
            ) {
                currentViewer.scene.primitives.remove(segment.primitive)
            }

            if (!segment.material.isDestroyed()) {
                segment.material.destroy()
            }
        }

        if (currentViewer && !currentViewer.isDestroyed()) {
            currentViewer.scene.requestRender()
        }

        routeArrowSegments = []
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
            const material = createRouteArrowMaterial()

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

            routeArrowSegments.push({
                positions,
                routeLengthMeters,
                primitive,
                material,
            })
        }

        if (routeArrowSegments.length === 0) {
            routeArrowViewer = undefined
            return
        }

        updateRouteArrowRepeatByCamera(viewer)

        removeCameraMoveEndListener = viewer.camera.moveEnd.addEventListener(() => {
            updateRouteArrowRepeatByCamera(viewer)
            viewer.scene.requestRender()
        })

        const animationStartTime = performance.now()

        removeArrowAnimationListener = viewer.scene.preRender.addEventListener(() => {
            const elapsedSeconds = (performance.now() - animationStartTime) / 1000

            for (const segment of routeArrowSegments) {
                segment.material.uniforms.u_time = elapsedSeconds
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
