-- Migration: add deleted_at to ai_content for soft-delete tracking
-- Slice S-06 (context/changes/edit-or-delete-digest). Soft-deleted rows stay in
-- the table (queryable for the 70% acceptance metric) and are filtered out in
-- application list queries. No RLS changes — existing select/update policies
-- do not reference deleted_at, so owning users can still read rejected rows
-- for future metric aggregation. No new index — MVP list queries are already
-- scoped by user_id + created_at.

alter table public.ai_content
  add column deleted_at timestamptz null default null;
