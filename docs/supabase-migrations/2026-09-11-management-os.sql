-- Один документ Management OS на пользователя.
create table if not exists public.management (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_management_touch on public.management;
create trigger trg_management_touch before update on public.management
  for each row execute function public.touch_updated_at();

alter table public.management enable row level security;

drop policy if exists "management_select_own" on public.management;
drop policy if exists "management_insert_own" on public.management;
drop policy if exists "management_update_own" on public.management;
drop policy if exists "management_delete_own" on public.management;

create policy "management_select_own" on public.management
  for select using (user_id = auth.uid());
create policy "management_insert_own" on public.management
  for insert with check (user_id = auth.uid());
create policy "management_update_own" on public.management
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "management_delete_own" on public.management
  for delete using (user_id = auth.uid());
