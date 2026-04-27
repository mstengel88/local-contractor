-- Adds quote creator tracking for saved quotes.
-- Run this in Supabase SQL Editor for the contractor app database.

alter table public.custom_delivery_quotes
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists created_by_name text,
  add column if not exists created_by_email text;

create index if not exists custom_delivery_quotes_created_by_user_id_idx
  on public.custom_delivery_quotes (created_by_user_id);

create index if not exists custom_delivery_quotes_created_at_idx
  on public.custom_delivery_quotes (created_at desc);
