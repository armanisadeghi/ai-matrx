-- DD-136b — THE OTHER HALF: A COMPONENT'S ACCESS IS ITS PARENT'S, INCLUDING FOR
-- THE ORGANIZATION'S ADMINS.
--
-- ── WHAT DD-136 LEFT OPEN, measured live after it landed ────────────────────
-- `iam_admin_lane_honours_personal_visibility_dd136.sql` (applied 2026-09-12
-- 11:10 UTC) guarded the org-admin read arm with `visibility >= 'internal'`
-- WHERE THE TABLE DECLARES A VISIBILITY CONTRACT, and deliberately left the arm
-- alone on the 305 org-scoped tables that declare none — because
-- `platform.entity_row_access_attrs` hard-codes `'personal'` for such a table
-- and a bare guard would have stripped the lane from tables that cannot hold a
-- private row at all.
--
-- 281 of those 305 are COMPONENTS, and a component is exactly the case that
-- rule gets wrong. A component has no visibility of its own BECAUSE ITS ACCESS
-- IS ITS PARENT'S (db-rules §6d-1) — so "declares no visibility contract" does
-- not mean "holds nothing private", it means "ask the parent". Measured, as the
-- same real org admin who is not a platform admin, the same identity DD-136
-- used:
--
--   chat.conversation, other people's `personal` rows   10,817  ->  7 (all ticketed)
--   chat.message in those conversations                 71,424  ->  71,424   ← UNCHANGED
--
-- The conversation is closed and every message inside it is still readable, by
-- role, with no audit. That is Arman's own example (2026-09-12): *"the admin
-- can't randomly go look at my emails"*. A door on the envelope and none on the
-- letter is not a door.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
-- A component whose composition/containment parent is registered AND whose FK
-- column exists does not get an org-admin role arm at all. It does not need
-- one: its generated read lane already carries
--     <fk> in (select … iam.accessible_entity_ids('<parent token>', 'viewer' …))
-- so an admin who may read the parent still reads every component of it, and an
-- admin who may not, does not. Same condition in the kernel's early org-admin
-- lane, because db-rules §6d requires the kernel and the mirror to agree.
--
-- Census, live: 281 component tables carry the arm; ALL 281 have a registered
-- composition/containment parent whose FK column is present, so not one of them
-- is left without a lane. 0 of them declare a visibility column, so none is
-- touched twice by DD-136's guard.
--
-- ── PROVEN IN THIS TRANSACTION, OR NOTHING COMMITS ──────────────────────────
--  A. TEXTUAL: every regenerated component `std_select` equals its pre-change
--     text with EXACTLY the org-admin arm removed, and every other policy on
--     every affected table is byte-identical.
--  B. RED -> GREEN on the real thing: the same org admin's readable count over
--     `chat.message` rows belonging to other people's `personal` conversations,
--     measured from outside RLS so the number cannot be flattered by the
--     policy being tested.
--  C. NOBODY ELSE LOSES A ROW: the row's owner, a true bystander (a member who
--     owns or administers NO organization) and the platform admin see identical
--     counts on `chat.conversation` and `chat.message` before and after.
--  D. STRUCTURAL: no component token emits an org-admin arm afterwards.
--  E. `iam.verify_canonical` FAIL counts did not rise; fingerprint re-baselined
--     and live == expected at the end.
--
-- One-shot, like DD-136: re-running aborts at the RED reading, because a
-- forcing test that cannot fail first is not a forcing test.

set local statement_timeout = '900s';

DO $pre$
BEGIN
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION
      'DD-136b: read-kernel fingerprint already moved (live %, expected %) — re-prove the mirror before stacking another kernel change on it',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
END
$pre$;

