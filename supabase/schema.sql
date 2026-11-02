-- Unibuild: Supabase (Postgres) schema. Run in the Supabase SQL editor.
create extension if not exists "pgcrypto";

create type element_type as enum ('wall','slab','roof','column','beam','foundation','door','window','stair',
  'duct','pipe','cable_tray','fixture','equipment','zone');
create type discipline as enum ('architecture','structure','mep');
create type member_role as enum ('owner','editor','viewer');

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  units text not null default 'metric',
  currency text not null default 'KES',
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);

create table project_members (
  project_id uuid references projects on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role member_role not null default 'editor',
  primary key (project_id, user_id)
);

create table stories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  name text not null,
  elevation_m numeric not null,
  height_m numeric not null default 3.6,
  sort_order int not null default 0
);

-- Reusable catalogs: materials, wall/slab assemblies, sections, door/window types, MEP equipment.
-- project_id null = global library shared by everyone.
create table library_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  discipline discipline not null,
  category text not null,
  name text not null,
  specs jsonb not null default '{}',
  unit text not null default 'each',
  unit_cost numeric,
  created_at timestamptz not null default now()
);

-- One generic table for every BIM element; geometry and parameters live in jsonb.
create table elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  story_id uuid references stories on delete set null,
  type element_type not null,
  discipline discipline not null,
  library_item_id uuid references library_items,
  geometry jsonb not null,            -- e.g. {"start":[0,0],"end":[6,0],"height":3.6}
  properties jsonb not null default '{}',
  version int not null default 1,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create index on elements (project_id, story_id);
create index on elements (project_id, discipline, type);

create table issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  kind text not null default 'clash',  -- clash | rfi | note
  element_a uuid references elements on delete set null,
  element_b uuid references elements on delete set null,
  title text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  name text not null,
  storage_path text not null,          -- Supabase Storage: IFC, DWG, PDF, photos
  created_at timestamptz not null default now()
);

create or replace function touch_element() returns trigger language plpgsql as $$
begin new.version := old.version + 1; new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger elements_touch before update on elements for each row execute function touch_element();

-- Row level security
create or replace function is_member(pid uuid, min_role member_role default 'viewer') returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from project_members m where m.project_id = pid and m.user_id = auth.uid()
    and (min_role = 'viewer' or (min_role = 'editor' and m.role in ('editor','owner')) or m.role = 'owner')) $$;

create or replace function add_owner() returns trigger language plpgsql security definer as $$
begin insert into project_members values (new.id, new.created_by, 'owner'); return new; end $$;
create trigger projects_owner after insert on projects for each row execute function add_owner();

alter table projects enable row level security;
alter table project_members enable row level security;
alter table stories enable row level security;
alter table library_items enable row level security;
alter table elements enable row level security;
alter table issues enable row level security;
alter table documents enable row level security;

create policy p_sel on projects for select using (is_member(id) or created_by = auth.uid());
create policy p_ins on projects for insert with check (created_by = auth.uid());
create policy p_upd on projects for update using (is_member(id,'owner'));
create policy m_sel on project_members for select using (is_member(project_id));
create policy m_all on project_members for all using (is_member(project_id,'owner'));
create policy l_sel on library_items for select using (project_id is null or is_member(project_id));
create policy l_mod on library_items for all using (project_id is not null and is_member(project_id,'editor'));

do $$ declare t text; begin
  foreach t in array array['stories','elements','issues','documents'] loop
    execute format('create policy %I_sel on %I for select using (is_member(project_id))', t, t);
    execute format('create policy %I_mod on %I for all using (is_member(project_id,''editor'')) with check (is_member(project_id,''editor''))', t, t);
  end loop; end $$;

alter publication supabase_realtime add table elements, issues;  -- live multi-user editing

-- Starter global library
insert into library_items (discipline, category, name, specs, unit, unit_cost) values
('architecture','wall','Masonry 200 mm plastered','{"thickness_mm":200,"u_value":1.9}','m2',6000),
('architecture','window','Aluminium double glazed 1.5x1.2','{"w":1.5,"h":1.2,"u_value":2.8}','each',45000),
('architecture','door','Timber flush door 0.9x2.1','{"w":0.9,"h":2.1}','each',18000),
('structure','material','Concrete C30/37','{"fcu_mpa":30,"density_kn_m3":25}','m3',34000),
('structure','material','Reinforcement B500','{"fy_mpa":500}','tonne',130000),
('structure','section','RC column 300x300','{"b_mm":300,"h_mm":300}','m',null),
('structure','section','RC beam 250x500','{"b_mm":250,"h_mm":500}','m',null),
('mep','equipment','Chiller 100 TR','{"capacity_kw":352,"cop":3.2}','each',null),
('mep','duct','Rectangular duct 600x300','{"w_mm":600,"h_mm":300}','m',null),
('mep','pipe','uPVC pipe 110 mm','{"dia_mm":110}','m',null);

-- ===== Migration 001 (snapshots, issue columns, storey uniqueness, project delete) =====
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

-- ===== Migration 002 (function hardening) =====
alter function public.touch_element() set search_path = public;
alter function public.add_owner() set search_path = public;
revoke execute on function public.add_owner() from public, anon, authenticated;

-- ===== Migration 003 (structural grid lines) =====
alter type element_type add value if not exists 'grid';

-- ===== Migration 004 (dimensions and text on the plan) =====
alter type element_type add value if not exists 'dimension';
alter type element_type add value if not exists 'text';

-- ===== Migration 004 (dimensions and text labels) =====
alter type element_type add value if not exists 'dimension';
alter type element_type add value if not exists 'label';
