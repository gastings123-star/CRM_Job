# Деплой Staff CRM на GitHub Pages

Pages-деплой выполняется автоматически воркфлоу
`.github/workflows/deploy-app.yml` на каждый push в `main`.
Артефакт — `app/dist/`, собранный Vite-сборкой.

URL: **https://gastings123-star.github.io/CRM_Job/**

## Что нужно настроить один раз

### 1. GitHub Pages → Source = GitHub Actions

Settings → Pages → Build and deployment → Source: **GitHub Actions**
(а не «Deploy from a branch»).

### 2. Repository secrets

Settings → Secrets and variables → Actions → New repository secret:

| Имя                       | Значение                                      |
|---------------------------|-----------------------------------------------|
| `VITE_SUPABASE_URL`       | `https://ejivinvdojubszwuraox.supabase.co`    |
| `VITE_SUPABASE_ANON_KEY`  | `anon`-ключ из Supabase Dashboard → API       |

Без этих секретов сборка пройдёт, но в рантайме приложение упадёт на
инициализации Supabase-клиента (`VITE_SUPABASE_URL и …_ANON_KEY должны
быть заданы в .env`).

### 3. OAuth redirect URI

Чтобы вход через Google работал на проде, добавь `https://gastings123-star.github.io/CRM_Job/`:

- **Google Cloud Console** → APIs & Services → Credentials → ваш OAuth 2.0
  Client ID → Authorized redirect URIs: должны быть
  `https://ejivinvdojubszwuraox.supabase.co/auth/v1/callback`
  (Supabase сам редиректит обратно на наш origin).
- **Supabase Dashboard** → Authentication → URL Configuration:
  - Site URL: `https://gastings123-star.github.io/CRM_Job/`
  - Additional Redirect URLs:
    - `http://localhost:5173/` (dev)
    - `https://gastings123-star.github.io/CRM_Job/` (prod)

## Особенности кода

- **`vite.base`** управляется переменной `VITE_BASE`. Локально не задаём —
  Vite берёт `/`. CI выставляет `VITE_BASE=/CRM_Job/` перед `npm run build`.
- **Роутинг.** `app/src/app/routes.ts` собирает пути через
  `import.meta.env.BASE_URL`, поэтому `<Route path>` совпадает с
  `location.pathname` на любом BASE.
- **OAuth redirect.** `app/src/infra/auth.ts` использует
  `window.location.origin + import.meta.env.BASE_URL` — на проде это даёт
  `https://gastings123-star.github.io/CRM_Job/`.
- **SPA-фолбэк.** В CI `dist/index.html` копируется в `dist/404.html`;
  GitHub Pages отдаёт `404.html` на любой неизвестный путь, что заставляет
  внутренний роутер работать как ожидается на прямых ссылках.

## Локальная проверка прод-сборки

```bash
cd app
VITE_BASE=/CRM_Job/ npm run build
npx serve -s dist -l 5174
# открыть http://localhost:5174/CRM_Job/
```

## Старый Jekyll-воркфлоу

`jekyll-gh-pages.yml` удалён в этапе 7. Он публиковал легаси `index.html`
из корня репозитория и конкурировал бы с новым деплоем в той же Pages-среде.
