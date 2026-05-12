# Подключение Google OAuth к Supabase

Эту настройку приходится делать руками — Google Cloud Console и Supabase Dashboard работают только из браузера. Один раз сделал — и всё. Время: ~10 минут.

## Шаг 1. Получить redirect-URL из Supabase

Это URL, по которому Supabase будет принимать ответ Google.

1. Открой https://supabase.com/dashboard/project/ejivinvdojubszwuraox/auth/providers
2. В списке провайдеров найди **Google** → нажми, чтобы раскрыть.
3. Скопируй строку **Callback URL (for OAuth)** — выглядит примерно так:

   ```
   https://ejivinvdojubszwuraox.supabase.co/auth/v1/callback
   ```

   Сохрани её — понадобится в шаге 2.

## Шаг 2. Создать OAuth client в Google Cloud

1. Открой https://console.cloud.google.com/
2. Сверху рядом с логотипом — выбор проекта. Нажми и **создай новый**, например `staff-crm-oauth`.
3. Дождись создания, выбери его как активный.
4. В поиске сверху набери **OAuth consent screen** и открой.
   - User Type: **External**, нажми Create.
   - App name: `Staff CRM` (или любой), User support email — твой email.
   - Developer contact email — твой email.
   - Save and Continue → Scopes: ничего не выбирай, **Save and Continue**.
   - Test users: добавь свой email, чтобы вход работал в режиме Testing.
   - Save → Back to Dashboard.
5. В поиске сверху набери **Credentials** → открой.
6. Нажми **+ Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Supabase`.
   - **Authorized redirect URIs** → Add URI → вставь URL из Шага 1
     (`https://ejivinvdojubszwuraox.supabase.co/auth/v1/callback`).
   - Если нужен локальный dev: добавь второй URI
     `http://localhost:5173` — но он нужен только если используешь Google login прямо на dev-сервере.
   - **Create**.
7. Появится модалка с **Client ID** и **Client secret** — скопируй оба значения. Закрывать модалку до этого нельзя.

## Шаг 3. Прокинуть credentials в Supabase

1. Вернись на https://supabase.com/dashboard/project/ejivinvdojubszwuraox/auth/providers
2. Раскрой **Google**, включи переключатель **Enable**.
3. Вставь **Client ID** и **Client Secret** из Шага 2.
4. **Save**.

## Шаг 4. Site URL и Redirect URLs

1. Открой https://supabase.com/dashboard/project/ejivinvdojubszwuraox/auth/url-configuration
2. **Site URL** поставь URL продакшна (когда будет — например `https://gastings123-star.github.io/CRM_Job/`).
3. **Redirect URLs** добавь все домены, где приложение будет открываться:
   - `http://localhost:5173/**` — dev
   - `https://gastings123-star.github.io/CRM_Job/**` — прод на GitHub Pages
4. **Save**.

## Шаг 5. Проверка

1. `cd /Users/dmitrijbelov/projects/staff-crm/app && npm run dev`
2. Открой http://localhost:5173
3. Нажми **Войти через Google** → должен сработать редирект → выбрать аккаунт → вернёт обратно с залогиненным пользователем.

## Если не работает

| Симптом                                       | Причина                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `redirect_uri_mismatch`                       | URI в Google Cloud не совпадает с тем, что шлёт Supabase. Сверь в Шаге 2. |
| `Access blocked: ... has not completed verification` | Добавь свой email в **Test users** на OAuth consent screen.             |
| Возвращает на чёрный экран без сессии         | В **Redirect URLs** Supabase не указан текущий origin.                  |
| `Error 400: invalid_request`                  | OAuth consent screen ещё не настроен до конца — заверши все шаги.       |

## Что лежит в коде

Клиентский код уже готов — он вызывает `supabase.auth.signInWithOAuth({ provider: 'google' })`. После настройки выше кнопка **Войти через Google** на экране входа начнёт работать.
