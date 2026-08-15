-- attach_updated_at_maintainers_to_unmaintained_tables.sql
--
-- Attaches the canonical `platform._touch_row()` BEFORE INSERT OR UPDATE trigger
-- to the SIX tables (of 36 scanned) whose `updated_at` column has NO database
-- maintainer AND no application write path that stamps it.
--
-- Follow-up to migrations/retire_orphan_updated_at_trigger_helpers.sql, whose
-- header filed this as separately-reported work: "35 OTHER non-graveyard tables
-- that have an updated_at column and NO database-level maintainer at all …
-- needs per-table checking of whether the application stamps updated_at itself."
-- Re-scanned live 2026-08-14; the population is now 36 (billing.org_plan joined
-- it since that note was written).
--
-- ⚠️ THIS IS NOT A BLANKET SWEEP. Each of the 36 was traced to its actual
-- writer — a Postgres function body, an aidream service, or a frontend service —
-- and 30 of them were left ALONE because they are already correct or because a
-- trigger would be actively wrong. The per-table verdicts are recorded below so
-- the next agent does not have to redo the trace.
--
-- ── WHY platform._touch_row() ───────────────────────────────────────────────
--     BEGIN
--       IF to_jsonb(NEW) ? 'updated_at' THEN NEW.updated_at := now(); END IF;
--       IF TG_OP='UPDATE' AND to_jsonb(NEW) ? 'version' THEN version := OLD+1; END IF;
--     END
-- It is what platform.create_entity_table() installs, and it is column-aware, so
-- it is safe on any shape. The `version` half is exactly why this migration is
-- NOT a blanket sweep — see the "version squatters" section.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ATTACHING (6) — nothing anywhere sets updated_at
-- ═══════════════════════════════════════════════════════════════════════════
--
--  1. content_ir.admission_config   (1 row, no created_at, no version)
--       Singleton flag row (`enforce`) created by aidream
--       db/migrations/wf_016_content_ir_admission_gate.sql. It is flipped BY HAND
--       as an operational action — .matrx/ARMAN_TASKS.md: "flip
--       MATRX_KINDS_ENFORCE_* + content_ir.admission_config in order …". A hand
--       UPDATE stamps nothing, so `updated_at` — the only record of WHEN
--       admission enforcement was turned on — never moves. Every one of its
--       seven content_ir siblings carries _touch_row.
--
--  2. users.user_secret_grants      (0 rows, no version)  ← THE REAL CODE GAP
--       matrx-orm secrets_battery writes this table at
--       packages/matrx-orm/matrx_orm/secrets_battery/items.py:1208 (set_item_grant)
--       and :1272 (update_item_grant). BOTH call `UserSecretGrant.update_where(...)`
--       with can_use / can_manage / granted_by and NO updated_at — verified by
--       reading both call sites. Its three Credential Vault siblings all carry
--       public.set_updated_at (users.credential_items, users.user_secrets,
--       users.credential_attachments), and the sibling MODULE stamps explicitly
--       (attachments.py:221 `{"updated_by": …, "updated_at": datetime.now(UTC)}`).
--       Changing a teammate's capability on a shared credential therefore leaves
--       the grant reading as never-modified. The trigger is the fix rather than
--       two more hand-stamps, so the third call site cannot forget.
--
--  3. ui.ui_surface_write_target    (382 rows, 32 drifted, no version)
--  4. ui.ui_surface_client_tool     (5 rows, 3 drifted, no version)
--       Written ONLY by hand-authored surface-sync migrations
--       (migrations/surface_sync_batch3_20260812.sql:171/177 etc.), whose
--       ON CONFLICT clauses happen to end `updated_at = now()`. That is a
--       per-batch author habit, not a guarantee — the drift counts show the
--       majority of rows have never been touched since insert. Every other
--       member of the ui_surface family HAS a maintainer: ui_surface_value →
--       tg_ui_surface_value_touch_updated_at, ui_surface_agent_role →
--       ui_surface_config_touch, ui_surface_config → _touch_row, ui_surface and
--       ui_client → set_updated_at. These two are the family's omission.
--
--  5. research.research_intent      (17 rows, 0 drifted, no version)
--       The fixed intent catalog seeded by aidream
--       db/migrations/0267_research_intent_catalog.sql, which ends
--       `on conflict (key) do nothing` — so a future revision migration (the
--       primary_objective / special_rules text IS prompt copy and WILL be tuned)
--       has no updated_at path at all. Read-only in the frontend
--       (features/research/service.ts:1435). All twelve research.rs_* siblings
--       plus youtube_search / youtube_video carry _touch_row.
--
--  6. workbench.udt_dataset_template_fields   (0 rows, no version)
--       No UPDATE path exists anywhere today — public.scope_system_apply only
--       INSERTs it, and guard_used_template_fields blocks any mutation once the
--       template is instantiated. But field edits BEFORE instantiation are
--       legitimate and unbuilt, and every udt_* sibling carries _touch_row.
--       Free to attach now; a defect to discover later.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NOT ATTACHING — a trigger would CORRUPT a value (version squatters)
-- ═══════════════════════════════════════════════════════════════════════════
-- The doctrine's §8d preflight ("type-check the reserved names") applies to
-- `version` too: _touch_row increments it on UPDATE, so a table whose `version`
-- means something else, or whose writer already increments it, must be left alone.
--
--  • platform.edge_payload_kind — `version` is the AUTHOR-DECLARED payload-schema
--      version, not a row counter. Live proof: `surface_binding` sits at 2 while
--      the other five sit at 1, and every seed writes `version = excluded.version`
--      (migrations/edge_payload_system_v1.sql:171, crm_02_core.sql:537,
--      plan_registry_seeds.sql:68) alongside `updated_at = now()`. A trigger
--      would silently bump a declared contract version on every edit.
--  • billing.org_plan — billing.org_plan_set already does
--      `updated_at = now(), version = p.version + 1`. A trigger would DOUBLE-
--      increment on every plan change.
--  • iam.org_member_controls — public.org_admin_set_member_controls already does
--      `updated_at = now(), version = iam.org_member_controls.version + 1`. Same
--      double-increment hazard.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NOT ATTACHING — the writer already stamps updated_at (verified, per table)
-- ═══════════════════════════════════════════════════════════════════════════
--  billing.class_purchase / connect_account  features/entitlements/stripe/connect.ts
--                                            :116 / :218 / :271 (+ upsert bodies)
--  billing.subscription                      features/entitlements/stripe/sync.ts:163/185
--  billing.capability / billing.product      no runtime writer at all; read-only in
--                                            EntitlementsTableClient.tsx and
--                                            loadEducationPricing.ts. Seeded by
--                                            migration (billing_org_tier_authority.sql:391
--                                            stamps on its do-update). The whole
--                                            billing schema is deliberately
--                                            trigger-free — all 11 tables, zero
--                                            triggers — because the Stripe mirror
--                                            stamps app-side.
--  iam.canonical_sweep                       iam.sweep_claim / iam.sweep_record
--  education.guardian_link                   public.guardian_grant / _request_student /
--                                            _respond / _unlink / _confirm_verification
--                                            (all five stamp)
--  education.study_streak                    education.bump_study_streak (all three
--                                            UPDATE branches) + public.set_streak_rest_weekdays
--  files.webhook_dispatch_state              files.webhook_dispatch
--  research.youtube_quota_day                research.youtube_quota_spend
--  platform.user_entity_state                public.ues_set / public.ues_touch
--  workspace.task_user_state                 features/tasks/services/taskUserStateService.ts:58
--                                            (the ONE writer, an upsert)
--  users.integration_connections             aidream/services/google_integrations/service.py
--  users.integration_connection_resources    :641/:682/:720/:796/:802/:841/:870
--  workbench.udt_dataset_templates           public.scope_system_apply (both UPDATE
--                                            branches stamp). Its `version` column is
--                                            an unread base-entity leftover — left
--                                            alone rather than started up.
--  seo.ai_visibility_citation                aidream/services/seo/ai_visibility.py
--  seo.ai_visibility_response                :441/:462/:514/:539/:569/:729/:745/:1088
--  seo.backlink                              packages/matrx-seo/backlink_enrichment.py
--  seo.referring_domain_profile              aidream/services/seo/backlink_enrichment.py:307
--  seo.collection_run                        packages/matrx-seo/orm_repository.py — and
--                                            NOTE: updated_at is a LEASE HEARTBEAT there
--                                            (`updated_at__lt now - RUN_LEASE_SECONDS`
--                                            reclaims a dead run, :383 / :1476). Do not
--                                            add a trigger without re-reading that.
--  seo.competitor / competitor_opportunity   aidream/services/seo/competitor_autopsy.py
--  seo.page_measurement_health               aidream/services/seo/pagespeed_health.py
--  seo.rank_target                           aidream/services/seo/rank_tracking.py
--  seo.reputation_case                       aidream/services/seo/reputation_intelligence.py:942
--       All ten seo.* tables additionally belong to the matrx-seo PACKAGE, which
--       must run standalone with no `platform` schema present (root CLAUDE.md §
--       PACKAGE / IMPLEMENTATION SEPARATION). Stamping in package code is the
--       correct design there, not an omission.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NOT ATTACHING — not a data table
-- ═══════════════════════════════════════════════════════════════════════════
--  platform._base_entity   the canonical COLUMN TEMPLATE (0 rows, referenced by
--                          matrx_orm/entity.py:49 and platform.create_entity_table).
--                          Nothing ever writes a row into it.
--  platform._bak_assoc_type_file_processed_document_20260812
--                          a dated backup snapshot. Backups are frozen on purpose.
--
-- Idempotent. Safe to re-run. Ends in assertions that RAISE on a false post-condition.

