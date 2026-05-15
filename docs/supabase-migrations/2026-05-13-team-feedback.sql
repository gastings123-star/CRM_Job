-- Миграция: таблица `team_feedback` — записи обратной связи о команде.
-- Источниками могут быть DPO, лид команды, peer-команды, сама заметка
-- руководителя. Используется на странице команды + для экспорта в AI.
--
-- payload содержит:
--   { teamId, date, source, author, mood, themes[], note, actionItems[] }
-- См. `app/src/data/schema.ts` (TeamFeedbackSchema).

create extension if not exists "pgcrypto";

create table if not exists public.team_feedback (
  id          uuid primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Полезные индексы для быстрых выборок по команде и по дате.
create index if not exists team_feedback_team_idx
  on public.team_feedback ((payload->>'teamId'));
create index if not exists team_feedback_date_idx
  on public.team_feedback ((payload->>'date'));

do $$
begin
  drop trigger if exists trg_team_feedback_owner on public.team_feedback;
  create trigger trg_team_feedback_owner before insert on public.team_feedback
    for each row execute function public.set_owner_id();
  drop trigger if exists trg_team_feedback_touch on public.team_feedback;
  create trigger trg_team_feedback_touch before update on public.team_feedback
    for each row execute function public.touch_updated_at();
end$$;

alter table public.team_feedback enable row level security;

drop policy if exists select_own on public.team_feedback;
create policy select_own on public.team_feedback for select using (owner_id = auth.uid());

drop policy if exists insert_own on public.team_feedback;
create policy insert_own on public.team_feedback for insert with check (owner_id = auth.uid());

drop policy if exists update_own on public.team_feedback;
create policy update_own on public.team_feedback for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists delete_own on public.team_feedback;
create policy delete_own on public.team_feedback for delete using (owner_id = auth.uid());
