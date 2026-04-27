-- Supabase Security Advisor hardening for the contractor app.
-- Run this in Supabase SQL Editor.
--
-- This app reads and writes these tables from the server using the Supabase
-- service role key, so these policies intentionally keep browser/API clients
-- from directly reading or changing quote, product, dispatch, and Shopify data.

-- Fix: RLS Disabled in Public
alter table if exists public.custom_delivery_quotes enable row level security;
alter table if exists public.product_source_map enable row level security;
alter table if exists public."Session" enable row level security;

-- Fix: RLS Enabled No Policy
alter table if exists public.dispatch_employees enable row level security;
alter table if exists public.dispatch_orders enable row level security;
alter table if exists public.dispatch_routes enable row level security;
alter table if exists public.dispatch_settings enable row level security;
alter table if exists public.dispatch_trucks enable row level security;
alter table if exists public.shipping_material_rules enable row level security;
alter table if exists public.shopify_app_settings enable row level security;

-- Service-role-only policies for server-managed tables.
drop policy if exists "service role manages custom delivery quotes" on public.custom_delivery_quotes;
create policy "service role manages custom delivery quotes"
  on public.custom_delivery_quotes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages product source map" on public.product_source_map;
create policy "service role manages product source map"
  on public.product_source_map
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages shopify sessions" on public."Session";
create policy "service role manages shopify sessions"
  on public."Session"
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages dispatch employees" on public.dispatch_employees;
create policy "service role manages dispatch employees"
  on public.dispatch_employees
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages dispatch orders" on public.dispatch_orders;
create policy "service role manages dispatch orders"
  on public.dispatch_orders
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages dispatch routes" on public.dispatch_routes;
create policy "service role manages dispatch routes"
  on public.dispatch_routes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages dispatch settings" on public.dispatch_settings;
create policy "service role manages dispatch settings"
  on public.dispatch_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages dispatch trucks" on public.dispatch_trucks;
create policy "service role manages dispatch trucks"
  on public.dispatch_trucks
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages shipping material rules" on public.shipping_material_rules;
create policy "service role manages shipping material rules"
  on public.shipping_material_rules
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages shopify app settings" on public.shopify_app_settings;
create policy "service role manages shopify app settings"
  on public.shopify_app_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Fix: Function Search Path Mutable
create or replace function public.set_dispatch_orders_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_dispatch_employees_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_dispatch_routes_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_dispatch_trucks_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Fix: Leaked Password Protection Disabled
-- This one is not SQL-controlled. In Supabase:
-- Authentication -> Sign In / Providers -> Password security
-- Enable "Leaked password protection".
