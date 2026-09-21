import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumSource = 'node_modules/cesium/Build/Cesium'
const cesiumBaseUrl = 'cesiumStatic'

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        {
          src: `${cesiumSource}/ThirdParty`,
          dest: cesiumBaseUrl,
          rename: { stripBase: 4 },
        },
        {
          src: `${cesiumSource}/Workers`,
          dest: cesiumBaseUrl,
          rename: { stripBase: 4 },
        },
        {
          src: `${cesiumSource}/Assets`,
          dest: cesiumBaseUrl,
          rename: { stripBase: 4 },
        },
        {
          src: `${cesiumSource}/Widgets`,
          dest: cesiumBaseUrl,
          rename: { stripBase: 4 },
        },
      ],
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // --- WebSocket 握手代理 ---
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true, // ws: true 表示这个代理需要支持 HTTP Upgrade，将普通 HTTP 握手升级为 WebSocket 长连接
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})