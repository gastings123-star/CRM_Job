-- Staff CRM — bootstrap schema (этап 5).
-- Запускать в Supabase SQL Editor от роли postgres.
--
-- Модель:
--   employees / teams / projects: одна строка на сущность,
--     `payload jsonb` хранит Zod-объект, `owner_id` ставит триггер из auth.uid().
--   personal: один документ на пользователя по `user_id`.
--
-- RLS: каждый пользователь видит только свои строки.

-- ---------------------------------------------------------------
-- 1. Таблицы
-- ---------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.employees (
  id          uuid primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.teams (
  id          uuid primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.personal (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 2. Триггеры: owner_id и updated_at
-- ---------------------------------------------------------------

create or replace function public.set_owner_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['employees','teams','projects'] loop
    execute format(
      'drop trigger if exists trg_%1$s_owner on public.%1$s;
       create trigger trg_%1$s_owner before insert on public.%1$s
         for each row execute function public.set_owner_id();
       drop trigger if exists trg_%1$s_touch on public.%1$s;
       create trigger trg_%1$s_touch before update on public.%1$s
         for each row execute function public.touch_updated_at();',
      t
    );
  end loop;
end $$;

drop trigger if exists trg_personal_touch on public.personal;
create trigger trg_personal_touch before update on public.personal
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------

alter table public.employees enable row level security;
alter table public.teams     enable row level security;
alter table public.projects  enable row level security;
alter table public.personal  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['employees','teams','projects'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_select_own" on public.%1$s for select using (owner_id = auth.uid());',
      t
    );
    execute format(
      'create policy "%1$s_insert_own" on public.%1$s for insert with check (owner_id is null or owner_id = auth.uid());',
      t
    );
    execute format(
      'create policy "%1$s_update_own" on public.%1$s for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
      t
    );
    execute format(
      'create policy "%1$s_delete_own" on public.%1$s for delete using (owner_id = auth.uid());',
      t
    );
  end loop;
end $$;

drop policy if exists "personal_select_own" on public.personal;
drop policy if exists "personal_upsert_own" on public.personal;
drop policy if exists "personal_update_own" on public.personal;
drop policy if exists "personal_delete_own" on public.personal;

create policy "personal_select_own" on public.personal
  for select using (user_id = auth.uid());
create policy "personal_upsert_own" on public.personal
  for insert with check (user_id = auth.uid());
create policy "personal_update_own" on public.personal
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "personal_delete_own" on public.personal
  for delete using (user_id = auth.uid());
