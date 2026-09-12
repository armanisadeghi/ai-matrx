-- iam_containment_never_carries_personal_dd171b_kernel — DD-171: CONTAINMENT NEVER CARRIES A
-- PERSONAL ROW. The resolver, its two mirrors, and the check that keeps them there.
--
-- THE RULING (chair, 2026-09-12 — supersedes the earlier "a chat in a shared room is Rule 9 union"
-- note recorded against DD-136)
-- --------------------------------------------------------------------------------------------
-- A row whose `visibility` is `personal` is reachable only by its OWNER and by explicit direct
-- grants ON THAT ROW. Containment carries the container's reach to rows at `internal` and above,
-- never to `personal`. Union never widens a personal row.
--
-- WHY THE FIX IS IN THREE FILES' WORTH OF ONE PLACE (it is the same lane three times, exactly as
-- DD-136 found it)
-- -------------------------------------------------------------------------------------------
--  1. `iam.has_access_for_base` — THE KERNEL. Two containment walks: the `platform.reachability`
--     conveyance loop, and the `platform.entity_relationships` composition/containment parent walk.
--     Neither looked at the child's own visibility.
--  2. `iam.entity_read_expr` — THE MIRROR the generator emits into every std_select. Its second
--     parent-FK arm reads `visibility is not null and visibility <> 'public'`, which is every value
--     the enum has EXCEPT public — `personal` included.
--  3. `iam.accessible_entity_ids` — THE SET FORM. Its parent cascade appends child ids with NO
--     has_access_for_base behind it (the loop above it confirms candidates; the cascade does not),
--     and a component's generated read lane takes this set as final.
--
-- Guarding one and not the others is the wall that only looks like one. All three ask the SAME
-- predicate, so the kernel and its mirrors cannot drift (db-rules §6d).
--
-- THE PREDICATE, AND THE TRAP IT AVOIDS
-- -------------------------------------
--     the child's own visibility is `internal` or above   OR   its table has no visibility contract
--
-- The second half is not a loophole, it is the thing that makes the first half safe:
-- `platform.entity_row_access_attrs` HARD-CODES o_vis := 'personal' for a table with no visibility
-- column, and a COMPONENT has no visibility column precisely BECAUSE its access is its parent's
-- (db-rules §6d-1). A bare `v_vis >= 'internal'` would therefore cut every component off from the
-- parent it exists to inherit from. `iam.table_has_visibility` is the same predicate DD-136 used
-- for the same reason.
--
-- NULL KEEPS ITS CURRENT LANE, EVERYWHERE, DELIBERATELY. `visibility` is NOT NULL on 301 of the 302
-- live typed columns; the one nullable token (`shared_canvas_item`) holds 0 NULL rows and has no
-- containment parent. So moving NULL would move nothing measurable while making a second, unproven
-- claim inside a security fix. Each expression below preserves exactly where NULL sits today and
-- narrows exactly one value: `personal`.
--
-- WHAT THIS FILE DOES NOT TOUCH: the owner arm, `iam.permissions`, `iam.memberships` on the row
-- itself, `platform.entity_grants`, the library lanes, `public.has_permission_for` — every explicit
-- direct grant. They all sit ABOVE the containment walks in the kernel and are unchanged, which is
-- what makes "the owner and everyone they shared with keep reading" a fact rather than a hope.
--
-- THIS FILE MOVES THE KERNEL, so it also moves `iam.entity_read_kernel_fingerprint()`. That is the
-- re-proof gate DD-165 declined to open, and opening it is this lane's work: the expected
-- fingerprint is re-stamped here, in the same transaction that installs the guard, and asserted to
-- have actually MOVED — an unmoved fingerprint means the guard was not installed.
--
-- The policies do not change until `iam.apply_rls` runs: that is dd171c. Between this file and it,
-- `iam.verify_canonical` FAILs `containment_respects_personal` on every un-regenerated token — that
-- is the RED, and it is the point.

-- ── 0. REFUSE TO PATCH A KERNEL THAT MOVED UNDERNEATH THIS FILE ──────────────────────────────────
DO $guard$
BEGIN
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'dd171b: the entity read kernel is already stale (live % <> expected %) — '
      'something else is mid-change. Resolve that before layering DD-171 on top.',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
END
$guard$;

