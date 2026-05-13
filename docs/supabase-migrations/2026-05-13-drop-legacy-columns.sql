-- Миграция: удаляем legacy per-column поля из `teams` и `projects`
-- (`name`, `status`, `color`, `legacy_id`, …). Данные ранее были скопированы
-- в jsonb `payload` миграцией `2026-05-13-add-payload-to-teams-projects.sql`.
--
-- Без этой миграции INSERT падает на 23502 «null value in column "name"
-- of relation "projects" violates not-null constraint» — клиент шлёт только
-- `id` и `payload`, а старая NOT NULL колонка остаётся обязательной.
--
-- Все DROP — IF EXISTS, идемпотентно.

-- teams
alter table public.teams drop column if exists name;
alter table public.teams drop column if exists color;
alter table public.teams drop column if exists legacy_id;
alter table public.teams drop column if exists full_name;
alter table public.teams drop column if exists role;
alter table public.teams drop column if exists team_id;

-- projects
alter table public.projects drop column if exists name;
alter table public.projects drop column if exists status;
alter table public.projects drop column if exists legacy_id;
alter table public.projects drop column if exists full_name;
alter table public.projects drop column if exists role;
alter table public.projects drop column if exists team_id;

-- Сразу проверка структуры — должно остаться только id/owner_id/payload/created_at/updated_at.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('teams', 'projects')
order by table_name, ordinal_position;