-- ── 1. THE SHARED PREDICATE, asked by the kernel AND the mirror ─────────────
CREATE OR REPLACE FUNCTION iam.token_is_parented_component(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  select exists (
    select 1
    from platform.entity_types et
    join platform.entity_relationships er
      on er.child_type = et.token and er.kind in ('composition','containment')
    where et.token = p_token
      and et.is_active
      and (et.is_component or et.rls_variant = 'component')
      and exists (select 1 from information_schema.columns c
                   where c.table_schema = et.schema_name
                     and c.table_name = et.table_name
                     and c.column_name = er.fk_column)
  );
$function$;

COMMENT ON FUNCTION iam.token_is_parented_component(text) IS
  'DD-136b. True when this token is a component whose composition/containment parent is registered and whose FK column actually exists on the table — i.e. its generated read lane already resolves access through the parent. The kernel (iam.has_access_for_base) and the mirror (iam.entity_read_expr) BOTH ask this before granting an org owner/admin a role-derived read, so they cannot drift on it.';

-- ── 2. THE IDENTITIES AND THE RED READING, before anything moves ────────────
CREATE TEMP TABLE _dd136b_identities ON COMMIT DROP AS
SELECT om.user_id AS admin_user, 0::bigint AS others_personal_messages
FROM iam.organization_member om
WHERE om.role IN ('owner','admin')
  AND NOT public.is_platform_admin_for(om.user_id)
ORDER BY (SELECT count(*) FROM chat.message m JOIN chat.conversation c ON c.id = m.conversation_id
           WHERE m.organization_id = om.organization_id
             AND c.visibility < 'internal'::platform.visibility
             AND c.created_by IS DISTINCT FROM om.user_id) DESC
LIMIT 1;

-- The RED reading is taken with EXACTLY the query proof B will re-run: the
-- DEPLOYED policy expressions, evaluated as this identity, counting messages
-- this identity can read that sit inside somebody else's `personal`
-- conversation THAT THIS IDENTITY CANNOT READ. Two different populations would
-- make "RED N -> GREEN 0" a sentence about nothing, and the parent clause is
-- the law itself: a component is readable exactly when its parent is. A message
-- inside a conversation that was genuinely SHARED with this admin is not a
-- violation and is not counted — that is the door working. Neither is a message
-- somebody deliberately attached to something (7 live `message` rows carry a
-- reachability edge and an association); a ticket on the row itself is a ticket.
DO $redmeasure$
DECLARE v_u uuid; v_n bigint;
BEGIN
  SELECT admin_user INTO v_u FROM _dd136b_identities;
  IF v_u IS NULL THEN RETURN; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  EXECUTE format(
    'select count(*)::bigint from (select * from chat.message) s
      where (%s)
        and exists (select 1 from chat.conversation c where c.id = s.conversation_id
                     and c.visibility < ''internal''::platform.visibility
                     and c.created_by is distinct from %L::uuid)
        and not exists (select 1 from (select * from chat.conversation) cc
                         where cc.id = s.conversation_id and (%s))
        and not exists (select 1 from platform.reachability rr
                         where rr.item_type = ''message'' and rr.item_id = s.id)
        and not exists (select 1 from platform.associations_live aa
                         where aa.source_type = ''message'' and aa.source_id = s.id)
        and not exists (select 1 from iam.permissions pp
                         where pp.resource_type = ''message'' and pp.resource_id = s.id)',
    (SELECT p.qual FROM pg_policies p WHERE p.schemaname='chat' AND p.tablename='message' AND p.policyname='std_select'),
    v_u,
    (SELECT p.qual FROM pg_policies p WHERE p.schemaname='chat' AND p.tablename='conversation' AND p.policyname='std_select'))
    INTO v_n;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE _dd136b_identities SET others_personal_messages = v_n;
END
$redmeasure$;

-- A TRUE bystander: a member who owns or administers NO organization anywhere,
-- so nothing this file does can touch what they see. Picking "a member of that
-- org" is not enough — DD-136's own proof C caught that, because the member it
-- picked was an admin somewhere else and legitimately lost a row.
CREATE TEMP TABLE _dd136b_bystanders ON COMMIT DROP AS
WITH cand AS (
  SELECT om.user_id
  FROM iam.organization_member om
  WHERE NOT EXISTS (SELECT 1 FROM iam.organization_member o2
                     WHERE o2.user_id = om.user_id AND o2.role IN ('owner','admin'))
    AND NOT public.is_platform_admin_for(om.user_id)
  GROUP BY om.user_id
  ORDER BY om.user_id
  LIMIT 1
), plat AS (
  SELECT a.user_id FROM public.current_user_is_admin a WHERE a.is_admin IS TRUE ORDER BY a.user_id LIMIT 1
), who AS (
  SELECT 'true_bystander'::text AS who, user_id FROM cand
  UNION ALL SELECT 'platform_admin', user_id FROM plat
)
SELECT who.who, who.user_id AS uid,
       public.std_select_count_as(who.user_id, 'chat', 'conversation') AS conversations,
       public.std_select_count_as(who.user_id, 'chat', 'message') AS messages
FROM who WHERE who.user_id IS NOT NULL;

-- THE ROW'S OWNER keeps their OWN data. Every live creator of a sub-internal
-- conversation also administers an organization, so their TOTAL counts legitimately
-- fall with this change (they stop reading other people's). What must not move is
-- what they see of THEIR OWN — measured under the deployed policy, restricted to
-- their own rows, before and after.
CREATE TEMP TABLE _dd136b_owner ON COMMIT DROP AS
SELECT c.created_by AS owner_user, 0::bigint AS own_conversations, 0::bigint AS own_messages
FROM chat.conversation c
WHERE c.visibility < 'internal'::platform.visibility AND c.created_by IS NOT NULL
GROUP BY c.created_by ORDER BY count(*) DESC LIMIT 1;

DO $ownerbase$
DECLARE v_u uuid; v_c bigint; v_m bigint;
BEGIN
  SELECT owner_user INTO v_u FROM _dd136b_owner;
  IF v_u IS NULL THEN RETURN; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  EXECUTE format('select count(*)::bigint from (select * from chat.conversation) s where (%s) and s.created_by = %L::uuid',
                 (SELECT p.qual FROM pg_policies p WHERE p.schemaname='chat' AND p.tablename='conversation' AND p.policyname='std_select'), v_u)
    INTO v_c;
  EXECUTE format('select count(*)::bigint from (select * from chat.message) s where (%s) and exists (select 1 from chat.conversation c where c.id = s.conversation_id and c.created_by = %L::uuid)',
                 (SELECT p.qual FROM pg_policies p WHERE p.schemaname='chat' AND p.tablename='message' AND p.policyname='std_select'), v_u)
    INTO v_m;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE _dd136b_owner SET own_conversations = v_c, own_messages = v_m;
  RAISE NOTICE 'DD-136b owner baseline (%): % own conversations, % own messages', v_u, v_c, v_m;
END
$ownerbase$;

DO $reset$ BEGIN PERFORM set_config('request.jwt.claims', '', true); END $reset$;

DO $red$
DECLARE v_admin uuid; v_rows bigint; v_bystanders int;
BEGIN
  SELECT admin_user, others_personal_messages INTO v_admin, v_rows FROM _dd136b_identities;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'DD-136b: no org owner/admin who is not a platform admin exists — the forcing test cannot be run, and an unrun forcing test is not a forcing test';
  END IF;
  SELECT count(*) INTO v_bystanders FROM _dd136b_bystanders;
  IF v_bystanders < 2 THEN
    RAISE EXCEPTION 'DD-136b: only % of the 2 unrestricted bystander identities could be found — refusing to claim "nobody else loses a row" on a partial baseline', v_bystanders;
  END IF;
  IF (SELECT owner_user FROM _dd136b_owner) IS NULL THEN
    RAISE EXCEPTION 'DD-136b: no owner of a sub-internal conversation could be found to prove the owner keeps their own data';
  END IF;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'DD-136b: the probe found NOTHING to close — either this is already fixed, or the measurement is wrong. Refusing either way.';
  END IF;
  RAISE NOTICE 'DD-136b RED (identity %): % chat.message row(s) inside other people''s personal conversations sit in organizations this non-platform-admin administers', v_admin, v_rows;
END
$red$;

CREATE TEMP TABLE _dd136b_before ON COMMIT DROP AS
SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text AS roles,
       p.permissive, p.qual, p.with_check, et.token, coalesce(et.rls_variant,'entity') AS rls_variant
FROM pg_policies p
JOIN platform.entity_types et
  ON et.schema_name = p.schemaname AND et.table_name = p.tablename AND et.is_active
WHERE (p.schemaname, p.tablename) IN (
  SELECT q.schemaname, q.tablename FROM pg_policies q
  JOIN platform.entity_types e2 ON e2.schema_name = q.schemaname AND e2.table_name = q.tablename AND e2.is_active
  WHERE q.policyname = 'std_select'
    AND q.qual ~ 'iam\.organization_member'
    AND iam.token_is_parented_component(e2.token)
);

CREATE TEMP TABLE _dd136b_fails_before ON COMMIT DROP AS
SELECT et.schema_name, et.table_name, et.token, coalesce(et.rls_variant,'entity') AS rls_variant,
       (SELECT count(*) FROM iam.verify_canonical(et.schema_name, et.table_name, et.token, coalesce(et.rls_variant,'entity')) v
         WHERE v.status = 'FAIL') AS fails
FROM (SELECT DISTINCT schemaname, tablename FROM _dd136b_before) b
JOIN platform.entity_types et
  ON et.schema_name = b.schemaname AND et.table_name = b.tablename AND et.is_active;

-- ── 3. THE KERNEL ───────────────────────────────────────────────────────────
DO $kpatch$
DECLARE
  v_def text := pg_get_functiondef('iam.has_access_for_base(uuid,text,uuid,permission_level,boolean)'::regprocedure);
  v_old text := $old$    if v_is_org_admin
       and (v_vis >= 'internal'::platform.visibility
            or not iam.table_has_visibility(v_schema, v_table))
    then return true; end if;$old$;
  v_new text := $new$    -- 🚨 DD-136b (2026-09-12) — AND A COMPONENT ASKS ITS PARENT.
    -- `not iam.table_has_visibility(...)` alone was too generous: 281 of the
    -- 305 tables it spared are COMPONENTS, and a component has no visibility
    -- column precisely BECAUSE its access is its parent's (db-rules §6d-1), not
    -- because it holds nothing private. It left every chat.message inside a
    -- `personal` conversation readable by the organization's admins after
    -- DD-136 had closed the conversation itself — 71,424 of them for one real
    -- admin. A component with a registered parent needs no role arm: its
    -- generated lane resolves the parent's accessible ids, so an admin who may
    -- read the parent still reads all of it, and an admin who may not, does not.
    if v_is_org_admin
       and (v_vis >= 'internal'::platform.visibility
            or (not iam.table_has_visibility(v_schema, v_table)
                and not iam.token_is_parented_component(p_type)))
    then return true; end if;$new$;
  v_hits int;
BEGIN
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'DD-136b: the DD-136 guard anchor occurs % time(s) in iam.has_access_for_base, expected exactly 1 — the kernel moved underneath this migration; re-read it before patching', v_hits;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
  RAISE NOTICE 'DD-136b: iam.has_access_for_base patched — the early org-admin lane no longer fires on a parented component';
END
$kpatch$;

-- ── 3b. 🚨 THE THIRD COPY OF THE SAME LANE — `iam.accessible_entity_ids` ────
--
-- FOUND BY THE REHEARSAL OF THIS FILE, after the component arm was already
-- removed and the leak did not move: 74,331 of somebody else's private messages
-- were still readable. The set-wise resolver builds its own "trusted" predicate
-- and carries THE SAME org-admin lane, unguarded, one line below a sibling lane
-- that IS guarded:
--
--     if v_has_org then
--       v_trusted := ... ' or t.organization_id in (select om.organization_id
--         from iam.organization_member om where om.user_id = $1
--         and om.role in (''owner'', ''admin''))';
--
-- It matters more here than anywhere, because a COMPONENT's generated read lane
-- calls this function on the PARENT token and takes the answer as final — there
-- is no `iam.has_access` confirmation behind it (D266: a component may never
-- ask accessible_entity_ids about its own token, so the parent set IS the
-- lane). So `chat.conversation` correctly showed the admin 7 rows while
-- `accessible_entity_ids('conversation','viewer')` still handed 10,817 ids to
-- `chat.message`. Two answers to the same question, and the component believed
-- the wrong one.
--
-- Guarded the same way, from the function's own catalog definition.
DO $setwise$
DECLARE
  v_def text := pg_get_functiondef('iam.accessible_entity_ids(text,permission_level,integer,boolean)'::regprocedure);
  v_old text := $old$    if v_has_org then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id '
        || 'from iam.organization_member om where om.user_id = $1 '
        || 'and om.role in (''owner'', ''admin''))';
    end if;$old$;
  v_new text := $new$    -- 🚨 DD-136b (2026-09-12) — THE THIRD COPY OF THE ORG-ADMIN LANE.
    -- Unguarded, it handed an organization's admins every id in the
    -- organization at viewer, including `personal` rows, and a component's
    -- generated read lane takes this set as final with no has_access behind it.
    -- Guarded to match iam.has_access_for_base and iam.entity_read_expr; a
    -- parented component still gets nothing by role here, because its access is
    -- its parent's (db-rules §6d-1).
    if v_has_org and v_has_vis then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    elsif v_has_org and not iam.token_is_parented_component(p_type) then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id '
        || 'from iam.organization_member om where om.user_id = $1 '
        || 'and om.role in (''owner'', ''admin''))';
    end if;$new$;
  v_hits int;
BEGIN
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'DD-136b: the unguarded org-admin lane anchor occurs % time(s) in iam.accessible_entity_ids, expected exactly 1 — re-read the resolver before patching', v_hits;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
  RAISE NOTICE 'DD-136b: iam.accessible_entity_ids patched — the set-wise org-admin lane honours visibility';
END
$setwise$;

DO $bump$
DECLARE v_fp text := iam.entity_read_kernel_fingerprint();
BEGIN
  IF v_fp = iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'DD-136b: the kernel fingerprint did NOT move — the guard was not actually installed';
  END IF;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text LANGUAGE sql IMMUTABLE AS $f$ select %L::text $f$', v_fp);
  RAISE NOTICE 'DD-136b: read-kernel fingerprint re-baselined to %', v_fp;
END
$bump$;

-- ── 4. THE MIRROR ───────────────────────────────────────────────────────────
DO $patch$
DECLARE
  v_def text := pg_get_functiondef('iam.entity_read_expr(text,text,text,text)'::regprocedure);
  v_old text := $old$    else
      v_arms := array_append(v_arms,
        '(organization_id is not null and organization_id in'
        ' (select om.organization_id from iam.organization_member om'
        ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))');
    end if;$old$;
  v_new text := $new$    elsif not iam.token_is_parented_component(p_token) then
      -- 🚨 DD-136b (2026-09-12) — A COMPONENT ASKS ITS PARENT, SO IT GETS NO
      -- ROLE ARM. DD-136 spared every table with no visibility column; 281 of
      -- them are components, which have no visibility column precisely BECAUSE
      -- their access is their parent's (db-rules §6d-1). Leaving the arm there
      -- meant an organization's admins kept reading every chat.message inside a
      -- `personal` conversation whose envelope DD-136 had just closed — 71,424
      -- rows for one real admin. The lane they lose here is one they never
      -- needed: the parent-cascade arm below resolves
      -- `iam.accessible_entity_ids('<parent>', 'viewer')`, so an admin who may
      -- read the parent still reads all of its components. Measured before
      -- changing anything: all 281 have a registered parent whose FK column
      -- exists, so not one is left with no lane at all.
      v_arms := array_append(v_arms,
        '(organization_id is not null and organization_id in'
        ' (select om.organization_id from iam.organization_member om'
        ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))');
    end if;$new$;
  v_hits int;
