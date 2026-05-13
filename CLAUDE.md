# Staff CRM — context for Claude

Этот файл — компактный онбординг для следующей сессии Claude. Читать
**целиком** перед первым tool-call в этом репо.

---

## Что это и для кого

Личный CRM-инструмент руководителя для развития команды:
сотрудники, команды, проекты, ИПР, 1-on-1, риск ухода, capacity, пульс
команд. Однопользовательский — каждый залогиненный видит **только свои**
строки. Multi-tenant сознательно отложен.

URL прода: <https://gastings123-star.github.io/CRM_Job/>
GitHub: <https://github.com/gastings123-star/CRM_Job>
Supabase: project `ejivinvdojubszwuraox` (см. `app/.env`).

---

## Стек

- **Preact 10** + `@preact/signals` (глобальные сигналы вместо контекста)
- **preact-iso** — роутинг, `useLocation()`/`useRoute()`
- **Tailwind CSS** — тёмная тема, glass-эффекты
- **TypeScript strict** (`exactOptionalPropertyTypes: true`)
- **Zod** — единственный источник истины по форме данных
- **Vite 5** + **vite-plugin-pwa** (autoUpdate, NetworkFirst для Supabase REST)
- **Vitest** + **@testing-library/preact** + jsdom — юниты + UI-тесты
- **Supabase** — БД (Postgres), Auth (Google OAuth + magic link), RLS
- **GitHub Pages** — деплой (см. `.github/workflows/deploy-app.yml`)

---

## Раскладка репозитория

```
staff-crm/
├── app/                          # Vite-приложение, единственный фронт
│   ├── src/
│   │   ├── app/                  # AppShell, routing, AuthGate
│   │   ├── data/schema.ts        # Все Zod-схемы (Employee, Team, Project,
│   │   │                         #   Personal, TeamPulseSnapshot)
│   │   ├── domain/               # Pure-функции: dates, risk, capacity,
│   │   │                         #   metrics, notifications, agenda,
│   │   │                         #   calendar, development, pulse,
│   │   │                         #   global-tasks, crm-lists
│   │   ├── infra/                # supabase client, auth, sync, storage,
│   │   │                         #   migrate-legacy, importExport
│   │   ├── infra/repos/          # createCollectionRepo / createSingletonRepo
│   │   │                         #   + employeesRepo / teamsRepo /
│   │   │                         #   projectsRepo / personalRepo / pulseRepo
│   │   ├── state/                # Глобальные сигналы (toasts, confirm,
│   │   │                         #   command-palette, crm-view)
│   │   └── ui/
│   │       ├── components/       # Button, Field, Modal, Tabs, Toast/Confirm,
│   │       │                     #   CommandPaletteHost
│   │       └── screens/          # Dashboard, CRM (+ tabs), Teams (+ pulse),
│   │                             #   Pulse, Tasks, Calendar, Development,
│   │                             #   Personal, Settings
│   ├── tests/unit/               # vitest
│   ├── vite.config.ts            # PWA + base path
│   └── package.json
├── docs/
│   ├── deploy.md                 # как раскатывать прод
│   ├── backlog/                  # отложенные продуктовые идеи
│   └── supabase-migrations/      # одноразовые SQL для прода
├── .github/workflows/
│   └── deploy-app.yml            # сборка Vite → GH Pages
└── README.md                     # пользовательский readme
```

---

## Архитектурные паттерны (важно)

### 1. Zod = единственный источник истины по форме данных
- Схема в `src/data/schema.ts`. UI и серверный jsonb выводятся из неё.
- `.passthrough()` на всех узлах, чтобы расширения payload не теряли данные.
- В Employee `load` **без `.default()` на корне** — UI должен передавать
  хотя бы `{}` при create, иначе safeParse падает (`load required`).

### 2. Per-user RLS через `owner_id = auth.uid()`
- Триггер `set_owner_id()` подставляет `owner_id := auth.uid()` на insert.
- RLS политики `select/insert/update/delete` по `owner_id = auth.uid()`.
- Главный SQL: `docs/supabase-schema.sql`. Дополнения — в
  `docs/supabase-migrations/*.sql` (по дате).
- Когда добавляешь новую таблицу в `SyncTable` — обязательно SQL-миграция
  с jsonb-payload, триггерами и RLS-политиками по образцу `team_pulse`.

### 3. Repos — реактивный слой над Supabase
- `createCollectionRepo<T>({ entity, schema, getId })` —
  `signal<T[]>` + локальный кэш + оптимистичные мутации через SyncQueue.
- `createSingletonRepo<T>` — для `personal` (один документ на user_id).
- Все мутации идут через `repo.create/update/remove` — попадают и в
  signal, и в localStorage, и в очередь синхронизации.
- `repo.loadAll()` сначала ждёт `queue.flush()`, потом мерджит ответ
  сервера с локально-pending записями (важно после bulk-импорта).

