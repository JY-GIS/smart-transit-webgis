<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const cesiumContainer = ref<HTMLDivElement | null>(null)

let viewer: Cesium.Viewer | undefined

onMounted(() => {
  if (!cesiumContainer.value) {
    return
  }

  viewer = new Cesium.Viewer(cesiumContainer.value)

  viewer.scene.debugShowFramesPerSecond = true
})

onBeforeUnmount(() => {
  if (viewer && !viewer.isDestroyed()) {
    viewer.destroy()
  }

  viewer = undefined
})
</script>

<template>
  <div ref="cesiumContainer" class="cesium-container"></div>
</template>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100%;
}
</style>