BEGIN
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'DD-136b: the unguarded-arm anchor occurs % time(s) in iam.entity_read_expr, expected exactly 1 — re-read the generator before patching', v_hits;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
  RAISE NOTICE 'DD-136b: iam.entity_read_expr patched — a parented component emits no org-admin arm';
END
$patch$;

-- ── 5. REGENERATION ─────────────────────────────────────────────────────────
DO $sweep$
DECLARE
  r record; v_done int := 0; v_failed text[] := '{}'; v_ok boolean; v_last text; v_retried int := 0;
BEGIN
  FOR r IN
    SELECT et.token, et.schema_name, et.table_name, coalesce(et.rls_variant,'entity') AS rls_variant
    FROM (SELECT DISTINCT schemaname, tablename FROM _dd136b_before) b
    JOIN platform.entity_types et
      ON et.schema_name = b.schemaname AND et.table_name = b.tablename AND et.is_active
    WHERE coalesce(et.audit_class,'entity') <> 'machinery'
    ORDER BY et.schema_name, et.table_name
  LOOP
    v_ok := false;
    FOR attempt IN 1..6 LOOP
      BEGIN
        PERFORM iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
        v_ok := true; EXIT;
      EXCEPTION
        WHEN deadlock_detected OR lock_not_available THEN
          v_last := SQLERRM; v_retried := v_retried + 1;
          PERFORM pg_sleep(0.5 * attempt);
        WHEN OTHERS THEN
          v_last := SQLERRM; EXIT;
      END;
    END LOOP;
    IF v_ok THEN v_done := v_done + 1;
    ELSE v_failed := array_append(v_failed, format('%s.%s (%s): %s', r.schema_name, r.table_name, r.token, v_last)); END IF;
  END LOOP;
  RAISE NOTICE 'DD-136b regeneration: % table(s) regenerated, % failed, % lock retries', v_done, cardinality(v_failed), v_retried;
  IF cardinality(v_failed) > 0 THEN
    RAISE EXCEPTION 'DD-136b regeneration failed on % table(s) — nothing is committed: %', cardinality(v_failed), array_to_string(v_failed, ' | ');
  END IF;
