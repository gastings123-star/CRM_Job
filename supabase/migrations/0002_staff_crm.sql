-- Этап 0.5: переход на Staff CRM
--
-- Контекст: миграция 0001_init.sql развёртывала схему backlog tracker
-- (tasks, teams с полями ana/dev/tst). Целевой проект — Staff CRM,
-- модель которого описана в legacy `staff-crm/index.html` (Employee, Team,
-- Project, Personal). Данных в проде нет — безопасно дропаем старое.
--
-- Сохраняем без изменений: profiles, audit_log, set_updated_at(), handle_new_user().

-- ============================================================
-- Удалить backlog tracker
-- ============================================================
drop trigger if exists tasks_updated_at on public.tasks;
drop trigger if exists teams_updated_at on public.teams;
drop table if exists public.tasks cascade;
drop table if exists public.teams cascade;

-- ============================================================
-- teams (Staff CRM)
-- ============================================================
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  legacy_id   text,
  name        text not null,
  color       text not null default '#534AB7',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists teams_owner_idx on public.teams(owner_id);
create unique index if not exists teams_owner_legacy_uidx
  on public.teams(owner_id, legacy_id) where legacy_id is not null;

alter table public.teams enable row level security;

create policy "teams_owner_all" on public.teams
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

-- ============================================================
-- employees
-- ============================================================
create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  legacy_id   text,
  full_name   text not null default '',
  role        text not null default '',
  team_id     uuid references public.teams(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists employees_owner_idx on public.employees(owner_id);
create index if not exists employees_team_idx on public.employees(team_id);
create unique index if not exists employees_owner_legacy_uidx
  on public.employees(owner_id, legacy_id) where legacy_id is not null;

alter table public.employees enable row level security;

create policy "employees_owner_all" on public.employees
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- ============================================================
-- projects
-- ============================================================
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  legacy_id   text,
  name        text not null,
  status      text not null default '',
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects(owner_id);
create unique index if not exists projects_owner_legacy_uidx
  on public.projects(owner_id, legacy_id) where legacy_id is not null;

alter table public.projects enable row level security;

create policy "projects_owner_all" on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ============================================================
-- personal (один документ на пользователя)
-- ============================================================
create table if not exists public.personal (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.personal enable row level security;

create policy "personal_owner_all" on public.personal
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger personal_updated_at
  before update on public.personal
  for each row execute function public.set_updated_at();
