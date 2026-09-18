-- dd204_access_machinery_carries_no_unexplained_client_lane
-- (DD-204. db-rules §0/§6d/§9. Closes the three real machinery findings DD-200 surfaced.)
--
-- ═══ WHAT WAS MEASURED, LIVE, 2026-09-14 ══════════════════════════════════════════════════════
-- DD-200 stopped measuring machinery tokens against a contract that never runs on them, and three
-- real FAILs came out of the noise. Each one is a live client read door on access machinery. This
-- file reads each door, its data and its readers, and disposes of each on the evidence.
--
-- ── 1. platform.activity_log / `std_select` — REMOVED ─────────────────────────────────────────
-- 🚨 THE FILING'S PREMISE WAS WRONG AND THE RECORD IS BETTER THAN IT SAID. DD-204 (and the
-- header of dd200_…sql, and check-policy-of-record.ts's comment) say this policy "appears in no
-- migration in either repository" and "was written by something else". It was not. Its migration
-- of record is `migrations/iam_hoist_has_org_access_set_wise_d146.sql`, applied 2026-08-15
-- 03:46:10Z, which ends its generator section with
--
--     SELECT iam.apply_rls('platform', 'activity_log', 'activity', 'ledger');
--
-- and whose own comment names it: "Only ONE of these 34 shapes is emitted by iam.apply_rls: the
-- `ledger` variant's std_select … platform.activity_log is then regenerated through it". Both
-- earlier greps looked for the literal string `std_select` NEAR `activity` and could not see a
-- generator CALL. So this is not a hand-applied policy of unknown origin (the DD-113 class); it is
-- the residue of a DELIBERATE generation that predates the 2026-08-24 ruling that made
-- `iam.apply_rls` refuse machinery. The disposition is unchanged — it must go — but for the real
-- reason, and the next reader should not be told a falsehood about where it came from.
--
-- WHO READS platform.activity_log AS A CLIENT: nobody. Censused across matrx-frontend, aidream,
-- matrx-local and matrx-extend. The two frontend readers
-- (lib/communications/voice/storage-canary-readiness.ts and provider-configuration-readiness.ts)
-- both use `createAdminClient()` — the service role, which reads through `svc_all`. The admin
-- events viewer at /administration/reporting/events calls the SECURITY DEFINER RPC
-- `public.admin_recent_activity` (whose own migration says "activity_log is not REST-exposed, so
-- this SECURITY DEFINER RPC"). Every one of the seven client-executable functions that touch the
-- table — files.webhook_dispatch / webhook_redeliver / webhook_send_test, platform.log_activity,
-- public.access_request_report, public.admin_recent_activity — is SECURITY DEFINER and bypasses
-- RLS. aidream reads it through the Matrx ORM as `postgres`. No view reads it. So `std_select`
-- served no reader at all.
--
-- WHAT IT DID GRANT, measured as test@test.com (a plain non-admin) in a rolled-back transaction:
-- 1,098 rows — 1,093 from an organization the account belongs to and 5 from the global-readable
-- system org — written by ANOTHER member of that organization. The table's metadata column is
-- producer-defined and unbounded, and across the whole table it carries `ip_address`,
-- `claim_token`, `session_id`, `provider_account_id`, `provider_media_url`, `sha256`,
-- `object_identity_hash`, `consent`. An undesigned, unread lane handing every member of an
-- organization the whole audit trail of everyone else in it is not a feature anyone asked for; it
-- is a generation nobody re-read after the ruling changed.
-- Removed through the ONE deliberate path (`iam.supersede_bespoke_policies`, reason recorded in
-- `iam.superseded_policy`) — see the amendment to that function below.
--
-- ── 2. platform.edge_payload_kind / `edge_payload_kind_read` — KEPT, AND DECLARED ─────────────
-- `USING (true)` FOR SELECT TO anon, authenticated; recorded in `migrations/edge_payload_system_v1.sql`.
-- The table holds kind / version / description / json_schema / source_type / target_type — eight
-- rows describing edge payload shapes ("Agent bound to a UI surface…", "Provenance for a fact
-- asserted about a party…") and the JSON Schema each payload must satisfy. No person, no
-- organization, no customer content. It is a PUBLISHED CATALOGUE, and its registry row already
-- says so: DD-163 set `data_class = 'public'` with the reason written out. (`anon` is named in the
-- policy but holds no table grant, so a signed-out session gets 42501 — reported by DD-163's own
-- gate, and not changed here: granting it would be a widening nobody asked for.)
-- An unconditional client read is therefore legitimate HERE, and the certifier is taught the
-- difference: not by exempting a table name, but by requiring the declaration the doctrine already
-- has a column for. See the `machinery_no_client_grant` amendment below.
--
-- ── 3. platform.repo / `repo_read` — REMOVED ──────────────────────────────────────────────────
-- `USING (true)` FOR SELECT TO authenticated. DD-172 recorded it as "KEEP (b). Signed-in read of
-- the platform repository catalogue … Reference data whose read the admin surfaces depend on."
-- The first half of that reason is the defect and the second half is satisfied without it:
--   • The table is the platform's own repository registry — 32 rows of `slug` +
--     `github_full_name` naming this organization's GitHub repositories, most of them private.
--     That is internal infrastructure inventory, not published reference data, and its registry
--     row says `data_class = 'confidential'`.
--   • Its ONE client reader is `features/admin/agent-review/registry.ts`, mounted only at
--     `/administration/users/agent-review`, behind the `(admin)` layout gate ("ANY Matrx admin").
--     Every row in `admin.admins` is an admin, and `public.is_platform_admin()` is true for every
--     one of them — so `platform_admin_all` (USING is_platform_admin()) already admits exactly the
--     population that can reach the surface. `repo_read` adds nothing for the reader it was kept
--     for, and hands every other signed-in account the catalogue.
--   • Everything else that reads it — aidream's mandate reference board and matrx-mandate-scan —
--     connects as `postgres` through the Matrx ORM and never sees RLS.
-- Removed through `iam.supersede_bespoke_policies` with the reason recorded.
--
-- MEASURED BEFORE/AFTER, one rolled-back transaction, the two drops applied inside it:
--   admin@admin.com   repo 32 → 32   activity_log 221,042 → 221,042   edge_payload_kind 8 → 8
--   test@test.com     repo 32 →  0   activity_log   1,098 →       0   edge_payload_kind 8 → 8
-- Two narrowings, both intended and both named. No widening.
--
-- ═══ THE TWO CLASS FIXES ══════════════════════════════════════════════════════════════════════
-- Neither finding is closed by touching only its own table.
--
-- A. `iam.supersede_bespoke_policies` REFUSED a generated name everywhere, with the reasoning
--    "Regeneration already replaces it; superseding it would only leave the table without a lane
--    until the next run." That is true on a table the generator can run on and FALSE on the 47
--    machinery tables `iam.apply_rls` refuses by construction — there is no next run, so the ONE
--    deliberate, recorded removal path was closed against exactly the policies that most need it,
--    and the only way to remove `std_select` from `platform.activity_log` was a bare DROP POLICY
--    with nothing written down. It is the same false exemption V-65 found in
--    `check:policy-of-record` and DD-200 found in the certifier, in a third place. The refusal is
--    now conditional on `audit_class`, and only for the CLASS-REGIME lanes
--    (std_select/std_insert/std_update/std_delete/pub_read) — `svc_all` and `platform_admin_all`
--    stay refused everywhere, because they are platform-wide lanes their own migrations put on
--    machinery too and superseding one would silently remove the staff or service lane.
--
-- B. `iam.verify_canonical`'s `machinery_no_client_grant` called EVERY unconditional client read
--    an ungated door. Some access machinery IS a published catalogue. The certifier now accepts an
--    unconditional client READ only when the registry row DECLARES it — `data_class = 'public'`
--    with a written `data_class_reason` — and the PASS detail names the policy and quotes the
--    declaration, so the door is never hidden behind a bare green. An undeclared one still FAILs,
--    and the FAIL says how to declare it. The `anon` limb is NOT waived by a public declaration:
--    machinery is an input the access resolver reads and a signed-out reader of it is wrong
--    whatever the contents are.
--
-- ═══ WHAT THIS FILE LEAVES BEHIND, NAMED ══════════════════════════════════════════════════════
-- `migrations/iam_bespoke_policies_of_record_dd172.sql` records `platform|repo|repo_read` among
-- the 74 doors it asserts byte-for-byte, and its record block CREATEs a recorded policy that is
-- missing. After this file, re-running that (already applied, never to be edited) migration would
-- create `repo_read`, immediately count 1 created, and RAISE — aborting its own transaction, so
-- nothing is resurrected, but failing loudly. That file is by its own header not replayable on a
-- fresh database anyway ("a creation means the live set has changed since 2026-09-13"), and its
-- SECOND block already handles this exact case: a name that is not live but IS in
-- `iam.superseded_policy` counts as accounted for. Recorded here so the next lane that meets the
-- raise knows what it is; the class fix (that block consulting `iam.superseded_policy` before
-- creating) belongs to whoever next amends the record.
--
-- ═══ THE FORCING TEST ══════════════════════════════════════════════════════════════════════════
-- The block near the end builds a scratch machinery token on a scratch table and proves both class
-- fixes RED then GREEN against this live database, then removes every trace of itself. It raises —
-- aborting this whole migration — if any limb does not move:
--   an undeclared USING (true) client read FAILs machinery_no_client_grant;
--   data_class='public' with a BLANK reason still FAILs (a declaration must be written);
--   data_class='public' with a written reason PASSes, and the detail NAMES the policy;
--   a declared-public table with an `anon` grant FAILs anyway;
--   supersede refuses `std_select` on a NON-machinery token (the old behaviour, kept);
--   supersede ACCEPTS it on a machinery token and records the row in iam.superseded_policy;
--   supersede still refuses `platform_admin_all` on a machinery token.
-- No live row, table, policy or grant is touched by it.

set local lock_timeout = '4s';

-- ═══ A. THE ONE DELIBERATE REMOVAL PATH REACHES MACHINERY ═════════════════════════════════════
-- Identical to the live function in every line but the generated-name refusal, which is now
-- conditional on the relation's active registry token being audit_class='machinery' AND the name
-- being a class-regime lane. Everything else — the ≥60-character reason, the "name them, there is
-- no 'all' here" rule, the not-live check, the iam.superseded_policy row, the NOTICE — is
-- untouched.
CREATE OR REPLACE FUNCTION iam.supersede_bespoke_policies(p_schema text, p_table text, p_policy_names text[], p_reason text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_len integer := coalesce(length(btrim(p_reason)), 0);
  v_machinery boolean;
  nm text;
  c_class_regime constant text[] := array['std_select','std_insert','std_update','std_delete','pub_read'];
begin
  if to_regclass(v_tbl) is null then
    raise exception 'supersede_bespoke_policies: %.% does not exist. Nothing was dropped.', p_schema, p_table;
  end if;
  if p_policy_names is null or cardinality(p_policy_names) = 0 then
    raise exception
      'supersede_bespoke_policies: name the policies you mean to drop. There is no "all" here on purpose — dropping a set nobody enumerated is exactly the defect DD-147 closes.';
  end if;
  if v_len < 60 then
    raise exception
      'supersede_bespoke_policies: a reason of at least 60 characters is required and % character(s) were given. Say what the policy did and what now does that job instead; "ok" is how an allowlist becomes a place to hide.', v_len;
  end if;

  -- DD-204 (2026-09-14). The generated-name refusal below rests on "regeneration already replaces
  -- it". `iam.apply_rls` REFUSES a machinery token by construction ("generic RLS is forbidden
  -- because machinery owns inputs consumed by the access resolver", the 2026-08-24 42P17 class),
  -- so on a machinery relation there IS no next run and that reasoning is false — it closed the
  -- one recorded removal path against the very policies that most need it (a class-regime lane on
  -- access machinery, which iam.verify_canonical's machinery_no_generated_policy exists to find),
  -- leaving a bare DROP POLICY with nothing written down as the only way out. Same false exemption
  -- V-65 found in check:policy-of-record and DD-200 found in the certifier, in a third place.
  select exists (
    select 1 from platform.entity_types et
     where et.schema_name = p_schema and et.table_name = p_table
       and et.is_active and et.audit_class = 'machinery')
    into v_machinery;

  foreach nm in array p_policy_names loop
    if nm = any (iam.generated_policy_names()) then
      -- `svc_all` and `platform_admin_all` stay refused EVERYWHERE, machinery included: they are
      -- platform-wide lanes their own migrations put on hundreds of tables, so superseding one
      -- here would silently remove the service or staff lane from a table that is meant to have it.
      if not (v_machinery and nm = any (c_class_regime)) then
        raise exception
          'supersede_bespoke_policies: % is a name iam.apply_rls AUTHORS (%). Regeneration already replaces it; superseding it would only leave the table without a lane until the next run. Nothing was dropped.%',
          nm, array_to_string(iam.generated_policy_names(), ', '),
          case when v_machinery then format(' (%I.%I IS machinery, but %s is a platform-wide lane its own migration put there — only the class-regime lanes %s may be superseded on machinery.)', p_schema, p_table, nm, array_to_string(c_class_regime, ', ')) else '' end;
      end if;
    end if;
    if not exists (
      select 1 from pg_policy p
       where p.polrelid = v_tbl::regclass and p.polname = nm
    ) then
      raise exception
        'supersede_bespoke_policies: %.% has no policy named %. Nothing was dropped — a name that is already gone means the caller is working from a stale reading of the table.',
        p_schema, p_table, nm;
    end if;

    execute format('drop policy %I on %s', nm, v_tbl);
    insert into iam.superseded_policy (schema_name, table_name, policy_name, reason)
    values (p_schema, p_table, nm, p_reason);
    raise notice 'supersede_bespoke_policies: DROPPED % on %.% — %', nm, p_schema, p_table, p_reason;
  end loop;
end
$function$;

-- ═══ B. THE CERTIFIER LEARNS THE DIFFERENCE BETWEEN A CATALOGUE AND A HOLE ════════════════════
-- Identical to the live function in every line but the `machinery_no_client_grant` block, which
-- now accepts an unconditional client READ when — and only when — the registry row DECLARES the
-- table public with a written reason, and names the door in the PASS detail either way. The anon
-- limb, the generated-policy limb, the reason limb, the RLS limb and the whole base contract are
-- untouched. (The full body is carried here rather than patched in place because a function is
-- replaced whole; the diff against the live 2026-09-13 body is 4 hunks.)
CREATE OR REPLACE FUNCTION iam.verify_canonical(p_schema text, p_table text, p_token text, p_variant text DEFAULT NULL::text)
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_tbl regclass;
  v_relkind "char";
  v_is_component boolean; v_variant text; v_reg_variant text;
  v_soft_delete boolean; v_is_versioned boolean; v_is_listed boolean; v_shareable boolean;
  v_vstore text; v_vstore_ref regclass;
  v_store_token text; v_store_fk text; v_store_trig boolean; v_store_uq boolean; v_store_kind "char";
  f_id_uuid boolean; f_id boolean; f_id_int boolean; f_org boolean; f_org_nn boolean;
  f_cb boolean; f_ub boolean; f_ca_nn boolean; f_occ_nn boolean; f_ua_nn boolean; f_del boolean;
  f_ver boolean; f_meta boolean;
  f_vis boolean; f_vis_enum boolean; f_vis_nn boolean;
  l_owner boolean; l_orgid boolean; l_isdel boolean; l_ispub boolean;
  fk_org boolean; fk_cb boolean; fk_ub boolean;
  t_stamp boolean; t_touch boolean; t_hist boolean;
  v_rls boolean; v_polnames text[]; v_sel text;
  v_reg_rt text; v_expected text[]; v_unexpected text[]; v_missing text[];
  v_bespoke text[];  -- DD-147: policies on this table iam.apply_rls did not author
  v_parent_type text; v_parent_col text;
  v_owner_pat text := '%created_by = ( SELECT auth.uid()%';
  -- THE PRIVACY WALL (SPEC-ACCESS §3.5). A token declaring
  -- suppress_platform_admin_lane is generated WITHOUT platform_admin_all, so the
  -- expected-policy set must omit it or every flipped table fails certification.
  v_suppress_admin boolean := false;
  -- THE PUBLIC-PARENT ANON LANE (0580). A component token declaring
  -- component_anon_read_via_public_parent is generated WITH a pub_read anon
  -- policy keyed on the parent's visibility, so the expected-policy set must
  -- include it — and a dedicated check keeps the lane from being silently
  -- dropped by a regeneration, exactly like the privacy wall in the other
  -- direction.
  v_anon_component boolean := false;
  v_pub text;
  -- THE PER-VARIANT BASE CONTRACT (derived above)
  -- DD-200 (2026-09-13) THE MACHINERY ROUTE. `audit_class` — not `rls_variant` — is the column
  -- that DECLARES a token machinery (`rls_variant` has no such value; its CHECK admits only
  -- entity/component/system/restricted/ledger/personal). It is read here so the machinery
  -- contract below can replace the base contract rather than sit beside it.
  v_audit_class text; v_audit_reason text;
  v_actor_req boolean;      -- must the actor pair EXIST?
  v_mutation_req boolean;   -- must the mutation trio EXIST?
BEGIN
  v_tbl := to_regclass(format('%I.%I',p_schema,p_table));
  IF v_tbl IS NULL THEN
    check_name:='table_exists'; status:='FAIL'; detail:='table not found'; RETURN NEXT; RETURN;
  END IF;

  SELECT relkind INTO v_relkind FROM pg_class WHERE oid=v_tbl;
  IF v_relkind NOT IN ('r','p') THEN
    check_name:='relation_kind'; status:='SKIP';
    detail:=format('%s — base contract not applicable; access follows the underlying query',
                   CASE v_relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE 'relkind '||v_relkind::text END);
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(is_component,false),COALESCE(has_soft_delete,false),COALESCE(is_versioned,false),COALESCE(is_listed,false),rls_variant,
         COALESCE(version_store,'history'),version_store_ref,COALESCE(suppress_platform_admin_lane,false),
         COALESCE(component_anon_read_via_public_parent,false)
    INTO v_is_component,v_soft_delete,v_is_versioned,v_is_listed,v_reg_variant,v_vstore,v_vstore_ref,v_suppress_admin,
         v_anon_component
    FROM platform.entity_types WHERE token=p_token;
  v_variant := COALESCE(p_variant, v_reg_variant, CASE WHEN v_is_component THEN 'component' ELSE 'entity' END);
  v_shareable := EXISTS(SELECT 1 FROM platform.shareable_resource_registry WHERE resource_type=p_token AND is_active);

  v_actor_req    := v_variant IN ('entity','system','restricted');
  -- The mutation trio is required where the row is USER-REVISED (the entity family) or where
  -- the registry DECLARES it versioned (any variant — a versioned row must bump `version`,
  -- §7's prerequisite pairing). `ledger` means "no user writes", not "the server never
  -- updates it": a server-written durable work queue is a legitimate ledger and may be
  -- versioned. Nothing in the machinery forbids it, so the gate must not either.
  v_mutation_req := v_variant IN ('entity','system','restricted','personal') OR v_is_versioned;

  SELECT
    bool_or(column_name='id' AND data_type='uuid'), bool_or(column_name='id'),
    bool_or(column_name='id' AND data_type IN ('bigint','integer','smallint')),
    bool_or(column_name='organization_id'), bool_or(column_name='organization_id' AND is_nullable='NO'),
    bool_or(column_name='created_by'), bool_or(column_name='updated_by'),
    bool_or(column_name='created_at' AND is_nullable='NO'),
    bool_or(column_name='occurred_at' AND is_nullable='NO'),
    bool_or(column_name='updated_at' AND is_nullable='NO'),
    bool_or(column_name='deleted_at'),
    bool_or(column_name='version' AND data_type='integer' AND is_nullable='NO'),
    bool_or(column_name='metadata' AND data_type='jsonb' AND is_nullable='NO'),
    bool_or(column_name='visibility'),
    bool_or(column_name='visibility' AND udt_schema='platform' AND udt_name='visibility'),
    bool_or(column_name='visibility' AND udt_schema='platform' AND udt_name='visibility' AND is_nullable='NO'),
    bool_or(column_name IN ('user_id','owner_id','author_id','creator_id')),
    bool_or(column_name='org_id'), bool_or(column_name='is_deleted'), bool_or(column_name='is_public')
  INTO f_id_uuid,f_id,f_id_int,f_org,f_org_nn,f_cb,f_ub,f_ca_nn,f_occ_nn,f_ua_nn,f_del,f_ver,f_meta,
       f_vis,f_vis_enum,f_vis_nn,l_owner,l_orgid,l_isdel,l_ispub
  FROM information_schema.columns WHERE table_schema=p_schema AND table_name=p_table;

  SELECT
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='organization_id' AND c.confrelid='iam.organizations'::regclass),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='created_by' AND c.confrelid='auth.users'::regclass),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='updated_by' AND c.confrelid='auth.users'::regclass)
  INTO fk_org,fk_cb,fk_ub;

  SELECT COALESCE(bool_or(pr.proname='_stamp_actor'),false),COALESCE(bool_or(pr.proname='_touch_row'),false),
         COALESCE(bool_or(pr.proname='_version_capture'),false)
    INTO t_stamp,t_touch,t_hist
  FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid WHERE tg.tgrelid=v_tbl AND NOT tg.tgisinternal;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid=v_tbl;
  SELECT array_agg(polname) INTO v_polnames FROM pg_policy WHERE polrelid=v_tbl;
  SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy WHERE polrelid=v_tbl AND polname='std_select';
  SELECT pg_get_expr(polqual,polrelid) INTO v_pub FROM pg_policy WHERE polrelid=v_tbl AND polname='pub_read';

  check_name:='entity_registered';
  IF EXISTS(SELECT 1 FROM platform.entity_types WHERE token=p_token AND schema_name=p_schema AND table_name=p_table)
    THEN status:='PASS'; detail:=v_variant; ELSE status:='FAIL'; detail:=format('no entity_types row for token=%s at %s.%s',p_token,p_schema,p_table); END IF; RETURN NEXT;

  -- ═══ DD-200 (2026-09-13) — A MACHINERY TOKEN IS MEASURED AGAINST THE MACHINERY CONTRACT ══════
  -- `iam.apply_rls` REFUSES a machinery token by construction ("generic RLS is forbidden because
  -- machinery owns inputs consumed by the access resolver", the 2026-08-24 42P17 recursion
  -- incident). So on a machinery table the per-variant base contract (§6d-3) and the generated
  -- policy family it certifies DESCRIBE A REGIME THAT NEVER RUNS — every FAIL they produced was
  -- a distance from a contract that by ruling does not apply, and that noise is exactly what
  -- hides a real FAIL from the lane reading the output (B-83 §8: a correctly re-registered
  -- `user_secret_grant` reported eleven of them).
  --
  -- What replaces them is the contract a machinery token DOES owe, derived from the rulings that
  -- created the class rather than from the generator:
  --   machinery_has_reason        — the written reason on the row (db-rules, the certification
  --                                 universe: "marking a table machinery is an owner decision with
  --                                 a written reason on the row — an agent may not self-declare
  --                                 one to clear red").
  --   machinery_no_generated_policy — the generator never ran here.
  --   machinery_no_client_grant   — no signed-out reach, and no UNDECLARED ungated client door
  --                                 (DD-204: a data_class='public' registry row with a written
  --                                 reason declares a published catalogue and is accepted, named).
  --   machinery_rls_on            — the bespoke policies are reachable at all.
  -- The base contract is then skipped with a NAMED row, never silently.
  SELECT COALESCE(et.audit_class,'entity'), et.audit_class_reason
    INTO v_audit_class, v_audit_reason
    FROM platform.entity_types et WHERE et.token = p_token;

  IF v_audit_class = 'machinery' THEN

    -- ── 1. THE WRITTEN REASON ──────────────────────────────────────────────────────────────────
    -- `entity_types_machinery_reason` is a NOT-NULL CHECK and nothing more, so a whitespace
    -- string satisfies it and arrives here as a machinery declaration with nothing written on it.
    check_name := 'machinery_has_reason';
    IF COALESCE(btrim(v_audit_reason),'') <> '' THEN
      status := 'PASS'; detail := left(btrim(v_audit_reason), 160);
    ELSE
      status := 'FAIL';
      detail := 'audit_class=machinery with a BLANK audit_class_reason. Marking a table machinery '
             || 'is an owner decision WITH A WRITTEN REASON ON THE ROW — an agent may not '
             || 'self-declare one to clear red, and a genuine entity that is merely non-canonical '
             || 'stays audit_class=entity and keeps its honest FAILs. The '
             || 'entity_types_machinery_reason CHECK only forbids NULL, so a whitespace string '
             || 'reaches this row. Write the reason into platform.entity_types.audit_class_reason.';
    END IF; RETURN NEXT;

    -- ── 2. THE GENERATOR NEVER RAN HERE ────────────────────────────────────────────────────────
    -- The CLASS-REGIME lanes (std_* / pub_read) are what `iam._apply_rls_unchecked` emits FOR A
    -- TABLE, and they cannot legitimately exist on a token the generator refuses. `svc_all` and
    -- `platform_admin_all` are NOT evidence of a generator run: both are platform-wide lanes put
    -- on hundreds of tables, machinery included, by their own migrations
    -- (access_gate_platform_admin_truth: "a platform_admin_all policy … on 888 tables"). They are
    -- NAMED in the detail even when this check passes, so nothing about the live door set is
    -- hidden behind a PASS.
    check_name := 'machinery_no_generated_policy';
    DECLARE
      v_class_lanes text[]; v_platform_lanes text[];
    BEGIN
      v_class_lanes := ARRAY(SELECT unnest(COALESCE(v_polnames,'{}'))
                             INTERSECT
                             SELECT unnest(ARRAY['std_select','std_insert','std_update','std_delete','pub_read']));
      v_platform_lanes := ARRAY(SELECT unnest(COALESCE(v_polnames,'{}'))
                                INTERSECT
                                SELECT unnest(ARRAY['svc_all','platform_admin_all']));
      IF v_class_lanes = '{}' THEN
        status := 'PASS';
        detail := CASE WHEN v_platform_lanes = '{}' THEN 'no generated policy'
                       ELSE format('no class lane. The platform-wide lane(s) %s are present and are '
                                || 'not evidence of generation — their own migrations put them on '
                                || 'machinery too.', array_to_string(v_platform_lanes,', ')) END;
      ELSE
        status := 'FAIL';
        detail := format('the generic class regime is LIVE on access machinery: %s. iam.apply_rls '
               || 'refuses a machinery token by construction, so a std_*/pub_read policy here was '
               || 'written by a generation that should never have happened (the 2026-08-24 42P17 '
               || 'class). Fold it into this table''s bespoke, documented contract or drop it.',
                         array_to_string(v_class_lanes,', '));
      END IF;
    END; RETURN NEXT;

    -- ── 3. NO SIGNED-OUT REACH, AND NO UNGATED CLIENT DOOR ─────────────────────────────────────
    -- Deliberately NOT "authenticated holds no privilege": the ratified machinery contract is that
    -- these tables keep their BESPOKE policies, and several of them must be client-readable
    -- through one (`iam.memberships` is read by the member it names). A table grant decides
    -- nothing on its own — RLS does. What is never right on access machinery is a signed-out
    -- reader, or a permissive client policy whose predicate is unconditional, which is a door RLS
    -- cannot gate. The authenticated privileges are named in the detail either way.
    check_name := 'machinery_no_client_grant';
    DECLARE
      v_anon_privs text; v_auth_privs text; v_open text; v_bad text := NULL;
      v_data_class text; v_data_reason text; v_declared text := NULL;
    BEGIN
      SELECT string_agg(DISTINCT g.privilege_type, ', ') INTO v_anon_privs
        FROM information_schema.role_table_grants g
       WHERE g.table_schema = p_schema AND g.table_name = p_table AND g.grantee = 'anon';
      SELECT string_agg(DISTINCT g.privilege_type, ', ') INTO v_auth_privs
        FROM information_schema.role_table_grants g
       WHERE g.table_schema = p_schema AND g.table_name = p_table AND g.grantee = 'authenticated';
      SELECT string_agg(pol.polname, ', ' ORDER BY pol.polname) INTO v_open
        FROM pg_policy pol
       WHERE pol.polrelid = v_tbl AND pol.polpermissive AND pol.polcmd IN ('r','*')
         AND (pol.polroles = '{0}'::oid[]
              OR EXISTS (SELECT 1 FROM pg_roles r
                          WHERE r.oid = ANY(pol.polroles) AND r.rolname IN ('anon','authenticated')))
         AND COALESCE(btrim(pg_get_expr(pol.polqual, pol.polrelid)), 'true') IN ('true','');
      IF v_anon_privs IS NOT NULL THEN
        v_bad := format('anon holds %s on this table — a signed-out client never reaches the '
              || 'inputs the access resolver reads', v_anon_privs);
      END IF;
      -- 🚨 DD-204 (2026-09-14) — A DECLARED PUBLIC CATALOGUE IS NOT AN UNGATED DOOR.
      -- Some access machinery IS published reference data: platform.edge_payload_kind is the
      -- registry of edge payload kinds and the JSON Schema each payload must satisfy, with no
      -- person, organization or customer content in it, and an unconditional signed-in read of it
      -- is the intended shape rather than a hole. What separates a catalogue from a hole is not
      -- the predicate — it is whether anybody DECLARED it. The doctrine already has the column:
      -- platform.entity_types.data_class. So an unconditional client READ policy is accepted here
      -- only when the registry row says data_class = 'public' AND carries a WRITTEN
      -- data_class_reason, and the PASS detail names the policy and quotes the declaration, so the
      -- live door is never hidden behind a bare green. A whitespace reason is not a declaration —
      -- the same gap machinery_has_reason exists for.
      SELECT et.data_class, et.data_class_reason INTO v_data_class, v_data_reason
        FROM platform.entity_types et WHERE et.token = p_token;
      IF v_open IS NOT NULL THEN
        IF v_data_class = 'public' AND COALESCE(btrim(v_data_reason),'') <> '' THEN
          v_declared := format('%s read unconditionally by a client role, and that is DECLARED: '
                    || 'the registry row says data_class=public because — %s',
                            v_open, left(btrim(v_data_reason), 200));
        ELSE
          v_bad := COALESCE(v_bad || '; ', '')
                || format('%s admit a client role with an UNCONDITIONAL predicate — a door RLS '
                       || 'cannot gate. If this table is published reference data, DECLARE it: '
                       || 'set data_class=''public'' with a written data_class_reason on the '
                       || 'platform.entity_types row and record the policy in a migration. An '
                       || 'undeclared unconditional read stays a defect (it reads today as '
                       || 'data_class=%s)', v_open, COALESCE(v_data_class,'<unset>'));
        END IF;
      END IF;
      -- The anon limb above is NEVER waived by a public declaration. Machinery is an input the
      -- access resolver reads; a signed-out reader of it is wrong whatever the contents are.
      IF v_bad IS NULL THEN
        status := 'PASS';
        detail := COALESCE(v_declared || '. ', '')
               || CASE WHEN v_auth_privs IS NULL THEN 'no client grant at all'
                       ELSE format('authenticated holds %s; every client lane is gated by a '
                                || 'bespoke policy or a written public declaration, which is the '
                                || 'ratified machinery contract', v_auth_privs) END;
      ELSE
        status := 'FAIL'; detail := v_bad || ' (DD-200, DD-204).';
      END IF;
    END; RETURN NEXT;

    -- ── 4. THE BESPOKE POLICIES ARE REACHABLE AT ALL ───────────────────────────────────────────
    check_name := 'machinery_rls_on';
    IF COALESCE(v_rls,false) THEN status := 'PASS'; detail := NULL;
    ELSE
      status := 'FAIL';
      detail := 'row security is DISABLED on a table the access resolver reads, so every bespoke '
             || 'policy on it is inert and any role holding a table grant reads every row. '
             || 'ALTER TABLE ... ENABLE ROW LEVEL SECURITY.';
    END IF; RETURN NEXT;

    -- ── 5. THE BASE CONTRACT IS SKIPPED BY NAME, NEVER SILENTLY ────────────────────────────────
    check_name := 'base_contract_not_applicable';
    status := 'SKIP';
    detail := format('audit_class=machinery: iam.apply_rls refuses this token, so the per-variant '
           || 'base contract (§6d-3) and the generated-policy family never run here and are not '
           || 'measured. Registered rls_variant is %s and is what the table would be generated as '
           || 'if it ever stopped being machinery. The four machinery_* checks above are this '
           || 'token''s contract. Reason on the row: %s',
                     COALESCE(v_reg_variant,'<unset>'),
                     COALESCE(NULLIF(btrim(COALESCE(v_audit_reason,'')),''),'<blank>'));
    RETURN NEXT;

    RETURN;
  END IF;

  -- ---- id -------------------------------------------------------------------------------
  -- A ledger row has a POSITION, not an identity: its std_select reads only organization_id
  -- and iam.has_access is never called on it, so a monotonic bigint (the shape
  -- history.row_versions itself uses) is canonical there.
  check_name:='base_id_uuid';
  IF f_id_uuid THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' AND f_id_int THEN
    status:='PASS'; detail:='ledger sequence id (integer) — a ledger row has a position, not a shareable identity';
  ELSIF f_id THEN status:='FAIL'; detail:='id not uuid';
  ELSE status:='FAIL'; detail:='missing id'; END IF; RETURN NEXT;

  -- ---- org: UNIVERSAL. The NO-NULL-ORG ruling is platform-wide, every variant. -----------
  check_name:='base_organization_id'; status:=CASE WHEN f_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_org THEN NULL ELSE 'missing organization_id' END; RETURN NEXT;
  check_name:='base_org_not_null'; status:=CASE WHEN NOT f_org THEN 'SKIP' WHEN f_org_nn THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN f_org AND NOT f_org_nn THEN 'organization_id must be NOT NULL' END; RETURN NEXT;
  check_name:='base_org_fk'; status:=CASE WHEN fk_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN fk_org THEN NULL ELSE 'organization_id missing FK -> iam.organizations' END; RETURN NEXT;

  -- ---- actor pair: entity family only (§6d-1) --------------------------------------------
  check_name:='base_created_by';
  IF f_cb THEN status:='PASS'; detail:=CASE WHEN v_variant='component' THEN 'present but NOT an access key (§6d-1): neutralize from the parent, rename to a domain author column, or drop' END;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing created_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no owner column (§6d-1) — access is the parent''s; the actor is in history.row_versions';
  ELSE status:='SKIP'; detail:='ledger actor is a named domain column (e.g. actor_id), never an access key'; END IF; RETURN NEXT;

  check_name:='base_created_by_fk'; status:=CASE WHEN NOT f_cb THEN 'SKIP' WHEN fk_cb THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_cb AND NOT fk_cb THEN 'created_by missing FK -> auth.users' END; RETURN NEXT;

  check_name:='base_updated_by';
  IF f_ub THEN status:='PASS'; detail:=NULL;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing updated_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no actor columns (§6d-1) — every write is stamped into history.row_versions';
  ELSE status:='SKIP'; detail:='append-only ledger row is never updated'; END IF; RETURN NEXT;

  check_name:='base_updated_by_fk'; status:=CASE WHEN NOT f_ub THEN 'SKIP' WHEN fk_ub THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_ub AND NOT fk_ub THEN 'updated_by missing FK -> auth.users' END; RETURN NEXT;

  -- ---- append timestamp: UNIVERSAL. A ledger names it occurred_at (history.row_versions). -
  check_name:='base_created_at';
  IF f_ca_nn THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' AND f_occ_nn THEN status:='PASS'; detail:='ledger append timestamp is occurred_at (the history.row_versions shape)';
  ELSE status:='FAIL'; detail:=CASE WHEN v_variant='ledger' THEN 'missing/nullable created_at (or occurred_at)' ELSE 'missing/nullable created_at' END; END IF; RETURN NEXT;

  -- ---- mutation trio: only where the row is user-revised ----------------------------------
  check_name:='base_updated_at';
  IF f_ua_nn THEN status:='PASS'; detail:=NULL;
  ELSIF v_mutation_req THEN status:='FAIL'; detail:='missing/nullable updated_at';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='non-versioned component — its revision history is its parent''s; adding a stamp nothing maintains is the dead-column anti-pattern (§8)';
  ELSE status:='SKIP'; detail:='non-versioned ledger — no user-write lane (SELECT-only grants, §6d-2) and nothing maintains the stamp'; END IF; RETURN NEXT;

  check_name:='base_version';
  IF f_ver THEN status:='PASS'; detail:=NULL;
  ELSIF v_mutation_req THEN status:='FAIL'; detail:='missing version int NOT NULL';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='non-versioned component — nothing reads version (§7: version matters iff is_versioned)';
  ELSE status:='SKIP'; detail:='non-versioned ledger — nothing reads version (§7: version matters iff is_versioned)'; END IF; RETURN NEXT;

  check_name:='base_metadata'; status:=CASE WHEN f_meta THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_meta THEN NULL ELSE 'missing metadata jsonb NOT NULL' END; RETURN NEXT;

  check_name:='soft_delete';
  IF v_soft_delete THEN status:=CASE WHEN f_del THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_del THEN NULL ELSE 'has_soft_delete=true but no deleted_at' END;
  ELSIF f_del THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='a ledger row is never soft-deleted; the ledger RLS lane has no deleted_at prefix (§8 corollary 2)';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='a component''s lifecycle is its parent''s — the parent''s deleted_at governs the tree, and the component RLS lane emits no deleted_at prefix; soft-deleting a child independently is the "own identity" a component does not have';
  ELSE status:='WARN'; detail:='no deleted_at (has_soft_delete=false)'; END IF; RETURN NEXT;

  -- ---- canonical triggers: required where they have something to do ----------------------
  -- platform._stamp_actor() assigns NEW.created_by UNGUARDED — attaching it to a table with
  -- no actor columns raises 42703 on every write. It can only be required where they exist.
  -- And it stamps auth.uid(), which §6d-1 calls the ENTITY fix: on a component a lingering
  -- created_by must be DERIVED FROM THE PARENT or dropped, never forced to the acting user.
  check_name:='trg_stamp_actor';
  IF v_actor_req THEN status:=CASE WHEN t_stamp THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_stamp THEN NULL ELSE 'missing _stamp_actor trigger' END;
  ELSIF f_cb OR f_ub THEN status:='SKIP'; detail:=format('lingering actor column on a %s — §6d-1: derive it from the parent or drop it; attaching _stamp_actor (it stamps auth.uid()) is the entity fix and is wrong here',v_variant);
  ELSE status:='SKIP'; detail:='no actor columns to stamp — platform._stamp_actor raises 42703 on a table without created_by'; END IF; RETURN NEXT;

  -- platform._touch_row() is jsonb-guarded and is a genuine no-op with neither column.
  check_name:='trg_touch_row';
  IF f_ua_nn OR f_ver THEN status:=CASE WHEN t_touch THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_touch THEN NULL ELSE 'missing _touch_row trigger' END;
  ELSE status:='SKIP'; detail:='no updated_at/version to maintain — platform._touch_row would be a no-op'; END IF; RETURN NEXT;

  check_name:='trg_version_capture';
  IF v_is_versioned AND v_vstore='custom' THEN
    -- CERTIFIED CUSTOM VERSION STORE (Arman-ratified 2026-08-12): the entity's versioning IS
    -- its declared store (e.g. a publication table product rows FK-pin). Requirements:
    IF t_hist THEN
      status:='FAIL'; detail:='DUPLICATE VERSIONING: version_store=custom but _version_capture also attached — an entity has exactly one versioning system';
    ELSIF v_vstore_ref IS NULL THEN
      status:='FAIL'; detail:='version_store=custom but version_store_ref is NULL';
    ELSE
      SELECT c.relkind INTO v_store_kind FROM pg_class c WHERE c.oid=v_vstore_ref;
      SELECT et.token INTO v_store_token FROM platform.entity_types et WHERE et.table_ref=v_vstore_ref AND et.is_active LIMIT 1;
      SELECT er.fk_column INTO v_store_fk FROM platform.entity_relationships er
        WHERE er.child_type=v_store_token AND er.parent_type=p_token AND er.kind='composition' LIMIT 1;
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid
        WHERE tg.tgrelid=v_tbl AND NOT tg.tgisinternal
          AND pr.prosrc ILIKE '%'||v_vstore_ref::text||'%'
      ) INTO v_store_trig;
      SELECT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid=v_vstore_ref AND i.indisunique
          AND v_store_fk = ANY (SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=v_vstore_ref AND a.attnum = ANY(i.indkey))
          AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_vstore_ref AND a.attnum = ANY(i.indkey) AND a.attname ILIKE '%version%')
      ) INTO v_store_uq;
      IF v_store_kind IS DISTINCT FROM 'r' THEN status:='FAIL'; detail:=format('custom store %s is not a plain table',v_vstore_ref::text);
      ELSIF v_store_token IS NULL THEN status:='FAIL'; detail:=format('custom store %s is not an active registered entity',v_vstore_ref::text);
      ELSIF v_store_fk IS NULL THEN status:='FAIL'; detail:=format('custom store token %s has no composition edge to %s',v_store_token,p_token);
      ELSIF NOT v_store_trig THEN status:='FAIL'; detail:=format('no automatic capture trigger on %s.%s writing %s',p_schema,p_table,v_vstore_ref::text);
      ELSIF NOT v_store_uq THEN status:='FAIL'; detail:=format('custom store %s lacks UNIQUE(%s, <version column>)',v_vstore_ref::text,v_store_fk);
      ELSE status:='PASS'; detail:=format('certified custom version store: %s',v_vstore_ref::text);
      END IF;
    END IF;
  ELSIF v_is_versioned THEN
    status:=CASE WHEN t_hist THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_hist THEN NULL ELSE 'is_versioned=true but no _version_capture trigger' END;
  ELSE
    status:=CASE WHEN t_hist THEN 'WARN' ELSE 'SKIP' END; detail:=CASE WHEN t_hist THEN '_version_capture present but is_versioned=false' ELSE 'not versioned' END;
  END IF; RETURN NEXT;

  -- ---- visibility -------------------------------------------------------------------------
  -- A component's and a ledger's RLS lane NEVER reads visibility. A column there is a second,
  -- competing access authority (§6d-1) — flag it for removal rather than blessing it.
  check_name:='visibility';
  IF f_vis AND v_variant IN ('component','ledger') THEN
    status:='WARN'; detail:=format('%s carries a stray visibility column — its RLS lane never reads it (§6d-1/§6d-2); a second competing access authority, file the removal',v_variant);
  ELSIF f_vis AND NOT f_vis_enum THEN status:='FAIL'; detail:='visibility not platform.visibility enum (free-text kill)';
  ELSIF f_vis_enum THEN status:=CASE WHEN f_vis_nn THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_vis_nn THEN NULL ELSE 'visibility must be NOT NULL' END;
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component inherits parent access';
  ELSIF v_variant='restricted' THEN status:='PASS'; detail:='restricted server-only table has no visibility column';
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='ledger access is org-scoped; the ledger RLS lane never reads visibility';
  ELSIF v_is_listed OR v_shareable THEN status:='FAIL'; detail:='listed/shareable entity requires visibility enum';
  ELSE status:='WARN'; detail:='no visibility enum (add + migrate is_public)'; END IF; RETURN NEXT;

  check_name:='legacy_org_id'; status:=CASE WHEN l_orgid THEN 'FAIL' ELSE 'PASS' END; detail:=CASE WHEN l_orgid THEN 'legacy org_id present; drop it' END; RETURN NEXT;
  check_name:='legacy_owner_col';
  IF v_variant='personal' THEN
    status:=CASE WHEN l_owner THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN l_owner THEN 'user_id is the personal access owner' ELSE 'personal variant requires user_id' END;
  ELSE
    status:=CASE WHEN l_owner THEN 'WARN' ELSE 'PASS' END;
    detail:=CASE WHEN l_owner THEN 'user_id/owner_id/author_id/creator_id present; created_by is canonical owner' END;
  END IF;
  RETURN NEXT;
  check_name:='legacy_is_public'; status:=CASE WHEN l_ispub THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_ispub THEN 'is_public present; visibility is the access driver' END; RETURN NEXT;
  check_name:='legacy_is_deleted'; status:=CASE WHEN l_isdel THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_isdel THEN 'is_deleted present; deleted_at is canonical' END; RETURN NEXT;

  check_name:='rls_enabled'; status:=CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END; detail:=NULL; RETURN NEXT;

  -- `platform_admin_all` is emitted by iam.apply_rls for every variant
  -- (2026-08-22, the admin lane). It is canonical, not drift.
  -- EXCEPT where the token declares suppress_platform_admin_lane (SPEC-ACCESS
  -- §3.5, the D19 privacy wall): the generator does not emit it, so expecting it
  -- would FAIL every flipped table. `personal` never had it in the first place.
  IF v_variant='restricted' AND NOT f_vis THEN v_expected:=ARRAY['svc_all'];
  ELSIF v_variant='ledger' THEN v_expected:=ARRAY['svc_all','platform_admin_all','std_select'];
  ELSIF v_variant='personal' THEN v_expected:=ARRAY['svc_all','std_select','std_insert','std_update','std_delete'];
  ELSE v_expected:=ARRAY['svc_all','platform_admin_all','std_select','std_insert','std_update','std_delete'];
       IF v_variant IN ('entity','system','restricted') AND f_vis_enum THEN v_expected:=array_append(v_expected,'pub_read'); END IF;
       -- THE PUBLIC-PARENT ANON LANE (0580): a flagged component table is
       -- generated WITH pub_read, so the expectation must include it.
       IF v_variant='component' AND v_anon_component THEN v_expected:=array_append(v_expected,'pub_read'); END IF; END IF;
  IF v_suppress_admin AND v_variant<>'personal' THEN
    v_expected:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT 'platform_admin_all');
  END IF;
  v_unexpected:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(v_expected));
  v_missing:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT unnest(COALESCE(v_polnames,'{}')));
  check_name:='policies_canonical';
  IF v_missing='{}' AND v_unexpected='{}' THEN status:='PASS'; detail:=NULL; ELSE status:='FAIL'; detail:=format('missing=%s legacy/unexpected=%s',v_missing,v_unexpected); END IF; RETURN NEXT;

  -- 🚨 DD-147 (2026-09-12) — THE GENERATOR KEEPS WHAT IT DID NOT AUTHOR, SO SOMETHING HAS TO SAY
  -- WHAT IT KEPT. Until today `iam.apply_rls` dropped EVERY policy on a table before regenerating,
  -- bespoke ones included: in the B-30 rehearsal it removed the signed-out invitation-request lanes
  -- and two migrations put them back by hand. The generator now drops only the names it authors
  -- (`iam.generated_policy_names()`), which means a hand-written policy SURVIVES a regeneration —
  -- and a surviving door that nothing generated and nothing certifies must never be silent.
  -- WARN, not FAIL: a bespoke policy is not by itself a defect (the vault, the anon share-link
  -- resolver and the signed-out invitation lanes are all deliberate). `policies_canonical` above
  -- already FAILs a table whose policy SET is wrong. This check exists to NAME them.
  check_name:='bespoke_policy_present';
  v_bespoke:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(iam.generated_policy_names()));
  IF v_bespoke='{}' THEN status:='PASS'; detail:=NULL;
  ELSE status:='WARN';
    detail:=format('%s policy/policies here were NOT authored by iam.apply_rls and are PRESERVED across regeneration: %s. Each is a live door the class regime never emitted and iam.verify_canonical cannot certify. Fold it into the class and name it in iam.supersede_bespoke_policies(...) with a reason, or state why it must stay.',
                   cardinality(v_bespoke), array_to_string(v_bespoke,', '));
  END IF; RETURN NEXT;

  -- THE PRIVACY WALL GATE (SPEC-ACCESS §3.5). Emitted ONLY for a token that
  -- declares the flag, so an unflagged table's finding set is byte-for-byte what
  -- it was. A wall that is only written down is a wall that a regeneration
  -- quietly removes; this is the check that makes it stay up.
  IF v_suppress_admin THEN
    check_name:='privacy_wall';
    IF v_variant='personal' THEN status:='PASS'; detail:='personal variant never had a platform-admin lane';
    ELSIF 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}')) THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but platform_admin_all exists — re-run iam.apply_rls';
    ELSIF COALESCE(v_sel,'') LIKE '%is_platform_admin%' OR COALESCE(v_sel,'') LIKE '%is_super_admin%' THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but std_select still carries a platform-staff arm — re-run iam.apply_rls';
    ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;
  END IF;

  -- 🚨 THE PERSONAL-ROW WALL (DD-165, 2026-09-12). The CLASS decides which lanes a table emits;
  -- a ROW's `visibility` only narrows them. Before this check, `note` (workbench.notes) was classed
  -- `organization`, kept `platform_admin_all`, and 137 of 4,166 rows marked `personal` by the person
  -- who wrote them were readable by any platform admin — measured, V-43 §A. The class regime had no
  -- opinion about it and nothing FAILed. Arman, 2026-09-12: an admin cannot read a person's private
  -- data. So on every classed table that carries a real `platform.visibility` column and still has a
  -- staff lane, each staff arm must be emitted in its WALLED form — `visibility >= 'internal'` AND
  -- the staff predicate — and this check FAILs when one is not.
  --
  -- What it deliberately does NOT assert: the system-org arm
  -- `(organization_id in (select organization_id from iam.system_orgs where global_readable) and
  --  is_super_admin())`, which `iam.entity_read_expr` mirrors from `iam.has_access_for_base`. That
  -- arm can only ever match a row owned by a global_readable SYSTEM organization — platform content,
  -- never a customer's person — and walling the mirror alone would change no access at all while the
  -- kernel's own copy stayed open, i.e. a wall that only LOOKS like one. 8 rows live behind it today
  -- and they are named in the DD-165 report rather than hidden here. It is recognised by the
  -- `system_orgs` reference in the same expression.
  IF f_vis_enum AND NOT v_suppress_admin AND v_variant <> 'personal' THEN
    check_name:='personal_row_wall';
    DECLARE
      w_admin constant text := '(visibility >= ''internal''::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)';
      w_super constant text := '(visibility >= ''internal''::platform.visibility) AND is_super_admin()';
      r_pol record; v_rest text; v_bad text := NULL; v_admin_ok boolean := NULL;
    BEGIN
      FOR r_pol IN
        SELECT p.polname,
               regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '\s+', ' ', 'g') AS q
          FROM pg_policy p
         WHERE p.polrelid = v_tbl AND p.polpermissive
         ORDER BY p.polname
      LOOP
        IF r_pol.polname = 'platform_admin_all' THEN
          v_admin_ok := position(w_admin in r_pol.q) > 0;
        END IF;
        v_rest := replace(replace(r_pol.q, w_admin, ''), w_super, '');
        IF v_rest LIKE '%is_platform_admin%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname || ' carries an UNWALLED platform-admin arm';
        ELSIF v_rest LIKE '%is_super_admin%' AND r_pol.q NOT LIKE '%system_orgs%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname || ' carries an UNWALLED super-admin arm';
        END IF;
      END LOOP;
      IF v_admin_ok IS FALSE THEN
        v_bad := coalesce(v_bad || '; ', '') || 'platform_admin_all USING does not exclude visibility=''personal''';
      END IF;
      IF v_bad IS NULL THEN status:='PASS'; detail:=NULL;
      ELSE status:='FAIL';
        detail:= v_bad || ' — a personal row stays personal inside an organization-class table (DD-165); re-run iam.apply_rls';
      END IF;
    END;
    RETURN NEXT;
  END IF;

  -- 🚨 A COMPONENT LANE IS NEVER WIDER THAN ITS PARENT'S READ (DD-175, 2026-09-12).
  -- A component has no class and no owner column of its own: its access IS its parent's
  -- (db-rules §6d-1). So every door a signed-in client can use on a component table must go
  -- through the parent. Measured live before this check existed: arman@titaniumsuccess.com read
  -- 2,313 docproc.processed_document_pages whose processed_document its own policy refuses, and
  -- admin@admin.com read 106 udt_document_snapshots through a `platform_admin_all` policy sitting
  -- beside a lane that had nothing to do with the parent.
  IF v_variant = 'component' THEN
    DECLARE
      r_pol record; v_bad text := NULL; v_any_parent boolean := false; v_rls boolean;
    BEGIN
      SELECT EXISTS (SELECT 1 FROM platform.entity_relationships er
                      JOIN platform.entity_types pt ON pt.token = er.parent_type AND pt.is_active
                     WHERE er.child_type = p_token AND er.kind IN ('composition','containment')
                       AND EXISTS (SELECT 1 FROM information_schema.columns c
                                    WHERE c.table_schema = p_schema AND c.table_name = p_table
                                      AND c.column_name = er.fk_column))
        INTO v_any_parent;
      IF v_any_parent THEN
        SELECT cl.relrowsecurity INTO v_rls
          FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
         WHERE ns.nspname = p_schema AND cl.relname = p_table;
        IF NOT COALESCE(v_rls, false) THEN
          v_bad := 'row security is DISABLED on the table — every signed-in client reads every row, '
                || 'which is the widest lane a component can have';
        ELSE
          FOR r_pol IN
            SELECT pol.polname,
                   regexp_replace(COALESCE(pg_get_expr(pol.polqual, pol.polrelid),'true'),'\s+',' ','g') AS q
              FROM pg_policy pol
              JOIN pg_class cl ON cl.oid = pol.polrelid
              JOIN pg_namespace ns ON ns.oid = cl.relnamespace
             WHERE ns.nspname = p_schema AND cl.relname = p_table
               AND pol.polpermissive AND pol.polcmd IN ('r','*')
               AND NOT EXISTS (SELECT 1 FROM unnest(pol.polroles) rr JOIN pg_roles ro ON ro.oid = rr
                                WHERE ro.rolname = 'service_role')
             ORDER BY pol.polname
          LOOP
            IF EXISTS (
              SELECT 1 FROM platform.entity_relationships er
                JOIN platform.entity_types pt ON pt.token = er.parent_type AND pt.is_active
               WHERE er.child_type = p_token AND er.kind IN ('composition','containment')
                 AND EXISTS (SELECT 1 FROM information_schema.columns c
                              WHERE c.table_schema = p_schema AND c.table_name = p_table
                                AND c.column_name = er.fk_column)
                 AND (r_pol.q LIKE '%accessible_entity_ids(''' || er.parent_type || '''%'
                   OR r_pol.q LIKE '%has_access(''' || er.parent_type || '''%'
                   OR r_pol.q LIKE '%' || pt.schema_name || '.' || pt.table_name || '%')
            ) THEN
              CONTINUE;
            END IF;
            IF (iam.class_lanes(p_token)).platform_admin_lane
               AND (r_pol.q LIKE '%is_platform_admin%' OR r_pol.q LIKE '%is_super_admin%') THEN
              CONTINUE;  -- the staff lane this token's class still keeps
            END IF;
            v_bad := COALESCE(v_bad || '; ', '') || r_pol.polname
                  || ' is a readable door that never asks the parent';
          END LOOP;
          IF NOT EXISTS (SELECT 1 FROM pg_policy pol
                           JOIN pg_class cl ON cl.oid = pol.polrelid
                           JOIN pg_namespace ns ON ns.oid = cl.relnamespace
                          WHERE ns.nspname = p_schema AND cl.relname = p_table
                            AND pol.polpermissive AND pol.polcmd IN ('r','*')
                            AND NOT EXISTS (SELECT 1 FROM unnest(pol.polroles) rr JOIN pg_roles ro ON ro.oid = rr
                                             WHERE ro.rolname = 'service_role')) THEN
            v_bad := COALESCE(v_bad || '; ', '')
                  || 'no permissive read policy for a signed-in client exists at all';
          END IF;
        END IF;
        check_name := 'component_not_wider_than_parent';
        IF v_bad IS NULL THEN status := 'PASS'; detail := NULL;
        ELSE status := 'FAIL';
          detail := v_bad || ' — a component''s access IS its parent''s (db-rules §6d-1, DD-175); '
                 || 'every readable door must resolve the parent. Re-run iam.apply_rls.';
        END IF;
        RETURN NEXT;
      END IF;
    END;
  END IF;

  -- 🚨 CONTAINMENT NEVER CARRIES A PERSONAL ROW (DD-171, 2026-09-12). DD-165 walled every STAFF
  -- arm; it never touched containment, so a child row still inherited its container's reach with no
  -- look at its own visibility. Measured live before this round: a PLAIN MEMBER — no admin.admins
  -- row, no org-admin role — read 8,815 other people's `personal` files, because files.files'
  -- parent-folder arm admitted any non-public file once the folder was viewer-accessible.
  -- Chair, 2026-09-12: a personal row is reachable only by its owner and by explicit direct grants
  -- ON THAT ROW; containment carries the container's reach to `internal` and above, never to
  -- `personal`. So on a table that carries a typed visibility column AND a composition/containment
  -- parent, the emitted parent-FK arm must read `visibility >= 'internal'`, and this check FAILs
  -- when it reads the old `visibility IS NOT NULL` instead (every enum value except public —
  -- `personal` included) or when the walled arm is missing altogether.
  IF f_vis_enum AND v_variant <> 'component' AND v_variant <> 'personal' THEN
    DECLARE
      r_rel record; v_q text; v_bad text := NULL; v_seen boolean := false;
    BEGIN
      v_q := regexp_replace(COALESCE(v_sel,''), '\s+', ' ', 'g');
      FOR r_rel IN
        SELECT er.parent_type, er.fk_column
          FROM platform.entity_relationships er
         WHERE er.child_type = p_token AND er.kind IN ('composition','containment')
           AND EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema = p_schema AND c.table_name = p_table
                          AND c.column_name = er.fk_column)
         ORDER BY er.parent_type, er.fk_column
      LOOP
        v_seen := true;
        IF v_q LIKE '%(' || r_rel.fk_column || ' IS NOT NULL) AND (visibility IS NOT NULL) AND (visibility <> ''public''%' THEN
          v_bad := COALESCE(v_bad || '; ', '') || r_rel.fk_column
                || ' carries the UNWALLED containment arm (admits visibility=''personal'')';
        ELSIF v_q NOT LIKE '%(' || r_rel.fk_column || ' IS NOT NULL) AND (visibility >= ''internal''::platform.visibility) AND (visibility <> ''public''%' THEN
          v_bad := COALESCE(v_bad || '; ', '') || r_rel.fk_column
                || ' has no walled containment arm at all';
        END IF;
      END LOOP;
      IF v_seen THEN
        check_name := 'containment_respects_personal';
        IF v_bad IS NULL THEN status := 'PASS'; detail := NULL;
        ELSE status := 'FAIL';
          detail := v_bad || ' — containment never carries a personal row (DD-171); re-run iam.apply_rls';
        END IF;
        RETURN NEXT;
      END IF;
    END;
  END IF;

  -- THE PUBLIC-PARENT ANON LANE GATE (0580). Same shape as the privacy wall,
  -- opposite direction: emitted ONLY for a flagged component token, so every
  -- unflagged table's finding set is byte-for-byte what it was. The lane that
  -- is only written down is a lane the next regeneration quietly drops; this
  -- check makes it stay up, and makes it stay CORRECT (keyed on the parent's
  -- public visibility, never a blanket read).
  IF v_anon_component AND v_variant='component' THEN
    check_name:='component_public_read';
    IF NOT ('pub_read'=ANY(COALESCE(v_polnames,'{}'))) THEN status:='FAIL';
      detail:='component_anon_read_via_public_parent=true but pub_read is missing — re-run iam.apply_rls';
    ELSIF COALESCE(v_pub,'') NOT LIKE '%visibility = ''public''%' THEN status:='FAIL';
      detail:='pub_read exists but is not keyed on the parent''s visibility=public — re-run iam.apply_rls';
    ELSIF NOT has_table_privilege('anon', v_tbl, 'SELECT') THEN status:='FAIL';
      detail:='pub_read exists but anon has no SELECT grant — the policy is unreachable; re-run iam.apply_rls';
    ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;
  END IF;

  IF v_variant IN ('entity','system') THEN
    check_name:='policy_owner_shortcircuit'; status:=CASE WHEN v_sel LIKE v_owner_pat THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE v_owner_pat THEN NULL ELSE 'std_select missing created_by short-circuit (42501 risk)' END; RETURN NEXT;
    check_name:='policy_uses_has_access'; status:=CASE WHEN v_sel LIKE '%has_access('''||p_token||'''%' THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE '%has_access('''||p_token||'''%' THEN NULL ELSE format('std_select does not call has_access(%L)',p_token) END; RETURN NEXT;
    check_name:='pub_read_anon';
      IF f_vis_enum THEN status:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN NULL ELSE 'missing anon visibility=public policy' END;
      ELSE status:='SKIP'; detail:='no visibility column'; END IF; RETURN NEXT;
    IF v_variant='system' THEN
      check_name:='policy_system_public_read'; status:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN 'PASS' ELSE 'FAIL' END;
        detail:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN NULL ELSE 'system variant std_select must pass visibility=public (authenticated catalog reads)' END; RETURN NEXT;
    END IF;
  ELSIF v_variant='personal' THEN
    check_name:='policy_personal_owner_only';
    status:=CASE
      WHEN v_sel LIKE '%user_id%'
       AND v_sel LIKE '%auth.uid%'
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE
      WHEN v_sel LIKE '%user_id%'
       AND v_sel LIKE '%auth.uid%'
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN NULL ELSE 'personal std_select must require user_id=auth.uid and omit platform_admin_all' END;
    RETURN NEXT;
  ELSIF v_variant='component' THEN
    SELECT parent_type,fk_column INTO v_parent_type,v_parent_col FROM platform.entity_relationships WHERE child_type=p_token AND kind='composition' LIMIT 1;
    check_name:='composition_parent'; status:=CASE WHEN v_parent_type IS NOT NULL THEN 'PASS' ELSE 'FAIL' END; detail:=COALESCE(v_parent_type,'no composition edge'); RETURN NEXT;
    check_name:='policy_defers_parent'; status:=CASE WHEN v_parent_type IS NOT NULL AND (v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||p_token||'''%') THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_parent_type IS NOT NULL AND (v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||p_token||'''%') THEN NULL ELSE 'std_select must defer to composition parent' END; RETURN NEXT;
  END IF;

  SELECT resource_type INTO v_reg_rt FROM platform.shareable_resource_registry WHERE table_name=p_table AND schema_name=p_schema AND is_active LIMIT 1;
-- ═══ DD-137b (VISIBILITY-BY-CLASS §3.2 interlock two) — THE CLASS IS RE-DERIVED HERE.
  -- A declaration nothing checks is §1.3's measured price: the registry said one thing and
  -- the policies said another for as long as anyone cared to look.
  DECLARE v_dc platform.data_class; v_ls platform.list_scope; v_lanes platform.lane_set;
  BEGIN
  SELECT et.data_class, et.default_list_scope INTO v_dc, v_ls
    FROM platform.entity_types et WHERE et.token = p_token;
  check_name:='data_class_set';
  -- DD-137b14: a COMPONENT holds NULL and resolves through its parent; a LEDGER holds a class,
  -- because it has no composition parent to resolve through (chair ruling 2026-09-12).
  IF v_variant = 'component' THEN
    status:=CASE WHEN v_dc IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NULL
                 THEN format('resolves to %s through its composition parent (§3.1, DD-137b10)',
                             (iam.class_lanes(p_token)).resolved_class)
                 ELSE 'a component may not hold a data_class of its own — its access IS its parent''s (db-rules §6d-1); iam.class_lanes resolves it upward' END;
  ELSIF v_variant = 'ledger' THEN
    status:=CASE WHEN v_dc IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NOT NULL THEN v_dc::text
                 ELSE 'a ledger has no composition parent, so it must STATE its class — an unset one would have to be guessed, and guessing is how 299 of 311 components kept a platform-staff lane under a private parent (DD-137b10)' END;
  ELSIF v_dc IS NULL THEN status:='FAIL';
    detail:='data_class is unset. Unset is a REFUSAL, not a value (chair R3): iam.apply_rls will not generate for this token and iam.class_lanes resolves it to private.';
  ELSE status:='PASS'; detail:=v_dc::text; END IF; RETURN NEXT;

  check_name:='data_class_derivations';
  IF v_variant = 'personal' AND v_dc IS DISTINCT FROM 'private'::platform.data_class THEN
    status:='FAIL'; detail:=format('§3.1 derivation one: rls_variant=personal emits no org, staff or sharing lane, so the class is private — the registry says %s', v_dc);
  ELSIF v_variant IN ('component','ledger')
        AND (iam.class_lanes(p_token)).resolved_class IN ('private','confidential')
        AND NOT v_suppress_admin THEN
    status:='FAIL'; detail:=format('DD-137b10: this %s resolves to class %s through its ' ||
      'parent, so the platform-staff lane is closed on it too — our own staff go through the ' ||
      'door like anyone. suppress_platform_admin_lane is false.', v_variant,
      (iam.class_lanes(p_token)).resolved_class);
  ELSIF v_dc IN ('private','confidential') AND NOT v_suppress_admin THEN
    status:='FAIL'; detail:=format('§3.1 derivation two: a %s token suppresses the platform-admin lane — our own staff go through the door too. suppress_platform_admin_lane is false.', v_dc);
  ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

  check_name:='default_list_scope_set';
  IF v_variant IN ('component','ledger') THEN
    status:=CASE WHEN v_ls IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_ls IS NULL THEN 'a component has no owner column, so "mine" is not expressible (§3.3)' ELSE 'component/ledger may not hold a default_list_scope' END;
  ELSIF v_ls IS NULL THEN status:='FAIL'; detail:='default_list_scope is unset — the screen has no declared landing place (§3.3)';
  ELSE status:='PASS'; detail:=v_ls::text; END IF; RETURN NEXT;

  check_name:='class_lanes_match_policy';
  -- DD-137b10: a component IS asked, through its resolved parent class. Skipping it here is
  -- what let 299 of 311 components keep a platform-staff lane under a private parent.
  IF v_variant = 'personal' OR v_sel IS NULL THEN
    status:='SKIP'; detail:='std_select is not built by the class-aware mirror on this variant';
  ELSE
    v_lanes := iam.class_lanes(p_token);
    IF NOT v_lanes.org_role_lane AND (v_sel LIKE '%role = ANY (ARRAY[''owner''%' OR v_sel LIKE '%is_org_admin%') THEN
      status:='FAIL'; detail:=format('class %s emits NO organization-role read lane, but std_select carries one — re-run iam.apply_rls', v_lanes.resolved_class);
    ELSIF NOT v_lanes.platform_admin_lane AND (v_sel LIKE '%is_platform_admin%' OR v_sel LIKE '%is_super_admin%') THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but std_select still carries a platform-staff arm — re-run iam.apply_rls', v_lanes.resolved_class);
    ELSIF NOT v_lanes.platform_admin_lane AND 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}')) THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but a ' ||
        'platform_admin_all policy still sits beside std_select — that policy is permissive ' ||
        'and grants everything on its own. Re-run iam.apply_rls.', v_lanes.resolved_class);
    ELSIF NOT v_lanes.anon_lane AND 'pub_read'=ANY(COALESCE(v_polnames,'{}')) AND v_variant<>'system' AND NOT v_anon_component THEN
      status:='WARN'; detail:=format('class %s emits no anonymous lane, but a pub_read policy exists', v_lanes.resolved_class);
    ELSE status:='PASS'; detail:=v_lanes.resolved_class::text; END IF;
  END IF; RETURN NEXT;

  -- 🚨 DD-185 (2026-09-13) — THE §6e SYSTEM-ORGANIZATION ARM IS AN EVERY-SIGNED-IN-USER ARM.
  -- `class_lanes_match_policy` above could not see this one: it keys the organization arms on
  -- `org_role_lane` and `platform_admin_lane`, and the global-readable arm is neither — it is
  -- gated on nothing but the row's organization being a global-readable system org. On a
  -- `confidential` token `org_member_lane` is TRUE, so the mirror's own filter kept the arm and
  -- every check in this function said PASS while a non-member read the rows (measured 0 -> 8 on
  -- `audit_exemption`, B-65; live on hr.earning_code, 24 rows). A lane with no check is a lane
  -- that comes back the next time somebody edits the generator.
  check_name:='system_org_arm_respects_class';
  IF v_variant = 'personal' OR v_sel IS NULL THEN
    status:='SKIP'; detail:='no class-built std_select on this variant';
  ELSIF (iam.class_lanes(p_token)).resolved_class IN ('organization','public') THEN
    status:='PASS';
    detail:=format('class %s: the global-readable system-organization arm is this class''s to carry',
                   (iam.class_lanes(p_token)).resolved_class);
  ELSIF v_sel LIKE '%global_readable%' THEN
    status:='FAIL';
    detail:=format('class %s carries NO global-readable system-organization read arm — that arm '
      || 'admits every signed-in account with no membership, role or grant — but std_select still '
      || 'has one. Re-run iam.apply_rls (DD-185).', (iam.class_lanes(p_token)).resolved_class);
  ELSE status:='PASS'; detail:=format('class %s: arm absent', (iam.class_lanes(p_token)).resolved_class);
  END IF; RETURN NEXT;
  END;

  -- 🚨 DD-180 (2026-09-13) — THE SUPER-ADMIN SYSTEM-ORGANIZATION ARM HONOURS A PERSONAL ROW.
  -- DD-165 walled every platform-staff READ arm behind `visibility >= 'internal'` except ONE, and
  -- named it rather than hiding it: the db-rules §6e global-readable system-organization arm gated
  -- on `public.is_super_admin()`. DD-170 walled that arm in the two places that DECIDE the read —
  -- the kernel `iam.has_access_for_base` and the mirror `iam.entity_read_expr` — and regenerated the
  -- four tables that actually held a `personal` row under a system org. But a live policy is TEXT,
  -- written at generation time: 333 `std_select` policies went on carrying the UNWALLED arm, 171 of
  -- them on a table that carries a real `platform.visibility` column and could therefore hold a
  -- `personal` row tomorrow. Measured 2026-09-13: ZERO personal rows sit under a global-readable
  -- system organization today, which is the only reason those 171 exposed nothing — and a mechanism
  -- that is safe only because of what the data happens to be right now is not safe.
  --
  -- `personal_row_wall` cannot see this arm: it exempts, by name, every policy whose expression
  -- mentions `system_orgs` (its own comment says so, and said why — walling the mirror while the
  -- kernel stayed open would have been a wall that only looked like one). DD-170 closed the kernel,
  -- so the exemption has no reason left to exist. THIS CHECK IS THAT EXEMPTION REMOVED: on every
  -- table with a typed `platform.visibility` column it takes each permissive read policy, subtracts
  -- the two WALLED super-admin forms the generator emits, and FAILs on any `is_super_admin` left
  -- over — whichever arm it belongs to and however it is spelled.
  IF f_vis_enum AND v_variant <> 'personal' THEN
    check_name:='super_admin_system_org_arm_walled';
    DECLARE
      -- the walled §6e arm as `iam.entity_read_expr` emits it (entity / system / component)
      w_sysorg constant text := '(organization_id IS NOT NULL) AND (visibility >= ''internal''::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin) AND (organization_id IN ( SELECT so.organization_id FROM iam.system_orgs so WHERE so.global_readable))';
      -- the walled plain super-admin arm `iam._apply_rls_unchecked` emits (restricted / ledger), DD-165
      w_plain constant text := '(visibility >= ''internal''::platform.visibility) AND is_super_admin()';
      r_pol record; v_rest text; v_bad text := NULL;
    BEGIN
      FOR r_pol IN
        SELECT p.polname,
               regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '\s+', ' ', 'g') AS q
          FROM pg_policy p
         WHERE p.polrelid = v_tbl AND p.polpermissive AND p.polcmd IN ('r','*')
         ORDER BY p.polname
      LOOP
        v_rest := replace(replace(r_pol.q, w_sysorg, ''), w_plain, '');
        IF v_rest LIKE '%is_super_admin%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname;
        END IF;
      END LOOP;
      IF v_bad IS NULL THEN status:='PASS'; detail:=NULL;
      ELSE status:='FAIL';
        detail:=format('%s carries a super-admin read arm with no `visibility >= ''internal''` wall. '
          || 'A super admin reads a person''s `personal` row the moment one lands under a '
          || 'global-readable system organization (DD-180). Re-run iam.apply_rls.', v_bad);
      END IF;
    END;
    RETURN NEXT;
  END IF;

  check_name:='sharing_token';
  IF v_reg_rt IS NULL THEN status:='SKIP'; detail:='not in shareable_resource_registry';
  ELSIF v_reg_rt=p_token THEN status:='PASS'; detail:=NULL;
  ELSE status:='FAIL'; detail:=format('registry resource_type=%s != token=%s',v_reg_rt,p_token); END IF; RETURN NEXT;