END
$sweep$;

-- ── 5b. RESTORE ANY BESPOKE POLICY iam.apply_rls DELETED (DD-136 found this) ─
DO $restore$
DECLARE r record; v_n int := 0; v_sql text; v_roles text; v_names text[] := '{}';
BEGIN
  FOR r IN
    SELECT b.* FROM _dd136b_before b
    WHERE b.policyname NOT LIKE 'std\_%'
      AND NOT EXISTS (SELECT 1 FROM pg_policies p
                       WHERE p.schemaname = b.schemaname AND p.tablename = b.tablename AND p.policyname = b.policyname)
    ORDER BY 1,2,3
  LOOP
    v_roles := replace(replace(r.roles, '{', ''), '}', '');
    IF v_roles = '' OR v_roles IS NULL THEN v_roles := 'public'; END IF;
    IF position('"' in v_roles) > 0 THEN
      RAISE EXCEPTION 'DD-136b: policy %.%/% has a quoted role list (%) this restorer will not reproduce faithfully — handle it by hand rather than guess',
        r.schemaname, r.tablename, r.policyname, r.roles;
    END IF;
    v_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s', r.policyname, r.schemaname, r.tablename,
                    CASE WHEN r.permissive = 'RESTRICTIVE' THEN 'RESTRICTIVE' ELSE 'PERMISSIVE' END, r.cmd, v_roles);
    IF r.qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', r.qual); END IF;
    IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', r.with_check); END IF;
    EXECUTE v_sql;
    v_n := v_n + 1; v_names := array_append(v_names, format('%s.%s/%s', r.schemaname, r.tablename, r.policyname));
  END LOOP;
  IF v_n > 0 THEN
    RAISE WARNING 'DD-136b: iam.apply_rls DELETED % bespoke policy/policies while regenerating; restored verbatim from the pre-sweep snapshot: %', v_n, array_to_string(v_names, ', ');
  END IF;
