create table if not exists public.dispatch_orders (
  id text primary key,
  source text not null check (source in ('email', 'manual')),
  customer text not null default '',
  contact text not null default '',
  address text not null default '',
  city text not null default '',
  material text not null default '',
  quantity text not null default '',
  unit text not null default 'TonS',
  requested_window text not null default 'Needs scheduling',
  truck_preference text,
  notes text not null default '',
  status text not null default 'new' check (status in ('new', 'scheduled', 'hold')),
  assigned_route_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists dispatch_orders_status_idx
  on public.dispatch_orders (status, created_at desc);

create index if not exists dispatch_orders_assigned_route_idx
  on public.dispatch_orders (assigned_route_id);

create or replace function public.set_dispatch_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists dispatch_orders_set_updated_at on public.dispatch_orders;

create trigger dispatch_orders_set_updated_at
before update on public.dispatch_orders
for each row
execute function public.set_dispatch_orders_updated_at();
