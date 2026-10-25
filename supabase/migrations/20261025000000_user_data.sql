-- Landed: each person's onboarding answers and app data, so they come back on sign-in.
-- Run once in Supabase → SQL Editor (or `supabase db push`).

-- Onboarding answers, one row per account.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  locale text not null,
  name text,
  origin_country text not null,
  languages text[] not null default '{}',
  city text not null,
  months_in_us integer not null default 0,
  has_children boolean not null default false,
  work_background text,
  biggest_challenge text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Everything else the app saves (plan, dates, checklist, questions, settings, prep summary,
-- typed-in language, saved chat), one row per kind, stored as the app's own JSON.
create table if not exists public.user_data (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key in ('plan', 'dates', 'questions', 'settings', 'customLanguage', 'checklist', 'prep', 'chat')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Each person can only see and change their own rows.
alter table public.profiles enable row level security;
alter table public.user_data enable row level security;

drop policy if exists "Own profile" on public.profiles;
create policy "Own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Own data" on public.user_data;
create policy "Own data" on public.user_data
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