END;

$function$

;

-- ═══ C. THE THREE DOORS ═══════════════════════════════════════════════════════════════════════

select iam.supersede_bespoke_policies(
  'platform', 'activity_log', array['std_select'],
  'DD-204 (2026-09-14). A class-regime read lane on ACCESS MACHINERY, generated by '
  'SELECT iam.apply_rls(''platform'',''activity_log'',''activity'',''ledger'') in '
  'migrations/iam_hoist_has_org_access_set_wise_d146.sql on 2026-08-15 — nine days before the '
  'ruling that made iam.apply_rls refuse a machinery token, so nothing has regenerated it since '
  'and nothing ever will. It served NO reader: censused across matrx-frontend, aidream, '
  'matrx-local and matrx-extend, every client read of platform.activity_log goes through the '
  'service role (svc_all) or a SECURITY DEFINER RPC that bypasses RLS — admin_recent_activity for '
  'the admin events viewer, log_activity for writes, the three files.webhook_* functions, '
  'access_request_report. What it DID grant, measured as test@test.com in a rolled-back '
  'transaction, was 1,098 rows of another member''s audit trail; the table''s metadata column is '
  'producer-defined and carries ip_address, claim_token, session_id, provider_account_id, '
  'provider_media_url and content hashes. Platform admins keep the whole table through '
  'platform_admin_all, the service role through svc_all, and the admin UI through '
  'public.admin_recent_activity. If an organization-facing activity feed is ever built, it comes '
  'back as a bespoke, attributed policy of record with a bounded predicate, or as a definer RPC — '
  'not as a generated lane nobody re-read.');

