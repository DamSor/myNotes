-- Migration: enforce note_tags ownership via composite foreign keys
-- Follow-up to 20260819205610_notes_tags_note_tags_schema_rls.sql (F1 from impl review).
--
-- Problem: note_tags.user_id was only FK'd to auth.users(id); note_id/tag_id were FK'd
-- to their parents by id alone. Nothing forced a link's owner to match the owner of the
-- referenced note/tag, so an authenticated user could link a note_id/tag_id they do not
-- own (given the UUID) while passing the auth.uid() = user_id insert policy.
--
-- Fix: make (id, user_id) a unique target on each parent, then tie note_tags to BOTH
-- parents by (child_id, user_id) so a link can only exist between rows the same user owns.

-- Composite unique targets on the parents (id is already PK; this adds the FK target).
alter table public.notes add constraint notes_id_user_id_key unique (id, user_id);
alter table public.tags add constraint tags_id_user_id_key unique (id, user_id);

-- Replace the single-column FKs with owner-scoped composite FKs.
alter table public.note_tags drop constraint note_tags_note_id_fkey;
alter table public.note_tags drop constraint note_tags_tag_id_fkey;

alter table public.note_tags
  add constraint note_tags_note_id_user_id_fkey
  foreign key (note_id, user_id) references public.notes (id, user_id) on delete cascade;

alter table public.note_tags
  add constraint note_tags_tag_id_user_id_fkey
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade;