END
$restore$;

-- ── 6. THE PROOFS ───────────────────────────────────────────────────────────
DO $proofA$
DECLARE
  v_arm constant text := '((organization_id IS NOT NULL) AND (organization_id IN ( SELECT om.organization_id
   FROM iam.organization_member om
  WHERE ((om.user_id = ( SELECT auth.uid() AS uid)) AND (om.role = ANY (ARRAY[''owner''::org_role, ''admin''::org_role])))))) OR ';
  v_cand constant text := 'SELECT iam\.unnest_uuids\(iam\.accessible_entity_ids\(''[a-z_0-9]+''::text, ''viewer''::permission_level, 0, true\)\) AS unnest_uuids\s*UNION\s*SELECT';
  v_initplan constant text := '( SELECT is_super_admin() AS is_super_admin)';
  v_bad text; v_n int;
BEGIN
  -- A1: every affected std_select == its old text with EXACTLY the arm removed.
  SELECT string_agg(format('%s.%s', b.schemaname, b.tablename), ', '), count(*) INTO v_bad, v_n
  FROM _dd136b_before b
  JOIN pg_policies p ON p.schemaname = b.schemaname AND p.tablename = b.tablename AND p.policyname = b.policyname
  WHERE b.policyname = 'std_select'
    AND regexp_replace(coalesce(p.qual,''), v_cand, 'SELECT', 'g')
        IS DISTINCT FROM regexp_replace(replace(coalesce(b.qual,''), v_arm, ''), v_cand, 'SELECT', 'g');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136b proof A: % component read lane(s) changed by MORE than the removed arm: %', v_n, left(v_bad, 2000);
  END IF;

  -- A2: the arm really was there, exactly once, on every one of them.
  SELECT string_agg(format('%s.%s', b.schemaname, b.tablename), ', ') INTO v_bad
  FROM _dd136b_before b
  WHERE b.policyname = 'std_select'
    AND (length(coalesce(b.qual,'')) - length(replace(coalesce(b.qual,''), v_arm, ''))) / length(v_arm) <> 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136b proof A: the org-admin arm did not appear exactly once in the pre-change policy of: %', left(v_bad, 2000);
  END IF;

  -- A3: every other policy on every affected table is byte-identical (modulo the
  -- semantically-empty InitPlan wrapper on std_insert, normalised on both sides).
  SELECT string_agg(format('%s.%s/%s', b.schemaname, b.tablename, b.policyname), ', ') INTO v_bad
  FROM _dd136b_before b
  LEFT JOIN pg_policies p ON p.schemaname = b.schemaname AND p.tablename = b.tablename AND p.policyname = b.policyname
  WHERE b.policyname <> 'std_select'
    AND (p.policyname IS NULL
         OR replace(coalesce(p.qual,''), v_initplan, 'is_super_admin()')
            IS DISTINCT FROM replace(coalesce(b.qual,''), v_initplan, 'is_super_admin()')
         OR replace(coalesce(p.with_check,''), v_initplan, 'is_super_admin()')
            IS DISTINCT FROM replace(coalesce(b.with_check,''), v_initplan, 'is_super_admin()')
         OR p.roles::text IS DISTINCT FROM b.roles
         OR p.cmd IS DISTINCT FROM b.cmd);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136b proof A: a NON-select policy moved on: %', left(v_bad, 2000);
  END IF;

  RAISE NOTICE 'DD-136b proof A: % component std_select policies differ from before by exactly the removed org-admin arm; every other policy byte-identical',
    (SELECT count(*) FROM _dd136b_before WHERE policyname = 'std_select');
