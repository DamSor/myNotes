-- Migration: RLS hardening follow-up (F2 from impl review)
-- Follow-up to 20260819205610_notes_tags_note_tags_schema_rls.sql.
--
-- Recreate all 12 per-operation policies using (select auth.uid()) instead of a bare
-- auth.uid(). Postgres evaluates the subquery once per statement (initplan) rather than
-- per row, matching Supabase's auth_rls_initplan advisor. Behaviour is identical; this
-- sets the convention for every future policy in this project.
--
-- Also pins set_updated_at()'s search_path (F3, function_search_path_mutable advisor).

-- Pin search_path so the trigger function cannot be hijacked via a mutable path
-- (pg_catalog is still implicitly resolved, so now() continues to work).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --- tags policies ---------------------------------------------------------
drop policy tags_select_own on public.tags;
create policy tags_select_own on public.tags
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy tags_insert_own on public.tags;
create policy tags_insert_own on public.tags
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy tags_update_own on public.tags;
create policy tags_update_own on public.tags
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy tags_delete_own on public.tags;
create policy tags_delete_own on public.tags
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- --- notes policies --------------------------------------------------------
drop policy notes_select_own on public.notes;
create policy notes_select_own on public.notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy notes_insert_own on public.notes;
create policy notes_insert_own on public.notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy notes_update_own on public.notes;
create policy notes_update_own on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy notes_delete_own on public.notes;
create policy notes_delete_own on public.notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- --- note_tags policies ----------------------------------------------------
drop policy note_tags_select_own on public.note_tags;
create policy note_tags_select_own on public.note_tags
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy note_tags_insert_own on public.note_tags;
create policy note_tags_insert_own on public.note_tags
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy note_tags_update_own on public.note_tags;
create policy note_tags_update_own on public.note_tags
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy note_tags_delete_own on public.note_tags;
create policy note_tags_delete_own on public.note_tags
  for delete to authenticated
  using ((select auth.uid()) = user_id);