-- ── 1. THE KERNEL — iam.has_access_for_base ──────────────────────────────────────────────────────
DO $kernel$
DECLARE
  v_src text; v_new text; v_hits int;
  a_decl   constant text := 'v_parent_id uuid; v_parent_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;';
  a_found  constant text := 'if not coalesce(v_found, false) then return false; end if;';
  a_reach  constant text := 'where r.item_type = p_type and r.item_id = p_id and r.max_level >= p_required';
  a_parent constant text := 'where er.child_type = p_type and er.kind in (''composition'', ''containment'')';
BEGIN
  -- pg_get_functiondef, never a hand-typed header: volatility, SECURITY DEFINER, COST and
  -- search_path are preserved byte-for-byte, so this migration cannot silently re-declare the
  -- kernel while it is guarding it.
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'iam' AND p.proname = 'has_access_for_base' AND p.pronargs = 5;
  IF v_src IS NULL THEN RAISE EXCEPTION 'dd171b: iam.has_access_for_base(5 args) not found'; END IF;

  FOREACH v_new IN ARRAY ARRAY[a_decl, a_found, a_reach, a_parent] LOOP
    v_hits := (length(v_src) - length(replace(v_src, v_new, ''))) / length(v_new);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'dd171b: anchor "%" occurs % time(s) in iam.has_access_for_base, expected exactly 1 '
        '— the kernel moved underneath this migration; re-read it before patching', left(v_new, 60), v_hits;
    END IF;
  END LOOP;
  IF position('v_containment_carries' in v_src) > 0 THEN
    RAISE NOTICE 'dd171b: iam.has_access_for_base already carries the DD-171 guard — nothing to do';
    RETURN;
  END IF;

  v_new := replace(v_src, a_decl, a_decl || E'\n  -- 🚨 DD-171 (2026-09-12) — CONTAINMENT NEVER CARRIES A PERSONAL ROW.'
    || E'\n  -- True when this row may be reached THROUGH a container at all. See the header: the'
    || E'\n  -- table_has_visibility half keeps every COMPONENT inheriting from its parent, because'
    || E'\n  -- entity_row_access_attrs hard-codes o_vis := ''personal'' for a table with no'
    || E'\n  -- visibility column and a component has none BY CONTRACT (db-rules §6d-1).'
    || E'\n  v_containment_carries boolean;');

  v_new := replace(v_new, a_found, a_found
    || E'\n  v_containment_carries := (v_vis is null'
    || E'\n                            or v_vis >= ''internal''::platform.visibility'
    || E'\n                            or not iam.table_has_visibility(v_schema, v_table));');

  -- The reachability conveyance. Guarded in the WHERE rather than around the loop so the refusal is
  -- one predicate in one place and cannot be half-applied.
  v_new := replace(v_new, a_reach, a_reach || E'\n      and v_containment_carries');
  v_new := replace(v_new, a_parent, a_parent || E'\n      and v_containment_carries');

  EXECUTE v_new;
  RAISE NOTICE 'dd171b: iam.has_access_for_base — both containment walks now refuse a personal row';
END
$kernel$;

-- ── 2. THE SET FORM — iam.accessible_entity_ids ──────────────────────────────────────────────────
-- Its parent cascade appends child ids DIRECTLY; nothing behind it re-asks the kernel. So the same
-- predicate has to be written into the three SQL fragments the cascade builds.
-- The one predicate the set form's cascade writes into its generated SQL. A function rather than a
-- literal so the kernel, the mirror and the set form cannot drift apart by one hand-typed clause.
-- NULL keeps its current lane here too (see the header): only `personal` is removed.
create or replace function iam._dd171_containment_filter(p_has_vis boolean, p_alias text, p_joiner text)
returns text
language sql
immutable
as $f$
  select case when coalesce(p_has_vis, false)
    then p_joiner || '(' || quote_ident(p_alias) || '.visibility is null or '
         || quote_ident(p_alias) || '.visibility >= ''internal''::platform.visibility) '
    else '' end;
$f$;
comment on function iam._dd171_containment_filter(boolean, text, text) is
  'DD-171 (2026-09-12): containment never carries a personal row. The child-visibility floor that '
  'iam.accessible_entity_ids'' parent cascade writes into its generated SQL.';