select iam.supersede_bespoke_policies(
  'platform', 'repo', array['repo_read'],
  'DD-204 (2026-09-14). USING (true) FOR SELECT TO authenticated on the platform''s own repository '
  'registry — 32 rows of slug + github_full_name naming this organization''s GitHub repositories, '
  'most of them private, and the registry row classes the table confidential. DD-172 recorded it '
  'as KEEP with the reason "Reference data whose read the admin surfaces depend on"; that read is '
  'served without it. The ONE client reader is features/admin/agent-review/registry.ts at '
  '/administration/users/agent-review, behind the (admin) layout gate, and every row of '
  'admin.admins satisfies public.is_platform_admin() — so platform_admin_all already admits '
  'exactly the population that can reach the surface, while repo_read additionally handed the '
  'catalogue to every other signed-in account. aidream''s mandate reference board and '
  'matrx-mandate-scan read this table as postgres through the Matrx ORM and never see RLS. '
  'Superseded rather than left standing because a door beside the door that actually gates it is '
  'not a door, it is a hole nobody is looking at.');

-- The registry row's data_class stays `confidential` — correct, and now true of the live door set
-- as well. Only the REASON changes: it carried DD-159 batch 3's machinery boilerplate, which
-- described the audit_class and never said a word about what is in the table. data_class is
-- untouched, so `_entity_types_class_regenerates` short-circuits on its first line and no
-- regeneration is attempted (which on machinery would only raise a notice anyway).
update platform.entity_types
   set data_class_reason =
     'DD-204 (2026-09-14): the platform''s own repository registry — one row per Matrx repository, '
     'holding slug, github_full_name and is_active, most of them PRIVATE repositories. Internal '
     'infrastructure inventory: no person, organization or customer content, and equally not '
     'published reference data. `confidential` is correct and is now what the live door set says '
     'too — the unconditional signed-in read (`repo_read`) was superseded by this file, leaving '
     'platform_admin_all, which is exactly the population that can reach the one client surface '
     'reading this table (/administration/users/agent-review, behind the (admin) gate). The '
     'previous reason here was DD-159 batch 3 boilerplate describing the audit_class rather than '
     'the contents. audit_class stays machinery: iam.apply_rls still refuses this token.'
 where token = 'platform_repo' and schema_name = 'platform' and table_name = 'repo';

