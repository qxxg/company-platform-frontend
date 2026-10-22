import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * Vite 开发配置。
 *
 * 浏览器只访问 5173 端口，/api 请求由 Vite 代理到网关 8080，避免开发环境
 * 因跨域配置不一致导致接口偶发失败。OAuth2 授权与令牌请求直接访问认证中心
 * 9000（认证中心已配置 CORS），这样登录回调地址与浏览器地址栏保持一致。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          xfwd: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
    },
  }
})
