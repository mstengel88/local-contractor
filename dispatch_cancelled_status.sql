alter table public.dispatch_orders
  drop constraint if exists dispatch_orders_status_check;

alter table public.dispatch_orders
  add constraint dispatch_orders_status_check
  check (status in ('new', 'scheduled', 'hold', 'delivered', 'cancelled'));
