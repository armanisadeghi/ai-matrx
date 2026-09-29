-- chair-step: replaces the certifier body (iam.verify_canonical), whose text only READS privileges named TRUNCATE; no table is truncated and no policy statement runs in this file; no freeze.
-- lane: access-ladder T-33e — the canonical certifier expects the org_open_gate policy the generator emits, exactly.
-- based-on: iam.verify_canonical(text, text, text, text) d5aa304bd1ec0e48249452f83c6f2edafd0b68309b9bb0241fc805b9b2e9c807
--
-- T-33b made iam._apply_rls_unchecked emit a RESTRICTIVE org_open_gate policy on every table
-- iam.org_open_gate_applies() names (853 live), but iam.verify_canonical never learned it, so
-- policies_canonical FAILed "legacy/unexpected={org_open_gate}" on ~819 tables and certification
-- collapsed. The certifier now asks the generator's own table test and certifies the exact shape;
-- a missing or wrong gate on a table that should carry one still FAILs, and a gate on a table that
-- should not stays "unexpected".

-- The deparsed form of iam.org_open_predicate() as PostgreSQL stores it in pg_policy. It answers
-- NULL once the generator's predicate text changes, so the certifier FAILs loudly instead of
-- certifying against a stale expectation.
create or replace function iam.org_open_gate_deparsed()
 returns text
 language sql
 stable
 set search_path to ''
as $function$
  select case when iam.org_open_predicate() = '((select public.is_platform_admin()) or organization_id is null or organization_id not in (select iam.archived_org_ids()))'
              then '(( SELECT is_platform_admin() AS is_platform_admin) OR (organization_id IS NULL) OR (NOT (organization_id IN ( SELECT iam.archived_org_ids() AS archived_org_ids))))'::text end
$function$;
comment on function iam.org_open_gate_deparsed() is
  'ACCESS LADDER T-33e: the deparsed org_open_gate predicate the canonical certifier compares against; NULL when iam.org_open_predicate() has moved on without it.';

-- Derived from the generator's real output, not typed from memory: every live org_open_gate was
-- created by iam._apply_rls_unchecked, and they must all deparse to exactly this text.
do $$
declare v_n int; v_bad int;
begin
  select count(*), count(*) filter (where pg_get_expr(polqual,polrelid) is distinct from iam.org_open_gate_deparsed()
                                       or pg_get_expr(polwithcheck,polrelid) is distinct from iam.org_open_gate_deparsed())
    into v_n, v_bad from pg_catalog.pg_policy where polname='org_open_gate';
  if iam.org_open_gate_deparsed() is null or v_n = 0 or v_bad > 0 then
    raise exception 'T-33e: live org_open_gate policies (% of %) do not deparse to iam.org_open_gate_deparsed()', v_bad, v_n;
  end if;