END
$proofA$;

-- PROOF B — RED -> GREEN on the real thing, measured from OUTSIDE the policy.
DO $proofB$
DECLARE v_admin uuid; v_red bigint; v_green bigint;
BEGIN
  SELECT admin_user, others_personal_messages INTO v_admin, v_red FROM _dd136b_identities;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE format(
    'select count(*)::bigint from (select * from chat.message) s
      where (%s)
        and exists (select 1 from chat.conversation c where c.id = s.conversation_id
                     and c.visibility < ''internal''::platform.visibility
                     and c.created_by is distinct from %L::uuid)
        and not exists (select 1 from (select * from chat.conversation) cc
                         where cc.id = s.conversation_id and (%s))
        and not exists (select 1 from platform.reachability rr
                         where rr.item_type = ''message'' and rr.item_id = s.id)
        and not exists (select 1 from platform.associations_live aa
                         where aa.source_type = ''message'' and aa.source_id = s.id)
        and not exists (select 1 from iam.permissions pp
                         where pp.resource_type = ''message'' and pp.resource_id = s.id)',
    (SELECT p.qual FROM pg_policies p WHERE p.schemaname='chat' AND p.tablename='message' AND p.policyname='std_select'),
    v_admin,
    (SELECT p.qual FROM pg_policies p WHERE p.schemaname='chat' AND p.tablename='conversation' AND p.policyname='std_select'))
    INTO v_green;
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_green <> 0 THEN
    RAISE EXCEPTION 'DD-136b proof B: an org admin who is not a platform admin can STILL read % chat.message row(s) whose parent conversation is somebody else''s private one that they CANNOT read — the component is not deferring to its parent', v_green;
  END IF;
  RAISE NOTICE 'DD-136b proof B: chat.message inside other people''s UNREADABLE private conversations, same identity, same query: RED % -> GREEN 0', v_red;
