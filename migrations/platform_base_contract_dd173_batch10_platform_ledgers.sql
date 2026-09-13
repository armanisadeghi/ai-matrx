-- platform_base_contract_dd173_batch10_platform_ledgers — DD-173 BATCH 10 (2 tokens).
--
-- THE TWO LEDGERS B-65 §5d held back because "whose organization is this?" was a real question and
-- not a lookup. Answered here from the writers and the readers, not from a default:
--
--   `matrx_action_ledger` (platform.matrx_action_ledger) — the ONE durable idempotency ledger for
--     executing directives. aidream states its own contract in
--     `services/directive_apply/ledger.py`: "Writes run OUTSIDE acting_as_user (server-owned table;
--     owner-read RLS for clients, NO CLIENT WRITE PATH)", and `services/directive_apply/keys.py`:
--     "platform.matrx_action_ledger holds EVERY action THE PLATFORM has ever applied". The key is
--     `sha256(namespace · type · canonical(item))` — a PLATFORM-WIDE dedup namespace, which is the
--     whole point of the table: the same content key must collide no matter who or which
--     organization emits it. Its `user_id` is the ACTOR of the directive, not the scope of the
--     record. B-65 measured the alternative and it failed: backfilling from each actor's personal
--     organization handed an org admin 5 rows they own none of and moved test@test.com 13 -> 18.
--     So: a PLATFORM ledger, in the system organization.
--
--   `rag_library_audit_log` (rag.library_audit_log) — the audit trail of the Shared Knowledge
--     Resources grant RPCs (`library_publish` / `library_revoke` / `library_subscribe` /
--     `library_unsubscribe`). `services/rag/library_grants.py`: "All WRITES go through the RPCs
--     (one mutation path, audited to rag.library_audit_log)", and "the FE reaches these over HTTP
--     (aidream router) because rag.* is NOT PostgREST-exposed" — no client can read or write this
--     table at all. `target_organization_id` names the organization the action was ABOUT, not the
--     organization that owns the record: the record is the platform's account of a publishing
--     decision. Backfilling from it was measured by B-65 and handed two org members 15 and 9 rows
--     of a platform administration trail. So: a PLATFORM ledger, in the system organization.
--
-- 🚨 WHAT "PLATFORM LEDGER, SYSTEM ORG" ACTUALLY MEANS HERE, SAID PLAINLY. The `ledger` variant
--    emits ONE read lane and its ONLY access key is `organization_id` (db-rules §6d-3). The system
--    organization has zero members, and `iam.class_lanes` says `confidential` is not one of the two
--    classes that get the §6e global-readable arm (DD-174). Both tokens are also declaring
--    `suppress_platform_admin_lane`, because the same `class_lanes` row says `confidential` has NO
--    platform-admin lane — our own staff go through the door too (§3.1 derivation two), and
--    `iam.verify_canonical` FAILs the token until the registry says so. The result is that after
--    this file NOBODY reads either table through a client channel: only `service_role`, through
--    `svc_all`, which is exactly who reads them today in code. Every client read that goes away is
--    named as a narrowing below. This is the same shape B-65's batch 3 shipped for six confidential
--    ledgers and the same ruling: a confidential record has no standing browse.
set local lock_timeout = '20s';

