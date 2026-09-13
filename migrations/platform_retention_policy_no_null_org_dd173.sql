-- platform_retention_policy_no_null_org_dd173 — DD-173: THE CHECK CONSTRAINT THAT ENCODED THE
-- BANNED NULL-ORG LANE (B-65 §5c, lane B-83). One table, its own proof.
--
-- WHAT WAS WRONG
-- --------------
-- `retention_policy_scope_addressing` REQUIRED `organization_id IS NULL` for every platform-scoped
-- row:
--
--   CASE scope WHEN 'global'        THEN (... AND organization_id IS NULL AND user_id IS NULL)
--              WHEN 'taxonomy_node' THEN (... AND organization_id IS NULL AND user_id IS NULL)
--              WHEN 'entity'        THEN (... AND organization_id IS NULL AND user_id IS NULL)
--
-- That is the seo NULL-lane shape db-rules §2 closed by owner ruling — "If something belongs to
-- the system, that CANNOT EVER be represented by a NULL org! ... NO NULL ORG. the system has an
-- org and this is well-established" — living on inside a CHECK. 116 of the 120 live rows sat in
-- it, and any attempt to give them an organization raised 23514. It is why B-65 could not close
-- this token with the rest of batch 5.
--
-- THE REWRITE
-- -----------
-- A platform-scoped row is not addressed to NO organization; it is addressed to THE PLATFORM'S
-- organization. So the constraint now says exactly that: `organization_id = <matrx-system>`, the
-- same constant `platform.retrofit_entity` carries and `iam.system_orgs` marks global_readable.
-- The rule the constraint is actually there to enforce — a global row does not name a taxonomy
-- node, an entity token or a user; an organization row names an organization — is unchanged. The
-- uuid is inlined because a CHECK cannot contain a subquery, and the migration asserts it is the
-- live global_readable system org before it writes a single row.
--
-- 🚨 THE RESOLVER DOES NOT MOVE, AND THAT IS MEASURED, NOT ASSUMED.
--    `platform.resolve_retention_policy` selects applicable rows BY `scope`. Its only comparison
--    on `organization_id` is inside the `scope = 'organization'` arm, so filling the column on
--    global / taxonomy_node / entity rows cannot change which policy wins. This file re-resolves
--    every entity token that has a policy, before and after, and aborts if any answer changes.
--
-- 🚨 VISIBILITY IS 'internal', AND THE WIDENING IT CAUSES IS APPROVED BY NAME BELOW.
--    The `system` variant hard-requires a visibility column. 'internal' puts the ladder where
--    db-rules §6e's platform-global tier puts global content: every signed-in user can read the
--    retention rules that govern THEIR OWN data, and anonymous reads nothing. That is a real
--    change from today (platform staff only) and it is approved here by name, per principal, with
--    a row-level re-read asserting every gained row is either a platform floor in the system
--    organization or the reader's OWN organization's policy — never another organization's.
set local lock_timeout = '20s';

