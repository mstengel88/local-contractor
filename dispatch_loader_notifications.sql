create table if not exists public.dispatch_notifications (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid,
  target_role text not null default 'loader',
  order_id text references public.dispatch_orders(id) on delete set null,
  route_id text references public.dispatch_routes(id) on delete set null,
  title text not null,
  message text not null,
  status text not null default 'unread'
    check (status in ('unread', 'read')),
  created_by_user_id uuid,
  created_by_name text not null default 'System',
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

create index if not exists dispatch_notifications_target_idx
  on public.dispatch_notifications (target_role, target_user_id, created_at desc);

create index if not exists dispatch_notifications_status_idx
  on public.dispatch_notifications (status, created_at desc);

create table if not exists public.dispatch_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text not null default '',
  target_role text not null default 'loader',
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now())
);

create index if not exists dispatch_push_subscriptions_user_idx
  on public.dispatch_push_subscriptions (user_id, updated_at desc);

create index if not exists dispatch_push_subscriptions_role_idx
  on public.dispatch_push_subscriptions (target_role, updated_at desc);

do $$
begin
  alter publication supabase_realtime add table public.dispatch_notifications;
exception
  when duplicate_object then null;
end $$;
