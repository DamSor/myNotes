-- Migration: ai_content table for AI-generated digests and weekly summaries
-- Slice S-02 (context/changes/first-ai-digest-on-click). Progressive disclosure
-- from F-01 — this table was intentionally not created in the schema foundation.
--
-- Ownership model: user_id references auth.users(id); RLS isolates rows per user
-- (same pattern as notes/tags). source_tag_id is nullable (weekly summaries span
-- all tags). kind uses a CHECK constraint (not an enum) for easier future extension.

-- =============================================================================
-- ai_content
-- =============================================================================
create table public.ai_content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_tag_id uuid references public.tags (id) on delete set null,
  kind text not null check (kind in ('digest', 'weekly')),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Newest-first listing per user (GET /api/digests).
create index ai_content_user_id_created_at_idx
  on public.ai_content (user_id, created_at desc);

-- "Last digest for this tag" lookup (windowing in generateDigest).
create index ai_content_user_tag_kind_created_idx
  on public.ai_content (user_id, source_tag_id, kind, created_at desc);

create trigger ai_content_set_updated_at
  before update on public.ai_content
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.ai_content enable row level security;

create policy ai_content_select_own on public.ai_content
  for select to authenticated
  using (auth.uid() = user_id);

create policy ai_content_insert_own on public.ai_content
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy ai_content_update_own on public.ai_content
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy ai_content_delete_own on public.ai_content
  for delete to authenticated
  using (auth.uid() = user_id);
