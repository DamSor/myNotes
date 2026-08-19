-- Migration: notes / tags / note_tags schema with per-operation RLS
-- Foundation F-01 (context/changes/notes-schema-and-rls). Establishes the core
-- domain schema for MyNotes with strict per-user data isolation (Guardrail #1).
--
-- Ownership model: every table carries user_id referencing auth.users(id); RLS on
-- each table is a direct auth.uid() = user_id check (note_tags denormalizes user_id
-- to avoid join-based policies). All foreign keys cascade on delete (hard delete,
-- no trash — FR-008).

-- =============================================================================
-- Shared trigger: keep updated_at current on UPDATE
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- tags
-- =============================================================================
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness per user; original casing preserved in name (FR-009).
create unique index tags_user_id_lower_name_key on public.tags (user_id, lower(name));
create index tags_user_id_idx on public.tags (user_id);

create trigger tags_set_updated_at
  before update on public.tags
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- notes
-- =============================================================================
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Newest-first flat list per user (FR-005).
create index notes_user_id_created_at_idx on public.notes (user_id, created_at desc);

create trigger notes_set_updated_at
  before update on public.notes
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- note_tags (junction)
-- =============================================================================
create table public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

-- Single-tag filter lookups (FR-011) and RLS-scoped scans.
create index note_tags_tag_id_idx on public.note_tags (tag_id);
create index note_tags_user_id_idx on public.note_tags (user_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.tags enable row level security;
alter table public.notes enable row level security;
alter table public.note_tags enable row level security;

-- --- tags policies ---------------------------------------------------------
create policy tags_select_own on public.tags
  for select to authenticated
  using (auth.uid() = user_id);

create policy tags_insert_own on public.tags
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy tags_update_own on public.tags
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy tags_delete_own on public.tags
  for delete to authenticated
  using (auth.uid() = user_id);

-- --- notes policies --------------------------------------------------------
create policy notes_select_own on public.notes
  for select to authenticated
  using (auth.uid() = user_id);

create policy notes_insert_own on public.notes
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy notes_update_own on public.notes
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy notes_delete_own on public.notes
  for delete to authenticated
  using (auth.uid() = user_id);

-- --- note_tags policies ----------------------------------------------------
create policy note_tags_select_own on public.note_tags
  for select to authenticated
  using (auth.uid() = user_id);

create policy note_tags_insert_own on public.note_tags
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy note_tags_update_own on public.note_tags
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy note_tags_delete_own on public.note_tags
  for delete to authenticated
  using (auth.uid() = user_id);
