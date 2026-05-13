import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

// На GitHub Pages приложение раздаётся по подпути `/CRM_Job/`.
// Локально (`npm run dev`) base должен оставаться `/`, иначе HMR/импорты ломаются.
// Переключение — через переменную окружения VITE_BASE (CI выставит её в '/CRM_Job/').
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [preact()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});
