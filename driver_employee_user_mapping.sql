-- Adds the employee link used to restrict driver logins to their own route.
-- Run in Supabase SQL Editor for the contractor app database.

alter table public.app_user_profiles
  add column if not exists driver_employee_id text;
