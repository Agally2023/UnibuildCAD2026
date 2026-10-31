-- Captures the changes that were applied by hand to the hosted project, so a fresh Supabase project matches the code.
-- Safe to run more than once.

create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  label text not null,
  summary jsonb not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists snapshots_project_idx on snapshots (project_id, created_at desc);

alter table issues add column if not exists location jsonb;
alter table issues add column if not exists severity text not null default 'hard';
alter table issues add column if not exists updated_at timestamptz not null default now();
alter table issues add column if not exists story_id uuid references stories on delete set null;

create unique index if not exists stories_project_elevation_uq on stories (project_id, elevation_m);

alter table snapshots enable row level security;
drop policy if exists snapshots_sel on snapshots;
drop policy if exists snapshots_mod on snapshots;
create policy snapshots_sel on snapshots for select using (is_member(project_id));
create policy snapshots_mod on snapshots for all using (is_member(project_id,'editor')) with check (is_member(project_id,'editor'));

-- Owners can delete their projects (there was no delete policy before).
drop policy if exists p_del on projects;
create policy p_del on projects for delete using (is_member(id,'owner'));