end $$;

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
  v_required_anon_status text;
  v_pub text;
  v_client_read_only boolean := false; v_registry_rows integer := 0;
  -- DOORS-ONLY-4 -- THE VERIFIER LEARNS THE NEW SET IN THE SAME CHANGE THAT EMITS IT.
  -- iam.generated_policy_names() now carries platform_admin_select, and DD-147's drift
  -- guard inside iam.apply_rls raises on any emitted name outside that catalog. If this
  -- function did not also learn it, policies_canonical would report the twin as
  -- legacy/unexpected on every doors-only table -- a generator arguing with its own
  -- verifier, which is the exact defect DD-249 was.
  v_doors_only boolean := false;
  v_registry_token text; v_registry_variant text;
  v_registry_guard_oid oid; v_registry_guard_source text;
  v_registry_guard_enabled "char"; v_registry_guard_type smallint;
  v_registry_guard_when pg_node_tree; v_registry_guard_nargs smallint; v_registry_guard_constraint oid;
  v_registry_guard_security_definer boolean; v_registry_guard_return_type oid;
  v_registry_guard_language text; v_registry_guard_config text[];
  v_registry_guard_expected_sha256 constant text := '659860c01c779564e4a94ec86d44a0be68f1857a71326e5f3b790bf0d39dbab0';
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
  v_doors_only := platform.schema_is_doors_only(p_schema);
  SELECT count(*), coalesce(bool_or(client_read_only), false), max(token), max(rls_variant)
    INTO v_registry_rows, v_client_read_only, v_registry_token, v_registry_variant
    FROM platform.entity_types
   WHERE schema_name=p_schema AND table_name=p_table;
  IF v_client_read_only AND v_registry_rows > 1 THEN
    check_name:='client_read_only_registry'; status:='FAIL'; detail:='duplicate entity_types rows for relation'; RETURN NEXT; RETURN;
  END IF;
  IF v_client_read_only THEN
    IF v_registry_token IS DISTINCT FROM p_token THEN
      check_name:='client_read_only_registry'; status:='FAIL'; detail:='readonly registry token mismatch'; RETURN NEXT; RETURN;
    ELSIF v_registry_variant IS NULL OR v_registry_variant NOT IN ('entity','system','restricted','personal','component','ledger','detail') THEN
      check_name:='client_read_only_registry'; status:='FAIL'; detail:='readonly registry variant is missing or unknown'; RETURN NEXT; RETURN;
    ELSIF p_variant IS NOT NULL AND p_variant IS DISTINCT FROM v_registry_variant THEN
      check_name:='client_read_only_registry'; status:='FAIL'; detail:='readonly registry variant mismatch'; RETURN NEXT; RETURN;
    END IF;
    -- The physical marked relation decides its shape. NULL means derive; a supplied
    -- default/entity must agree, so callers cannot bypass restricted/no-visibility.
    v_variant := v_registry_variant;
  END IF;
  -- A DETAIL'S REGISTRY AND ITS DECLARATION MUST AGREE. The kernel resolves a token declared in
  -- platform.detail_parent_columns as a detail of its record whatever its registered variant, and
  -- refuses every reader of a `detail` token with no declaration. Certify what the kernel does.
  DECLARE
    v_decl text[] := platform.detail_parent_columns(p_token);
  BEGIN
    check_name:='detail_declaration_matches_registry';
    IF v_reg_variant = 'detail' AND v_decl IS NULL THEN
      status:='FAIL';
      detail:=format('%s is registered detail but platform.detail_parent_columns does not declare how it names its record, so the kernel refuses every reader. Add it to platform.detail_parent_columns.', p_token);
    ELSIF v_decl IS NOT NULL AND v_reg_variant IS DISTINCT FROM 'detail' THEN
      status:='WARN';
      detail:=format('%s is registered %s but the kernel resolves it as a detail of its record (platform.detail_parent_columns). The registry misdescribes the table: re-register it as detail or retire it.', p_token, coalesce(v_reg_variant, 'unregistered'));
    ELSIF v_decl IS NULL THEN
      status:='SKIP'; detail:='not a detail';
    ELSE
      status:='PASS'; detail:=NULL;
    END IF;
    RETURN NEXT;
  END;
  v_shareable := EXISTS(SELECT 1 FROM platform.shareable_resource_registry WHERE resource_type=p_token AND is_active);

  v_actor_req    := v_variant IN ('entity','system','restricted','detail','personal');  -- RC-A2: a detail's created_by is its author. PERSONAL-OWNER (2026-09-25): a personal row's created_by IS its owner (user_id retired, Arman 2026-09-23)
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
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='created_by' AND c.confrelid in ('auth.users'::regclass, 'iam.users'::regclass)),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='updated_by' AND c.confrelid in ('auth.users'::regclass, 'iam.users'::regclass))
  INTO fk_org,fk_cb,fk_ub;

  SELECT COALESCE(bool_or(pr.proname='_stamp_actor'),false),COALESCE(bool_or(pr.proname='_touch_row'),false),
         COALESCE(bool_or(pr.proname='_version_capture'),false)
    INTO t_stamp,t_touch,t_hist
  FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid WHERE tg.tgrelid=v_tbl AND NOT tg.tgisinternal;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid=v_tbl;
  SELECT array_agg(polname) INTO v_polnames FROM pg_policy WHERE polrelid=v_tbl AND polname <> 'platform_admin_read'; -- ADMIN-ACCESS 2026-09-24: judged by platform_admin_read_present, never as a stray
  SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy WHERE polrelid=v_tbl AND polname='std_select';
  -- THE REFERENCE VARIANT NAMES ITS READ LANE FOR WHAT IT IS, AND THE CLASS-AWARE CHECKS BELOW
  -- MUST STILL SEE IT. `ref_all_members_read` is the one SELECT policy iam._apply_rls_unchecked
  -- emits for rls_variant='reference'; reading it into the SAME variable means
  -- class_lanes_match_policy, system_org_arm_respects_class and the pub_read arbitration JUDGE a
  -- reference table instead of silently SKIPping it on a NULL std_select -- a half-taught verifier
  -- across a 700-table registry being exactly the defect class this variant was built inside.
  -- No other variant emits this name, so this lookup is a no-op everywhere else.
  IF v_sel IS NULL THEN
    SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy
     WHERE polrelid=v_tbl AND polname='ref_all_members_read';
  END IF;
  -- READ-LANE V2 (P4): the lane-admin guard only NARROWS std_select (a lane admin reads through
  -- platform_admin_read). Every check below judges std_select without that exact literal; an admin
  -- ARM anywhere is still seen.
  v_sel := replace(v_sel, iam.read_lane_v2_guard_deparsed(), '');
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

    -- ── 6. SYSTEM TABLES CARRY THE SAME ADMIN CONTRACT (Arman 2026-09-27) ─────────────────────
    RETURN QUERY SELECT h.check_name, h.status, h.detail FROM iam.admin_policy_findings(v_tbl) h;

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
  -- 🚨 WITH ONE NAMED EXCEPTION, AND IT IS A CLASS DEFINITION, NOT A WAIVER. `reference` is a
  -- global CATALOGUE: rows that belong to no organization and no person. The NO-NULL-ORG ruling is
  -- about a row that belongs to SOMEBODY; a reference row belongs to nobody, which is why
  -- iam.apply_rls REFUSES this variant outright (22023) when organization_id exists. The skip is
  -- therefore backed by a generator refusal AND by the positive assertion
  -- `reference_has_no_scope_columns` below -- never by this gate looking away.
  IF v_variant='reference' THEN
    check_name:='base_organization_id'; status:='SKIP'; detail:='a reference catalogue belongs to no organization; iam.apply_rls refuses the variant if organization_id exists, and reference_has_no_scope_columns asserts it'; RETURN NEXT;
    check_name:='base_org_not_null'; status:='SKIP'; detail:='no organization_id on a reference catalogue, so nothing to require NOT NULL'; RETURN NEXT;
    check_name:='base_org_fk'; status:='SKIP'; detail:='no organization_id on a reference catalogue, so nothing to key to iam.organizations'; RETURN NEXT;
  ELSE
  check_name:='base_organization_id'; status:=CASE WHEN f_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_org THEN NULL ELSE 'missing organization_id' END; RETURN NEXT;
  check_name:='base_org_not_null'; status:=CASE WHEN NOT f_org THEN 'SKIP' WHEN f_org_nn THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN f_org AND NOT f_org_nn THEN 'organization_id must be NOT NULL' END; RETURN NEXT;
  check_name:='base_org_fk'; status:=CASE WHEN fk_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN fk_org THEN NULL ELSE 'organization_id missing FK -> iam.organizations' END; RETURN NEXT;
  END IF;

  -- ---- actor pair: entity family only (§6d-1) --------------------------------------------
  check_name:='base_created_by';
  IF f_cb THEN status:='PASS'; detail:=CASE WHEN v_variant='component' THEN 'present but NOT an access key (§6d-1): neutralize from the parent, rename to a domain author column, or drop' END;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing created_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no owner column (§6d-1) — access is the parent''s; the actor is in history.row_versions';
  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference row has no creator to name -- the catalogue belongs to the platform, its writes are a door''s, and iam.apply_rls refuses the variant if created_by exists';
  ELSE status:='SKIP'; detail:='ledger actor is a named domain column (e.g. actor_id), never an access key'; END IF; RETURN NEXT;

  check_name:='base_created_by_fk'; status:=CASE WHEN NOT f_cb THEN 'SKIP' WHEN fk_cb THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_cb AND NOT fk_cb THEN 'created_by missing FK -> iam.users' END; RETURN NEXT;

  check_name:='base_updated_by';
  IF f_ub THEN status:='PASS'; detail:=NULL;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing updated_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no actor columns (§6d-1) — every write is stamped into history.row_versions';
  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference catalogue has no actor columns -- every write goes through a door and the actor is stamped into history.row_versions';
  ELSE status:='SKIP'; detail:='append-only ledger row is never updated'; END IF; RETURN NEXT;

  check_name:='base_updated_by_fk'; status:=CASE WHEN NOT f_ub THEN 'SKIP' WHEN fk_ub THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_ub AND NOT fk_ub THEN 'updated_by missing FK -> iam.users' END; RETURN NEXT;

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
  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference catalogue has no client write lane at all (read-only client grant) -- nothing a client does maintains the stamp';
  ELSE status:='SKIP'; detail:='non-versioned ledger — no user-write lane (SELECT-only grants, §6d-2) and nothing maintains the stamp'; END IF; RETURN NEXT;

  check_name:='base_version';
  IF f_ver THEN status:='PASS'; detail:=NULL;
  ELSIF v_mutation_req THEN status:='FAIL'; detail:='missing version int NOT NULL';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='non-versioned component — nothing reads version (§7: version matters iff is_versioned)';
  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='non-versioned reference catalogue — nothing reads version (§7: version matters iff is_versioned)';
  ELSE status:='SKIP'; detail:='non-versioned ledger — nothing reads version (§7: version matters iff is_versioned)'; END IF; RETURN NEXT;

  check_name:='base_metadata'; status:=CASE WHEN f_meta THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_meta THEN NULL ELSE 'missing metadata jsonb NOT NULL' END; RETURN NEXT;

  check_name:='soft_delete';
  IF v_soft_delete THEN status:=CASE WHEN f_del THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_del THEN NULL ELSE 'has_soft_delete=true but no deleted_at' END;
  ELSIF f_del THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='a ledger row is never soft-deleted; the ledger RLS lane has no deleted_at prefix (§8 corollary 2)';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='a component''s lifecycle is its parent''s — the parent''s deleted_at governs the tree, and the component RLS lane emits no deleted_at prefix; soft-deleting a child independently is the "own identity" a component does not have';
  ELSIF v_variant='reference' THEN status:='WARN'; detail:='no deleted_at — a retired catalogue row should be archived, not deleted; the reference read lane emits no deleted_at prefix, so the door and the reader must filter';
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
  IF f_vis AND v_variant IN ('component','ledger','reference','detail','personal') THEN
    status:='WARN'; detail:=format('%s carries a stray visibility column — its RLS lane never reads it (§6d-1/§6d-2); a second competing access authority, file the removal',v_variant);
  ELSIF f_vis AND NOT f_vis_enum THEN status:='FAIL'; detail:='visibility not platform.visibility enum (free-text kill)';
  ELSIF f_vis_enum THEN status:=CASE WHEN f_vis_nn THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_vis_nn THEN NULL ELSE 'visibility must be NOT NULL' END;
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component inherits parent access';
  ELSIF v_variant='personal' THEN status:='SKIP'; detail:='a personal row''s owner is its whole boundary; with no visibility column the kernel reads the row as personal, exactly what the owner-only policies say (PERSONAL-OWNER 2026-09-25)';
  ELSIF v_variant='detail' THEN status:='SKIP'; detail:='a detail inherits its parent''s access through (entity_type, entity_id) (RC-A2)';
  ELSIF v_variant='restricted' THEN status:='PASS'; detail:='restricted server-only table has no visibility column';
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='ledger access is org-scoped; the ledger RLS lane never reads visibility';
  ELSIF v_variant='reference' THEN status:='PASS'; detail:='a reference catalogue has no per-row visibility — every signed-in member reads every row, and whether a SIGNED-OUT reader may is the CLASS''s call (data_class=public), never a column''s';
  ELSIF v_is_listed OR v_shareable THEN status:='FAIL'; detail:='listed/shareable entity requires visibility enum';
  ELSE status:='WARN'; detail:='no visibility enum (add + migrate is_public)'; END IF; RETURN NEXT;

  check_name:='legacy_org_id'; status:=CASE WHEN l_orgid THEN 'FAIL' ELSE 'PASS' END; detail:=CASE WHEN l_orgid THEN 'legacy org_id present; drop it' END; RETURN NEXT;
  -- PERSONAL-OWNER (2026-09-25): the personal variant is no exception. user_id was retired in
  -- favour of created_by (Arman 2026-09-23); this check used to FAIL a personal table WITHOUT
  -- user_id, which is the canonical shape the builder produces.
  check_name:='legacy_owner_col';
  status:=CASE WHEN l_owner THEN 'WARN' ELSE 'PASS' END;
  detail:=CASE WHEN l_owner THEN 'user_id/owner_id/author_id/creator_id present; created_by is canonical owner' END;
  RETURN NEXT;
  check_name:='legacy_is_public'; status:=CASE WHEN l_ispub THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_ispub THEN 'is_public present; visibility is the access driver' END; RETURN NEXT;
  check_name:='legacy_is_deleted'; status:=CASE WHEN l_isdel THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_isdel THEN 'is_deleted present; deleted_at is canonical' END; RETURN NEXT;

  check_name:='rls_enabled'; status:=CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END; detail:=NULL; RETURN NEXT;

  -- `platform_admin_all` is emitted by iam.apply_rls for every variant
  -- (2026-08-22, the admin lane). It is canonical, not drift.
  -- EXCEPT where the token declares suppress_platform_admin_lane (SPEC-ACCESS
  -- §3.5, the D19 privacy wall): the generator does not emit it, so expecting it
  -- would FAIL every flipped table. `personal` never had it in the first place.
  IF v_variant='reference' THEN
       -- THE WHOLE POLICY SET OF A CATALOGUE: the service lane, and one read lane whose name says
       -- it belongs to every signed-in member. NO platform_admin_all (a staff READ lane adds
       -- nothing where every member already reads every row, and a staff WRITE lane is exactly the
       -- door this variant exists to force) and NO std_insert/std_update/std_delete at all.
       v_expected:=ARRAY['svc_all','ref_all_members_read'];
       -- The anon lane is the CLASS's, not the variant's (DD-249).
       IF (iam.class_lanes(p_token)).anon_lane THEN v_expected:=array_append(v_expected,'pub_read'); END IF;
  ELSIF v_variant='restricted' AND NOT f_vis THEN v_expected:=ARRAY['svc_all'];
  ELSIF v_variant='ledger' THEN v_expected:=ARRAY['svc_all','platform_admin_all','std_select'];
  ELSIF v_variant='personal' THEN v_expected:=ARRAY['svc_all','std_select','std_insert','std_update','std_delete'];
  -- RC-A2: a detail has no platform-staff lane of its own; it reaches exactly as far as its parent.
  ELSIF v_variant='detail' THEN v_expected:=ARRAY['svc_all','std_select','std_insert','std_update','std_delete'];
  ELSE v_expected:=ARRAY['svc_all','platform_admin_all','std_select','std_insert','std_update','std_delete'];
       -- 🚨 DD-249 (2026-09-15) — THE VERIFIER WAS ARGUING WITH ITSELF, AND THAT IS THE
       -- WHOLE DEFECT. `class_lanes_match_policy` below WARNs when a pub_read policy exists on
       -- a class with no anonymous lane; this line, and `pub_read_anon`, FAILed when it was
       -- ABSENT on any table with a visibility column. Both could not be satisfied at once, so
       -- the builder obeyed the louder one (a FAIL beats a WARN) and emitted the lane for
       -- everyone. Certification cannot be the tie-breaker between two of its own checks: the
       -- expectation now asks `iam.class_lanes`, the same authority the WARN asks.
       IF v_variant IN ('entity','system','restricted') AND f_vis_enum
          AND (v_variant = 'system' OR (iam.class_lanes(p_token)).anon_lane)
       THEN v_expected:=array_append(v_expected,'pub_read'); END IF;
       -- THE PUBLIC-PARENT ANON LANE (0580): a flagged component table is
       -- generated WITH pub_read, so the expectation must include it.
       IF v_variant='component' AND v_anon_component THEN v_expected:=array_append(v_expected,'pub_read'); END IF; END IF;
  IF v_suppress_admin AND v_variant NOT IN ('personal','reference','detail') THEN
    v_expected:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT 'platform_admin_all');
  END IF;
  IF v_client_read_only THEN
    v_expected:=ARRAY(SELECT unnest(v_expected)
      EXCEPT SELECT unnest(ARRAY['platform_admin_all','std_insert','std_update','std_delete']));
  ELSIF v_doors_only THEN
    -- A doors-only schema emits no client write lane at all, and the platform-staff FOR ALL
    -- policy is replaced by its FOR SELECT twin: identical read, no write half.
    v_expected:=ARRAY(SELECT unnest(v_expected)
      EXCEPT SELECT unnest(ARRAY['std_insert','std_update','std_delete']));
    IF 'platform_admin_all' = ANY(v_expected) THEN
      v_expected:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT 'platform_admin_all');
      -- ONE ADMIN READ (2026-09-27): no FOR SELECT twin is expected; the admin read is platform_admin_read.
    END IF;
  END IF;
  -- CLIENT DELETES REFUSED (chair 2026-09-26): a declared token emits no std_delete.
  IF COALESCE((SELECT et.client_deletes_refused FROM platform.entity_types et WHERE et.token = p_token), false) THEN
    v_expected:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT 'std_delete');
  END IF;
  -- D347: certify the declared restriction, including role and permissiveness.
  SELECT anonymous_read_status INTO v_required_anon_status
    FROM platform.entity_types WHERE token=p_token;
  -- RC-A2c: a token that points at another record carries the restrictive ref_target_gate.
  IF EXISTS (SELECT 1 FROM platform.reference_gate(p_token)) THEN
    v_expected:=array_append(v_expected,'ref_target_gate');
  END IF;
  -- 🚨 ACCESS LADDER T-33e (2026-09-28): AN ORGANIZATION TABLE CARRIES org_open_gate. The generator
  -- emits it on exactly the tables iam.org_open_gate_applies() names (every variant), so the
  -- certifier asks the SAME function and expects it; a gate on any other table stays "unexpected".
  -- The shape is certified exactly: RESTRICTIVE, every command, roles {authenticated, anon}, USING and
  -- WITH CHECK both the generator's predicate as PostgreSQL deparses it (iam.org_open_gate_deparsed(),
  -- which refuses to answer once iam.org_open_predicate() moves on without it).
  IF iam.org_open_gate_applies(p_schema, p_table) THEN
    v_expected:=array_append(v_expected,'org_open_gate');
    check_name:='org_open_gate';
    IF iam.org_open_gate_deparsed() IS NULL THEN
      status:='FAIL'; detail:='iam.org_open_predicate() changed but iam.org_open_gate_deparsed() still describes the old predicate; update the certifier with the generator';
    ELSIF EXISTS (
      SELECT 1 FROM pg_policy WHERE polrelid=v_tbl AND polname='org_open_gate'
        AND NOT polpermissive AND polcmd='*'
        AND (SELECT array_agg(r ORDER BY r) FROM unnest(polroles) r)
            = (SELECT array_agg(r ORDER BY r) FROM unnest(ARRAY['authenticated'::regrole::oid,'anon'::regrole::oid]) r)
        AND pg_get_expr(polqual,polrelid)=iam.org_open_gate_deparsed()
        AND pg_get_expr(polwithcheck,polrelid)=iam.org_open_gate_deparsed()
    ) THEN
      status:='PASS'; detail:=NULL;
    ELSE
      status:='FAIL'; detail:='org_open_gate is missing or differs from the generator''s restrictive archived-organization gate (every command, authenticated + anon, iam.org_open_predicate()); regenerate with iam.apply_rls';
    END IF;
    RETURN NEXT;
  END IF;
  IF v_required_anon_status IS NOT NULL THEN
    v_expected:=array_append(v_expected,'anon_status_gate');
    check_name:='anonymous_read_status';
    IF v_variant NOT IN ('entity','system','restricted') OR NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid=v_tbl AND attname='status'
        AND atttypid='text'::regtype AND NOT attisdropped
    ) THEN
      status:='FAIL'; detail:='anonymous_read_status requires an entity/system/restricted table with a text status column';
    ELSIF EXISTS (
      SELECT 1 FROM pg_policy WHERE polrelid=v_tbl AND polname='anon_status_gate'
        AND NOT polpermissive AND polcmd='r' AND polroles=ARRAY['anon'::regrole::oid]
        AND polwithcheck IS NULL
        AND pg_get_expr(polqual,polrelid)=format('(status = %L::text)',v_required_anon_status)
    ) THEN
      status:='PASS'; detail:='anonymous SELECT is restricted to the declared status; authenticated lanes are unchanged';
    ELSE
      status:='FAIL'; detail:='anon_status_gate is missing or differs from the declared restrictive anon SELECT status predicate; regenerate with iam.apply_rls';
    END IF;
    RETURN NEXT;
  END IF;
  v_unexpected:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(v_expected));
  -- DOORS-ONLY refusals are the chair ruling's own output, in the one shape that can only refuse
  -- (iam.doors_only_refusals). The verifier learns what the ruling emits, as DOORS-ONLY-4 did.
  v_unexpected:=ARRAY(SELECT unnest(v_unexpected) EXCEPT SELECT unnest(iam.doors_only_refusals(v_tbl)));
  -- 🚨 DD-249 — ONE DEFECT, ONE VOICE. A `pub_read` left on a class with no anonymous lane is
  -- already reported, by name and with the class in the message, by `class_lanes_match_policy`
  -- below. Letting `policies_canonical` ALSO call it "legacy/unexpected" would turn that one
  -- WARN into a second, louder FAIL on all 233 live tokens that carry the lane today — and
  -- those tokens cannot currently be regenerated to clear it, because
  -- `iam.entity_read_kernel_fingerprint()` is stale (measured 2026-09-15: live
  -- c18523c3… vs expected 231f3814…), so every `iam.apply_rls` re-run drops the D249 bound
  -- and rewrites std_select into the unbounded-has_access form. A FAIL nobody can clear is
  -- not a finding, it is noise that buries the 400-odd real ones. So this check stays silent
  -- on exactly the case the WARN owns — and on nothing else: `personal`, `ledger` and the
  -- machinery lanes keep failing on a stray pub_read, because no WARN speaks for them.
  IF 'pub_read' = ANY(v_unexpected)
     AND v_sel IS NOT NULL
     AND v_variant NOT IN ('system','personal','reference')
     AND NOT v_anon_component
     AND NOT (iam.class_lanes(p_token)).anon_lane THEN
    v_unexpected:=ARRAY(SELECT unnest(v_unexpected) EXCEPT SELECT 'pub_read');
  END IF;
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
  -- ADMIN-ACCESS (Arman 2026-09-24): the platform-admin READ lane is expected on every RLS table.
  RETURN QUERY SELECT h.check_name, h.status, h.detail FROM iam.admin_policy_findings(v_tbl) h;  -- ONE copy, shared with system tables

  check_name:='bespoke_policy_present';
  v_bespoke:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(iam.generated_policy_names())
                     EXCEPT SELECT unnest(iam.doors_only_refusals(v_tbl)));
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
    IF v_variant IN ('personal','reference','detail') THEN status:='PASS'; detail:=format('the %s variant never had a platform-admin lane',v_variant);
    ELSIF 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}'))
       OR 'platform_admin_select'=ANY(COALESCE(v_polnames,'{}')) THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but a platform-staff policy exists — re-run iam.apply_rls';
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
  IF f_vis_enum AND NOT v_suppress_admin AND v_variant NOT IN ('personal','detail') THEN
    check_name:='personal_row_wall';
    DECLARE
      w_admin constant text := '(visibility >= ''internal''::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)';
      w_super constant text := '(visibility >= ''internal''::platform.visibility) AND is_super_admin()';
      -- 2026-09-26: the same walled arm as the generator now emits it (evaluated once per statement).
      w_super_once constant text := '(visibility >= ''internal''::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin)';
      r_pol record; v_rest text; v_bad text := NULL; v_admin_ok boolean := NULL;
    BEGIN
      FOR r_pol IN
        SELECT p.polname,
               regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '\s+', ' ', 'g') AS q
          FROM pg_policy p
         WHERE p.polrelid = v_tbl AND p.polpermissive AND p.polname <> 'platform_admin_read'
         ORDER BY p.polname
      LOOP
        IF r_pol.polname IN ('platform_admin_all','platform_admin_select') THEN
          v_admin_ok := position(w_admin in r_pol.q) > 0;
        END IF;
        v_rest := replace(replace(replace(replace(r_pol.q, iam.read_lane_v2_guard_deparsed(), ''), w_admin, ''), w_super_once, ''), w_super, '');
        IF v_rest LIKE '%is_platform_admin%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname || ' carries an UNWALLED platform-admin arm';
        ELSIF v_rest LIKE '%is_super_admin%' AND r_pol.q NOT LIKE '%system_orgs%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname || ' carries an UNWALLED super-admin arm';
        END IF;
      END LOOP;
      IF v_admin_ok IS FALSE THEN
        v_bad := coalesce(v_bad || '; ', '') || 'the platform-staff policy USING does not exclude visibility=''personal''';
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
               AND pol.polname <> 'platform_admin_read'
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
  IF f_vis_enum AND v_variant <> 'component' AND v_variant <> 'personal' AND v_variant <> 'detail' THEN
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
  -- Only marked relations add checks; preserve the unmarked result set.
  IF v_client_read_only THEN
  check_name:='client_read_only_grants';
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
    WHERE has_table_privilege(r.role_name, v_tbl, 'INSERT')
       OR has_table_privilege(r.role_name, v_tbl, 'UPDATE')
       OR has_table_privilege(r.role_name, v_tbl, 'DELETE')
       OR has_table_privilege(r.role_name, v_tbl, 'TRUNCATE')
       OR has_table_privilege(r.role_name, v_tbl, 'REFERENCES')
       OR has_table_privilege(r.role_name, v_tbl, 'TRIGGER')
       OR has_any_column_privilege(r.role_name, v_tbl, 'INSERT,UPDATE,REFERENCES')
       OR ((v_variant='restricted' AND NOT f_vis)
           AND (has_table_privilege(r.role_name, v_tbl, 'SELECT')
                OR has_any_column_privilege(r.role_name, v_tbl, 'SELECT')))
  ) THEN status:='FAIL'; detail:='effective client table/column mutation or restricted read privilege remains';
  ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

  check_name:='client_read_only_policies';
  IF EXISTS (
    SELECT 1 FROM pg_policy p CROSS JOIN LATERAL unnest(p.polroles) AS pr(role_oid)
     WHERE p.polrelid=v_tbl AND p.polcmd IN ('*','a','w','d')
       AND (pr.role_oid=0 OR pg_has_role('anon', pr.role_oid, 'USAGE')
            OR pg_has_role('authenticated', pr.role_oid, 'USAGE'))
  ) THEN status:='FAIL'; detail:='applicable client mutation policy remains';
  ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

  check_name:='client_read_only_registry_guard';
    SELECT p.oid, p.prosrc, p.prosecdef, p.prorettype, l.lanname, p.proconfig
      INTO v_registry_guard_oid, v_registry_guard_source, v_registry_guard_security_definer,
           v_registry_guard_return_type, v_registry_guard_language, v_registry_guard_config
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
     WHERE n.nspname='platform' AND p.proname='entity_types_client_read_only_guard'
       AND p.pronargs=0;
    SELECT tg.tgenabled, tg.tgtype, tg.tgqual, tg.tgnargs, tg.tgconstraint
      INTO v_registry_guard_enabled, v_registry_guard_type, v_registry_guard_when,
           v_registry_guard_nargs, v_registry_guard_constraint
      FROM pg_trigger tg
     WHERE tg.tgrelid='platform.entity_types'::regclass
       AND NOT tg.tgisinternal
       AND tg.tgname='entity_types_client_read_only_guard'
       AND tg.tgfoid=v_registry_guard_oid;
    IF v_registry_guard_oid IS NULL THEN status:='FAIL'; detail:='guard function missing';
    ELSIF v_registry_guard_security_definer OR v_registry_guard_return_type IS DISTINCT FROM 'trigger'::regtype
       OR v_registry_guard_language IS DISTINCT FROM 'plpgsql'
       OR v_registry_guard_config IS DISTINCT FROM ARRAY['search_path=pg_catalog, auth, platform'] THEN
      status:='FAIL'; detail:='guard function security, return type, language, or fixed search_path differs';
    ELSIF encode(extensions.digest(v_registry_guard_source, 'sha256'), 'hex') <> v_registry_guard_expected_sha256 THEN
      status:='FAIL'; detail:='guard prosrc digest differs from reviewed literal';
    ELSIF v_registry_guard_enabled IS DISTINCT FROM 'O' OR v_registry_guard_type IS DISTINCT FROM 31
       OR v_registry_guard_when IS NOT NULL OR v_registry_guard_nargs IS DISTINCT FROM 0
       OR v_registry_guard_constraint IS DISTINCT FROM 0 THEN
      status:='FAIL'; detail:='guard trigger must be enabled unconstrained BEFORE ROW INSERT/UPDATE/DELETE without WHEN arguments';
    ELSIF EXISTS (
      SELECT 1 FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
       WHERE has_table_privilege(r.role_name, 'platform.entity_types'::regclass, 'TRUNCATE')
          OR has_table_privilege(r.role_name, 'platform.entity_types'::regclass, 'REFERENCES')
          OR has_table_privilege(r.role_name, 'platform.entity_types'::regclass, 'TRIGGER')
          OR has_function_privilege(r.role_name, v_registry_guard_oid, 'EXECUTE')
    ) THEN status:='FAIL'; detail:='effective client registry TRUNCATE/REFERENCES/TRIGGER or guard EXECUTE privilege remains';
    ELSE status:='PASS'; detail:=NULL; END IF;
  RETURN NEXT;
  END IF;

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
      -- DD-249: a visibility COLUMN is not a mandate for an anonymous lane. `system` keeps its
      -- unconditional one (the platform's own published catalogue); every other variant is asked
      -- of its class, so that an `organization` table missing pub_read reads as CORRECT here
      -- rather than as the defect it was reported to be until 2026-09-15.
      IF NOT f_vis_enum THEN status:='SKIP'; detail:='no visibility column';
      ELSIF v_variant <> 'system' AND NOT (iam.class_lanes(p_token)).anon_lane THEN
        status:='SKIP';
        detail:=format('class %s emits no anonymous lane, so no pub_read is expected (DD-249)',
                       (iam.class_lanes(p_token)).resolved_class);
      ELSE status:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN NULL ELSE 'missing anon visibility=public policy' END;
      END IF; RETURN NEXT;
    IF v_variant='system' THEN
      check_name:='policy_system_public_read'; status:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN 'PASS' ELSE 'FAIL' END;
        detail:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN NULL ELSE 'system variant std_select must pass visibility=public (authenticated catalog reads)' END; RETURN NEXT;
    END IF;
  ELSIF v_variant='personal' THEN
    -- PERSONAL-OWNER (2026-09-25): the owner is created_by, the column the kernel reads.
    check_name:='policy_personal_owner_only';
    status:=CASE
      WHEN v_sel LIKE v_owner_pat
       AND v_sel !~ '(^|[^a-z_.])user_id\s*='
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE
      WHEN v_sel LIKE v_owner_pat
       AND v_sel !~ '(^|[^a-z_.])user_id\s*='
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN NULL ELSE 'personal std_select must require created_by = auth.uid() (the owner column the kernel reads; user_id retired 2026-09-23), must not key on user_id (a direct grant''s granted_to_user_id is the sharing arm, not an owner key), and must omit platform_admin_all — re-run iam.apply_rls' END;
    RETURN NEXT;
  ELSIF v_variant='reference' THEN
    -- ── 1. THE ONE READ LANE, AND IT IS OPEN TO EVERY MEMBER ON PURPOSE ──────────────────────
    check_name:='reference_open_read';
    DECLARE r_open record;
    BEGIN
      SELECT p.polname,
             COALESCE(btrim(regexp_replace(COALESCE(pg_get_expr(p.polqual,p.polrelid),'true'),'\s+',' ','g')),'') AS q,
             (SELECT bool_and(ro.rolname='authenticated')
                FROM unnest(p.polroles) rr JOIN pg_roles ro ON ro.oid=rr) AS only_auth
        INTO r_open
        FROM pg_policy p WHERE p.polrelid=v_tbl AND p.polname='ref_all_members_read';
      IF r_open.polname IS NULL THEN
        status:='FAIL'; detail:='the reference read lane ref_all_members_read is missing — a catalogue with no read policy shows nothing and explains nothing. Re-run iam.apply_rls(...,''reference'').';
      ELSIF r_open.q NOT IN ('true','') THEN
        status:='FAIL'; detail:=format('ref_all_members_read carries a predicate (%s). A reference catalogue has nothing to filter a read on — if these rows need filtering they are not reference data and the table is registered as the wrong variant. Re-run iam.apply_rls.', left(r_open.q,120));
      ELSIF NOT COALESCE(r_open.only_auth,false) THEN
        status:='FAIL'; detail:='ref_all_members_read is not TO authenticated alone — whether a SIGNED-OUT reader is welcome is the class''s call (data_class=public emits pub_read), never this lane''s. Re-run iam.apply_rls.';
      ELSE status:='PASS'; detail:='every signed-in member reads the whole catalogue';
      END IF;
    END; RETURN NEXT;

    -- ── 2. WRITES ARE A DOOR'S, AND NO PRIVILEGE SITS BEHIND ONE ─────────────────────────────
    check_name:='reference_no_client_write';
    DECLARE v_w text := NULL; v_polw text := NULL; v_colw text := NULL;
    BEGIN
      SELECT string_agg(DISTINCT r.role_name||':'||pv.priv, ', ') INTO v_w
        FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
        CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS pv(priv)
       WHERE has_table_privilege(r.role_name, v_tbl, pv.priv);
      SELECT string_agg(DISTINCT r.role_name, ', ') INTO v_colw
        FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
       WHERE has_any_column_privilege(r.role_name, v_tbl, 'INSERT,UPDATE,REFERENCES');
      SELECT string_agg(DISTINCT p.polname, ', ') INTO v_polw
        FROM pg_policy p CROSS JOIN LATERAL unnest(p.polroles) AS pr(role_oid)
       WHERE p.polrelid=v_tbl AND p.polcmd IN ('*','a','w','d')
         AND (pr.role_oid=0 OR pg_has_role('anon',pr.role_oid,'USAGE') OR pg_has_role('authenticated',pr.role_oid,'USAGE'));
      IF v_w IS NULL AND v_colw IS NULL AND v_polw IS NULL THEN
        status:='PASS'; detail:='no client write privilege and no client write policy — the catalogue''s writes are a door''s';
      ELSE status:='FAIL';
        detail:=format('a reference catalogue is written by a DOOR, never by a client:%s%s%s. iam.apply_table_grants issues the read-only client grant for this variant, so re-running iam.apply_rls(...,''reference'') withdraws it; a hand-fixed grant lasts exactly until the next regeneration (DD-248).',
                       COALESCE(' table privileges '||v_w,''), COALESCE(' column privileges for '||v_colw,''), COALESCE(' write policies '||v_polw,''));
      END IF;
    END; RETURN NEXT;

    -- ── 3. NOTHING TO SCOPE A READ ON, ASSERTED RATHER THAN ASSUMED ──────────────────────────
    check_name:='reference_has_no_scope_columns';
    IF f_org OR l_owner OR f_cb OR f_ub THEN
      status:='FAIL';
      detail:=format('a reference catalogue belongs to no organization and no person, but this table carries %s. Two authorities then disagree about who may read a row: the column says one thing and ref_all_members_read says everyone (§6d-1''s lesson, one variant over). Drop the column, rename it to real domain authorship, or register the table as entity/system/personal.',
        btrim(CASE WHEN f_org THEN 'organization_id ' ELSE '' END
           || CASE WHEN l_owner THEN 'user_id/owner_id/author_id/creator_id ' ELSE '' END
           || CASE WHEN f_cb THEN 'created_by ' ELSE '' END
           || CASE WHEN f_ub THEN 'updated_by' ELSE '' END));
    ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

    -- ── 4. THE ANON LANE IS THE CLASS'S (DD-249) ─────────────────────────────────────────────
    check_name:='pub_read_anon';
    IF (iam.class_lanes(p_token)).anon_lane THEN
      IF NOT ('pub_read'=ANY(COALESCE(v_polnames,'{}'))) THEN
        status:='FAIL'; detail:='data_class=public but pub_read is missing — re-run iam.apply_rls';
      ELSIF NOT has_any_column_privilege('anon', v_tbl, 'SELECT') THEN
        status:='FAIL'; detail:='pub_read exists but anon holds no SELECT key — a door with no key, which reads as an anonymous lane to everyone auditing the table. Re-run iam.apply_rls.';
      ELSE status:='PASS'; detail:='data_class=public: the catalogue is served to signed-out readers'; END IF;
    ELSIF has_any_column_privilege('anon', v_tbl, 'SELECT') THEN
      status:='FAIL'; detail:=format('class %s emits NO anonymous lane, but anon holds a SELECT key to this catalogue. Either declare it (data_class=public with a written reason) or re-run iam.apply_rls, which withdraws the key.', (iam.class_lanes(p_token)).resolved_class);
    ELSE status:='SKIP'; detail:=format('class %s emits no anonymous lane, so no pub_read is expected (DD-249)', (iam.class_lanes(p_token)).resolved_class);
    END IF; RETURN NEXT;
  ELSIF v_variant='detail' THEN
    -- RC-A2: the read lane asks the kernel about the row's OWN parent, and nothing else admits.
    check_name:='policy_follows_parent';
    IF (platform.detail_parent_columns(p_token))[4] IS NOT NULL THEN
      -- 1294: a MAPPED detail (a preferred typed pointer, then a mapped type column) reads set-wise:
      -- the kernel's set of the preferred parent, and platform.detail_readable_parents for the rest —
      -- exactly what iam.apply_rls emits for it, and no staff or organization lane beside it.
      IF COALESCE(v_sel,'') LIKE '%accessible_entity_ids(''' || (platform.detail_parent_columns(p_token))[5] || '''%'
         AND (((platform.detail_parent_columns(p_token))[2] IS NULL)
              OR COALESCE(v_sel,'') LIKE '%detail_readable_parents(''' || p_token || '''%')
         AND COALESCE(v_sel,'') !~* '(is_platform_admin|is_super_admin|organization_id|visibility|my_orgs)'
         AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
         AND NOT ('platform_admin_select'=ANY(COALESCE(v_polnames,'{}'))) THEN
        status:='PASS'; detail:='std_select is the parent''s kernel set (preferred pointer) or platform.detail_readable_parents, and nothing else';
      ELSE status:='FAIL';
        detail:=format('a mapped detail''s read must be the preferred parent''s iam.accessible_entity_ids plus platform.detail_readable_parents(%L), with no staff lane beside it; found %s. Re-run iam.apply_rls(...,''detail'').', p_token, left(COALESCE(v_sel,'<none>'),160));
      END IF;
    ELSIF (COALESCE(v_sel,'') LIKE '%has_access(entity_type, entity_id, ''viewer''::%'
        OR COALESCE(v_sel,'') LIKE '%detail_parent_access(entity_type, entity_id, ''viewer''::%')
       AND COALESCE(v_sel,'') !~* '( or |is_platform_admin|is_super_admin|organization_id|visibility|my_orgs)'
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
       AND NOT ('platform_admin_select'=ANY(COALESCE(v_polnames,'{}'))) THEN
      status:='PASS'; detail:='std_select is viewer on (entity_type, entity_id) and nothing else';
    ELSE status:='FAIL';
      detail:=format('a detail''s read must be exactly iam.has_access(entity_type, entity_id, viewer) with no staff lane beside it; found %s. Re-run iam.apply_rls(...,''detail'').', left(COALESCE(v_sel,'<none>'),160));
    END IF; RETURN NEXT;
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
  ELSIF v_variant = 'reference' THEN
    status:=CASE WHEN v_dc IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NOT NULL THEN v_dc::text
                 ELSE 'a reference catalogue has no composition parent, so it must STATE its class — and the only question its class answers is whether a SIGNED-OUT reader is welcome (public) or only signed-in members (organization)' END;
  ELSIF v_variant = 'ledger' THEN
    status:=CASE WHEN v_dc IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NOT NULL THEN v_dc::text
                 ELSE 'a ledger has no composition parent, so it must STATE its class — an unset one would have to be guessed, and guessing is how 299 of 311 components kept a platform-staff lane under a private parent (DD-137b10)' END;
  ELSIF v_dc IS NULL THEN status:='FAIL';
    detail:='data_class is unset. Unset is a REFUSAL, not a value (chair R3): iam.apply_rls will not generate for this token, and iam.class_lanes resolves it to organization, the level every table starts at (common-docs/policies/access-ladder.md).';
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
  ELSIF v_variant = 'reference' AND v_dc IN ('private','confidential') THEN
    status:='FAIL'; detail:=format('a reference catalogue is read by EVERY signed-in member by construction — ref_all_members_read is `true` — so class %s is a declaration the live policy contradicts on its face. Its class is `organization` (members only) or `public` (signed-out readers too).', v_dc);
  ELSIF v_dc IN ('private','confidential') AND NOT v_suppress_admin THEN
    status:='FAIL'; detail:=format('§3.1 derivation two: a %s token suppresses the platform-admin lane — our own staff go through the door too. suppress_platform_admin_lane is false.', v_dc);
  ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

  check_name:='default_list_scope_set';
  IF v_variant IN ('component','ledger','reference') THEN
    status:=CASE WHEN v_ls IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_ls IS NOT NULL THEN format('%s may not hold a default_list_scope',v_variant)
                 WHEN v_variant='reference' THEN 'a reference catalogue has no owner and no organization: "mine" is not expressible and "organization" would be a lie — the whole catalogue IS the list (§3.3)'
                 ELSE 'a component has no owner column, so "mine" is not expressible (§3.3)' END;
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
    ELSIF NOT v_lanes.platform_admin_lane
      AND ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}'))
        OR 'platform_admin_select'=ANY(COALESCE(v_polnames,'{}'))) THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but a ' ||
        'platform_admin_all/platform_admin_select policy still sits beside std_select — that ' ||
        'policy is permissive and grants its command on its own. Re-run iam.apply_rls.', v_lanes.resolved_class);
    ELSIF NOT v_lanes.anon_lane AND 'pub_read'=ANY(COALESCE(v_polnames,'{}')) AND v_variant<>'system' AND NOT v_anon_component THEN
      status:='WARN'; detail:=format('class %s emits no anonymous lane, but a pub_read policy exists', v_lanes.resolved_class);
    ELSE status:='PASS'; detail:=v_lanes.resolved_class::text; END IF;
  END IF; RETURN NEXT;

  -- READ-LANE V2 (P5): a component whose std_select probes its parent's own read needs that parent
  -- to still be eligible — row security on, a signed-in read of its id, only generated policies.
  IF COALESCE(v_sel,'') LIKE '%row_security_active(%' THEN
    check_name:='read_lane_v2_parents_eligible';
    detail:=iam.read_lane_v2_stale_edges(p_schema, p_table, p_token);
    status:=CASE WHEN detail IS NULL THEN 'PASS' ELSE 'FAIL' END; RETURN NEXT;
  END IF;

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
      -- 2026-09-26: the same walled arm as the generator now emits it (evaluated once per statement).
      w_plain_once constant text := '(visibility >= ''internal''::platform.visibility) AND ( SELECT is_super_admin() AS is_super_admin)';
      r_pol record; v_rest text; v_bad text := NULL;
    BEGIN
      FOR r_pol IN
        SELECT p.polname,
               regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '\s+', ' ', 'g') AS q
          FROM pg_policy p
         WHERE p.polrelid = v_tbl AND p.polpermissive AND p.polcmd IN ('r','*')
         ORDER BY p.polname
      LOOP
        v_rest := replace(replace(replace(r_pol.q, w_sysorg, ''), w_plain_once, ''), w_plain, '');
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

$function$;
