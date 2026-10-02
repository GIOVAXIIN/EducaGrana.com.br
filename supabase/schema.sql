create table if not exists public.finance_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"expenses":[],"cards":[],"incomes":[],"theme":"light"}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint finance_progress_data_is_object check (jsonb_typeof(data) = 'object')
);

alter table public.finance_progress enable row level security;

revoke all on table public.finance_progress from anon;
grant select, insert, update on table public.finance_progress to authenticated;

drop policy if exists "Users can read their own finance progress" on public.finance_progress;
create policy "Users can read their own finance progress"
  on public.finance_progress for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own finance progress" on public.finance_progress;
create policy "Users can create their own finance progress"
  on public.finance_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own finance progress" on public.finance_progress;
create policy "Users can update their own finance progress"
  on public.finance_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
