-- Миграция: гарантируем наличие колонок `payload jsonb`, `owner_id`,
-- `created_at`, `updated_at` у таблиц `teams` и `projects`, а также
-- триггеров owner_id/touch и RLS-политик. Безопасно запускать повторно.
--
-- Зачем: на части аккаунтов таблицы создавались ранней версией миграции
-- легаси с per-column-схемой (без payload), из-за чего новый репозиторий
-- падает на `SELECT id, payload` с `column ... does not exist`.

-- ---------------------------------------------------------------
-- 1. Колонки
-- ---------------------------------------------------------------

alter table public.teams
  add column if not exists owner_id   uuid references auth.users(id) on delete cascade,
  add column if not exists payload    jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.projects
  add column if not exists owner_id   uuid references auth.users(id) on delete cascade,
  add column if not exists payload    jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Если в legacy-формате name/color лежали отдельными колонками — переносим
-- их в payload, чтобы новый клиент их увидел. Идемпотентно: для строк,
-- где payload уже непустой, ничего не делаем.

update public.teams
   set payload = jsonb_build_object(
     'id', id::text,
     'name', coalesce(name, ''),
     'color', coalesce(color, '#534AB7')
   )
 where payload = '{}'::jsonb
   and (
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'teams' and column_name = 'name')
   );

update public.projects
   set payload = jsonb_build_object(
     'id', id::text,
     'name', coalesce(name, ''),
     'status', coalesce(status, '')
   )
 where payload = '{}'::jsonb
   and (
     exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'projects' and column_name = 'name')
   );

-- ---------------------------------------------------------------
-- 2. Triggers (owner_id и updated_at) — копируем из supabase-schema.sql
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
  foreach t in array array['teams','projects'] loop
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
end$$;

-- Заполняем owner_id у старых строк, у которых он null
-- (если такие есть). Берём из контекста auth.uid(); если не залогинены —
-- пропускаем (мы и не сможем выполнить миграцию без логина в SQL editor).
update public.teams    set owner_id = auth.uid() where owner_id is null and auth.uid() is not null;
update public.projects set owner_id = auth.uid() where owner_id is null and auth.uid() is not null;

-- После заполнения сделаем колонку обязательной (если ещё не была).
alter table public.teams    alter column owner_id set not null;
alter table public.projects alter column owner_id set not null;

-- ---------------------------------------------------------------
-- 3. RLS-политики
-- ---------------------------------------------------------------

alter table public.teams    enable row level security;
alter table public.projects enable row level security;

do $$
declare t text;
begin
  foreach t in array array['teams','projects'] loop
    execute format('drop policy if exists select_own on public.%1$s; create policy select_own on public.%1$s for select using (owner_id = auth.uid());', t);
    execute format('drop policy if exists insert_own on public.%1$s; create policy insert_own on public.%1$s for insert with check (owner_id = auth.uid());', t);
    execute format('drop policy if exists update_own on public.%1$s; create policy update_own on public.%1$s for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());', t);
    execute format('drop policy if exists delete_own on public.%1$s; create policy delete_own on public.%1$s for delete using (owner_id = auth.uid());', t);
  end loop;
end$$;