do $attach$
declare
  v_targets constant text[][] := array[
    array['content_ir','admission_config'],
    array['users','user_secret_grants'],
    array['ui','ui_surface_write_target'],
    array['ui','ui_surface_client_tool'],
    array['research','research_intent'],
    array['workbench','udt_dataset_template_fields']
  ];
  v_schema text;
  v_table  text;
  v_oid    oid;
  v_added  text[] := '{}';
  i int;
begin
  for i in 1 .. array_length(v_targets, 1) loop
    v_schema := v_targets[i][1];
    v_table  := v_targets[i][2];

    select c.oid into v_oid
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = v_schema and c.relname = v_table and c.relkind = 'r';

    if v_oid is null then
      raise exception 'attach_updated_at_maintainers: %.% does not exist — re-verify before re-running.',
        v_schema, v_table;
    end if;

    -- The table must actually have the column we claim to maintain.
    if not exists (
      select 1 from pg_attribute a
      where a.attrelid = v_oid and a.attname = 'updated_at' and a.attnum > 0 and not a.attisdropped
    ) then
      raise exception 'attach_updated_at_maintainers: %.% has no updated_at column.', v_schema, v_table;
    end if;

    -- THE VERSION GUARD. _touch_row increments `version` on UPDATE. Not one of
    -- these six has that column today, and if one ever grows it, this migration
    -- must be re-reasoned (see the "version squatters" section above) rather
    -- than silently start bumping a value that may not be a row counter.
    if exists (
      select 1 from pg_attribute a
      where a.attrelid = v_oid and a.attname = 'version' and a.attnum > 0 and not a.attisdropped
    ) then
      raise exception
        'attach_updated_at_maintainers: %.% now has a `version` column. platform._touch_row would increment it on every UPDATE. Confirm the column is a canonical row counter (not an author-declared schema version, and not already incremented by the writer) before attaching.',
        v_schema, v_table;
    end if;

    -- Already wired up by a previous run, or by someone else in the meantime.
    if exists (
      select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = v_oid and not t.tgisinternal
        and t.tgtype & 2 = 2            -- BEFORE
        and p.prosrc ~* 'updated_at'
    ) then
      continue;
    end if;

    execute format(
      'create trigger _touch_row before insert or update on %I.%I '
      'for each row execute function platform._touch_row()',
      v_schema, v_table
    );
    v_added := v_added || (v_schema || '.' || v_table);
  end loop;

  if array_length(v_added, 1) is null then
    raise notice 'attach_updated_at_maintainers: nothing to do — all 6 targets already have a BEFORE updated_at maintainer.';
  else
    raise notice 'attach_updated_at_maintainers: attached platform._touch_row to % table(s): %',
      array_length(v_added, 1), array_to_string(v_added, ', ');
  end if;
