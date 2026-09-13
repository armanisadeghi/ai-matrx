-- iam_component_never_wider_than_parent_dd175b_setform — DD-175: THE SET FORM LEARNS THE CLASS,
-- the kernel fingerprint is re-stamped, and verify_canonical gains the structural check.
--
-- THE FIX IS ONE SENTENCE: `iam.accessible_entity_ids` asks `iam.class_lanes(p_type)` — the SAME
-- function `iam.has_access_for_base` asks at runtime and `iam.entity_read_expr` asks at generation
-- time. Three places, one answer, which is db-rules §6d's whole point ("Mirror and kernel ask the
-- same predicate so they cannot drift"). Until today two of the three asked and the third did not.
--
-- THE FOUR ARMS THIS GATES, EACH AGAINST THE KERNEL LINE THAT ALREADY GATES IT
-- ---------------------------------------------------------------------------
--   set form (before)                                       kernel                     lane
--   visibility >= internal and org in my orgs               has_access_for_base §131    org_member_lane
--   visibility >= internal and org in my owner/admin orgs   has_access_for_base §127    org_role_lane
--   org in system_orgs global_readable and is_super_admin   has_access_for_base §103    platform_admin_lane
--   DD-136b's late org-admin arm (both shapes)              has_access_for_base §90     org_role_lane
--
-- Three arms are LEFT ALONE on purpose, because the kernel does not gate them either and narrowing
-- them here would be a second, unproven change inside a security fix:
--   * the owner arm — no class has ever excluded the owner and none may (db-rules §6);
--   * `visibility = 'public'` at viewer (kernel §97);
--   * the global-readable system-org arm at >= internal for a signed-in reader (kernel §98-100).
--
-- THE PATCH IS APPLIED TO `pg_get_functiondef`, NOT TO A HAND-TYPED HEADER, so STABLE, SECURITY
-- DEFINER and the function's own `search_path` are preserved byte for byte and this file cannot
-- silently re-declare the machinery it is guarding. Every anchor is asserted to occur EXACTLY once
-- before it is replaced: if the function has moved under this file, it refuses rather than
-- half-patching.

