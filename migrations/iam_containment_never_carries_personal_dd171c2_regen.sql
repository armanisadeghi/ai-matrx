-- iam_containment_never_carries_personal_dd171c2_regen — THE REGENERATION, PART 2 OF 4 (DD-171).
--
-- dd171b moved the kernel (`iam.has_access_for_base`, `iam.accessible_entity_ids`) and the mirror
-- (`iam.entity_read_expr`). The kernel half is live the moment that file commits; the MIRROR half
-- only reaches a table when `iam.apply_rls` re-emits its std_select. This file does that, for the
-- exact set `iam.verify_canonical`'s new `containment_respects_personal` check reports RED:
--
--   20 tokens carry a typed `platform.visibility` column AND a composition/containment parent whose
--   FK column exists on the table — agent, app, file, folder, growth_loop_run, hr_posting,
--   marketing_initiative, plan_entity, plan_node, project, seo_collection_run, seo_gsc_dig_rule,
--   seo_keyword_class_rule, seo_keyword_market, seo_rank_target, seo_starter_pack_item, skill,
--   skill_render_definition, task, web_site.
--
-- 🚨 THE SET IS DERIVED FROM THE CHECK, NOT TYPED IN. A hand-typed list is a list that silently
-- stops matching the machinery; this loop asks `containment_respects_personal` which tokens are open
-- and regenerates exactly those. It is therefore idempotent by construction: a second run finds
-- nothing RED and regenerates nothing.
--
-- 🚨 WHY THIS IS FOUR FILES OF FIVE AND NOT ONE FILE OF TWENTY, HONESTLY. It was one file. It lost
-- `40P01 deadlock detected` on `seo.collection_run` TWICE in a row against live traffic, rolled back
-- both times and never reached the ledger — the same failure DD-165's batch 3 hit on
-- `runtime.operation_stream`. `pnpm db:apply` wraps a file in ONE transaction, so every ACCESS
-- EXCLUSIVE is held until commit, and the answer `ddl_lock_timeout_guard` prints on every run is
-- "commit per table — this bounds waiting, never holding". Five tables per transaction is that
-- answer taken as far as this set needs. A partial application is therefore possible; it is
-- acceptable only because every table is individually correct in EITHER state (arm unwalled as
-- before, or walled as intended) and because dd171d asks the DATABASE for the end state and refuses
-- to pass on a token still open.
--
-- Each part takes the FIRST FIVE tokens still RED, so the parts are order-independent and every one
-- of them is idempotent: re-run any part after a lost race.
--
-- COORDINATION (2026-09-12): B-54 is regenerating DD-159's unregistered-token wave concurrently.
-- Checked before writing this file — all 20 tokens here are long-generated (7 policies each,
-- std_select present), none is in DD-159's registered-but-never-generated population, so the two
-- batches touch disjoint tables.
set local lock_timeout = '30s';

do $$
declare
  r record; v_ok int := 0; v_refused int := 0; v_seen int := 0;
begin
  for r in
    select distinct et.schema_name, et.table_name, et.token, et.rls_variant
      from platform.entity_types et
      cross join lateral iam.verify_canonical(et.schema_name, et.table_name, et.token, et.rls_variant) v
     where et.is_active
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and v.check_name = 'containment_respects_personal' and v.status = 'FAIL'
     order by et.schema_name, et.table_name
     limit 5
  loop
    v_seen := v_seen + 1;
    begin
      perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
      v_ok := v_ok + 1;
    exception when others then
      -- The same closed set of STRUCTURAL refusals DD-165's batches tolerate — each a token
      -- `iam.apply_rls` cannot generate by construction. Anything else aborts, naming the table.
      if sqlstate in ('P0001','42703','42883')
         and (sqlerrm like '%access machinery%'
              or sqlerrm like '%column "id" does not exist%'
              or sqlerrm like '%operator does not exist%'
              or sqlerrm like '%not an active registered entity%'
              or sqlerrm like '%has no composition parent%') then
        v_refused := v_refused + 1;
        raise notice 'dd171c2: % (%.%) keeps its bespoke policy — %',
          r.token, r.schema_name, r.table_name, sqlerrm;
      else
        raise exception 'dd171c2: % (%.%) failed with %: %. That is not a structural refusal, so this '
          'file refuses to commit a partial regeneration. A 55P03 or 40P01 here is a lost race — '
          're-run this file; it is idempotent.', r.token, r.schema_name, r.table_name, sqlstate, sqlerrm;
      end if;
    end;
  end loop;

  if v_seen = 0 then
    raise notice 'dd171c2: nothing was RED — every containment arm is already walled';
  else
    raise notice 'dd171c2: % token(s) were RED; regenerated %, structurally refused %',
      v_seen, v_ok, v_refused;
  end if;
end $$;
