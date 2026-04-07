import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * Vite 設定。
 *
 * dev サーバー:
 * - 127.0.0.1 に bind する (ADR 0009: ローカルのみ)
 * - /api へのリクエストは api パッケージのサーバーへプロキシする
 *   dev 時は api を `PORT=3000 node packages/api/dist/main.js` で
 *   起動しておくことを前提とする
 *
 * production ビルドは bin/git-web 経由で api パッケージが
 * dist を配信する想定のため、proxy 設定は dev 時のみ効く。
 */
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
