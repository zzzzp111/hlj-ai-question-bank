import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite 配置（Wave 1 脚手架）
// dev 端口 5173；/api 前缀代理到后端 3001（server），浏览器侧零跨域负担。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})