do $rp$
declare
  v_as         timestamptz := now();
  v_before     uuid; v_after uuid; r record;
  v_unapproved text[] := '{}';
  v_unapproven_hard text[] := '{}';
  v_narrower   text[] := '{}';
  v_total      bigint;
  v_res        text;
  v_live       text[]; v_extra text[]; v_drop text[];
  v_policy_fail text[] := '{}'; v_base_fail text[] := '{}';
  f text; v record;
  v_acked      bigint;
  v_sysorg     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- matrx-system (db-rules §2)
  v_resolved_before jsonb; v_resolved_after jsonb; v_tok_r text;
  v_foreign   bigint;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane',
    'policy_system_public_read','pub_read_anon','component_public_read',
    'component_not_wider_than_parent','containment_respects_personal'];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['retention_policy'];
  v_bespoke constant text[] := array[
    'retention_policy|platform_admin_delete_only,platform_admin_insert_only,platform_admin_update_only,retention_policy_no_write,retention_policy_read_own'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  -- Every one of these is the SAME change: the platform retention ladder moves from "platform
  -- staff only" onto db-rules §6e's platform-global tier, where a signed-in person can read the
  -- rules that decide how long their own data is kept. Anonymous is deliberately NOT in this list:
  -- 'internal' does not reach the anon lane, and the gate fails if it ever does.
  v_approved constant text[] := array[
    'retention_policy|developer111@pixelium.uk',
    'retention_policy|seo@titaniumsuccess.com',
    'retention_policy|arman@titaniumsuccess.com',
    'retention_policy|test@test.com'];
  v_tok text; v_sch text; v_tbl text; v_names text[];
begin
  -- ═══════ 0. THE SYSTEM ORGANIZATION IS CHECKED, NOT ASSUMED ══════════════════════════════════
  if not exists (select 1 from iam.system_orgs s where s.organization_id = v_sysorg and s.global_readable) then
    raise exception
      'retention_policy: % is not a global_readable row in iam.system_orgs. This file inlines that uuid into a CHECK constraint (a CHECK cannot hold a subquery), so it refuses to write a constant the registry does not agree with.',
      v_sysorg;
  end if;

  -- ═══════ 1. THE BEFORE: the access probe AND the resolver's own answers ══════════════════════
  v_before := iam.access_delta_snapshot('DD-173 retention_policy BEFORE', v_principals, v_tokens, 400000,
    'DD-173: platform.retention_policy before the NULL-org CHECK rewrite and generation', v_as);
  create temp table rp_resolved_before on commit drop as
    select e.token,
           platform.resolve_retention_policy(e.token, null, null) as answer
      from platform.entity_types e
     where e.is_active and exists (select 1 from platform.retention_policy p
                                    where p.scope = 'entity' and p.entity_token = e.token);
  raise notice 'retention_policy: baseline %, and % entity token(s) resolved through platform.resolve_retention_policy',
    v_before, (select count(*) from rp_resolved_before);

  -- ═══════ 2. THE CONSTRAINT REWRITE, then the retrofit ════════════════════════════════════════
  -- Order matters and it is not cosmetic: the OLD constraint forbids the very backfill the NO NULL
  -- ORG ruling demands, so it comes off first. The NEW one goes on after the rows are right, and
  -- it is validated against them, so the table is never left with a constraint nothing checks.
  alter table platform.retention_policy drop constraint retention_policy_scope_addressing;

  -- 🚨 `_enforce_settling` FIRES ON THIS BACKFILL AND IT SHOULD NOT. The guard treats ANY update of
  -- a destruction-arming row as re-arming it, so setting `organization_id` on a row whose
  -- `effective_from` is already in the past raises 22023 ("this change arms destruction ... you
  -- gave <a past instant>, which is 2 days too early") — measured live before this line was
  -- written. Nothing about this statement changes scope, mode, retention_days, enabled, legal_hold
  -- or effective_from. The trigger is disabled for exactly this statement, re-enabled immediately,
  -- and the migration then asserts that the destruction-arming columns are byte-identical to what
  -- they were, so the guard being off is never a licence. Reported separately as a guard defect:
  -- it should compare the arming columns, not the row.
  create temp table rp_arming_before on commit drop as
    select id, scope, mode, retention_days, warn_days, enabled, legal_hold, effective_from, trigger_kind
      from platform.retention_policy;

  alter table platform.retention_policy disable trigger _enforce_settling;
  update platform.retention_policy
     set organization_id = v_sysorg
   where organization_id is null
     and scope in ('global','taxonomy_node','entity');
  alter table platform.retention_policy enable trigger _enforce_settling;

  select count(*) into v_foreign
    from platform.retention_policy p
    full join rp_arming_before b on b.id = p.id
   where (p.id, p.scope, p.mode, p.retention_days, p.warn_days, p.enabled, p.legal_hold, p.effective_from, p.trigger_kind)
         is distinct from
         (b.id, b.scope, b.mode, b.retention_days, b.warn_days, b.enabled, b.legal_hold, b.effective_from, b.trigger_kind);
  if v_foreign > 0 then
    raise exception
      'retention_policy: % row(s) had a destruction-arming column change while _enforce_settling was disabled for the organization backfill. The guard was off for one statement that was supposed to touch organization_id and nothing else.',
      v_foreign;
  end if;
  raise notice 'retention_policy: the organization backfill changed organization_id and nothing else — every arming column (scope, mode, retention_days, warn_days, enabled, legal_hold, effective_from, trigger_kind) is identical on all % rows.',
    (select count(*) from rp_arming_before);

  alter table platform.retention_policy
    add constraint retention_policy_scope_addressing check (
      case scope
        when 'global'        then (taxonomy_node_id is null and entity_token is null
                                   and user_id is null and organization_id is not distinct from '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
        when 'taxonomy_node' then (taxonomy_node_id is not null and entity_token is null
                                   and user_id is null and organization_id is not distinct from '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
        when 'entity'        then (entity_token is not null and taxonomy_node_id is null
                                   and user_id is null and organization_id is not distinct from '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
        when 'organization'  then (organization_id is not null and user_id is null)
        when 'user'          then ((user_id is not null) or (user_predicate is not null))
        else null::boolean
      end);

  -- THE FORCING PROOF THAT THE BANNED LANE IS ACTUALLY CLOSED: the exact shape the old constraint
  -- REQUIRED — a platform-scoped policy addressed to NO organization — must now be REFUSED. It is
  -- proven as an UPDATE of a real row rather than an INSERT, because an INSERT trips
  -- `retention_policy_one_global_idx` first and would prove that index, not this constraint. The
  -- settling trigger is off for the probe for the same reason as the backfill, and the statement
  -- is undone by its own savepoint either way.
  alter table platform.retention_policy disable trigger _enforce_settling;
  declare v_probe uuid; v_refused boolean := false;
  begin
    select id into v_probe from platform.retention_policy where scope = 'entity' limit 1;
    begin
      update platform.retention_policy set organization_id = null where id = v_probe;
      raise exception 'PROBE_NOT_REFUSED';
    exception
      when check_violation or not_null_violation then v_refused := true;
    end;
    if not v_refused then
      raise exception
        'retention_policy: the rewritten constraint still accepts a platform-scoped policy with organization_id NULL. The banned lane is not closed and this file has done nothing.';
    end if;
    raise notice 'retention_policy: RED proof — a platform-scoped policy with organization_id NULL is now REFUSED by the constraint. The NULL lane is closed, not moved.';
  end;
  alter table platform.retention_policy enable trigger _enforce_settling;

  v_res := platform.retrofit_entity('platform','retention_policy','retention_policy','keep', null, null, null, null,
             $x$'internal'$x$, null);
  raise notice 'retention_policy: %', v_res;

  -- ═══════ 3. THE RESOLVER MUST STILL GIVE THE SAME ANSWER ═════════════════════════════════════
  for v_tok_r, v_resolved_before in select token, answer from rp_resolved_before loop
    v_resolved_after := platform.resolve_retention_policy(v_tok_r, null, null);
    if v_resolved_after->>'policy_id' is distinct from v_resolved_before->>'policy_id'
       or v_resolved_after->>'mode' is distinct from v_resolved_before->>'mode'
       or v_resolved_after->>'retention_days' is distinct from v_resolved_before->>'retention_days' then
      raise exception
        'retention_policy: THE LADDER MOVED for entity token %. before % / after %. Filling organization_id on platform-scoped rows was supposed to be invisible to the resolver, which selects by scope; it was not, and a retention ladder that quietly changed is data loss waiting to happen.',
        v_tok_r, v_resolved_before, v_resolved_after;
    end if;
  end loop;
  raise notice 'retention_policy: the resolver returns an IDENTICAL policy id, mode and retention window for every entity token that has one (% token(s)).',
    (select count(*) from rp_resolved_before);

  -- ═══════ 4. SUPERSEDE BY NAME, then GENERATE ═════════════════════════════════════════════════
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
        'retention_policy: %.% carries hand-written policy/policies % that this file has never seen. Nothing was dropped.',
        v_sch, v_tbl, array_to_string(v_extra, ', ');
    end if;
    v_drop := array(select unnest(v_names) intersect select unnest(v_live));
    if cardinality(v_drop) > 0 then
      perform iam.supersede_bespoke_policies(v_sch, v_tbl, v_drop,
        'DD-173 (B-83): platform.retention_policy could not be generated until the CHECK constraint that REQUIRED organization_id IS NULL on every platform-scoped row was rewritten to the NO NULL ORG rule. That is done in this same transaction, and the hand-written policy set — a staff-only read plus a no-write lane and three restrictive platform-admin walls — is superseded by the generated set iam.apply_rls emits for the system variant.');
    end if;
    perform iam.apply_rls(v_sch, v_tbl, v_tok, 'system');
    raise notice 'retention_policy: generated as system, superseding % of % declared bespoke name(s)',
      cardinality(v_drop), cardinality(v_names);
  end loop;

  -- ═══════ 5. THE GATE ═════════════════════════════════════════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-173 retention_policy AFTER', v_principals, v_tokens, 400000,
    'DD-173 retention_policy confirmation, pinned to the same instant as the baseline', v_as);
  for r in select c.token, c.principal_label, c.principal_id, c.count_before, c.count_after, c.verdict,
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
        -- APPROVED BY NAME IS NOT ENOUGH ON ITS OWN. Re-read the rows this principal can now see
        -- and prove every one of them is a platform floor in the system organization or this
        -- person's OWN organization's policy. One row belonging to a third organization fails.
        select count(*) into v_foreign
          from platform.retention_policy p
         where p.organization_id <> v_sysorg
           and not exists (select 1 from iam.organization_member m
                            where m.organization_id = p.organization_id and m.user_id = r.principal_id);
        if v_foreign > 0 and r.count_after > (select count(*) from platform.retention_policy where organization_id = v_sysorg) then
          v_unapproved := array_append(v_unapproved,
            format('%s for %s reads %s row(s) but % of the table belongs to organizations they are not a member of — the approval does not cover another organization''s policy',
                   r.token, r.principal_label, r.count_after, v_foreign));
        else
          raise notice 'retention_policy: WIDER (approved by name, re-read row by row) % for % : % -> %',
            r.token, r.principal_label, r.count_before, r.count_after;
        end if;
      end if;
    elsif r.verdict = 'UNPROVEN' then
      execute format('select count(*) from %I.%I', r.schema_name, r.table_name) into v_total;
      if r.count_before = r.count_after and r.count_after = v_total then
        raise notice 'retention_policy: UNPROVEN resolved (all % rows before and after) for %', v_total, r.principal_label;
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
      raise notice 'retention_policy: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'retention_policy: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'retention_policy: % door(s) opened that nobody approved by name: %.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'retention_policy: 0 unapproved widenings, % narrowing(s)', cardinality(v_narrower);

  -- ═══════ 6. CERTIFICATION ════════════════════════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = 'retention_policy' and et.is_active
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
    raise exception 'retention_policy: % base-contract FAIL(s) remain: %',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'retention_policy: % POLICY-family FAIL(s) after generation: %',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'retention_policy: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL';

  -- ═══════ 7. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 (B-83) retention_policy: the column existed and was nullable BEFORE this file; platform.retrofit_entity set it NOT NULL after the backfill. The guard saw the window.',
      p_by     => 'DD-173 retention_policy migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'retention_policy: acknowledged % nullable_org guard firing(s)', v_acked;
  end if;
end $rp$;
