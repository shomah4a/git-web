import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * Vite 設定。
 *
 * 本プロジェクトの通常の開発フローでは vite dev サーバーを使わず、
 * `make serve` 経由で bin/git-web (api が packages/front/dist を静的配信)
 * を起動する (ADR 0013)。vite はビルドのみを担当する。
 *
 * `pnpm --filter @git-web/front dev` を直接叩いた場合の dev サーバー設定は
 * 将来 HMR を必要としたときのために残している。その場合は api を別途
 * `PORT=47906 ./bin/git-web` などで起動し、下記 proxy target を合わせること。
 */
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:47906',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
