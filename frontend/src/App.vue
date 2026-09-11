<script setup lang="ts">
// 根组件只负责选择当前页面，Cesium 的生命周期由 TransitMapView 管理。
// CesiumView 保留为最小化调试页面，需要时可以临时切换回来。
// import CesiumView from '@/views/CesiumView.vue'
import TransitMapView from '@/views/TransitMapView.vue'
</script>

<template>
  <!-- 当前业务地图入口：白膜、行政区、公交线路和线路查询都由该页面组装。 -->
  <!-- <CesiumView /> -->
  <TransitMapView />
</template>
