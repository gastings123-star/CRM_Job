-- Миграция: таблица `team_pulse` для еженедельных снэпшотов команд.
-- Каждая запись — один (team_id, week_start) для текущего пользователя.
-- Структура по образцу `employees`/`teams`/`projects`: id + owner_id + jsonb payload.
--
-- payload содержит:
--   { teamId, weekStart, status, tailIndex, escalations, escalationKind, note }
-- См. `app/src/data/schema.ts` (TeamPulseSnapshotSchema).

create extension if not exists "pgcrypto";

create table if not exists public.team_pulse (
  id          uuid primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Уникальность пары (owner_id, teamId, weekStart) — один снэпшот в неделю.
create unique index if not exists team_pulse_uniq_week
  on public.team_pulse (owner_id, (payload->>'teamId'), (payload->>'weekStart'));

-- Триггеры owner_id и touch_updated_at — функции из основного schema-скрипта,
-- здесь только подвешиваем.
do $$
begin
  drop trigger if exists trg_team_pulse_owner on public.team_pulse;
  create trigger trg_team_pulse_owner before insert on public.team_pulse
    for each row execute function public.set_owner_id();
  drop trigger if exists trg_team_pulse_touch on public.team_pulse;
  create trigger trg_team_pulse_touch before update on public.team_pulse
    for each row execute function public.touch_updated_at();
end$$;

-- RLS: каждый пользователь видит только свои снэпшоты.
alter table public.team_pulse enable row level security;

drop policy if exists select_own on public.team_pulse;
create policy select_own on public.team_pulse for select using (owner_id = auth.uid());

drop policy if exists insert_own on public.team_pulse;
create policy insert_own on public.team_pulse for insert with check (owner_id = auth.uid());

drop policy if exists update_own on public.team_pulse;
create policy update_own on public.team_pulse for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists delete_own on public.team_pulse;
create policy delete_own on public.team_pulse for delete using (owner_id = auth.uid());
