-- Supabase auth profile and permission storage for the contractor app.
-- Run this in Supabase SQL Editor after enabling Supabase Auth email/password.

create table if not exists public.app_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'user',
  permissions jsonb not null default '["quoteTool"]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_user_profiles_email_idx
  on public.app_user_profiles (lower(email));

alter table public.app_user_profiles enable row level security;

drop policy if exists "service role manages app user profiles" on public.app_user_profiles;
create policy "service role manages app user profiles"
  on public.app_user_profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Optional: let an authenticated user read their own profile if you later use
-- Supabase directly from the browser. The current app reads profiles server-side.
drop policy if exists "users can read their own app profile" on public.app_user_profiles;
create policy "users can read their own app profile"
  on public.app_user_profiles
  for select
  using (auth.uid() = id);

create table if not exists public.app_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null default 'System',
  actor_email text not null default '',
  action text not null,
  target_type text not null default 'app',
  target_id text,
  target_label text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_audit_log_created_at_idx
  on public.app_audit_log (created_at desc);

create index if not exists app_audit_log_actor_user_id_idx
  on public.app_audit_log (actor_user_id);

create index if not exists app_audit_log_action_idx
  on public.app_audit_log (action);

alter table public.app_audit_log enable row level security;

drop policy if exists "service role manages app audit log" on public.app_audit_log;
create policy "service role manages app audit log"
  on public.app_audit_log
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
