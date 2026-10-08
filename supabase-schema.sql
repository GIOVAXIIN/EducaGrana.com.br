create table if not exists public.educagrana_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"transactions":[],"cards":[],"theme":"dark","hideValues":false}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.educagrana_data enable row level security;

drop policy if exists "Users can read their own EducaGrana data" on public.educagrana_data;
create policy "Users can read their own EducaGrana data"
  on public.educagrana_data for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own EducaGrana data" on public.educagrana_data;
create policy "Users can create their own EducaGrana data"
  on public.educagrana_data for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own EducaGrana data" on public.educagrana_data;
create policy "Users can update their own EducaGrana data"
  on public.educagrana_data for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.educagrana_data to authenticated;