END
$proofB$;

-- PROOF C — NOBODY ELSE LOSES A ROW.
DO $proofC$
DECLARE r record; v_now bigint; v_bad text[] := '{}';
BEGIN
  FOR r IN SELECT * FROM _dd136b_bystanders LOOP
    v_now := public.std_select_count_as(r.uid, 'chat', 'conversation');
    IF v_now IS DISTINCT FROM r.conversations THEN
      v_bad := array_append(v_bad, format('%s chat.conversation %s -> %s', r.who, r.conversations, v_now));
    END IF;
    v_now := public.std_select_count_as(r.uid, 'chat', 'message');
    IF v_now IS DISTINCT FROM r.messages THEN
      v_bad := array_append(v_bad, format('%s chat.message %s -> %s', r.who, r.messages, v_now));
    END IF;
  END LOOP;
  DECLARE v_u uuid; v_c bigint; v_m bigint; v_c0 bigint; v_m0 bigint;
  BEGIN
    SELECT owner_user, own_conversations, own_messages INTO v_u, v_c0, v_m0 FROM _dd136b_owner;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
    EXECUTE format('select count(*)::bigint from (select * from chat.conversation) s where (%s) and s.created_by = %L::uuid',
                   (SELECT p.qual FROM pg_policies p WHERE p.schemaname='chat' AND p.tablename='conversation' AND p.policyname='std_select'), v_u)
      INTO v_c;
    EXECUTE format('select count(*)::bigint from (select * from chat.message) s where (%s) and exists (select 1 from chat.conversation c where c.id = s.conversation_id and c.created_by = %L::uuid)',
                   (SELECT p.qual FROM pg_policies p WHERE p.schemaname='chat' AND p.tablename='message' AND p.policyname='std_select'), v_u)
      INTO v_m;
    IF v_c IS DISTINCT FROM v_c0 THEN v_bad := array_append(v_bad, format('row_owner own conversations %s -> %s', v_c0, v_c)); END IF;
    IF v_m IS DISTINCT FROM v_m0 THEN v_bad := array_append(v_bad, format('row_owner own messages %s -> %s', v_m0, v_m)); END IF;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  IF cardinality(v_bad) > 0 THEN
    RAISE EXCEPTION 'DD-136b proof C: an identity that must lose NOTHING lost rows (a blocked legitimate reader is as serious as a leak, db-rules §6a): %', array_to_string(v_bad, ' | ');
  END IF;
  RAISE NOTICE 'DD-136b proof C: a true bystander and the platform admin see identical totals; the row owner still sees every one of their own conversations and messages';
