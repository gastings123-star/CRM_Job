-- Backlog Tracker v2: первичная схема
-- Принципы:
--  * Все строки принадлежат одному owner_id (auth.uid()).
--  * RLS включён на каждую таблицу, политика — owner-only.
--  * Триггер updated_at = now() на UPDATE.

-- ============================================================
-- Расширения
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Утилиты
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- profiles
-- ============================================================
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (user_id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert with check (user_id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- teams
-- ============================================================
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  legacy_id   integer,
  name        text not null,
  color       text not null default '#534AB7',
  ana         numeric not null default 100, -- capacity %
  dev         numeric not null default 100,
  tst         numeric not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists teams_owner_idx on public.teams(owner_id);

alter table public.teams enable row level security;

create policy "teams_owner_all" on public.teams
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

-- ============================================================
-- tasks
-- ============================================================
create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  legacy_id          integer,
  name               text not null,
  short_description  text not null default '',
  team_id            uuid references public.teams(id) on delete set null,
  ana                numeric not null default 0, -- человеко-дни
  dev                numeric not null default 0,
  tst                numeric not null default 0,
  status             text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  priority           text not null default ''
    check (priority in ('high', 'medium', 'low', '')),
  rank               integer not null default 0,
  value              text not null default '',
  effect             text not null default '',
  systems            text not null default '',
  stakeholder        text not null default '',
  quarter            text not null default '',
  comment            text not null default '',
  jira               text not null default '',
  sd                 text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists tasks_owner_idx on public.tasks(owner_id);
create index if not exists tasks_team_idx on public.tasks(team_id);
create index if not exists tasks_status_idx on public.tasks(status);

alter table public.tasks enable row level security;

create policy "tasks_owner_all" on public.tasks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ============================================================
-- audit_log (для Этапа 6 — будет наполняться позже)
-- ============================================================
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  entity      text not null,
  entity_id   uuid,
  action      text not null,
  diff        jsonb,
  at          timestamptz not null default now()
);

create index if not exists audit_log_owner_at_idx on public.audit_log(owner_id, at desc);

alter table public.audit_log enable row level security;

create policy "audit_log_owner_select" on public.audit_log
  for select using (owner_id = auth.uid());
create policy "audit_log_owner_insert" on public.audit_log
  for insert with check (owner_id = auth.uid());
