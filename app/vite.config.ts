import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { localDataPlugin } from './local-server';
const localMode = process.env.VITE_LOCAL_MODE === 'true';

// На GitHub Pages приложение раздаётся по подпути `/CRM_Job/`.
// Локально (`npm run dev`) base должен оставаться `/`, иначе HMR/импорты ломаются.
// Переключение — через переменную окружения VITE_BASE (CI выставит её в '/CRM_Job/').
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    ...(localMode ? [localDataPlugin()] : []),
    VitePWA({
      // autoUpdate — при появлении нового SW он скачается и активируется сам
      // при следующем визите (без интерактивного промпта). Для нашего юзкейса
      // безопасно: данные живут на сервере, конфликта версий локального
      // состояния не будет.
      disable: localMode,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Staff CRM',
        short_name: 'StaffCRM',
        description: 'CRM руководителя для развития команды',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        lang: 'ru',
        scope: base,
        start_url: base,
        icons: [
          { src: 'favicon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'favicon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Кэшируем все статические ассеты — приложение работает офлайн.
        // Данные Supabase кэшируем как stale-while-revalidate, чтобы при
        // отсутствии сети показывался последний срез, но при онлайне приходило свежее.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: `${base.replace(/\/$/, '')}/index.html`,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/.*$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/auth\/v1\/.*$/,
            // Auth никогда не кэшируем — всегда сеть.
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  preview: { host: '127.0.0.1', port: localMode ? 4310 : 4173, strictPort: true },
  build: {
    outDir: localMode ? 'dist-local' : 'dist',
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: localMode ? 4310 : 5173,
    strictPort: true,
    open: false,
  },
});