do $patch$
declare
  v_def text; v_new text; v_a text; v_b text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'iam' and p.proname = 'accessible_entity_ids'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_type text, p_required permission_level, p_depth integer, p_include_public boolean';
  if v_def is null then
    raise exception 'DD-175: the 4-arg iam.accessible_entity_ids was not found — the anchors below cannot be trusted';
  end if;
  v_new := v_def;

  -- ── 1. declare the lane set ────────────────────────────────────────────────
  v_a := $a$  v_ids uuid[] := '{}';
  rec record;$a$;
  if (length(v_new) - length(replace(v_new, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'DD-175 anchor 1 (the declarations) is not unique — the function has moved'; end if;
  v_b := $b$  v_ids uuid[] := '{}';
  -- 🚨 DD-175 (2026-09-12) — THE SET FORM ASKS THE SAME QUESTION THE KERNEL ASKS.
  -- iam.has_access_for_base and iam.entity_read_expr both gate the organization and
  -- platform-staff lanes on iam.class_lanes (DD-137b). This function never learned that,
  -- so it returned ids the parent's own policy refuses. On the parent's own std_select that
  -- is harmless — the set is only a CANDIDATE there and iam.has_access confirms every id —
  -- but a generated COMPONENT lane takes this set as FINAL with nothing behind it, so the
  -- component read rows its parent refuses. Measured live, 2026-09-12, before this change:
  -- arman@titaniumsuccess.com read 2,313 docproc.processed_document_pages whose parent
  -- processed_document its own policy refuses; admin@admin.com 106 udt_document_snapshots
  -- and 87 udt_workbook_snapshots; users.credential_attachments leaked all 3 of its rows
  -- under a refused credential_item; workbench.udt_structured_list_items all 15 of its.
  v_lanes platform.lane_set;
  rec record;$b$;
  v_new := replace(v_new, v_a, v_b);

  -- ── 2. resolve the lanes as soon as the token resolves ─────────────────────
  v_a := $a$  if v_schema is null then return '{}'::uuid[]; end if;
  v_tbl := format('%I.%I', v_schema, v_table);$a$;
  if (length(v_new) - length(replace(v_new, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'DD-175 anchor 2 (the token lookup) is not unique — the function has moved'; end if;
  v_new := replace(v_new, v_a, v_a || chr(10) || $b$  v_lanes := iam.class_lanes(p_type);$b$);

  -- ── 3/4. the two early organization arms, each gated by the lane that owns it ──
  v_a := $a$    if p_required <= 'editor'::public.permission_level then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om where om.user_id = $1))';
    else
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;$a$;
  if (length(v_new) - length(replace(v_new, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'DD-175 anchor 3 (the early org arms) is not unique — the function has moved'; end if;
  v_b := $b$    if p_required <= 'editor'::public.permission_level and v_lanes.org_member_lane then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om where om.user_id = $1))';
    elsif p_required > 'editor'::public.permission_level and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;$b$;
  v_new := replace(v_new, v_a, v_b);

  -- ── 5. the platform-staff system-org lane ──────────────────────────────────
  v_a := $a$  if v_has_org and public.is_super_admin_for(v_uid) then$a$;
  if (length(v_new) - length(replace(v_new, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'DD-175 anchor 5 (the staff lane) is not unique — the function has moved'; end if;
  v_new := replace(v_new, v_a,
    $b$  if v_has_org and v_lanes.platform_admin_lane and public.is_super_admin_for(v_uid) then$b$);

  -- ── 6. DD-136b's late organization-ROLE lane, both arms ────────────────────
  v_a := $a$    if v_has_org and v_has_vis then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    elsif v_has_org and not iam.token_is_parented_component(p_type) then$a$;
  if (length(v_new) - length(replace(v_new, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'DD-175 anchor 6 (the late org-role lane) is not unique — the function has moved'; end if;
  v_b := $b$    if v_has_org and v_has_vis and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    elsif v_has_org and v_lanes.org_role_lane and not iam.token_is_parented_component(p_type) then$b$;
  v_new := replace(v_new, v_a, v_b);

  if v_new = v_def then raise exception 'DD-175: the patch changed nothing'; end if;
  if position('v_lanes := iam.class_lanes(p_type);' in v_new) = 0 then
    raise exception 'DD-175: the lane resolution did not land'; end if;
  execute v_new;
end $patch$;

-- ── THE FINGERPRINT GATE ─────────────────────────────────────────────────────────────────────────
-- `iam.accessible_entity_ids` is inside `iam.entity_read_kernel_fingerprint()`, and
-- `iam.entity_read_expr` REFUSES to emit a policy while the fingerprint disagrees with
-- `iam.entity_read_kernel_expected()`. Re-stamping it is not bookkeeping: an UNMOVED fingerprint
-- here would mean the patch above did not land, so the file asserts the move before it re-stamps.
do $fp$
declare v_old text; v_new text;
begin
  v_old := iam.entity_read_kernel_expected();
  v_new := iam.entity_read_kernel_fingerprint();
  if v_new = v_old then
    raise exception 'dd175b: the read-kernel fingerprint did not move (% ). The patch to '
      'iam.accessible_entity_ids did not change its source, so nothing above ran the way this file '
      'claims.', v_old;
  end if;
  execute format(
    'create or replace function iam.entity_read_kernel_expected() returns text language sql '
    'immutable as $f$ select %L::text $f$', v_new);
  if iam.entity_read_kernel_fingerprint() <> iam.entity_read_kernel_expected() then
    raise exception 'dd175b: the re-stamp did not take — iam.entity_read_expr would refuse to emit.';
  end if;
  raise notice 'dd175b: read-kernel fingerprint % -> % (DD-175)', v_old, v_new;
end $fp$;

-- ── THE STRUCTURAL CHECK: component_not_wider_than_parent ────────────────────────────────────────
-- The class gate above closes the LANE. This closes the SHAPE: a component's readable doors must
-- all go through its parent. Every permissive SELECT/ALL policy a signed-in client can use must,
-- for at least one registered parent, either
--   * resolve the parent's ids           — `iam.accessible_entity_ids('<parent>'…`  (the generated arm)
--   * ask the kernel about the parent     — `iam.has_access('<parent>'…`             (runtime.global_execution_control)
--   * or read the parent table itself     — `… from <parent schema>.<parent table>`  (users.credential_attachments)
-- The third form is the strictest of the three and is deliberately ACCEPTED rather than replaced:
-- PostgreSQL applies row security to a policy's own subqueries, so a bare
-- `exists (select 1 from <parent> where id = <fk>)` IS the parent's deployed policy and cannot
-- drift from it. Proven live: users.credential_attachments carries exactly that and nothing else,
-- and test@test.com reads 0 of its 4 rows while admin@admin.com reads 3.
--
-- The one arm that may skip the parent is the platform-staff arm, and only on a token whose class
-- still HAS a platform-admin lane. `service_role` policies are not a client door and are excluded.
-- RLS switched off is the widest lane there is, so it FAILs first and by name.
do $vc$
declare v_def text; v_new text; v_a text; v_b text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'iam' and p.proname = 'verify_canonical';
  if v_def is null then raise exception 'dd175b: iam.verify_canonical not found'; end if;

  v_a := '  -- 🚨 CONTAINMENT NEVER CARRIES A PERSONAL ROW (DD-171, 2026-09-12).';
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'dd175b: the DD-171 insertion anchor in iam.verify_canonical is not unique — '
      'refusing to insert a check at a place this file cannot identify';
  end if;
  if position('component_not_wider_than_parent' in v_def) > 0 then
    raise notice 'dd175b: component_not_wider_than_parent is already installed';
    return;
  end if;

  v_b := $ins$  -- 🚨 A COMPONENT LANE IS NEVER WIDER THAN ITS PARENT'S READ (DD-175, 2026-09-12).
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

$ins$;

  v_new := replace(v_def, v_a, v_b || v_a);
  if v_new = v_def then raise exception 'dd175b: the verify_canonical insertion changed nothing'; end if;
  execute v_new;
end $vc$;

-- THE RED. A check that is green the moment it is installed has proven nothing.
do $red$
declare r record; v_red text[] := '{}';
begin
  for r in
    select distinct et.token, et.schema_name, et.table_name, et.rls_variant
      from platform.entity_types et
      join platform.entity_relationships er on er.child_type = et.token and er.kind in ('composition','containment')
     where et.is_active and et.rls_variant = 'component'
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = er.fk_column)
     order by et.token
  loop
    if exists (select 1 from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant) v
                where v.check_name = 'component_not_wider_than_parent' and v.status = 'FAIL') then
      v_red := array_append(v_red, r.token);
    end if;
  end loop;
  if cardinality(v_red) = 0 then
    raise exception 'dd175b: component_not_wider_than_parent is GREEN on every one of the live '
      'component tokens the moment it was installed. Refusing to ship a check that never goes RED.';
  end if;
  raise notice 'dd175b RED: component_not_wider_than_parent FAILs on % token(s): %',
    cardinality(v_red), array_to_string(v_red, ', ');
end $red$;
