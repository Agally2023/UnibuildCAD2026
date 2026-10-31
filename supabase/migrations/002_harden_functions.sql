-- Security hardening flagged by the Supabase advisor. Safe to re-run.
alter function public.touch_element() set search_path = public;
alter function public.add_owner() set search_path = public;
-- add_owner is only called by the projects_owner trigger; it must not be callable through the API.
revoke execute on function public.add_owner() from public, anon, authenticated;
