-- chair-step: drops ONE unique index and rebuilds one as partial. It drops workbench.note_folders_created_by_name_unique (created_by, name). It ignores the organization, so a person can own only one folder called "Draft" across all their organizations, which makes the "+" on /notes impossible in every organization but one. The organization-qualified key that replaces it has been live since 2026-09-12 and the browser now writes through workbench.note_folder_get_or_create, which uses it. It also rebuilds the organization-qualified key with `where deleted_at is null`, because the live one is a full index again and a removed folder must stop holding its name. No row changes.
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
--   matrx-local     app/services/documents/supabase_client.py — reads by created_by, plain insert,
--                   and SOFT-deletes folders (why the organization key must be partial).
--   matrx-frontend  features/files/virtual-sources/adapters/notes.ts — moved to createFolder.
-- Nothing names `created_by,name` as a conflict target. READERS that assume a name is unique per
-- person (the /files Notes source listing; aidream's notes_adapter `filter(created_by, name).limit(1)`)
-- are tracked in common-docs policies/organization-is-the-container.md § Applying it.

drop index if exists workbench.note_folders_created_by_name_unique;

-- THE ORGANIZATION KEY IS MADE PARTIAL HERE, AGAIN. The morning chair step
-- (chair_step_2026_09_18_db_guard_findings_non_additive.sql, 15:22Z) rebuilt it `where deleted_at is
-- null` and its proof passed — yet at 19:30Z the live index was a FULL index again, with no ledgered
-- file in between that names it (found by the independent review of this fix; cause unknown, filed
-- in features/notes/FEATURE.md). A full key lets a soft-deleted folder hold its name for ever:
-- matrx-local soft-deletes folders, and the get-or-create would then answer
-- `notes_folder_not_visible` on every "+" in that organization. 55 rows; the rebuild is milliseconds.
drop index if exists workbench.note_folders_organization_created_by_name_unique;
create unique index note_folders_organization_created_by_name_unique
  on workbench.note_folders (organization_id, created_by, name)
  where deleted_at is null;

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
  if coalesce(v_pred, '') not ilike '%deleted_at is null%' then
    raise exception 'chair_step: the organization-qualified name key is absent or not partial on deleted_at (predicate: %) — refusing to leave note_folders without it', v_pred;
  end if;
  if to_regprocedure('workbench.note_folder_get_or_create(uuid, text)') is null then
    raise exception 'chair_step: workbench.note_folder_get_or_create is absent — apply note_folder_get_or_create_per_organization.sql first';
  end if;
end
$proof$;