do $dd173b10$
declare
  v_as         timestamptz := now();
  v_before     uuid; v_after uuid; r record;
  v_unapproved text[] := '{}';
  v_unapproven_hard text[] := '{}';
  v_unproven_ok text[] := '{}';
  v_narrower   text[] := '{}';
  v_total      bigint;
  v_res        text;
  v_live       text[]; v_extra text[]; v_drop text[];
  v_policy_fail text[] := '{}'; v_base_fail text[] := '{}';
  f text; v record;
  v_acked      bigint;
  v_svc        bigint;
  v_mal_rows   bigint;
  v_ral_rows   bigint;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane',
    'policy_system_public_read','pub_read_anon','component_public_read',
    'component_not_wider_than_parent','containment_respects_personal'];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with a row of their own here
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member with 13 rows of their own here today
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['matrx_action_ledger','rag_library_audit_log'];
  v_bespoke constant text[] := array[
    'matrx_action_ledger|matrx_action_ledger_owner_read,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only',
    'rag_library_audit_log|library_audit_select_admin,platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
  v_tok text; v_sch text; v_tbl text; v_names text[];
begin
  -- ═══════ 0. THE CLASSIFICATION, with its reason stored in the row ════════════════════════════
  update platform.entity_types et set
    suppress_platform_admin_lane = true,
    notes = concat_ws(' ', et.notes,
      '[DD-173 B-83, 2026-09-13] Classified a PLATFORM ledger: organization_id = the system organization. aidream owns every write (services/directive_apply/ledger.py: "server-owned table ... no client write path") and the content key sha256(namespace.type.item) is a PLATFORM-WIDE dedup namespace — the same action must collide whoever emits it. user_id is the directive''s ACTOR, not the record''s scope; B-65 measured the personal-organization alternative and it widened (an org admin gained 5 rows they own none of; test@test.com 13 -> 18). suppress_platform_admin_lane set because iam.class_lanes says the confidential class has no platform-admin lane (§3.1 derivation two).')
   where et.token = 'matrx_action_ledger' and et.is_active;

  update platform.entity_types et set
    suppress_platform_admin_lane = true,
    notes = concat_ws(' ', et.notes,
      '[DD-173 B-83, 2026-09-13] Classified a PLATFORM ledger: organization_id = the system organization. Written only by the library grant RPCs (services/rag/library_grants.py: "All WRITES go through the RPCs ... audited to rag.library_audit_log") and rag.* is not PostgREST-exposed, so no client reads or writes it. target_organization_id names the organization the action was ABOUT; the record is the platform''s account of a publishing decision, not that organization''s property — B-65 measured the target-organization backfill and it handed two org members 15 and 9 rows of a platform administration trail. suppress_platform_admin_lane set because iam.class_lanes says the confidential class has no platform-admin lane.')
   where et.token = 'rag_library_audit_log' and et.is_active;

  select count(*) into v_mal_rows from platform.matrx_action_ledger;
  select count(*) into v_ral_rows from rag.library_audit_log;

  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 b10 BEFORE', v_principals, v_tokens, 400000,
    'DD-173 batch 10: the two ledgers whose organization was a real question', v_as);
  raise notice 'dd173b10: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;

  -- ═══════ 2. THE BASE RETROFIT ════════════════════════════════════════════════════════════════
  -- db-rules §2: the launching operation supplies the system org EXPLICITLY; the database never
  -- picks one. `system` is that explicit statement, and it is the classification above, not a
  -- fallback for rows nothing else matched.
  v_res := platform.retrofit_entity('platform','matrx_action_ledger','matrx_action_ledger','system', null, null, null, null, null, null);
  raise notice 'dd173b10: %', v_res;
  v_res := platform.retrofit_entity('rag','library_audit_log','rag_library_audit_log','system', null, null, null, null, null, null);
  raise notice 'dd173b10: %', v_res;

  -- ═══════ 3. SUPERSEDE BY NAME, then GENERATE ═════════════════════════════════════════════════
  foreach f in array v_bespoke loop
    v_tok   := split_part(f, '|', 1);
    v_names := array_remove(string_to_array(split_part(f, '|', 2), ','), '');
    select et.schema_name, et.table_name into v_sch, v_tbl
      from platform.entity_types et where et.token = v_tok and et.is_active;
    select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
      from pg_policy pol
     where pol.polrelid = format('%I.%I', v_sch, v_tbl)::regclass
       and not (pol.polname = any (iam.generated_policy_names()));
    v_extra := array(select unnest(v_live) except select unnest(v_names));
    if v_extra <> '{}' then
      raise exception
        'dd173b10: %.% carries hand-written policy/policies % that this file has never seen. Nothing was dropped.',
        v_sch, v_tbl, array_to_string(v_extra, ', ');
    end if;
    v_drop := array(select unnest(v_names) intersect select unnest(v_live));
    if cardinality(v_drop) > 0 then
      perform iam.supersede_bespoke_policies(v_sch, v_tbl, v_drop, format(
        'DD-173 batch 10 (B-83): %s is classified a PLATFORM ledger in this same transaction, with the reason stored on its registry row. Its hand-written set — an owner or staff read plus three restrictive platform-admin write walls — is superseded by the generated ledger set, whose only access key is organization_id (db-rules 6d-3) and whose lanes come from the class (DD-174).',
        v_tok));
    end if;
    perform iam.apply_rls(v_sch, v_tbl, v_tok, 'ledger');
    raise notice 'dd173b10: generated % (%.%) as ledger, superseding % of % declared bespoke name(s)',
      v_tok, v_sch, v_tbl, cardinality(v_drop), cardinality(v_names);
  end loop;

  -- ═══════ 3b. THE READER THAT MUST STILL WORK ═════════════════════════════════════════════════
  -- Every real reader and writer of both tables is aidream on `service_role` — that is the claim
  -- this file's narrowings rest on, so it is MEASURED rather than asserted. Both tables are read as
  -- `service_role` after generation and must return every row; a ledger nobody can read is not a
  -- narrowing, it is a broken table.
  execute 'set local role service_role';
  select count(*) into v_svc from platform.matrx_action_ledger;
  execute 'reset role';
  if v_svc <> v_mal_rows then
    raise exception
      'dd173b10: service_role reads % of % rows of platform.matrx_action_ledger after generation. aidream is the ONLY reader left and it cannot read the table — the narrowings below are not narrowings, they are an outage.',
      v_svc, v_mal_rows;
  end if;
  execute 'set local role service_role';
  select count(*) into v_svc from rag.library_audit_log;
  execute 'reset role';
  if v_svc <> v_ral_rows then
    raise exception
      'dd173b10: service_role reads % of % rows of rag.library_audit_log after generation.', v_svc, v_ral_rows;
  end if;
  raise notice 'dd173b10: service_role — the only reader either table has in code — still reads all % and all % rows.',
    v_mal_rows, v_ral_rows;

  -- ═══════ 4. THE GATE ═════════════════════════════════════════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-173 b10 AFTER', v_principals, v_tokens, 400000,
    'DD-173 batch 10 confirmation, pinned to the same instant as the baseline', v_as);
  for r in select c.token, c.principal_label, c.count_before, c.count_after, c.verdict,
                  et.schema_name, et.table_name
             from iam.access_delta_compare(v_before, v_after) c
             join platform.entity_types et on et.token = c.token
            where c.verdict <> 'SAME' order by c.verdict, c.token, c.principal_label
  loop
    if r.verdict = 'WIDER' then
      if not ((r.token || '|' || r.principal_label) = any (v_approved)) then
        v_unapproved := array_append(v_unapproved,
          format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      else
        raise notice 'dd173b10: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    elsif r.verdict = 'UNPROVEN' then
      execute format('select count(*) from %I.%I', r.schema_name, r.table_name) into v_total;
      if r.count_before = r.count_after and r.count_after = v_total then
        v_unproven_ok := array_append(v_unproven_ok,
          format('%s for %s (all %s rows before and after)', r.token, r.principal_label, v_total));
      else
        v_unapproven_hard := array_append(v_unapproven_hard,
          format('UNPROVEN %s for %s (%s -> %s of %s rows)', r.token, r.principal_label, r.count_before, r.count_after, v_total));
      end if;
    elsif r.verdict = 'UNMEASURED' then
      v_unapproved := array_append(v_unapproved,
        format('UNMEASURED %s for %s — the probe itself failed', r.token, r.principal_label));
    else
      v_narrower := array_append(v_narrower,
        format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      raise notice 'dd173b10: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173b10: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173b10: % door(s) opened that nobody approved by name: %.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173b10: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical',
    cardinality(v_narrower), cardinality(v_unproven_ok);

  -- ═══════ 5. CERTIFICATION ════════════════════════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) order by et.token
  loop
    for v in select * from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant)
              where status = 'FAIL'
    loop
      f := format('%s / %s: %s', r.token, v.check_name, coalesce(v.detail,''));
      if v.check_name = any (v_policy_checks) then v_policy_fail := array_append(v_policy_fail, f);
      else v_base_fail := array_append(v_base_fail, f); end if;
    end loop;
  end loop;
  if cardinality(v_base_fail) > 0 then
    raise exception 'dd173b10: % base-contract FAIL(s) remain after the retrofit: %',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173b10: % POLICY-family FAIL(s) after generation: %',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173b10: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL across both tokens';

  -- ═══════ 6. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 batch 10 (B-83): platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair.',
      p_by     => 'DD-173 batch 10 migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173b10: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173b10$;
