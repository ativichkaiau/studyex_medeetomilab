-- ============================================================
-- studyex_medeetomilab · Supabase cloud schema
-- Run this once in your Supabase project → SQL Editor → New query.
-- Then connect from the app (☁ Cloud button) with the project URL and the
-- anon public key. Email magic-link auth works out of the box
-- (Authentication → Providers → Email is enabled by default).
-- ============================================================

-- 1. Per-user workspace — the whole store (all projects + LitLink) as one JSON blob.
create table if not exists public.user_states (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_states enable row level security;

drop policy if exists "own state read"   on public.user_states;
drop policy if exists "own state insert" on public.user_states;
drop policy if exists "own state update" on public.user_states;
create policy "own state read"   on public.user_states for select using (auth.uid() = user_id);
create policy "own state insert" on public.user_states for insert with check (auth.uid() = user_id);
create policy "own state update" on public.user_states for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Public, read-only shared project snapshots (share links).
create table if not exists public.shared_projects (
  id         text primary key,
  owner      uuid references auth.users (id) on delete cascade,
  name       text,
  project    jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.shared_projects enable row level security;

drop policy if exists "shared public read"  on public.shared_projects;
drop policy if exists "shared owner insert" on public.shared_projects;
drop policy if exists "shared owner delete" on public.shared_projects;
create policy "shared public read"  on public.shared_projects for select using (true);
create policy "shared owner insert" on public.shared_projects for insert with check (auth.uid() = owner);
create policy "shared owner delete" on public.shared_projects for delete using (auth.uid() = owner);
