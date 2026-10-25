-- Landed: the Community forum. Anyone signed in can read every post and reply; people
-- can only post as themselves and delete what they wrote.
-- Run once in Supabase → SQL Editor (or `supabase db push`).

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- First name at the time of posting (profiles are private), or null for "Landed member".
  author_name text check (char_length(author_name) <= 40),
  title text not null check (char_length(title) between 3 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text check (char_length(author_name) <= 40),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists forum_posts_created_at on public.forum_posts (created_at desc);
create index if not exists forum_replies_post_id on public.forum_replies (post_id, created_at);

alter table public.forum_posts enable row level security;
alter table public.forum_replies enable row level security;

drop policy if exists "Read posts" on public.forum_posts;
create policy "Read posts" on public.forum_posts for select to authenticated using (true);
drop policy if exists "Write own posts" on public.forum_posts;
create policy "Write own posts" on public.forum_posts for insert to authenticated with check ((select auth.uid()) = author_id);
drop policy if exists "Delete own posts" on public.forum_posts;
create policy "Delete own posts" on public.forum_posts for delete to authenticated using ((select auth.uid()) = author_id);

drop policy if exists "Read replies" on public.forum_replies;
create policy "Read replies" on public.forum_replies for select to authenticated using (true);
drop policy if exists "Write own replies" on public.forum_replies;
create policy "Write own replies" on public.forum_replies for insert to authenticated with check ((select auth.uid()) = author_id);
drop policy if exists "Delete own replies" on public.forum_replies;
create policy "Delete own replies" on public.forum_replies for delete to authenticated using ((select auth.uid()) = author_id);