do $dd204_repo_reason$
declare v_n integer;
begin
  select count(*) into v_n from platform.entity_types
   where token = 'platform_repo' and data_class = 'confidential'
     and data_class_reason like 'DD-204%';
  if v_n <> 1 then
    raise exception 'DD-204: the platform_repo registry row did not take the corrected data_class_reason (matched % row(s)). Nothing about its class was meant to move.', v_n;
  end if;
end
$dd204_repo_reason$;

-- platform.edge_payload_kind is deliberately NOT touched. Its policy stays, its grant stays, its
-- registry row already declares data_class='public' with DD-163's written reason, and the
-- certifier amendment above is what turns that declaration into a PASS instead of a FAIL. This
-- file asserts the declaration is really there rather than assuming it.
do $dd204_epk$
declare v_class text; v_reason text;
begin
  select data_class, data_class_reason into v_class, v_reason
    from platform.entity_types where token = 'edge_payload_kind';
  if v_class is distinct from 'public' or coalesce(btrim(v_reason),'') = '' then
    raise exception 'DD-204: platform.edge_payload_kind is kept as a DECLARED public catalogue, but its registry row reads data_class=% with reason %. Without the written declaration the certifier is right to FAIL it and this file must not pretend otherwise.',
      coalesce(v_class,'<unset>'), coalesce(nullif(btrim(v_reason),''),'<blank>');
  end if;