DO $setform$
DECLARE
  v_src text; v_new text; v_hits int; v_a text;
  a_self  constant text := '            || '' select t.id from %s t join clo c on t.%I = c.id''
            || '') select coalesce(array_agg(id), ''''{}'''') from clo'',';
  a_pub   constant text := '            || ''or (t.visibility is distinct from ''''public'''' and t.%I = any($2))''';
  a_else  constant text := '            || ''where t.%I = any($1) ''
            || ''and not exists (select 1 from have h where h.id = t.id)'',';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'iam' AND p.proname = 'accessible_entity_ids' AND p.pronargs = 4;
  IF v_src IS NULL THEN RAISE EXCEPTION 'dd171b: iam.accessible_entity_ids(4 args) not found'; END IF;
  IF position('DD-171' in v_src) > 0 THEN
    RAISE NOTICE 'dd171b: iam.accessible_entity_ids already carries the DD-171 guard — nothing to do';
    RETURN;
  END IF;
  FOREACH v_a IN ARRAY ARRAY[a_self, a_pub, a_else] LOOP
    v_hits := (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'dd171b: anchor "%" occurs % time(s) in iam.accessible_entity_ids, expected exactly 1 '
        '— the resolver moved underneath this migration; re-read it before patching', left(v_a, 60), v_hits;
    END IF;
  END LOOP;

  -- (a) the SELF-containment closure (folder inside folder). Only the non-public branch reaches
  --     here; its public sibling already filters `t.visibility = 'public'`.
  v_new := replace(v_src, a_self,
    '            || '' select t.id from %s t join clo c on t.%I = c.id%s''
            || '') select coalesce(array_agg(id), ''''{}'''') from clo'',');
  -- (b) the two cascade predicates. `>= ''internal''` excludes NULL by construction, so the NULL
  --     row keeps the lane it has today and only `personal` is removed.
  v_new := replace(v_new, a_pub,
    '            || ''or ((t.visibility is null or t.visibility >= ''''internal''''::platform.visibility)''
            || '' and t.visibility is distinct from ''''public'''' and t.%I = any($2))''');
  v_new := replace(v_new, a_else,
    '            || ''where t.%I = any($1) %s''
            || ''and not exists (select 1 from have h where h.id = t.id)'',');
  -- and the format() argument lists that feed the two new %s holes.
  v_new := replace(v_new,
    '            v_tbl, rec.fk_column);
        end if;
        execute v_sql into v_more using v_ids;',
    '            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, ''t'', '' where ''));
        end if;
        execute v_sql into v_more using v_ids;');
  v_new := replace(v_new,
    '            v_tbl, rec.fk_column
          );
          execute v_sql into v_more using v_parent_ids, v_ids;',
    '            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, ''t'', '' and '')
          );
          execute v_sql into v_more using v_parent_ids, v_ids;');

  IF position('_dd171_containment_filter' in v_new) = 0 THEN
    RAISE EXCEPTION 'dd171b: neither cascade format() argument list matched — refusing to install a '
      'predicate with no argument behind it (the format hole would render literally)';
  END IF;

  -- The DD-171 marker goes INSIDE the body (first line after the opening dollar quote) so the
  -- idempotency check above can see it on a re-run.
  v_new := replace(v_new, 'AS $function$', 'AS $function$
-- DD-171: containment never carries a personal row (see iam._dd171_containment_filter).');
  EXECUTE v_new;
  RAISE NOTICE 'dd171b: iam.accessible_entity_ids — the parent cascade now refuses a personal child';
END
$setform$;

-- ── 3. THE MIRROR — iam.entity_read_expr ─────────────────────────────────────────────────────────
DO $mirror$
DECLARE
  v_src text; v_new text; v_hits int;
  a_arm constant text := '''(%1$I is not null and visibility is not null and visibility <> ''''public'''' and %1$I in''';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'iam' AND p.proname = 'entity_read_expr';
  IF v_src IS NULL THEN RAISE EXCEPTION 'dd171b: iam.entity_read_expr not found'; END IF;
  IF position('DD-171' in v_src) > 0 THEN
    RAISE NOTICE 'dd171b: iam.entity_read_expr already carries the DD-171 guard — nothing to do';
    RETURN;
  END IF;
  v_hits := (length(v_src) - length(replace(v_src, a_arm, ''))) / length(a_arm);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'dd171b: the non-public parent-FK arm occurs % time(s) in iam.entity_read_expr, '
      'expected exactly 1 — re-read the mirror before patching', v_hits;
  END IF;
  -- `visibility >= 'internal'` is NULL-false, so the NULL row stays exactly where it is: on the
  -- sibling arm above, which walks the parent with include_public => true. Only `personal` moves.
  v_new := replace(v_src, a_arm,
    '''(%1$I is not null and visibility >= ''''internal''''::platform.visibility and visibility <> ''''public'''' and %1$I in''');
  v_new := replace(v_new, 'AS $function$', 'AS $function$
-- DD-171: containment never carries a personal row — the emitted parent-FK arm stops at internal.');
  EXECUTE v_new;
  RAISE NOTICE 'dd171b: iam.entity_read_expr — the emitted containment arm now stops at internal';
END
$mirror$;

-- ── 4. RE-STAMP THE KERNEL FINGERPRINT, AND PROVE IT MOVED ───────────────────────────────────────
DO $fp$
DECLARE v_fp text := iam.entity_read_kernel_fingerprint();
BEGIN
  IF v_fp = iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'dd171b: the kernel fingerprint did NOT move — the guard was not actually installed';
  END IF;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text LANGUAGE sql IMMUTABLE AS $f$ select %L::text $f$',
    v_fp);
  RAISE NOTICE 'dd171b: entity read kernel fingerprint re-stamped to %', v_fp;
END
$fp$;

-- ── 5. THE CHECK THAT KEEPS THE WALL UP — iam.verify_canonical.containment_respects_personal ─────
-- A wall that is only written down is a wall the next regeneration quietly removes. This is the
-- CONTAINMENT sibling of DD-165's `personal_row_wall`: that one reads the STAFF arms, this one reads
-- the parent-FK arm the mirror emits. Purely additive — `diff` against the live source deletes
-- nothing, so every other token's finding set is byte-for-byte what it was.
DO $check$
DECLARE
  v_src text; v_new text; v_hits int;
  a_tail constant text := '  -- THE PUBLIC-PARENT ANON LANE GATE (0580). Same shape as the privacy wall,';
  v_block constant text :=
$block$  -- 🚨 CONTAINMENT NEVER CARRIES A PERSONAL ROW (DD-171, 2026-09-12). DD-165 walled every STAFF
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

$block$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'iam' AND p.proname = 'verify_canonical';
  IF v_src IS NULL THEN RAISE EXCEPTION 'dd171b: iam.verify_canonical not found'; END IF;
  IF position('containment_respects_personal' in v_src) > 0 THEN
    RAISE NOTICE 'dd171b: iam.verify_canonical already carries containment_respects_personal';
    RETURN;
  END IF;
  v_hits := (length(v_src) - length(replace(v_src, a_tail, ''))) / length(a_tail);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'dd171b: the insertion anchor occurs % time(s) in iam.verify_canonical, expected '
      'exactly 1 — re-read it before patching', v_hits;
  END IF;
  v_new := replace(v_src, a_tail, v_block || a_tail);
  EXECUTE v_new;
  RAISE NOTICE 'dd171b: iam.verify_canonical gains containment_respects_personal';
END
$check$;

-- ── 6. THE RED, ASSERTED RATHER THAN ASSUMED ─────────────────────────────────────────────────────
-- Between this file and dd171c every containment token is un-regenerated, so the new check must FAIL
-- on the ones that actually hold a containment arm. A check that is GREEN the moment it is installed
-- has proven nothing.
DO $red$
DECLARE r record; v_red text[] := '{}';
BEGIN
  FOR r IN
    SELECT et.token, et.schema_name, et.table_name, et.rls_variant
      FROM platform.entity_types et
     WHERE et.is_active
       AND to_regclass(format('%I.%I', et.schema_name, et.table_name)) IS NOT NULL
       AND EXISTS (SELECT 1 FROM platform.entity_relationships er
                    WHERE er.child_type = et.token AND er.kind IN ('composition','containment'))
       AND EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = et.schema_name AND c.table_name = et.table_name
                      AND c.column_name = 'visibility' AND c.udt_schema = 'platform' AND c.udt_name = 'visibility')
     ORDER BY et.token
  LOOP
    IF EXISTS (SELECT 1 FROM iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant) v
                WHERE v.check_name = 'containment_respects_personal' AND v.status = 'FAIL') THEN
      v_red := array_append(v_red, r.token);
    END IF;
  END LOOP;
  IF cardinality(v_red) = 0 THEN
    RAISE EXCEPTION 'dd171b: containment_respects_personal is GREEN on every token the moment it was '
      'installed. Either the policies are already walled (they are not — dd171c has not run) or the '
      'check does not detect anything. Refusing to ship a check that never goes RED.';
  END IF;
  RAISE NOTICE 'dd171b RED: containment_respects_personal FAILs on % token(s): %',
    cardinality(v_red), array_to_string(v_red, ', ');
END
$red$;
