-- retire_web_batch_item_lifecycle_guard.sql
--
-- Retires web.enforce_batch_item_lifecycle() — a lifecycle ENFORCEMENT trigger
-- function attached to zero tables since 2026-07 — because the table it guards
-- was deliberately retired and has no successor that this body can run against.
-- SET SCHEMA retirement, not a DROP: the body survives in `graveyard` and one
-- ALTER brings it back.
--
-- ── THE HUNT (unfinished-work-alarm policy, step 1) ─────────────────────────
-- Born in migrations/web_marketing_integrity_contracts.sql (applied 2026-07-19),
-- which created it and attached it at line 574:
--     CREATE TRIGGER _enforce_batch_item_lifecycle
--       BEFORE UPDATE ON web.batch_item
--       FOR EACH ROW EXECUTE FUNCTION web.enforce_batch_item_lifecycle();
-- so its one and only target was web.batch_item.
--
-- web.batch_item and web.batch_job were then RETIRED ON PURPOSE. The header of
-- migrations/web_remove_retired_batch_cross_pointers.sql states it outright:
--   "web.batch_job and web.batch_item were retired after their execution role
--    moved to batch.*"
-- That migration surgically removed the batch_item branches from the sibling
-- guard web.validate_cross_pointers() and RAISEs if any reference survives — a
-- deliberate, verified teardown. It simply did not also detach/retire this one.
-- Live confirmation: no relation named batch_item exists in ANY schema
-- (including graveyard), and web.* holds no batch table at all.
--
-- ── CAN IT BE WIRED UP INSTEAD? No — there is nothing it can attach to ──────
-- The execution role moved to batch.work_item, which is a DIFFERENT ENTITY, not
-- a rename:
--   * this body reads NEW.site_id / batch_id / item_id / provider_id /
--     subject_type / subject_id — batch.work_item has NONE of those columns
--     (it is the LLM batch queue: provider, model, payload, result_handler,
--     lease_expires_at, …). Attaching it would raise on the first UPDATE.
--   * the status vocabularies do not overlap. This body enforces
--     queued→submitted→processing→complete|failed|cancelled; batch.work_item's
--     CHECK constraint work_item_status_valid allows
--     pending|claimed|submitted|completed|failed|dead_letter|abandoned.
-- So it is not a guard that lost its wiring; it is a guard whose subject was
-- removed. The web.* immutability contract it belonged to is still live and
-- intact on the tables that survived (_reject_immutable_fact_mutation on
-- web.snapshot / analysis_result / link_edge, _validate_cross_pointers on the
-- 11 remaining web tables).
--
-- ⚠️ SEPARATELY REPORTED, NOT FIXED HERE: batch.work_item constrains status
-- VALUES (CHECK) but has no transition guard, so an out-of-order status write is
-- possible there. That is a different table in a different domain with its own
-- claim/lease protocol in aidream — it needs its own transition map and its own
-- verification, and inventing one inside this retirement would be a guess.
-- Filed as a follow-up rather than smuggled in.
--
-- Idempotent. Safe to re-run.

do $retire$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'web' and p.proname = 'enforce_batch_item_lifecycle'
  ) then
    -- If a target reappeared since this was written, stop and re-verify.
    if exists (
      select 1 from pg_trigger t
      where t.tgfoid = 'web.enforce_batch_item_lifecycle()'::regprocedure
        and not t.tgisinternal
    ) then
      raise exception 'web.enforce_batch_item_lifecycle() is now attached to a table — it is live, do not retire it.';
    end if;

    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog','information_schema','graveyard')
        and p.prokind = 'f'
        and p.oid <> 'web.enforce_batch_item_lifecycle()'::regprocedure
        and p.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))
        and pg_get_functiondef(p.oid) ~* '\menforce_batch_item_lifecycle\M'
    ) then
      raise exception 'enforce_batch_item_lifecycle now has an in-DB dependent — re-verify before retiring.';
    end if;

    alter function web.enforce_batch_item_lifecycle() set schema graveyard;
    raise notice 'Retired web.enforce_batch_item_lifecycle() to graveyard.';
  else
    raise notice 'Nothing to retire — web.enforce_batch_item_lifecycle() already moved.';
  end if;
end $retire$;

insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
values (
  'web.enforce_batch_item_lifecycle()',
  'no successor — web.batch_item was retired; batch.work_item.work_item_status_valid CHECK governs the replacement queue',
  'graveyard.enforce_batch_item_lifecycle()',
  'BEFORE UPDATE lifecycle guard created in web_marketing_integrity_contracts.sql for web.batch_item only. web.batch_item + web.batch_job were deliberately retired when execution moved to batch.* (see web_remove_retired_batch_cross_pointers.sql, which tore down the sibling guard''s batch branches). No relation named batch_item exists in any schema. Cannot be re-attached: batch.work_item has none of the columns this body reads (site_id/batch_id/item_id/provider_id/subject_type/subject_id) and a disjoint status vocabulary. Zero attachments since 2026-07.'
)
on conflict (old_ref) do update
  set new_ref = excluded.new_ref, archived_as = excluded.archived_as, reason = excluded.reason;

-- Post-conditions.
do $assert$
declare v_web int; v_grave int; v_ledger int;
begin
  select count(*) into v_web from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'web' and p.proname = 'enforce_batch_item_lifecycle';
  if v_web <> 0 then
    raise exception 'enforce_batch_item_lifecycle still lives in web — retirement did not take.';
  end if;

  select count(*) into v_grave from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'graveyard' and p.proname = 'enforce_batch_item_lifecycle';
  if v_grave <> 1 then
    raise exception 'Expected 1 retired enforce_batch_item_lifecycle in graveyard, found % — the body was lost, not retired.', v_grave;
  end if;

  select count(*) into v_ledger from platform.deprecated_relations
  where old_ref = 'web.enforce_batch_item_lifecycle()';
  if v_ledger <> 1 then
    raise exception 'Retirement not ledgered in platform.deprecated_relations.';
  end if;

  -- The surviving web.* integrity contract must be untouched.
  if (select count(*) from pg_trigger t
      where t.tgfoid = 'web.validate_cross_pointers()'::regprocedure and not t.tgisinternal) = 0 then
    raise exception 'web.validate_cross_pointers lost every attachment — this migration must not have done that.';
  end if;
  if (select count(*) from pg_trigger t
      where t.tgfoid = 'web.reject_immutable_fact_mutation()'::regprocedure and not t.tgisinternal) < 3 then
    raise exception 'web.reject_immutable_fact_mutation lost attachments — expected >= 3 (snapshot, analysis_result, link_edge).';
  end if;
end $assert$;