end
$dd204_epk$;

-- ═══ D. THE FORCING TEST — both class fixes, RED then GREEN, on this live database ════════════
do $dd204_forcing$
declare
  c_tok    constant text := 'dd204_forcing_probe';
  c_reason constant text := 'DD-204 forcing probe: a scratch machinery token that exists for the length of this migration only.';
  v_st     text;
  v_dt     text;
  v_n      integer;
  v_raised text;
begin
  -- CREATE POLICY … TO authenticated registers a shared dependency on the role, which any
  -- concurrent GRANT anywhere on this database contends for; the file's 4s budget (right for a
  -- LIVE table) is not right for that wait. Raised for the scratch object only and restored below.
  perform set_config('lock_timeout', '30s', true);

  -- ── a clean slate, so this file is re-runnable ───────────────────────────────────────────────
  delete from platform.entity_types where token = c_tok;
  delete from iam.superseded_policy where schema_name = 'dd204_forcing';
  drop schema if exists dd204_forcing cascade;

  create schema dd204_forcing;
  -- No foreign key: an FK to a hot shared table makes this transaction hold a lock on it for the
  -- length of the block and deadlocks against the schema-cache introspection our own DDL wakes
  -- (measured by B-93, 40P01, twice). Nothing the machinery contract reads is a column value.
  create table dd204_forcing.probe (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
  );
  alter table dd204_forcing.probe enable row level security;

  insert into platform.entity_types
    (token, schema_name, table_name, label, rls_variant, audit_class, audit_class_reason,
     is_active, is_versioned, has_soft_delete, is_listed, is_component)
  values
    (c_tok, 'dd204_forcing', 'probe', 'DD-204 forcing probe', 'entity', 'machinery', c_reason,
     true, false, false, false, false);
  update platform.entity_types
     set data_class = 'confidential',
         data_class_reason = 'DD-204 forcing probe: deliberately NOT a public declaration.'
   where token = c_tok;

  -- ── GREEN 0: no client read policy at all → the check passes ─────────────────────────────────
  select vc.status into v_st from iam.verify_canonical('dd204_forcing','probe',c_tok) vc
   where vc.check_name = 'machinery_no_client_grant';
  if v_st is distinct from 'PASS' then
    raise exception 'DD-204 forcing test GREEN 0 failed: a machinery probe with no client read policy reported machinery_no_client_grant=%, expected PASS', coalesce(v_st,'<no row>');
  end if;

  -- ── RED 1: an UNDECLARED unconditional client read ───────────────────────────────────────────
  create policy dd204_probe_read on dd204_forcing.probe for select to authenticated using (true);
  select vc.status, vc.detail into v_st, v_dt from iam.verify_canonical('dd204_forcing','probe',c_tok) vc
   where vc.check_name = 'machinery_no_client_grant';
  if v_st is distinct from 'FAIL' then
    raise exception 'DD-204 forcing test RED 1 did not fire: a USING (true) client read policy on a machinery table classed confidential reported machinery_no_client_grant=%, expected FAIL', coalesce(v_st,'<no row>');
  end if;
  if v_dt not like '%data_class%' then
    raise exception 'DD-204 forcing test RED 1: the FAIL does not tell the reader how to declare a public catalogue. detail was: %', v_dt;
  end if;

  -- ── RED 2: data_class='public' with a BLANK reason is NOT a declaration ──────────────────────
  update platform.entity_types set data_class = 'public', data_class_reason = '   ' where token = c_tok;
  select vc.status into v_st from iam.verify_canonical('dd204_forcing','probe',c_tok) vc
   where vc.check_name = 'machinery_no_client_grant';
  if v_st is distinct from 'FAIL' then
    raise exception 'DD-204 forcing test RED 2 did not fire: data_class=public with a WHITESPACE data_class_reason reported machinery_no_client_grant=%, expected FAIL. A declaration nobody wrote is not a declaration.', coalesce(v_st,'<no row>');
  end if;

  -- ── GREEN 1: the declaration written → PASS, and the detail NAMES the door ───────────────────
  update platform.entity_types
     set data_class_reason = 'DD-204 forcing probe: a published catalogue with no person, organization or customer content in it.'
   where token = c_tok;
  select vc.status, vc.detail into v_st, v_dt from iam.verify_canonical('dd204_forcing','probe',c_tok) vc
   where vc.check_name = 'machinery_no_client_grant';
  if v_st is distinct from 'PASS' then
    raise exception 'DD-204 forcing test GREEN 1 failed: a DECLARED public machinery catalogue reported machinery_no_client_grant=%, expected PASS', coalesce(v_st,'<no row>');
  end if;
  if v_dt not like '%dd204_probe_read%' or v_dt not like '%DECLARED%' then
    raise exception 'DD-204 forcing test GREEN 1: the PASS hides the live door instead of naming it. detail was: %', v_dt;
  end if;

  -- ── RED 3: a public declaration NEVER buys signed-out reach ──────────────────────────────────
  grant select on dd204_forcing.probe to anon;
  select vc.status into v_st from iam.verify_canonical('dd204_forcing','probe',c_tok) vc
   where vc.check_name = 'machinery_no_client_grant';
  if v_st is distinct from 'FAIL' then
    raise exception 'DD-204 forcing test RED 3 did not fire: a DECLARED public machinery table with an anon SELECT grant reported machinery_no_client_grant=%, expected FAIL. Machinery is an input the access resolver reads; a signed-out reader of it is wrong whatever the contents are.', coalesce(v_st,'<no row>');
  end if;
  revoke select on dd204_forcing.probe from anon;
  drop policy dd204_probe_read on dd204_forcing.probe;

  -- ── RED 4: supersede still REFUSES a class-regime name on a NON-machinery token ──────────────
  create policy std_select on dd204_forcing.probe for select to authenticated using (true);
  update platform.entity_types set audit_class = 'entity', audit_class_reason = null where token = c_tok;
  v_raised := null;
  begin
    perform iam.supersede_bespoke_policies('dd204_forcing','probe',array['std_select'],
      'DD-204 forcing test: this call must be REFUSED because the token is not machinery and a regeneration would replace the lane.');
  exception when others then v_raised := sqlerrm;
  end;
  if v_raised is null then
    raise exception 'DD-204 forcing test RED 4 did not fire: supersede_bespoke_policies accepted std_select on a NON-machinery token. The old refusal must survive this change everywhere the generator can still run.';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'dd204_forcing.probe'::regclass and polname = 'std_select') then
    raise exception 'DD-204 forcing test RED 4: the refusal raised but the policy is gone. A refusal that still drops is worse than no refusal.';
  end if;

  -- ── GREEN 2: on a machinery token it is ACCEPTED and RECORDED ────────────────────────────────
  update platform.entity_types set audit_class = 'machinery', audit_class_reason = c_reason where token = c_tok;
  perform iam.supersede_bespoke_policies('dd204_forcing','probe',array['std_select'],
    'DD-204 forcing test: a class-regime lane on access machinery, which iam.apply_rls refuses by construction, so no regeneration will ever replace it and the recorded removal path is the only honest way out.');
  if exists (select 1 from pg_policy where polrelid = 'dd204_forcing.probe'::regclass and polname = 'std_select') then
    raise exception 'DD-204 forcing test GREEN 2 failed: supersede_bespoke_policies returned but std_select is still live on the probe.';
  end if;
  select count(*) into v_n from iam.superseded_policy
   where schema_name = 'dd204_forcing' and table_name = 'probe' and policy_name = 'std_select';
  if v_n <> 1 then
    raise exception 'DD-204 forcing test GREEN 2 failed: the supersession recorded % row(s) in iam.superseded_policy, expected exactly 1. A removal nobody wrote down is the defect DD-147 closed.', v_n;
  end if;

  -- ── RED 5: the platform-wide lanes stay refused, machinery or not ────────────────────────────
  create policy platform_admin_all on dd204_forcing.probe for all to authenticated using (true) with check (true);
  v_raised := null;
  begin
    perform iam.supersede_bespoke_policies('dd204_forcing','probe',array['platform_admin_all'],
      'DD-204 forcing test: this call must be REFUSED — platform_admin_all is a platform-wide lane its own migration put on hundreds of tables, machinery included.');
  exception when others then v_raised := sqlerrm;
  end;
  if v_raised is null then
    raise exception 'DD-204 forcing test RED 5 did not fire: supersede_bespoke_policies dropped platform_admin_all on a machinery token. Only the class-regime lanes may go this way.';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'dd204_forcing.probe'::regclass and polname = 'platform_admin_all') then
    raise exception 'DD-204 forcing test RED 5: the refusal raised but the staff lane is gone.';
  end if;

  -- ── every trace of the probe removed ─────────────────────────────────────────────────────────
  delete from platform.entity_types where token = c_tok;
  delete from iam.superseded_policy where schema_name = 'dd204_forcing';
  drop schema dd204_forcing cascade;
  if exists (select 1 from platform.entity_types where token = c_tok)
     or exists (select 1 from iam.superseded_policy where schema_name = 'dd204_forcing')
     or to_regclass('dd204_forcing.probe') is not null then
    raise exception 'DD-204 forcing test failed to clean itself up';
  end if;

  perform set_config('lock_timeout', '4s', true);
  raise notice 'DD-204 forcing test: 5 RED limbs fired, 3 GREEN limbs passed, probe removed.';
