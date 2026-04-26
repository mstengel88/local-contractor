create table if not exists public.dispatch_orders (
  id text primary key,
  order_number text,
  source text not null check (source in ('email', 'manual')),
  customer text not null default '',
  contact text not null default '',
  address text not null default '',
  city text not null default '',
  material text not null default '',
  quantity text not null default '',
  unit text not null default 'TonS',
  requested_window text not null default 'Needs scheduling',
  time_preference text,
  truck_preference text,
  notes text not null default '',
  status text not null default 'new' check (status in ('new', 'scheduled', 'hold', 'delivered')),
  assigned_route_id text,
  stop_sequence integer,
  delivery_status text not null default 'not_started' check (delivery_status in ('not_started', 'en_route', 'arrived', 'delivered', 'issue')),
  eta text,
  travel_minutes numeric,
  travel_miles numeric,
  travel_summary text,
  arrived_at timestamptz,
  departed_at timestamptz,
  delivered_at timestamptz,
  proof_name text,
  proof_notes text,
  email_subject text,
  raw_email text,
  mailbox_message_id text,
  signature_name text,
  signature_data text,
  photo_urls text,
  ticket_numbers text,
  inspection_status text,
  checklist_json text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.dispatch_orders
  add column if not exists order_number text,
  add column if not exists stop_sequence integer,
  add column if not exists delivery_status text not null default 'not_started',
  add column if not exists eta text,
  add column if not exists travel_minutes numeric,
  add column if not exists travel_miles numeric,
  add column if not exists travel_summary text,
  add column if not exists time_preference text,
  add column if not exists arrived_at timestamptz,
  add column if not exists departed_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists proof_name text,
  add column if not exists proof_notes text,
  add column if not exists email_subject text,
  add column if not exists raw_email text,
  add column if not exists mailbox_message_id text,
  add column if not exists signature_name text,
  add column if not exists signature_data text,
  add column if not exists photo_urls text,
  add column if not exists ticket_numbers text,
  add column if not exists inspection_status text,
  add column if not exists checklist_json text;

alter table public.dispatch_orders
  drop constraint if exists dispatch_orders_status_check;

alter table public.dispatch_orders
  add constraint dispatch_orders_status_check
  check (status in ('new', 'scheduled', 'hold', 'delivered'));

create table if not exists public.dispatch_trucks (
  id text primary key,
  label text not null default '',
  truck_type text not null default '',
  capacity text not null default '',
  tons text,
  yards text,
  license_plate text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.dispatch_trucks
  add column if not exists tons text,
  add column if not exists yards text;

create table if not exists public.dispatch_employees (
  id text primary key,
  name text not null default '',
  role text not null default 'driver' check (role in ('driver', 'helper', 'dispatcher')),
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists dispatch_orders_status_idx
  on public.dispatch_orders (status, created_at desc);

create index if not exists dispatch_orders_order_number_idx
  on public.dispatch_orders (order_number);

create index if not exists dispatch_orders_assigned_route_idx
  on public.dispatch_orders (assigned_route_id);

create index if not exists dispatch_orders_route_sequence_idx
  on public.dispatch_orders (assigned_route_id, stop_sequence asc);

create unique index if not exists dispatch_orders_mailbox_message_id_idx
  on public.dispatch_orders (mailbox_message_id)
  where mailbox_message_id is not null;

create index if not exists dispatch_trucks_active_idx
  on public.dispatch_trucks (is_active, label asc);

create index if not exists dispatch_employees_active_idx
  on public.dispatch_employees (is_active, name asc);

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

create or replace function public.set_dispatch_trucks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists dispatch_trucks_set_updated_at on public.dispatch_trucks;

create trigger dispatch_trucks_set_updated_at
before update on public.dispatch_trucks
for each row
execute function public.set_dispatch_trucks_updated_at();

create or replace function public.set_dispatch_employees_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists dispatch_employees_set_updated_at on public.dispatch_employees;

create trigger dispatch_employees_set_updated_at
before update on public.dispatch_employees
for each row
execute function public.set_dispatch_employees_updated_at();

create table if not exists public.dispatch_routes (
  id text primary key,
  code text not null default '',
  truck_id text references public.dispatch_trucks(id) on delete set null,
  truck text not null default '',
  driver_id text references public.dispatch_employees(id) on delete set null,
  driver text not null default '',
  helper_id text references public.dispatch_employees(id) on delete set null,
  helper text not null default '',
  color text not null default '#38bdf8',
  shift text not null default '',
  region text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.dispatch_routes
  add column if not exists truck_id text references public.dispatch_trucks(id) on delete set null,
  add column if not exists driver_id text references public.dispatch_employees(id) on delete set null,
  add column if not exists helper_id text references public.dispatch_employees(id) on delete set null;

create index if not exists dispatch_routes_active_idx
  on public.dispatch_routes (is_active, created_at asc);

create table if not exists public.dispatch_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_dispatch_routes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists dispatch_routes_set_updated_at on public.dispatch_routes;

create trigger dispatch_routes_set_updated_at
before update on public.dispatch_routes
for each row
execute function public.set_dispatch_routes_updated_at();
