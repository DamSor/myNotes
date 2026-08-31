-- Migration: extend ai_content.kind CHECK to include 'weekly-failed'
-- Change: weekly-summary-cron (S-08)

alter table public.ai_content
  drop constraint ai_content_kind_check;

alter table public.ai_content
  add constraint ai_content_kind_check
  check (kind in ('digest', 'weekly', 'weekly-failed'));
