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

alter publication supabase_realtime add table public.dispatch_notifications;
