-- platform_base_contract_dd173_batch3_confidential_ledgers — DD-173 BATCH 3 (6 tokens).
--
-- THE SIX APPEND-ONLY TRAILS: the admin action log, the admin email log, the API field-warning
-- log, the context access log, the dev-login audit and the guest-conversion audit. Every one is
-- `rls_variant = ledger`, `data_class = confidential`, registered by DD-159 batch 1 and refused by
-- `iam.apply_rls` ever since — nine of the ten refused with a bare `column "organization_id" does
-- not exist`, which is the whole of DD-173 in one sentence.
--
-- 🚨 A LEDGER GETS LESS, NOT MORE, AND THAT IS THE POINT OF §6d-3. No actor pair (a ledger's actor
--    is a named domain column — `actor_user_id`, `sent_by`, `requested_at` — that never touches a
--    policy), no mutation trio (a ledger has no user-write lane at all), and NO visibility column
--    (its RLS lane never reads one, so the column would be a second competing access authority).
--    `platform.retrofit_entity` refuses to add any of them to a ledger. What they get is what the
--    variant actually reads: a uuid id where one was missing, `organization_id` NOT NULL with its
--    FK, an append timestamp, and `metadata`.
--
-- 🚨 EVERY STAFF READ GOES TO ZERO, AND THAT IS THE DECLARED BEHAVIOUR, NOT AN ACCIDENT.
--    `iam.class_lanes` gives a `confidential` class NO platform-admin lane, so the declaration in
--    step 1b closes the staff door these six carry today (DD-137b), and the generated ledger lane
--    is org-scoped only. Measured in a rolled-back rehearsal: a platform admin goes 14 -> 0 on the
--    admin action log, 405 -> 0 on the dev-login audit, 286 -> 0 on the field warnings. These are
--    server-read trails — `service_role` keeps `svc_all` and every writer is server-side — and
--    NEITHER repo contains a client-side SELECT of any of the six (checked by name: the frontend
--    writes admin_email_logs through the service-role client and reads none of them). These six
--    are 6 of the 13 tokens `pnpm check:staff-door` names as still carrying the staff lane under a
--    private-or-confidential parent.
--
-- 🚨 WHY THE SYSTEM ORG, AND WHY THAT IS SAFE HERE. Five of the six are platform operations
--    records — no customer wrote a row and no customer owns one — so db-rules §2 assigns them the
--    system org explicitly. §6e makes system-org rows readable through a global-readable arm on
--    some generated lanes, and DD-174 caught exactly that shape handing a confidential audit to
--    every signed-in user, so it is MEASURED rather than assumed: in the rehearsal every
--    non-staff principal read ZERO rows of all five before and after. `context_access_log` keeps
--    its own column ('keep'): it has no rows today, and a future row's organization is the
--    context item's, which its writer supplies.
--
-- 🚨 FOUR MORE LEDGERS ARE HELD BACK BY NAME and written up in the B-65 report:
--    `matrx_action_ledger` (the personal-org backfill made 5 rows readable by an org admin who
--    does not own them and moved test@test.com 13 -> 18 — a real widening, so its org is not the
--    owner's personal org and the right answer is not this file's to guess),
--    `rag_library_audit_log` (backfilling from `target_organization_id` gave two org members 15
--    and 9 rows — arguably their own organization's library trail, but a widening is approved by
--    name after a row-level re-read, and that proof belongs with the RAG lane),
--    `ops.api_request_log` (1.46 M rows, written continuously — a NOT NULL backfill plus a uuid
--    id rewrite is a lock this file must not take beside the other five) and
--    `runtime.execution_event_cursor` (162 k rows, no id and no timestamp at all, written by every
--    running execution — the delta probe cannot even pin it, which its own probe row says).
--
-- The org strategy, the re-read bespoke superset, the one-transaction gate, the UNPROVEN
-- resolution and the guard acknowledgement are batch 1's shape and are documented there.
set local lock_timeout = '20s';

