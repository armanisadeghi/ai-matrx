-- chair-step: drops ONE unique index, workbench.note_folders_created_by_name_unique (created_by, name). It ignores the organization, so a person can own only one folder called "Draft" across all their organizations, which makes the "+" on /notes impossible in every organization but one. The organization-qualified key that replaces it has been live since 2026-09-12 and the browser now writes through workbench.note_folder_get_or_create, which uses it. No row changes.
--
-- chair_step_2026_09_18a_note_folders_org_blind_name_key
--
-- This is the "folder-key cutover" the 2026-09-12 Notes work deferred. It is a DROP, so it is a
-- chair step (migrations/JUDGMENT.md §4b, §5). Apply AFTER
-- note_folder_get_or_create_per_organization.sql; the proof below refuses otherwise. (That file's
-- comments and the function's HINT name this step without the `a` — it was renumbered to a sub-step
-- after that file was applied, and applied bytes are frozen. The branch that prints the hint is
-- unreachable once this step has run.)
--
-- CENSUS OF WRITERS, 2026-09-18 (who could depend on the dropped key as an ON CONFLICT arbiter):
--   matrx-frontend  features/notes/service/notesService.ts createFolder — moved to the function.
--   aidream         db/managers/workbench/note_folders.py — generic ORM manager, no upsert.
--   matrx-local     app/services/documents/supabase_client.py — reads by created_by, plain insert.
-- Nothing else names `created_by,name` as a conflict target.

drop index if exists workbench.note_folders_created_by_name_unique;

do $proof$
declare v_pred text;
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'workbench' and c.relname = 'note_folders_created_by_name_unique') then
    raise exception 'chair_step: the org-blind name key is still present';
  end if;
  select pg_get_expr(ix.indpred, ix.indrelid) into v_pred
    from pg_index ix join pg_class c on c.oid = ix.indexrelid
   where c.relname = 'note_folders_organization_created_by_name_unique'
     and ix.indrelid = 'workbench.note_folders'::regclass and ix.indisunique and ix.indisvalid;
  if v_pred is null then
    raise exception 'chair_step: the organization-qualified partial name key is absent — refusing to leave note_folders with NO name key';
  end if;
  if to_regprocedure('workbench.note_folder_get_or_create(uuid, text)') is null then
    raise exception 'chair_step: workbench.note_folder_get_or_create is absent — apply note_folder_get_or_create_per_organization.sql first';
  end if;
end
$proof$;