### 4. SyncQueue (`src/infra/sync.ts`)
- discriminated union: `insert | update | delete | upsert`.
- Compress соседних ops по `(table, id)`: `insert+update→insert(merged)`,
  `insert+delete→noop`, `update+delete→delete` и т.д.
- Сериализуется в `localStorage`, переживает релоад.
- При flush — sequential apply на supabase REST через клиент.
- Версионирование ключа очереди: при первом запуске мигрирует v1→v2.

### 5. Globals через `@preact/signals`
- `toastsSignal`, `confirmSignal` — для уведомлений и dialog-confirm
  без пробрасывания контекста.
- `paletteOpenSignal` — Cmd+K палитра.
- `crmViewSignal` — упорядоченные id из текущего среза /crm, нужно
  карточке сотрудника для prev/next-навигации.

### 6. Domain modules — pure
- Никаких сайд-эффектов и сигналов внутри `src/domain/*.ts`.
- Принимают `now: Date` параметром (для тестируемости).
- UI вызывает их через `useMemo`.

---

## Конвенции

### Ветки и PR
- По одной стадии = одна ветка `stage-N-short-description` = один PR.
- Коммит-сообщения с заголовком `feat(stage-N): описание` (или
  `fix(stage-N): …` для мелких правок в ту же ветку до мержа).