do $dd173b3$
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
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane',
    'policy_system_public_read','pub_read_anon','component_public_read',
    'component_not_wider_than_parent','containment_respects_personal'];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with real rows elsewhere
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT platform staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT — the one that matters most on a public catalog
  ]::uuid[];
  v_tokens text[] := array[
    'admin_audit_log','admin_email_log','api_field_warning','context_access_log',
    'dev_login_audit','guest_conversion_audit'];
  -- token | schema | table | org strategy. A `ledger` gets NO visibility column and NO actor pair
  -- and NO mutation trio — §6d-3 forbids all three, and `platform.retrofit_entity` refuses them.
  v_plan constant text[][] := array[
    array['admin_audit_log','admin','admin_audit_log','system'],
    array['admin_email_log','admin','admin_email_logs','system'],
    array['api_field_warning','ops','api_field_warnings','system'],
    array['context_access_log','context','context_access_log','keep'],
    array['dev_login_audit','admin','dev_login_audit','system'],
    array['guest_conversion_audit','users','guest_conversion_audit','system']];
  -- the SUPERSET of hand-written policy names this file was written against: 'token|a,b,c'.
  -- (A flat text[] rather than a 2-D array because Postgres requires every row of a
  -- multidimensional array to have the same length, and these tables do not.)
  v_bespoke constant text[] := array[
    'admin_audit_log|admin_audit_no_direct_writes,admin_audit_select_super',
    'admin_email_log|Admins can insert email logs,Admins can view email logs',
    'api_field_warning|',
    'context_access_log|context_access_log_insert,context_access_log_select',
    'dev_login_audit|',
    'guest_conversion_audit|platform_admin_only'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
  i int; v_tok text; v_sch text; v_tbl text; v_strat text; v_names text[];
begin
  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 b3 BEFORE', v_principals, v_tokens, 400000,
    'DD-173 batch 3: the ten public reference catalogs, before the base retrofit and generation', v_as);
  raise notice 'dd173b3: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;

  -- ═══════ 1b. THE DECLARATION THAT MUST COME BEFORE THE GENERATION ═══════════════════════════
  -- `iam.class_lanes` says `platform_admin_lane = false` for all six (their class is
  -- `confidential`), and DD-159 batch 1 registered them without `suppress_platform_admin_lane`.
  -- Generating them as they stand would emit `platform_admin_all` on tables whose class forbids a
  -- staff lane — the defect DD-137b closed for the rest of the registry. The declaration is set
  -- HERE, in the same transaction, BEFORE the generator reads it: a wall that is only written
  -- down is a wall the next regeneration quietly removes. This is also why every staff read below
  -- goes to zero; these trails are read by the SERVER (service_role keeps `svc_all`), and no
  -- client code in either repo selects any of them — checked by name before this file was written.
  for r in select et.token, l.platform_admin_lane, coalesce(et.suppress_platform_admin_lane,false) sup
             from platform.entity_types et, lateral iam.class_lanes(et.token) l
            where et.token = any (v_tokens) order by et.token
  loop
    if not r.platform_admin_lane and not r.sup then
      update platform.entity_types set suppress_platform_admin_lane = true where token = r.token;
      raise notice 'dd173b3: % declares suppress_platform_admin_lane — its class has no staff lane', r.token;
    elsif r.platform_admin_lane and r.sup then
      raise exception 'dd173b3: % declares suppress_platform_admin_lane but its class HAS a staff lane. The registry and the class disagree; nothing was generated.', r.token;
    end if;
  end loop;

  -- ═══════ 2. THE BASE RETROFIT, per token, through the one path ═══════════════════════════════
  for i in 1 .. array_length(v_plan, 1) loop
    v_tok := v_plan[i][1]; v_sch := v_plan[i][2]; v_tbl := v_plan[i][3]; v_strat := v_plan[i][4];
    v_res := platform.retrofit_entity(v_sch, v_tbl, v_tok, v_strat);
    raise notice 'dd173b3: %', v_res;
  end loop;

  -- ═══════ 3. SUPERSEDE BY NAME, then GENERATE, one pass per token ═════════════════════════════
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
        'dd173b3: %.% carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
        v_sch, v_tbl, array_to_string(v_extra, ', ');
    end if;
    v_drop := array(select unnest(v_names) intersect select unnest(v_live));
    if cardinality(v_drop) > 0 then
      perform iam.supersede_bespoke_policies(v_sch, v_tbl, v_drop, format(
        'DD-173 batch 3: %s is an append-only trail registered by DD-159 batch 1 and refused by iam.apply_rls until now for a missing base contract. Its base contract is retrofitted in this same transaction and its hand-written policy set is superseded by the generated set iam.apply_rls emits for the ledger variant under its confidential class. Kept unsuperseded the two would OR together and leave the table wider than either regime intended.',
        v_tok));
    end if;
    perform iam.apply_rls(v_sch, v_tbl, v_tok, 'ledger');
    raise notice 'dd173b3: generated % (%.%), superseding % of % declared bespoke name(s)',
      v_tok, v_sch, v_tbl, cardinality(v_drop), cardinality(v_names);
  end loop;

  -- ═══════ 4. THE GATE — the same probe, the same instant, the same cast ═══════════════════════
  v_after := iam.access_delta_snapshot('DD-173 b3 AFTER', v_principals, v_tokens, 400000,
    'DD-173 batch 3 confirmation, pinned to the same instant as the baseline', v_as);
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
        raise notice 'dd173b3: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;

    elsif r.verdict = 'UNPROVEN' then
      -- 🚨 UNPROVEN IS NOT A PASS, AND IT IS NOT NARROWER EITHER. It means the probe could not
      -- compare the two reads ROW BY ROW. Here the cause is structural and known: before this
      -- file these tables had no uuid `id`, so `iam.access_delta_snapshot` hashed the whole row
      -- text instead of collecting ids — and this file ADDS columns to every one of them, so that
      -- hash was always going to differ. The count is unchanged, which is necessary and not
      -- sufficient. What makes it sufficient is that the count IS the whole table: if a principal
      -- read every row before and every row after, there is no "which rows" left to ask. Any pair
      -- where that is not true aborts the migration rather than being waved through.
      execute format('select count(*) from %I.%I', r.schema_name, r.table_name) into v_total;
      if r.count_before = r.count_after and r.count_after = v_total then
        v_unproven_ok := array_append(v_unproven_ok,
          format('%s for %s (all %s rows before and after)', r.token, r.principal_label, v_total));
      else
        v_unapproven_hard := array_append(v_unapproven_hard,
          format('UNPROVEN %s for %s (%s -> %s of %s rows) — the row-by-row comparison is impossible and the read is not the whole table, so nobody can say which rows moved',
                 r.token, r.principal_label, r.count_before, r.count_after, v_total));
      end if;

    elsif r.verdict = 'UNMEASURED' then
      v_unapproved := array_append(v_unapproved,
        format('UNMEASURED %s for %s — the probe itself failed; a gate that could not read proves nothing', r.token, r.principal_label));

    else
      v_narrower := array_append(v_narrower,
        format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      raise notice 'dd173b3: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173b3: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173b3: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173b3: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical (id-hash UNPROVEN by construction, resolved), across % tokens x % principals',
    cardinality(v_narrower), cardinality(v_unproven_ok), cardinality(v_tokens), cardinality(v_principals);

  -- ═══════ 5. CERTIFICATION — this batch's whole point is that BOTH axes are now clean ═════════
  -- DD-159 batch 2 could only say "0 POLICY FAIL, and the base FAILs are named not absorbed",
  -- because a base retrofit was another lane's decision. This IS that lane, so a base-contract
  -- FAIL here is this file failing, and it aborts exactly like a policy FAIL.
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
    raise exception 'dd173b3: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173b3: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173b3: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL across all 6 tokens';

  -- ═══════ 6. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 batch 3: platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair. The alternative (add column not null default <org>) is hard-blocked by this same guard, and combining add + drop-default into one ALTER is rejected by Postgres.',
      p_by     => 'DD-173 batch 3 migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173b3: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173b3$;