end $attach$;

-- ── POST-CONDITION 1: all six now have a working BEFORE updated_at maintainer.
do $assert_attached$
declare v_missing text;
begin
  select string_agg(t.s || '.' || t.n, ', ')
    into v_missing
  from (values
    ('content_ir','admission_config'),
    ('users','user_secret_grants'),
    ('ui','ui_surface_write_target'),
    ('ui','ui_surface_client_tool'),
    ('research','research_intent'),
    ('workbench','udt_dataset_template_fields')
  ) as t(s, n)
  where not exists (
    select 1
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_trigger tg on tg.tgrelid = c.oid and not tg.tgisinternal
    join pg_proc p on p.oid = tg.tgfoid
    where ns.nspname = t.s and c.relname = t.n
      and tg.tgtype & 2 = 2
      and p.prosrc ~* 'updated_at'
  );

  if v_missing is not null then
    raise exception 'POST-CONDITION FAILED: these targets still have no BEFORE updated_at maintainer: %', v_missing;
  end if;
end $assert_attached$;

-- ── POST-CONDITION 2: the trigger actually fires and moves updated_at.
-- Proves behaviour, not just catalog presence. Uses the singleton config row —
-- a no-op self-assignment inside a rolled-back subtransaction.
do $assert_fires$
declare
  v_before timestamptz;
  v_after  timestamptz;