- В теле — что сделано, какие тесты, почему так.
- PR `#K` имеет связь со стадией N: `K = N + 1` (PR #2 ↔ stage 1, и т.д.).
- В конце пишем `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

### SQL-миграции
- В `docs/supabase-migrations/YYYY-MM-DD-name.sql`.
- Всегда идемпотентны: `IF NOT EXISTS`, `OR REPLACE`, `drop policy if
  exists; create policy …`.
- Применяются вручную через Supabase Dashboard → SQL Editor (для прод —
  обязательно перед мержем PR; Claude напоминает пользователю).

### PWA / Base path
- `app/vite.config.ts` берёт `process.env.VITE_BASE` — CI выставляет
  `/CRM_Job/` для GitHub Pages, локально `/`.
- `app/src/app/routes.ts` собирает пути через `import.meta.env.BASE_URL`.
- В `app/src/infra/auth.ts` redirect URL — `origin + BASE_URL`.
- В Supabase Auth → Site URL и Additional Redirect URLs должны включать
  и `http://localhost:5173/`, и `https://gastings123-star.github.io/CRM_Job/`.
- В GitHub Secrets хранятся `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.

### Тесты
- `npm run test` — vitest, ≈ 228 теста.
- UI-компоненты, использующие `useLocation()`, **оборачивать в
  `<LocationProvider>`** в тесте.
- Для модалок, использующих `pulseRepo/employeesRepo` etc., мокать
  `@/infra/supabase` чтобы не лезли в сеть.
- Pure-функции из `domain/` — тестируются без render.

---

## Что сделано (стадии 0–23)

| # | Что | Ключевые файлы |
|---|---|---|
| 0 | Vite+TS+Tailwind+CI каркас, Supabase init | `app/`, `.github/workflows/ci.yml` |
| 1 | Zod-схема + domain (risk, capacity, agenda, metrics, notifications, dates) | `data/schema.ts`, `domain/*` |
| 2 | Infra: storage, sync, importExport, OAuth UI | `infra/*` |
| 3 | UI-каркас: routing, signals, базовые компоненты, 7 плейсхолдеров | `app/AppShell.tsx`, `ui/components/*` |
| 4 | Data layer: репозитории + sync с kind | `infra/repos/*`, `sync.ts` |
| 5 | Первый CRM-экран: список + create/edit/delete | `ui/screens/crm/CrmScreen.tsx` |
| 6 | Импорт legacy: jsonb-migrate + Settings UI | `infra/migrate-legacy.ts`, `ui/screens/settings/*` |
| 7 | Деплой на GitHub Pages, SPA fallback | `deploy-app.yml`, `vite.config.ts` |
| 8–11 | Карточка сотрудника, 8 вкладок (Basic, Load, Skills, Goals, Tasks, 1-on-1, ProjectHistory, Extra) | `ui/screens/crm/EmployeeDetail.tsx`, `tabs/*` |
| 12 | Дашборд: KPI, уведомления, топ риска, распределения | `ui/screens/dashboard/DashboardScreen.tsx` |
| 13 | /teams CRUD + SQL-миграция payload | `ui/screens/teams/TeamsScreen.tsx` |
| 14 | /projects CRUD + миграция drop legacy-колонок | `ui/screens/projects/ProjectsScreen.tsx` |
| 15 | /calendar — месячная сетка с событиями | `domain/calendar.ts`, `ui/screens/calendar/*` |
| 16 | /development — ИПР сводка, навыки, карьера | `domain/development.ts`, `ui/screens/development/*` |
| 17 | /personal — заметки + задачи руководителя | `ui/screens/personal/PersonalScreen.tsx` |
| 18 | CRM quick wins: Cmd+K, smart lists, info row, prev/next | `state/command-palette.ts`, `domain/crm-lists.ts` |
| 19 | Bulk actions в /crm | `CrmScreen.tsx` (BulkActionBar, BulkPickerModal) |
| 20 | Закрытие 1-on-1 с follow-up в tasks | `tabs/OneOnOneTab.tsx` |
| 21 | /tasks глобальная лента + CSV/Excel экспорт + PWA | `domain/global-tasks.ts`, `vite.config.ts` |
| 22 | Team Pulse X.1–X.4: SQL, repo, domain/pulse, /teams/:id, модалка снэпшота | `domain/pulse.ts`, `ui/screens/teams/*` |
| 23 | Team Pulse X.5: /pulse heatmap (команды × недели) | `ui/screens/pulse/PulseReportScreen.tsx` |

Всего к концу 23 — 228 тестов проходят, PWA работает, прод-деплой
автоматический на каждый merge в main.

---

## Backlog (на возврат)

### Высокий приоритет (давно ждёт)
- **Дедуп сотрудников** — UI «найти и слить дубликаты по ФИО». После
  bulk-импорта возможны дубли (legacyId отсутствовал в CSV-конверторе).

### Quick wins
- **Аватары через Supabase Storage** — фото в карточке.
- **Audit log** — кто что менял, через триггер в `audit_log` таблицу.
- **Skill matrix per team** — heatmap «сотрудники команды × навыки».
- **ИПР-шаблоны** — пресеты «зон развития».

### Крупные
- **Weekly email summary** — Supabase Edge Function + cron.
- **iCal/Google Calendar экспорт** для 1-on-1 и отпусков.

См. также `docs/backlog/team-pulse.md` — там был отдельный roadmap, к
концу stage 23 закрыт полностью.

---

## Типичные подводные камни

1. **`load: {}` обязателен** при создании нового employee — иначе Zod
   падает с «required». См. `makeEmployee` в `CrmScreen.tsx`.
2. **`loadAll()` после bulk-импорта** — без `await queue.flush()` затрёт
   локальные оптимистичные insert'ы пустым ответом сервера. Уже
   исправлено в `infra/repos/core.ts`, не сломайте.
3. **Модалка внутри `<form>`** — нельзя ставить `type="submit"` на
   кнопке внутри модалки, потому что HTML flatten-ит nested forms и
   submit летит в outer. Используем `type="button"` + `onClick`.
4. **`vi.mock` hoisting** — модули, использующие моки, нужно импортить
   ПОСЛЕ `vi.mock`. Если мок ссылается на переменные — используем
   `vi.hoisted()`. Образец — `tests/unit/sync.test.ts`.
5. **Signal-чтения в `useMemo`** — не реактивны автоматически. Читать
   `.value` в теле компонента, складывать в const, передавать в deps
   массив `useMemo`. Образец — `CommandPaletteHost.tsx`.
6. **`exactOptionalPropertyTypes: true`** — нельзя присвоить `undefined`
   полю типа `T?`. Используем условные `if`/два вызова с разными
   объектами вместо передачи `undefined`.
7. **SQL-миграция перед мержем PR** — если PR трогает шейп БД, всегда
   напомнить пользователю прогнать миграцию в Supabase Dashboard.
8. **GitHub Pages 404 на deep-link** — нормально, Pages отдаёт
   `404.html` (наш index.html) со статусом 404, но SPA-роутер всё равно
   работает. SPA-fallback копируется в deploy-workflow:
   `cp dist/index.html dist/404.html`.

---

## Команды, которые делаю чаще всего

```bash
# Разработка
cd /Users/dmitrijbelov/projects/staff-crm/app
npm run dev                    # localhost:5173
npm test                       # vitest
npm run typecheck              # tsc -b --noEmit
npm run lint
npm run build                  # с переменной VITE_BASE для прод-проверки

# Git workflow
cd /Users/dmitrijbelov/projects/staff-crm
git checkout main && git pull
git checkout -b stage-N-name
# ...работа...
git add -A && git commit -m "feat(stage-N): …"
git push -u origin stage-N-name
# Открываешь PR, ждёшь зелёного CI, мержишь, я возвращаюсь к main
```

---

## Точка входа при возврате

Скажи мне «возвращаемся к проекту» + либо номер стадии из backlog, либо
конкретную задачу. Я перечитаю этот файл, схему и нужные модули — и
сразу буду в контексте. Если контекст устарел (фичи добавились,
SyncQueue эволюционировал и т.п.) — попроси меня обновить `CLAUDE.md`
**первым делом**, потом продолжим.
