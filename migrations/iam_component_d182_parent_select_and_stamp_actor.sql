-- D182 remainder — component-RLS: parent-fk std_select + missing actor stamp.
--
-- Two independent, idempotent repairs. Both go through the CANONICAL generator /
-- canonical trigger function; no hand-written per-table policy anywhere.
--
-- PART A — 10 component tables whose std_select was still SELF-REFERENTIAL
--   (`id IN accessible_entity_ids(<its OWN token>)`, or `iam.has_access(<own token>, id)`).
--   These tables have NO `created_by` column, so the D181 owner arm cannot rescue them:
--   the only arm is a STABLE function that cannot see the tuple being inserted, so
--   `INSERT … RETURNING` fails 42501 and reads resolve nothing structural.
--   All 10 have a registered `composition` parent in platform.entity_relationships,
--   and iam.apply_rls already emits the correct parent-fk form (2026-08-13,
--   iam_component_select_structural_parent_rls.sql) — these 10 were simply never
--   re-generated. Re-running the generator is the whole fix.
--
--   This deliberately WIDENS the visible row set from "effectively nobody" to
--   "the parents you can actually view" — which is what rls_variant='component'
--   is defined to mean. Same direction, same rationale as the 2026-08-13 repair;
--   see common-docs/systems/db-rules/FEATURE.md §6d. Not a leak: all 10 are
--   SELECT-only or no-grant for `authenticated`, none has an anon policy, and
--   iam.permissions holds no direct grants on any of these tokens.
--
-- PART B — 2 component tables that carry BOTH created_by and updated_by but had no
--   trigger running platform._stamp_actor(), so created_by/updated_by were never
--   stamped and an authed insert had to send created_by by hand.
--
--   ⚠️ DO NOT extend Part B to the other 22 component tables that have created_by
--   but NO updated_by column. platform._stamp_actor() assigns NEW.updated_by
--   UNCONDITIONALLY, so attaching it to a table without that column raises
--   42703 `record "new" has no field "updated_by"` on EVERY insert and update —
--   which would break the service_role pipelines that are those tables' only
--   writers today. Verified empirically 2026-08-14. Those tables need the
--   base-contract column retrofit (add updated_by) FIRST; tracked in D182.

begin;

-- ---------------------------------------------------------------- PART A
do $$
declare
  targets text[][] := array[
    array['runtime','global_execution','global_execution'],
    array['runtime','work_item','work_item'],
    array['seo','ai_visibility_citation','seo_ai_visibility_citation'],
    array['seo','ai_visibility_claim','seo_ai_visibility_claim'],
    array['seo','ai_visibility_signal','seo_ai_visibility_signal'],
    array['seo','page_measurement_health','seo_page_measurement_health'],
    array['seo','provider_call','seo_provider_call'],
    array['seo','provider_task','seo_provider_task'],
    array['seo','raw_payload','seo_raw_payload'],
    array['seo','serp_result','seo_serp_result']
  ];
  i int;
begin
  for i in 1 .. array_length(targets, 1) loop
    -- Guard: only regenerate a token that is still an ACTIVE component with a
    -- registered composition parent. Never invent a policy for an unparented child.
    if exists (
      select 1
      from platform.entity_types et
      join platform.entity_relationships er
        on er.child_type = et.token and er.kind = 'composition'
      where et.token = targets[i][3]
        and et.is_active
        and et.rls_variant = 'component'
        and et.schema_name = targets[i][1]
        and et.table_name  = targets[i][2]
    ) then
      perform iam.apply_rls(targets[i][1], targets[i][2], targets[i][3], 'component');
      raise notice 'D182/A regenerated component RLS: %.% (%)',
        targets[i][1], targets[i][2], targets[i][3];
    else
      raise warning 'D182/A SKIPPED %.% (%) — not an active component with a composition parent',
        targets[i][1], targets[i][2], targets[i][3];
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- PART B
do $$
declare
  targets text[][] := array[
    array['seo','gsc_dig_rule'],
    array['seo','keyword_class_rule']
  ];
  i int;
  rel regclass;
begin
  for i in 1 .. array_length(targets, 1) loop
    rel := format('%I.%I', targets[i][1], targets[i][2])::regclass;

    -- Hard guard: platform._stamp_actor() writes NEW.updated_by unconditionally.
    -- Refuse to attach it to a table lacking that column (see header warning).
    if not exists (
      select 1 from information_schema.columns
      where table_schema = targets[i][1] and table_name = targets[i][2]
        and column_name = 'updated_by'
    ) then
      raise exception 'D182/B REFUSED %.% — no updated_by column; _stamp_actor would break every write',
        targets[i][1], targets[i][2];
    end if;

    -- Idempotent by FUNCTION, not by trigger name: several tables already run
    -- platform._stamp_actor() under a bespoke trigger name (trg_stamp_actor,
    -- <table>_stamp_actor). Matching on name alone would create a duplicate.
    if exists (
      select 1 from pg_trigger g
      where g.tgrelid = rel and not g.tgisinternal
        and g.tgfoid = 'platform._stamp_actor'::regproc
    ) then
      raise notice 'D182/B %.% already runs platform._stamp_actor — skipped',
        targets[i][1], targets[i][2];
    else
      execute format(
        'create trigger _stamp_actor before insert or update on %I.%I
           for each row execute function platform._stamp_actor()',
        targets[i][1], targets[i][2]);
      raise notice 'D182/B attached _stamp_actor to %.%', targets[i][1], targets[i][2];
    end if;
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