END
$proofC$;

-- PROOF D — STRUCTURAL: no parented component emits an org-admin arm any more.
DO $proofD$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(et.schema_name||'.'||et.table_name, ', ') INTO v_bad
  FROM platform.entity_types et
  WHERE et.is_active
    AND coalesce(et.audit_class,'entity') <> 'machinery'
    AND to_regclass(format('%I.%I', et.schema_name, et.table_name)) IS NOT NULL
    AND iam.token_is_parented_component(et.token)
    AND iam.entity_read_expr(et.schema_name, et.table_name, et.token, 'component')
        LIKE '%om.role in (''owner'',''admin'')%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136b proof D: parented component token(s) still emit an org-admin arm: %', left(v_bad, 2000);
  END IF;

  SELECT string_agg(b.schemaname||'.'||b.tablename, ', ') INTO v_bad
  FROM (SELECT DISTINCT schemaname, tablename FROM _dd136b_before) b
  JOIN pg_policies p ON p.schemaname = b.schemaname AND p.tablename = b.tablename AND p.policyname = 'std_select'
  WHERE p.qual ~ 'iam\.organization_member';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136b proof D: regenerated component policies still carry the arm: %', left(v_bad, 2000);
  END IF;
  RAISE NOTICE 'DD-136b proof D: no parented component emits or carries an org-admin read arm';
END
$proofD$;

-- PROOF E — conformance did not regress; the mirror is not left stale.
DO $proofE$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s.%s', b.schema_name, b.table_name), ', ') INTO v_bad
  FROM _dd136b_fails_before b
  WHERE (SELECT count(*) FROM iam.verify_canonical(b.schema_name, b.table_name, b.token, b.rls_variant) v
          WHERE v.status = 'FAIL') > b.fails;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136b proof E: iam.verify_canonical FAIL count ROSE on: %', left(v_bad, 2000);
  END IF;
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'DD-136b proof E: fingerprint live % <> expected % at the end — the mirror would emit UNBOUNDED policies',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
  RAISE NOTICE 'DD-136b: CLOSED — the envelope AND the letter. A component asks its parent, for the organization''s admins too.';
END
$proofE$;
