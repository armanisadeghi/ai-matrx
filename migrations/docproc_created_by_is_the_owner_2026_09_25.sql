-- docproc: created_by IS the owner — every row, and every row from now on.
--
-- THE INCIDENT (2026-09-25 20:43-20:45Z): 392 statement timeouts on
-- PATCH /rest/v1/processed_documents (a one-row `name` update), 8-17.6 s each.
--
-- WHY A ONE-ROW UPDATE COST SECONDS. The generated policies on both docproc
-- tables open with the owner shortcut `created_by = auth.uid()`. Measured live:
-- created_by is NULL on 473 of 473 processed_documents and 194 of 194
-- page_extraction_jobs — aidream writes both through the service role, where
-- platform._stamp_actor has no auth.uid() to stamp, and sets only owner_id. So
-- the shortcut never fires for anyone, and every read or write falls through to
-- std_select's set lane: iam.accessible_entity_ids(...) (~450 ms, every visible
-- doc) UNION platform.reachability with iam.has_access per container row
-- (~450 ms), evaluated once for the UPDATE's own visibility and once more for
-- its RETURNING — about 2.0 s per rename on an idle clone, 8-17 s on production
-- under a 366-request burst. iam.has_access_for_base (redefined 20:38Z) is NOT
-- the cause: the rename measures 1.97-2.04 s with the pre-20:38 body and
-- 1.99-2.04 s with the current one (clone, rolled back).
--
-- THE FIX. owner_id is the owner these tables have always named (0 rows where a
-- non-null created_by disagrees with it). Backfill created_by from owner_id,
-- and stamp it on every future insert BEFORE platform._stamp_actor runs (BEFORE
-- triggers fire in name order; `_0_` sorts first). Measured on the clone: the
-- same rename 1966-2095 ms -> 174-283 ms (client round trip included).
--
-- updated_at is preserved: the backfill is not an edit anyone made, so the
-- updated_at triggers are held for the one UPDATE (SHARE ROW EXCLUSIVE, tables
-- of 473 and 194 rows). _guard_governance does not fire outside the
-- `authenticated` role, and no other UPDATE trigger watches created_by.
-- Proof: scripts/campaign-tests/docproc_created_by_is_the_owner_green.sql
-- (RED before this file, GREEN after).

create or replace function docproc._created_by_is_the_owner()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
-- The owner shortcut in the generated policies keys on created_by. A writer that
-- names owner_id and not created_by (aidream's service-role inserts) would leave
-- it NULL and send every later read and write of the row down the slow set lane.
begin
  new.created_by := coalesce(new.created_by, new.owner_id);
  return new;
end
$function$;
revoke all on function docproc._created_by_is_the_owner() from public, anon, authenticated;

drop trigger if exists _0_created_by_is_the_owner on docproc.processed_documents;
create trigger _0_created_by_is_the_owner
  before insert on docproc.processed_documents
  for each row execute function docproc._created_by_is_the_owner();

drop trigger if exists _0_created_by_is_the_owner on docproc.page_extraction_jobs;
create trigger _0_created_by_is_the_owner
  before insert on docproc.page_extraction_jobs
  for each row execute function docproc._created_by_is_the_owner();

alter table docproc.processed_documents disable trigger trg_processed_documents_updated_at;
update docproc.processed_documents
   set created_by = owner_id
 where created_by is null and owner_id is not null;
alter table docproc.processed_documents enable trigger trg_processed_documents_updated_at;

alter table docproc.page_extraction_jobs disable trigger trg_page_extraction_jobs_updated_at;
update docproc.page_extraction_jobs
   set created_by = owner_id
 where created_by is null and owner_id is not null;
alter table docproc.page_extraction_jobs enable trigger trg_page_extraction_jobs_updated_at;
