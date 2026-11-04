import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite config da v2.
 *
 * Em DEV, dois proxies resolvem as restricoes de CORS:
 *   /api/channels    -> backend local (backend/server.mjs, porta 8080)
 *   /api/embedcanais -> o site embedcanais.online (mesma origem => sem CORS)
 *
 * Em PRODUCAO (GitHub Pages) nao ha proxy: o app usa a API publica
 * (Netlify Function, via VITE_API_URL) e o snapshot gerado no build.
 */

export default defineConfig({
  plugins: [react()],
  // A v2 e published em /WebTV/v2/ (mesmo Pages da v1, subpasta).
  base: process.env.BASE_URL || '/WebTV/v2/',
  server: {
    port: 3001,
    host: true,
    allowedHosts: true,
    proxy: {
      // Backend local (mesma pasta do projeto)
      '/api/channels': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/channels/, '/channels'),
      },
      // Site de origem, para a via "live" funcionar em dev
      '/api/embedcanais': {
        target: 'https://embedcanais.online',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/embedcanais/, ''),
      },
    },
  },
})
