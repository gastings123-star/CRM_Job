# Supabase setup

## Создание проекта

1. Создать новый проект на https://supabase.com (бесплатный tier).
2. Project Settings → API:
   - скопировать `Project URL` → `VITE_SUPABASE_URL` в `app/.env`
   - скопировать `anon public` ключ → `VITE_SUPABASE_ANON_KEY`
3. Authentication → Providers → Google:
   - включить Google provider
   - в Google Cloud Console создать OAuth client (Web), указать в Authorised redirect URIs:
     `https://<project-ref>.supabase.co/auth/v1/callback`
   - скопировать Client ID и Client Secret в Supabase
4. Authentication → URL Configuration:
   - Site URL: `http://localhost:5173` (dev) и продакшн-URL GitHub Pages
   - Redirect URLs: добавить оба

## Применение миграций

Через Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Либо вручную: открыть SQL Editor и выполнить содержимое `migrations/0001_init.sql`.

## Проверка RLS

После миграции войти двумя разными Google-аккаунтами и убедиться,
что каждый видит только свои строки в `employees`, `teams`, `projects`, `personal`.
