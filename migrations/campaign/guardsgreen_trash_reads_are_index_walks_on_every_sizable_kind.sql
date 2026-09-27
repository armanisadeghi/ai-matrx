-- chair-step: lane GUARDS-GREEN — adds six partial Trash indexes (archived rows only). Its only DROPs are 'drop index concurrently if exists' of these same six names, so a rerun rebuilds an INVALID leftover of a cancelled build instead of skipping it; no data is touched.
-- lane GUARDS-GREEN — every sizable Trash kind is read by a bounded index walk, not a filter over its live rows.
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.
--
-- VERIFIER-27: `org_trash_list` merged page (AI Matrx) answered in 975.7 ms against its 300 ms ceiling.
-- The merged page is every kind's read in one call (public._trash_kind_rows loops ~98 kinds), so it
-- costs the SUM of the kinds. Profiled on production 2026-09-27 (read-only, admin@admin.com, AI Matrx):
-- conversation 54 ms, processed_document 30, folder 26, file 22, the rest under 18. files.files has
-- carried trash indexes since TRASH-2; the three other tables over 4 MB had none, so each branch
-- walked the organization's (or the owner's) LIVE rows to find the archived ones — chat.conversation:
-- 4,424 + 2,917 rows filtered, 2,787 buffers for 50 answers; cold, that is the 975 ms. The class is
-- "a Trash kind of real size with no trash index"; these are that class, with the files.files pattern:
--   · (organization_id, deleted_at desc, id) where deleted_at is not null and visibility is distinct
--     from 'personal' — Organization Trash's shared branch;
--   · (created_by, deleted_at desc, id) where deleted_at is not null — personal Trash and
--     Organization Trash's own-personal branch.
-- Partial on archived rows only, so live writes never touch them. Every other Trash kind's table is
-- under 5 MB (a scan of it is a few pages).
--
-- INVERSE: migrations/inverse/guardsgreen_trash_reads_are_index_walks_on_every_sizable_kind_down.sql
-- lane: GUARDS-GREEN
--
-- RE-RUNNABLE WITHOUT A SILENT INVALID INDEX. A CONCURRENTLY build cancelled by lock_timeout leaves
-- an INVALID index behind, and `create index concurrently if not exists` then skips it and reports
-- ok (measured on the clone 2026-09-27: three invalid indexes after an "ok" rerun). So each index is
-- dropped (concurrently, if it exists) and built again, and the last statement refuses the file
-- unless all six are valid.

drop index concurrently if exists chat.conversation_trash_org_shared_deleted_idx;
create index concurrently conversation_trash_org_shared_deleted_idx
  on chat.conversation (organization_id, deleted_at desc, id)
  where deleted_at is not null and visibility is distinct from 'personal'::platform.visibility;

drop index concurrently if exists chat.conversation_trash_owner_deleted_idx;
create index concurrently conversation_trash_owner_deleted_idx
  on chat.conversation (created_by, deleted_at desc, id) where deleted_at is not null;

drop index concurrently if exists files.folders_trash_org_shared_deleted_idx;
create index concurrently folders_trash_org_shared_deleted_idx
  on files.folders (organization_id, deleted_at desc, id)
  where deleted_at is not null and visibility is distinct from 'personal'::platform.visibility;

drop index concurrently if exists files.folders_trash_owner_deleted_idx;
create index concurrently folders_trash_owner_deleted_idx
  on files.folders (created_by, deleted_at desc, id) where deleted_at is not null;

drop index concurrently if exists docproc.processed_documents_trash_org_shared_deleted_idx;
create index concurrently processed_documents_trash_org_shared_deleted_idx
  on docproc.processed_documents (organization_id, deleted_at desc, id)
  where deleted_at is not null and visibility is distinct from 'personal'::platform.visibility;

drop index concurrently if exists docproc.processed_documents_trash_owner_deleted_idx;
create index concurrently processed_documents_trash_owner_deleted_idx
  on docproc.processed_documents (created_by, deleted_at desc, id) where deleted_at is not null;

do $check$
declare v_bad text;
begin
  select string_agg(w.n, ', ') into v_bad
    from (values ('conversation_trash_org_shared_deleted_idx'), ('conversation_trash_owner_deleted_idx'),
                 ('folders_trash_org_shared_deleted_idx'), ('folders_trash_owner_deleted_idx'),
                 ('processed_documents_trash_org_shared_deleted_idx'), ('processed_documents_trash_owner_deleted_idx')) w(n)
    left join pg_class c on c.relname = w.n and c.relkind = 'i'
    left join pg_index i on i.indexrelid = c.oid
   where i.indisvalid is not true;
  if v_bad is not null then
    raise exception 'guardsgreen trash indexes not valid: % — re-run the file', v_bad;
  end if;
end
$check$;
