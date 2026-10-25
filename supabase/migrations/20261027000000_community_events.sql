-- Landed: events people post on the Community tab, and RSVPs to them. Anyone signed in can
-- read events; people can only post as themselves and change or delete their own. RSVP counts
-- come from a function, so nobody can see who else said they're going.
-- Run once in Supabase → SQL Editor (or `supabase db push`).

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  event_date date not null,
  start_time text check (char_length(start_time) <= 20),
  end_time text check (char_length(end_time) <= 20),
  venue text check (char_length(venue) <= 120),
  address text check (char_length(address) <= 200),
  -- The city from the author's profile ("Houston, TX"), to show events near people.
  city text not null check (char_length(city) <= 80),
  cost text check (char_length(cost) <= 60),
  -- Event interest ids from lib/interests.ts, for matching people's filters.
  interests text[] not null default '{}' check (cardinality(interests) <= 10),
  created_at timestamptz not null default now()
);

create table if not exists public.community_event_rsvps (
  event_id uuid not null references public.community_events (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists community_events_city_date on public.community_events (city, event_date);

alter table public.community_events enable row level security;
alter table public.community_event_rsvps enable row level security;

drop policy if exists "Read events" on public.community_events;
create policy "Read events" on public.community_events for select to authenticated using (true);
drop policy if exists "Post own events" on public.community_events;
create policy "Post own events" on public.community_events for insert to authenticated with check ((select auth.uid()) = author_id);
drop policy if exists "Edit own events" on public.community_events;
create policy "Edit own events" on public.community_events for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
drop policy if exists "Delete own events" on public.community_events;
create policy "Delete own events" on public.community_events for delete to authenticated using ((select auth.uid()) = author_id);

-- People see only their own RSVPs; everyone else's are counted by rsvp_counts().
drop policy if exists "Read own RSVPs" on public.community_event_rsvps;
create policy "Read own RSVPs" on public.community_event_rsvps for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "RSVP as yourself" on public.community_event_rsvps;
create policy "RSVP as yourself" on public.community_event_rsvps for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Cancel own RSVP" on public.community_event_rsvps;
create policy "Cancel own RSVP" on public.community_event_rsvps for delete to authenticated using ((select auth.uid()) = user_id);

-- How many people said they're going, per event. Runs with the table owner's rights so it can
-- count every RSVP, but returns only numbers.
create or replace function public.rsvp_counts(event_ids uuid[])
returns table (event_id uuid, going bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.event_id, count(*) from public.community_event_rsvps r
  where r.event_id = any (event_ids)
  group by r.event_id
$$;

revoke all on function public.rsvp_counts(uuid[]) from public, anon;
grant execute on function public.rsvp_counts(uuid[]) to authenticated;