end
$dd204_forcing$;

-- ═══ E. THE LIVE STATE THIS FILE LEAVES ═══════════════════════════════════════════════════════
-- DD-200's file asserted that three named machinery FAILs were the only ones. This file replaces
-- that assertion with the one it was aiming at: ZERO. It raises naming any machinery token that
-- FAILs for any reason at all, so the next lane that meets one knows it is new.
do $dd204_state$
declare r record; v_bad text := null; v_n integer := 0;
begin
  for r in
    select et.token, vc.check_name, vc.detail
      from platform.entity_types et
      cross join lateral iam.verify_canonical(et.schema_name, et.table_name, et.token) vc
     where et.is_active and et.audit_class = 'machinery' and vc.status = 'FAIL'
     order by et.token, vc.check_name
  loop
    v_bad := coalesce(v_bad || '; ', '') || r.token || '/' || r.check_name || ' — ' || left(coalesce(r.detail,''), 200);
  end loop;
  if v_bad is not null then
    raise exception 'DD-204: access machinery still carries a client lane nobody explained — %. DD-204 closed the three DD-200 found; a fourth is a new door and must be read, not recorded away.', v_bad;
  end if;
  select count(*) into v_n from platform.entity_types where is_active and audit_class = 'machinery';
  raise notice 'DD-204: % active machinery tokens, ZERO FAILs from iam.verify_canonical. Access machinery carries no unexplained client lane.', v_n;