begin
  if not exists (select 1 from content_ir.admission_config) then
    raise warning 'attach_updated_at_maintainers: content_ir.admission_config is EMPTY — the singleton row is missing (a platform defect in its own right). Skipping the behavioural proof; the catalog assertion above still holds.';
    return;
  end if;

  select updated_at into v_before from content_ir.admission_config where singleton limit 1;

  begin
    update content_ir.admission_config set note = note where singleton;
    select updated_at into v_after from content_ir.admission_config where singleton limit 1;
    if v_after is not distinct from v_before then
      raise exception 'POST-CONDITION FAILED: platform._touch_row is attached to content_ir.admission_config but an UPDATE did not move updated_at (% -> %).', v_before, v_after;
    end if;
    -- Undo the probe: this migration must not leave a data change behind.
    raise exception 'MTX_ROLLBACK_PROBE';
  exception
    when others then
      if sqlerrm <> 'MTX_ROLLBACK_PROBE' then raise; end if;
  end;

  raise notice 'attach_updated_at_maintainers: behavioural proof OK — _touch_row moved updated_at on content_ir.admission_config (probe rolled back).';
end $assert_fires$;

-- ── POST-CONDITION 3: none of the six grew a `version` column that the trigger
-- would now be silently incrementing.
do $assert_no_version$
declare v_bad text;
begin
  select string_agg(t.s || '.' || t.n, ', ')
    into v_bad
  from (values
    ('content_ir','admission_config'),
    ('users','user_secret_grants'),
    ('ui','ui_surface_write_target'),
    ('ui','ui_surface_client_tool'),
    ('research','research_intent'),
    ('workbench','udt_dataset_template_fields')
  ) as t(s, n)
  where exists (
    select 1 from information_schema.columns col
    where col.table_schema = t.s and col.table_name = t.n and col.column_name = 'version'
  );

  if v_bad is not null then
    raise exception 'POST-CONDITION FAILED: % now carry a `version` column that platform._touch_row will increment on every UPDATE. Re-reason before leaving this trigger attached.', v_bad;
  end if;
end $assert_no_version$;