end
$dd204_state$;

-- ═══ F. THE TWO DOORS ARE GONE AND THE REMOVAL IS WRITTEN DOWN ════════════════════════════════
do $dd204_closed$
declare v_n integer;
begin
  if exists (select 1 from pg_policy where polrelid = 'platform.activity_log'::regclass and polname = 'std_select') then
    raise exception 'DD-204: std_select is still live on platform.activity_log.';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'platform.repo'::regclass and polname = 'repo_read') then
    raise exception 'DD-204: repo_read is still live on platform.repo.';
  end if;
  select count(*) into v_n from iam.superseded_policy
   where (schema_name, table_name, policy_name) in
         (('platform','activity_log','std_select'), ('platform','repo','repo_read'));
  if v_n <> 2 then
    raise exception 'DD-204: % of the 2 removals are recorded in iam.superseded_policy. A door that leaves with nothing written down is the defect, not the fix.', v_n;
  end if;
  -- The lanes that must SURVIVE both removals.
  if not exists (select 1 from pg_policy where polrelid = 'platform.activity_log'::regclass and polname = 'platform_admin_all')
     or not exists (select 1 from pg_policy where polrelid = 'platform.activity_log'::regclass and polname = 'svc_all')
     or not exists (select 1 from pg_policy where polrelid = 'platform.repo'::regclass and polname = 'platform_admin_all') then
    raise exception 'DD-204: a lane that had to survive this file is missing — platform_admin_all/svc_all on platform.activity_log, or platform_admin_all on platform.repo.';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'platform.edge_payload_kind'::regclass and polname = 'edge_payload_kind_read') then
    raise exception 'DD-204: edge_payload_kind_read was KEPT by this file and is not live.';
  end if;
  raise notice 'DD-204: both doors closed and recorded; the declared public catalogue and every staff/service lane intact.';
end
$dd204_closed$;
