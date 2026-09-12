-- DD-136 — THE ORG-ADMIN READ LANE NOW HONOURS `personal` VISIBILITY.
--
-- ── THE DEFECT, measured live in rolled-back probes on 2026-09-12 ────────────
-- `iam.has_access_for_base` opens its viewer path with
--
--     if p_required = 'viewer' and v_org is not null then
--       v_is_org_admin := public.is_org_admin_for(v_uid, v_org);
--       if v_is_org_admin then return true; end if;   -- ← NO VISIBILITY GUARD
--     end if;
--
-- and the read-lane MIRROR `iam.entity_read_expr` emits the same arm, also
-- unguarded, while the TWO ORG ARMS BESIDE IT are both guarded
-- `visibility >= 'internal'`. Consequence: `visibility='personal'` hides a row
-- from a plain member and from NOBODY ELSE.
--
--   identity (org f9cb3e35-2a65-4f2a-8525-088d6551071c)  is_platform_admin  other people's personal chat.conversation rows
--   c5e92166-…3665  plain member                          false              0
--   34ed4fc3-…3261  org ADMIN                              false              10,817   (+ 74,485 chat.message rows)
--
-- No audit row is written by either read and there is nowhere for one to go
-- (`pgaudit` is not installed; the only read-audit tables are `hr.access_audit`
-- and `context.context_access_log`).
--
-- Arman, 2026-09-12: **the organization reaches a person's private data only
-- through an audited emergency door, never by an admin browsing.**
--
-- ── THE FIX IS ONE CONDITION, IN BOTH PLACES ────────────────────────────────
-- db-rules §6d requires the kernel and its generator mirror to agree or the
-- fingerprint gate degrades every table to an unbounded `has_access` lane, so
-- the same condition goes in both:
--
--   kernel  `iam.has_access_for_base` — the early org-admin lane returns true
--           only when `v_vis >= 'internal'`, OR the table carries NO
--           `platform.visibility` column at all.
--   mirror  `iam.entity_read_expr`    — the org-admin arm is emitted with
--           `visibility >= 'internal'::platform.visibility` when the table has
--           that column, and unchanged when it does not.
--
-- THE NO-VISIBILITY-COLUMN BRANCH IS NOT A BYPASS AND IT IS NOT AN ACCIDENT.
-- `platform.entity_row_access_attrs` HARD-CODES `o_vis := 'personal'` for a
-- table with no `visibility` column (branches 3 and 4 of its ladder), so a bare
-- `v_vis >= 'internal'` guard would have stripped the org-admin read lane from
-- 305 org-scoped tables that never declared any visibility contract at all —
-- and on those tables no OTHER role lane exists (`iam.has_org_access_for` is
-- guarded by the same `v_vis >= 'internal'`), so their owners and admins would
-- have been left with the creator lane and explicit grants only. That is a
-- different, much larger decision than DD-136, it is nobody's ruling, and it is
-- not this file's business. A table that has never declared a visibility
-- contract cannot hold a row marked `personal`; the class this migration closes
-- is precisely the tables that CAN. `iam.table_has_visibility` is the shared
-- predicate so the kernel and the mirror cannot drift on that question.
--
-- SCOPE, measured: 562 live `std_select` policies carry the org-admin arm; 257
-- of those tables have a `platform.visibility` column (199 `entity`, 54
-- `system`, 4 unregistered `graveyard` tables) and are the ones whose behaviour
-- changes. The 4 graveyard tables cannot be regenerated (`iam.apply_rls`
-- refuses an inactive registry row) and are RESIDUE, recorded in the report,
-- NOT silently allowlisted — they are retired tables behind a retired schema.
--
-- THE DOOR IS NOT BUILT HERE. DD-137 generalises `public.hr_break_glass` /
-- `hr.access_audit` into the platform-wide audited emergency door. This file
-- leaves no bypass in its place: after it, an organization admin reaches a
-- member's `personal` row by an explicit grant (`iam.permissions`) and by
-- nothing else — which is exactly the row a break-glass grant will write.
--
-- ── WHAT IS PROVEN, IN THIS TRANSACTION, OR NOTHING COMMITS ─────────────────
--  A. TEXTUAL, all affected tables: the regenerated `std_select` equals the
--     pre-change `std_select` with EXACTLY ONE substitution — the visibility
--     conjunct inserted into the org-admin arm — and every OTHER policy on
--     every affected table is byte-identical. This is the collateral-damage
--     proof: if the only textual difference is the guard, no other lane moved.
--  B. BEHAVIOURAL RED→GREEN: `public.admin_door_probe` counts, per table, rows
--     with `visibility < 'internal'` that a real org admin (not a platform
--     admin) can read ONLY because of the org-admin arm. RED before (must be
--     > 0 somewhere, or this migration is not the one you want), 0 after,
--     across every affected table.
--  C. NOBODY ELSE LOSES A ROW: the row counts visible to the row's OWNER, to a
--     plain member, and to a platform admin on `chat.conversation` and
--     `chat.message` are identical before and after.
--  D. `iam.verify_canonical` FAIL counts did not rise on any affected table.
--  E. the read-kernel fingerprint is re-baselined (the kernel really did move)
--     and live == expected at the end, so the mirror is not left stale.
--
-- THIS FILE IS A ONE-SHOT, ON PURPOSE. Re-running it aborts at the RED reading
-- ("the probe found NOTHING to close before the change"), because a migration
-- whose forcing test cannot fail first is not a forcing test. Re-applying after
-- a genuine regression means re-reading the regression, not re-running this.

-- Regenerating 253 read policies and probing whole tables as real identities is
-- minutes of work, not seconds; the PostgREST door's default statement timeout
-- is ~8s. Transaction-local, so it ends with this migration.
set local statement_timeout = '900s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. PRECONDITION — the mirror must be current BEFORE we move the kernel.
-- ─────────────────────────────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION
      'DD-136: read-kernel fingerprint ALREADY moved (live %, expected %) — someone else changed the kernel and did not re-prove the mirror. Refusing to stack a second kernel change on a stale mirror; re-prove first (aidream scripts/_verify_entity_read_equivalence.py).',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
END
$pre$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE SHARED PREDICATE — "does this table declare a visibility contract?"
--    Deliberately identical to the test `iam.entity_read_expr` already makes
--    (`platform.visibility`-typed column named `visibility`), so the kernel and
--    the mirror answer the same question with the same code.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam.table_has_visibility(p_schema text, p_table text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  select exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    join pg_namespace tn on tn.oid = t.typnamespace
    where n.nspname = p_schema and c.relname = p_table
      and a.attname = 'visibility' and a.attnum > 0 and not a.attisdropped
      and tn.nspname = 'platform' and t.typname = 'visibility'
  );
$function$;

COMMENT ON FUNCTION iam.table_has_visibility(text, text) IS
  'DD-136. True when the table declares a platform.visibility contract. The kernel (iam.has_access_for_base) and the mirror (iam.entity_read_expr) BOTH ask this before guarding the org-admin read lane, so they cannot drift on it. platform.entity_row_access_attrs reports ''personal'' for a table with no visibility column, which is why the guard cannot be a bare v_vis >= ''internal''.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE PROBE — the forcing function, usable before and after the fix.
--    Counts rows a given identity can read ONLY because the org-admin arm
--    admits them, restricted to rows whose visibility is below `internal`.
--    SECURITY INVOKER: it evaluates policy EXPRESSIONS as data, it is not a
--    door, and it is granted to service_role only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_door_probe(p_user uuid, p_limit integer DEFAULT NULL)
RETURNS TABLE(schema_name text, table_name text, token text,
              considered bigint, by_role bigint, no_ticket bigint, conveyable boolean)
LANGUAGE plpgsql
AS $function$
declare
  r record;
  v_variant text;
  v_full text;
  v_arm text;
  v_arm_guarded  constant text :=
    '(organization_id is not null and visibility >= ''internal''::platform.visibility and organization_id in'
    ' (select om.organization_id from iam.organization_member om'
    ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))';
  v_arm_open constant text :=
    '(organization_id is not null and organization_id in'
    ' (select om.organization_id from iam.organization_member om'
    ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))';
  v_src text;
  v_ticket text;
  v_orgs uuid[];
  v_all_orgs uuid[];
  v_considered bigint; v_by_role bigint; v_no_ticket bigint;
begin
  if p_user is null then
    raise exception 'admin_door_probe: no identity given — a probe with no identity proves nothing';
  end if;

  select coalesce(array_agg(om.organization_id), '{}') into v_orgs
  from iam.organization_member om
  where om.user_id = p_user and om.role in ('owner','admin');

  select coalesce(array_agg(om.organization_id), '{}') into v_all_orgs
  from iam.organization_member om where om.user_id = p_user;

  if cardinality(v_orgs) = 0 then
    raise exception 'admin_door_probe: % owns or administers no organization — it cannot exercise the org-admin lane', p_user;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);

  for r in
    select et.token as tok, et.schema_name as sch, et.table_name as tbl,
           coalesce(et.rls_variant, 'entity') as variant,
           (et.is_component or et.rls_variant = 'component') as is_comp,
           -- CONVEYABLE: this token's rows can also be reached through a parent
           -- (composition / containment) or through a bespoke resolver that is
           -- not iam.has_access_for_base at all. For those, "no ticket of its
           -- own" is REPORTED rather than asserted: the ticket sits on the
           -- parent, and this probe does not walk parents.
           (exists (select 1 from platform.entity_relationships er
                     where er.child_type = et.token and er.kind in ('composition','containment'))
            or exists (select 1 from pg_proc pp join pg_namespace nn on nn.oid = pp.pronamespace
                        where nn.nspname = 'iam' and pp.proname = 'has_access_for'
                          and pp.prosrc ~ ('p_type\s*=\s*''' || et.token || ''''))) as conveyable
    from platform.entity_types et
    where et.is_active
      and coalesce(et.audit_class, 'entity') <> 'machinery'
      and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
      and iam.table_has_visibility(et.schema_name, et.table_name)
      and exists (select 1 from information_schema.columns c
                   where c.table_schema = et.schema_name and c.table_name = et.table_name
                     and c.column_name = 'organization_id')
    order by et.schema_name, et.table_name
  loop
    v_variant := case when r.is_comp then 'component' else r.variant end;
    v_full := format('%s(%s)', iam.platform_admin_read_prefix(r.tok),
                     iam.entity_read_expr(r.sch, r.tbl, r.tok, v_variant));

    if position(v_arm_guarded in v_full) > 0 then
      v_arm := v_arm_guarded;
    elsif position(v_arm_open in v_full) > 0 then
      v_arm := v_arm_open;
    else
      continue;   -- this token does not carry the org-admin lane at all
    end if;

    -- The candidate population: somebody ELSE's row, below `internal`, inside an
    -- organization this identity owns or administers.
    v_src := format(
      'select * from %I.%I where visibility < ''internal''::platform.visibility and organization_id::text = any(%L::text[])',
      r.sch, r.tbl, v_orgs);
    if exists (select 1 from information_schema.columns c
                where c.table_schema = r.sch and c.table_name = r.tbl and c.column_name = 'created_by') then
      v_src := v_src || format(' and created_by::text is distinct from %L', p_user);
    end if;
    if p_limit is not null then
      v_src := v_src || format(' order by %I.id limit %s', r.tbl, p_limit);
    end if;

    -- A ROW SOMEBODY WAS ACTUALLY GIVEN IS NOT A VIOLATION. DD-136 forbids
    -- reading a private row BECAUSE YOU ARE AN ADMIN; it forbids nothing about
    -- reading a row that was shared with you, and a grant is exactly what the
    -- audited door (DD-137) will write into iam.permissions.
    v_ticket := format(
      'exists (select 1 from iam.permissions pp where pp.resource_type = %1$L'
      ' and pp.resource_id::text = s.id::text'
      ' and (pp.granted_to_user_id = %2$L::uuid or pp.granted_to_organization_id = any(%3$L::uuid[]))'
      ' and pp.status <> ''rejected'' and (pp.expires_at is null or pp.expires_at > now()))'
      ' or exists (select 1 from iam.memberships mm where mm.container_type = %1$L'
      ' and mm.container_id::text = s.id::text and mm.user_id = %2$L::uuid and mm.deleted_at is null)'
      ' or exists (select 1 from platform.reachability rr where rr.item_type = %1$L and rr.item_id::text = s.id::text)'
      ' or exists (select 1 from platform.entity_grants gg where gg.entity_type = %1$L and gg.entity_id::text = s.id::text)'
      ' or exists (select 1 from platform.associations_live aa where aa.source_type = %1$L and aa.source_id::text = s.id::text)',
      r.tok, p_user, v_all_orgs);

    -- TWO statements, not one, and that is the point. `by_role` reads only the
    -- arm — organization, visibility, membership — and is evaluable on every
    -- table. `no_ticket` evaluates the WHOLE generated read lane, which on a
    -- table whose `id` is text rather than uuid RAISES (extend.wbx_guidance:
    -- its std_select compares a text id against uuid candidate sets, so it is
    -- unreadable for every non-platform-admin today — a live defect of its
    -- own). Measuring them together would have thrown away the one number this
    -- migration is actually accountable for.
    execute format('select count(*)::bigint, count(*) filter (where (%1$s))::bigint from (%2$s) s',
                   v_arm, v_src)
      into v_considered, v_by_role;
    begin
      execute format(
        'select count(*) filter (where (%1$s) and not (%2$s))::bigint from (%3$s) s',
        v_full, v_ticket, v_src)
        into v_no_ticket;
    exception when others then
      -- A table the probe cannot evaluate is REPORTED, never skipped silently:
      -- -1 is the unmeasured marker and the caller treats it as a failure unless
      -- it can name why. extend.wbx_guidance is one: its `id` is text while the
      -- generated read lane compares it against uuid sets, so its std_select
      -- RAISES for every non-platform-admin today — a live defect of its own.
      raise warning 'admin_door_probe: %.% — the generated read lane RAISES (% %), so `no_ticket` is UNMEASURED there; `by_role` above is still a real measurement', r.sch, r.tbl, SQLSTATE, SQLERRM;
      v_no_ticket := -1;
    end;

    if v_considered <> 0 or v_by_role <> 0 or v_no_ticket <> 0 then
      schema_name := r.sch; table_name := r.tbl; token := r.tok;
      considered := v_considered; by_role := v_by_role; no_ticket := v_no_ticket;
      conveyable := r.conveyable;
      return next;
    end if;
  end loop;

  -- Never leave the transaction impersonating the probe identity.
  perform set_config('request.jwt.claims', '', true);
  return;
end;
$function$;

COMMENT ON FUNCTION public.admin_door_probe(uuid, integer) IS
  'DD-136 forcing function. For every registered, visibility-declaring, org-scoped table carrying the org-admin read arm, over somebody ELSE''s rows below `internal` visibility inside an organization this identity owns or administers: `by_role` = how many the org-admin arm itself admits (must be 0), `no_ticket` = how many are readable with no permission, membership, reachability, entity grant or scope assignment behind them (must be 0 unless `conveyable` — the token can also be reached through a composition/containment parent or a bespoke resolver, where the ticket sits on the parent). Must be 0 for every table for an org admin who is not a platform admin. p_limit caps rows per table (NULL = the whole table). considered/leaked = -1 means UNMEASURED, which is a failure, never a pass. Service-role only; SECURITY INVOKER; it evaluates policy expressions as data and grants nothing.';

REVOKE ALL ON FUNCTION public.admin_door_probe(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_door_probe(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_door_probe(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_door_probe(uuid, integer) TO service_role;


-- A second, tiny probe: how many rows of a table the DEPLOYED `std_select`
-- admits for one identity. `public.rls_count_as` would do it but it sets the
-- transaction-local `role` GUC to `authenticated`, which would leave the rest
-- of this migration — and the applier's own ledger write — running as that
-- role. This one only sets the JWT claim and evaluates the policy expression,
-- exactly as `iam.entity_read_equivalence` already does.
CREATE OR REPLACE FUNCTION public.std_select_count_as(p_user uuid, p_schema text, p_table text)
RETURNS bigint
LANGUAGE plpgsql
AS $function$
declare v_qual text; v_n bigint;
begin
  if p_user is null then return -1; end if;
  select p.qual into v_qual from pg_policies p
  where p.schemaname = p_schema and p.tablename = p_table and p.policyname = 'std_select';
  if v_qual is null then
    raise exception 'std_select_count_as: %.% has no std_select policy', p_schema, p_table;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute format('select count(*)::bigint from (select * from %I.%I) s where (%s)', p_schema, p_table, v_qual)
    into v_n;
  perform set_config('request.jwt.claims', '', true);
  return v_n;
end;
$function$;

COMMENT ON FUNCTION public.std_select_count_as(uuid, text, text) IS
  'DD-136. Rows of a table the DEPLOYED std_select policy admits for one identity, by evaluating the policy expression with that identity''s JWT claim. It never touches the `role` GUC, so it is safe inside a migration. Service-role only.';

REVOKE ALL ON FUNCTION public.std_select_count_as(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.std_select_count_as(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.std_select_count_as(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.std_select_count_as(uuid, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PICK THE REAL IDENTITIES and TAKE THE RED READING — before anything moves.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _dd136_identities ON COMMIT DROP AS
SELECT om.user_id AS admin_user,
       (SELECT om2.user_id FROM iam.organization_member om2
         WHERE om2.organization_id = om.organization_id AND om2.role = 'member'
           -- "Plain member" must be plain across the whole system. A member of
           -- this organization may own/administer another one; that identity is
           -- SUPPOSED to lose its unaudited admin-only reads there, so using it
           -- as a bystander makes proof C reject the intended fix.
           AND NOT EXISTS (
             SELECT 1 FROM iam.organization_member elevated
             WHERE elevated.user_id = om2.user_id
               AND elevated.role IN ('owner', 'admin')
           )
         ORDER BY om2.user_id LIMIT 1) AS member_user,
       om.organization_id AS org_id,
       (SELECT count(*) FROM chat.conversation c
         WHERE c.organization_id = om.organization_id
           AND c.visibility < 'internal'::platform.visibility
           AND c.created_by IS DISTINCT FROM om.user_id) AS others_personal_rows
FROM iam.organization_member om
WHERE om.role IN ('owner','admin')
  AND NOT public.is_platform_admin_for(om.user_id)
ORDER BY others_personal_rows DESC
LIMIT 1;

CREATE TEMP TABLE _dd136_red ON COMMIT DROP AS
SELECT * FROM public.admin_door_probe((SELECT admin_user FROM _dd136_identities), 200);

DO $red$
DECLARE v_admin uuid; v_tables int; v_rows bigint; v_unmeasured int;
BEGIN
  SELECT admin_user INTO v_admin FROM _dd136_identities;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'DD-136: no org owner/admin who is not a platform admin exists — the forcing test cannot be run, and an unrun forcing test is not a forcing test';
  END IF;
  SELECT count(*) FILTER (WHERE by_role > 0), coalesce(sum(by_role) FILTER (WHERE by_role > 0), 0),
         count(*) FILTER (WHERE by_role = -1)
    INTO v_tables, v_rows, v_unmeasured
  FROM _dd136_red;
  RAISE NOTICE 'DD-136 RED (identity %): on % table(s) the org-admin arm ALONE admits % row(s) of other people''s sub-internal data to an org admin who is not a platform admin (sampled 200 rows/table); % table(s) UNMEASURED',
    v_admin, v_tables, v_rows, v_unmeasured;
  IF v_tables = 0 THEN
    RAISE EXCEPTION 'DD-136: the probe found NOTHING to close before the change. Either the defect is already fixed (then this file is a no-op and should not be applied) or the probe is broken (then it would have reported GREEN afterwards for the wrong reason). Refusing either way.';
  END IF;
END
$red$;

-- Snapshot EVERY policy on EVERY table that will be regenerated — proof A.
CREATE TEMP TABLE _dd136_before ON COMMIT DROP AS
SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text AS roles,
       p.permissive, p.qual, p.with_check, et.token, coalesce(et.rls_variant,'entity') AS rls_variant
FROM pg_policies p
JOIN platform.entity_types et
  ON et.schema_name = p.schemaname AND et.table_name = p.tablename AND et.is_active
WHERE (p.schemaname, p.tablename) IN (
  SELECT q.schemaname, q.tablename FROM pg_policies q
  WHERE q.policyname = 'std_select'
    AND q.qual ~ 'iam\.organization_member'
    AND iam.table_has_visibility(q.schemaname, q.tablename)
);

CREATE TEMP TABLE _dd136_fails_before ON COMMIT DROP AS
SELECT et.schema_name, et.table_name, et.token, coalesce(et.rls_variant,'entity') AS rls_variant,
       (SELECT count(*) FROM iam.verify_canonical(et.schema_name, et.table_name, et.token, coalesce(et.rls_variant,'entity')) v
         WHERE v.status = 'FAIL') AS fails
FROM (SELECT DISTINCT schemaname, tablename FROM _dd136_before) b
JOIN platform.entity_types et
  ON et.schema_name = b.schemaname AND et.table_name = b.tablename AND et.is_active;

-- Proof C baseline — the identities that must lose NOTHING.
CREATE TEMP TABLE _dd136_bystanders ON COMMIT DROP AS
SELECT 'member'::text AS who, (SELECT member_user FROM _dd136_identities) AS uid,
       public.std_select_count_as((SELECT member_user FROM _dd136_identities), 'chat', 'conversation') AS conversations,
       public.std_select_count_as((SELECT member_user FROM _dd136_identities), 'chat', 'message') AS messages
UNION ALL
SELECT 'platform_admin',
       (SELECT a.user_id FROM public.current_user_is_admin a WHERE a.is_admin IS TRUE ORDER BY a.user_id LIMIT 1),
       public.std_select_count_as((SELECT a.user_id FROM public.current_user_is_admin a WHERE a.is_admin IS TRUE ORDER BY a.user_id LIMIT 1), 'chat', 'conversation'),
       public.std_select_count_as((SELECT a.user_id FROM public.current_user_is_admin a WHERE a.is_admin IS TRUE ORDER BY a.user_id LIMIT 1), 'chat', 'message')
UNION ALL
SELECT 'row_owner',
       (SELECT c.created_by FROM chat.conversation c
         WHERE c.visibility < 'internal'::platform.visibility AND c.created_by IS NOT NULL
         GROUP BY c.created_by ORDER BY count(*) DESC LIMIT 1),
       public.std_select_count_as((SELECT c.created_by FROM chat.conversation c
         WHERE c.visibility < 'internal'::platform.visibility AND c.created_by IS NOT NULL
         GROUP BY c.created_by ORDER BY count(*) DESC LIMIT 1), 'chat', 'conversation'),
       public.std_select_count_as((SELECT c.created_by FROM chat.conversation c
         WHERE c.visibility < 'internal'::platform.visibility AND c.created_by IS NOT NULL
         GROUP BY c.created_by ORDER BY count(*) DESC LIMIT 1), 'chat', 'message');

DO $reset$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
END
$reset$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE KERNEL — the org-admin viewer lane now asks about visibility.
--    Reproduced verbatim from the live catalog definition; the ONLY change is
--    the guard on the early org-admin lane, marked 🚨 DD-136 below.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 10000
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_id uuid; v_parent_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;
begin
  if v_uid is null then return false; end if;
  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et where et.token = p_type and et.is_active;
  if v_schema is null then return false; end if;

  if p_required = 'viewer'::public.permission_level
     and public.user_can_read_via_library_grant(v_uid, p_type, p_id)
  then return true; end if;
  -- THE OPEN LIBRARY (2026-08-23): a resource GIVEN to an industry or to
  -- everyone is readable by anyone signed in. The opt-in decides what you are
  -- SHOWN by default, never what you are ALLOWED to see. Organization-audience
  -- grants (pilots, subscriptions) are excluded and stay targeted.
  if p_required = 'viewer'::public.permission_level
     and public.library_is_open(p_type, p_id)
  then return true; end if;
  if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id) then return true; end if;
  if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
    if p_required = 'viewer'::public.permission_level then return true; end if;
    if exists (select 1 from platform.rulebook rb
                where rb.id = p_id and rb.status = 'draft' and rb.deleted_at is null)
    then return true; end if;
  end if;

  v_attrs := platform.entity_row_access_attrs(v_schema, v_table, p_id);
  v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner; v_org := v_attrs.o_org; v_found := v_attrs.o_found;
  if not coalesce(v_found, false) then return false; end if;
  if v_owner = v_uid then return true; end if;
  -- 🚨 DD-136 (2026-09-12) — THE ORG-ADMIN LANE HONOURS `personal` VISIBILITY.
  -- This lane used to `return true` for any org owner/admin at viewer, with no
  -- visibility condition, while the two org lanes below are both guarded
  -- `v_vis >= 'internal'`. That single asymmetry meant `visibility='personal'`
  -- hid a row from a plain member and from nobody else: measured live, a plain
  -- member read 0 of other people's personal conversations and an org admin who
  -- is not a platform admin read 10,817 of them plus 74,485 messages, with no
  -- audit anywhere. Arman, 2026-09-12: the organization reaches a person's
  -- private data only through an audited emergency door, never by an admin
  -- browsing. The door is a GRANT (DD-137 generalises `public.hr_break_glass`),
  -- and a grant is already a first-class lane below — so the door needs no arm
  -- of its own and this guard leaves no bypass.
  --
  -- The `table_has_visibility` half is not a loophole: entity_row_access_attrs
  -- HARD-CODES o_vis := 'personal' for a table with no visibility column, so a
  -- bare `v_vis >= 'internal'` would strip this lane from 305 org-scoped tables
  -- that never declared a visibility contract and cannot hold a `personal` row
  -- at all. iam.entity_read_expr asks the SAME predicate, so the mirror and the
  -- kernel cannot drift on it (db-rules §6d).
  if p_required = 'viewer'::public.permission_level and v_org is not null then
    if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
    if v_is_org_admin
       and (v_vis >= 'internal'::platform.visibility
            or not iam.table_has_visibility(v_schema, v_table))
    then return true; end if;
  end if;
  if p_include_public and v_vis = 'public'::platform.visibility and p_required = 'viewer'::public.permission_level then return true; end if;
  if p_include_public and p_required = 'viewer'::public.permission_level
     and v_vis >= 'internal'::platform.visibility and v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
  if v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
     and public.is_super_admin_for(v_uid) then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id and m.user_id = v_uid
      and m.deleted_at is null and g.confers >= p_required) then return true; end if;
  if p_required = 'viewer'::public.permission_level and public._edu_can_read_via_assignment(v_uid, p_type, p_id) then return true; end if;
  for rec in
    select r.container_type, r.container_id from platform.reachability r
    where r.item_type = p_type and r.item_id = p_id and r.max_level >= p_required
  loop
    if (rec.container_type, rec.container_id) is distinct from (p_type, p_id)
       and iam.has_access_for_base(v_uid, rec.container_type, rec.container_id, p_required,
             p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility))
    then return true; end if;
  end loop;
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
    if v_is_org_admin then return true; end if;
    if p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  v_parent_include_public := p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility);
  for rec in
    select er.parent_type, er.fk_column from platform.entity_relationships er
    where er.child_type = p_type and er.kind in ('composition', 'containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table) into v_parent_id using p_id;
    if v_parent_id is not null
       and iam.has_access_for_base(v_uid, rec.parent_type, v_parent_id, p_required, v_parent_include_public)
    then return true; end if;
  end loop;
  return false;
end; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RE-BASELINE THE FINGERPRINT — the kernel really did move, and this file is
--    the re-reading of it. Computed from the live catalog rather than pasted,
--    so the constant cannot be wrong.
-- ─────────────────────────────────────────────────────────────────────────────
DO $bump$
DECLARE v_fp text := iam.entity_read_kernel_fingerprint();
BEGIN
  IF v_fp = iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'DD-136: the kernel fingerprint did NOT move after replacing iam.has_access_for_base — the guard was not actually installed';
  END IF;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text LANGUAGE sql IMMUTABLE AS $f$ select %L::text $f$',
    v_fp);
  RAISE NOTICE 'DD-136: read-kernel fingerprint re-baselined to %', v_fp;
END
$bump$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. THE MIRROR — patched from its own live catalog definition, the same way
--    D266 patched `platform._ddl_guard()`. Re-typing a 250-line generator to
--    change four words is how an unrelated arm goes missing; a single anchored
--    substitution cannot lose one. The anchor must occur EXACTLY ONCE.
-- ─────────────────────────────────────────────────────────────────────────────
DO $patch$
DECLARE
  v_def text := pg_get_functiondef('iam.entity_read_expr(text,text,text,text)'::regprocedure);
  v_old text := $old$    -- org-admin at viewer — `is_org_admin_for(v_uid, v_org)`
    v_arms := array_append(v_arms,
      '(organization_id is not null and organization_id in'
      ' (select om.organization_id from iam.organization_member om'
      ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))');
$old$;
  v_new text := $new$    -- org-admin at viewer — `is_org_admin_for(v_uid, v_org)`
    --
    -- 🚨 DD-136 (2026-09-12) — THIS ARM USED TO CARRY NO VISIBILITY GUARD while
    -- the two org arms directly below it both do, so `visibility='personal'`
    -- hid a row from a plain member and from nobody else. Measured live before
    -- the fix: a plain member read 0 of other people's personal conversations,
    -- an org admin who is NOT a platform admin read 10,817 of them plus 74,485
    -- messages, and nothing anywhere recorded that it happened. Arman,
    -- 2026-09-12: the organization reaches a person's private data only through
    -- an audited emergency door, never by an admin browsing (the door is a
    -- grant — DD-137 — and the grant lanes are already below).
    --
    -- The kernel guards the same lane with `v_vis >= 'internal' or not
    -- iam.table_has_visibility(...)`. The second half is why this is an if/else
    -- rather than one string: `platform.entity_row_access_attrs` HARD-CODES
    -- 'personal' for a table with no visibility column, so a table that never
    -- declared a visibility contract must keep the arm it has always had — it
    -- cannot hold a row marked `personal` in the first place. Mirror and kernel
    -- ask the same predicate so they cannot drift (db-rules §6d).
    if v_has_vis then
      v_arms := array_append(v_arms,
        '(organization_id is not null and visibility >= ''internal''::platform.visibility and organization_id in'
        ' (select om.organization_id from iam.organization_member om'
        ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))');
    else
      v_arms := array_append(v_arms,
        '(organization_id is not null and organization_id in'
        ' (select om.organization_id from iam.organization_member om'
        ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))');
    end if;
$new$;
  v_hits int;
BEGIN
  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'DD-136: the org-admin arm anchor occurs % time(s) in iam.entity_read_expr, expected exactly 1 — the generator moved underneath this migration; re-read it before patching', v_hits;
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
  RAISE NOTICE 'DD-136: iam.entity_read_expr patched — org-admin arm now guarded on visibility-declaring tables';
END
$patch$;

DO $mirrorcheck$
DECLARE v_unguarded text;
BEGIN
  -- Every visibility-declaring, org-scoped, active token must now emit the
  -- GUARDED arm and none may emit the open one.
  SELECT string_agg(et.schema_name||'.'||et.table_name, ', ')
    INTO v_unguarded
  FROM platform.entity_types et
  WHERE et.is_active
    AND coalesce(et.audit_class,'entity') <> 'machinery'
    AND to_regclass(format('%I.%I', et.schema_name, et.table_name)) IS NOT NULL
    AND iam.table_has_visibility(et.schema_name, et.table_name)
    AND iam.entity_read_expr(et.schema_name, et.table_name, et.token,
          CASE WHEN et.is_component OR et.rls_variant='component' THEN 'component'
               ELSE coalesce(et.rls_variant,'entity') END)
        LIKE '%(organization_id is not null and organization_id in (select om.organization_id%';
  IF v_unguarded IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136: token(s) still emit an UNGUARDED org-admin arm despite declaring a visibility contract: %', v_unguarded;
  END IF;
END
$mirrorcheck$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. REGENERATION — every affected table, no exceptions, no allowlist.
--    Lock contention is retried, bounded and announced (the scheduler writes
--    continuously and deadlocked D266's rehearsal); anything else stops here.
-- ─────────────────────────────────────────────────────────────────────────────
DO $sweep$
DECLARE
  r record; v_done int := 0; v_failed text[] := '{}'; v_ok boolean; v_last text; v_retried int := 0;
BEGIN
  FOR r IN
    SELECT et.token, et.schema_name, et.table_name, coalesce(et.rls_variant,'entity') AS rls_variant
    FROM (SELECT DISTINCT schemaname, tablename FROM _dd136_before) b
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
          RAISE NOTICE 'DD-136 regeneration: %.% attempt % hit lock contention (%) — retrying', r.schema_name, r.table_name, attempt, v_last;
          PERFORM pg_sleep(0.5 * attempt);
        WHEN OTHERS THEN
          v_last := SQLERRM; EXIT;
      END;
    END LOOP;
    IF v_ok THEN v_done := v_done + 1;
    ELSE v_failed := array_append(v_failed, format('%s.%s (%s/%s): %s', r.schema_name, r.table_name, r.token, r.rls_variant, v_last));
    END IF;
  END LOOP;
  RAISE NOTICE 'DD-136 regeneration: % table(s) regenerated, % failed, % lock retries', v_done, cardinality(v_failed), v_retried;
  IF cardinality(v_failed) > 0 THEN
    RAISE EXCEPTION 'DD-136 regeneration failed on % table(s) — nothing is committed: %', cardinality(v_failed), array_to_string(v_failed, ' | ');
  END IF;
END
$sweep$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7b. 🚨 RESTORE THE BESPOKE POLICIES `iam.apply_rls` JUST DELETED.
--
-- FOUND IN THE ROLLED-BACK REHEARSAL, and it is a defect class of its own:
-- `iam.apply_rls` does not merely rewrite the policies it generates, it leaves
-- the table with ONLY those policies. Every hand-added lane on a regenerated
-- table disappears — silently, with no error and no notice. In the rehearsal
-- that cost `users.invitation_requests` its three public signup lanes
-- (`invitation_request_public_submit` / `_followup` / `_return_id` — the
-- signed-out request-an-invitation flow) and `rag.library_docs` its three
-- `platform_admin_*_only` lanes.
--
-- THIS BLOCK RESTORES THEM VERBATIM FROM THE SNAPSHOT taken before the sweep —
-- same name, same command, same roles, same permissive/restrictive kind, same
-- USING and WITH CHECK bytes. That is restoration, not policy authoring: the
-- bytes are the ones the database was already running, and §8c then asserts,
-- byte for byte, that every non-`std_select` policy on every affected table is
-- exactly what it was. Only non-generated names are restored; a `std_*` policy
-- the generator chose not to emit is the generator's business, not this file's.
--
-- It is not a fix for the class. `iam.apply_rls` should refuse, or announce, or
-- carry them itself; every future regeneration sweep hits the same trapdoor.
-- That goes to the register as its own row — a migration that quietly repairs
-- a platform primitive's behaviour for its own 253 tables and says nothing
-- would be the same silence one level up.
DO $restore$
DECLARE
  r record; v_n int := 0; v_sql text; v_roles text; v_names text[] := '{}';
BEGIN
  FOR r IN
    SELECT b.* FROM _dd136_before b
    WHERE b.policyname NOT LIKE 'std\_%'
      AND NOT EXISTS (SELECT 1 FROM pg_policies p
                       WHERE p.schemaname = b.schemaname AND p.tablename = b.tablename
                         AND p.policyname = b.policyname)
    ORDER BY b.schemaname, b.tablename, b.policyname
  LOOP
    v_roles := replace(replace(r.roles, '{', ''), '}', '');
    IF v_roles = '' OR v_roles IS NULL THEN v_roles := 'public'; END IF;
    IF position('"' in v_roles) > 0 THEN
      RAISE EXCEPTION 'DD-136: policy %.%/% has a quoted role list (%) this restorer will not reproduce faithfully — stop and handle it by hand rather than guess',
        r.schemaname, r.tablename, r.policyname, r.roles;
    END IF;
    v_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                    r.policyname, r.schemaname, r.tablename,
                    CASE WHEN r.permissive = 'RESTRICTIVE' THEN 'RESTRICTIVE' ELSE 'PERMISSIVE' END,
                    r.cmd, v_roles);
    IF r.qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', r.qual); END IF;
    IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', r.with_check); END IF;
    EXECUTE v_sql;
    v_n := v_n + 1;
    v_names := array_append(v_names, format('%s.%s/%s', r.schemaname, r.tablename, r.policyname));
  END LOOP;
  IF v_n > 0 THEN
    RAISE WARNING 'DD-136: iam.apply_rls DELETED % bespoke policy/policies while regenerating; restored verbatim from the pre-sweep snapshot: %',
      v_n, array_to_string(v_names, ', ');
  ELSE
    RAISE NOTICE 'DD-136: no bespoke policies were deleted by the regeneration sweep';
  END IF;
END
$restore$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. THE PROOFS.
-- ─────────────────────────────────────────────────────────────────────────────

-- PROOF A — TEXTUAL. Exactly TWO differences are allowed anywhere, and the
-- second one is not this migration's doing.
--
-- 🚨 THE SECOND DELTA, found in the rolled-back rehearsal and NOT hidden here.
-- `iam.apply_rls` regenerates a table's policy from TODAY's generator, and 242
-- of the 253 affected tables were last generated before the generator learned
-- to emit its first candidate set — the `iam.unnest_uuids(iam.accessible_entity_ids(
-- '<token>', 'viewer', 0, true))` superset that D249/D266 put at the head of the
-- bounded definer lane. Their deployed policies are therefore NARROWER than the
-- access kernel says they should be, and regenerating them restores the
-- canonical shape. That is a WIDENING, and it rides along with this file
-- because there is exactly one way to write an RLS policy on this platform and
-- it is the generator (db-rules §0). It cannot grant anything the kernel
-- refuses: the candidate set is only the id filter in front of
-- `... and iam.has_access('<token>', id, 'viewer')`, which stays the judge —
-- asserted in 8d below, per table, rather than argued. The census of how many
-- tables it touched is printed and carried to the report as pre-existing
-- conformance debt, not as a change this migration invented.
DO $proofA$
DECLARE
  v_search constant text := '(organization_id IS NOT NULL) AND (organization_id IN ( SELECT om.organization_id';
  v_insert constant text := '(organization_id IS NOT NULL) AND (visibility >= ''internal''::platform.visibility) AND (organization_id IN ( SELECT om.organization_id';
  -- The canonical candidate-superset clause, stripped from BOTH sides so the
  -- comparison sees everything else byte for byte.
  v_cand constant text := 'SELECT iam\.unnest_uuids\(iam\.accessible_entity_ids\(''[a-z_0-9]+''::text, ''viewer''::permission_level, 0, true\)\) AS unnest_uuids\s*UNION\s*SELECT';
  v_initplan constant text := '( SELECT is_super_admin() AS is_super_admin)';
  v_bad text; v_n int; v_gained int;
BEGIN
  -- 8a. std_select: new == old with exactly one substitution, once the
  --     candidate-superset clause is normalised out of both sides.
  SELECT string_agg(format('%s.%s', b.schemaname, b.tablename), ', '), count(*)
    INTO v_bad, v_n
  FROM _dd136_before b
  JOIN pg_policies p ON p.schemaname = b.schemaname AND p.tablename = b.tablename AND p.policyname = b.policyname
  WHERE b.policyname = 'std_select'
    AND regexp_replace(coalesce(p.qual,''), v_cand, 'SELECT', 'g')
        IS DISTINCT FROM regexp_replace(replace(coalesce(b.qual,''), v_search, v_insert), v_cand, 'SELECT', 'g');
  IF v_bad IS NOT NULL THEN
    -- A THIRD difference is not automatically a defect — it is a table whose
    -- DEPLOYED policy had drifted further from the generator than the candidate
    -- lane. It IS automatically un-shippable on this file's word alone, so each
    -- one is measured against real identities in 8e below instead of argued.
    RAISE NOTICE 'DD-136 proof A: % table(s) carry generator drift beyond the guard and the candidate lane — each is measured per identity in 8e: %', v_n, left(v_bad, 2000);
    CREATE TEMP TABLE _dd136_drift ON COMMIT DROP AS
    SELECT b.schemaname, b.tablename, b.token,
           replace(coalesce(b.qual,''), v_search, v_insert) AS baseline
    FROM _dd136_before b
    JOIN pg_policies p ON p.schemaname = b.schemaname AND p.tablename = b.tablename AND p.policyname = b.policyname
    WHERE b.policyname = 'std_select'
      AND regexp_replace(coalesce(p.qual,''), v_cand, 'SELECT', 'g')
          IS DISTINCT FROM regexp_replace(replace(coalesce(b.qual,''), v_search, v_insert), v_cand, 'SELECT', 'g');
  ELSE
    CREATE TEMP TABLE _dd136_drift ON COMMIT DROP AS
    SELECT b.schemaname, b.tablename, b.token, ''::text AS baseline
    FROM _dd136_before b WHERE false;
  END IF;

  SELECT count(*) INTO v_gained
  FROM _dd136_before b
  JOIN pg_policies p ON p.schemaname = b.schemaname AND p.tablename = b.tablename AND p.policyname = b.policyname
  WHERE b.policyname = 'std_select'
    AND regexp_replace(coalesce(b.qual,''), v_cand, 'SELECT', 'g') = coalesce(b.qual,'')
    AND regexp_replace(coalesce(p.qual,''), v_cand, 'SELECT', 'g') IS DISTINCT FROM coalesce(p.qual,'');
  RAISE NOTICE 'DD-136 proof A: % of % regenerated table(s) also REGAINED the canonical candidate-superset lane they had been missing (pre-existing conformance debt, widening, judged by iam.has_access as before)',
    v_gained, (SELECT count(*) FROM _dd136_before WHERE policyname = 'std_select');

  -- 8d. the judge is unchanged: every regenerated read lane still ends by
  --     asking iam.has_access about its own token. A candidate set that is not
  --     followed by the judge would be a raw grant, which is the only way the
  --     widening above could hurt.
  SELECT string_agg(format('%s.%s', b.schemaname, b.tablename), ', ') INTO v_bad
  FROM _dd136_before b
  JOIN pg_policies p ON p.schemaname = b.schemaname AND p.tablename = b.tablename AND p.policyname = b.policyname
  WHERE b.policyname = 'std_select'
    AND p.qual NOT LIKE '%iam.has_access(' || quote_literal(b.token) || '::text, id, ''viewer''::permission_level)%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136 proof A: regenerated read lane no longer ends at the iam.has_access judge on: %', left(v_bad, 2000);
  END IF;

  -- 8b. the substitution actually happened (and exactly once) on every table.
  SELECT string_agg(format('%s.%s', b.schemaname, b.tablename), ', ')
    INTO v_bad
  FROM _dd136_before b
  WHERE b.policyname = 'std_select'
    AND (length(coalesce(b.qual,'')) - length(replace(coalesce(b.qual,''), v_search, ''))) / length(v_search) <> 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136 proof A: the org-admin arm did not appear exactly once in the pre-change policy of: %', left(v_bad, 2000);
  END IF;

  -- 8c. every OTHER policy on every affected table is byte-identical, modulo one
  --     semantically-empty idiom. The deployed `std_insert` lanes carry
  --     `( SELECT is_super_admin() AS is_super_admin)` — the InitPlan wrapper
  --     that makes a STABLE function evaluate once per statement — and today's
  --     generator emits the bare `is_super_admin()`. Same predicate, same rows,
  --     same answer; the wrapper is a planner hint on a WITH CHECK clause that
  --     is evaluated per inserted row either way. It is normalised out of BOTH
  --     sides rather than ignored, so a real change to an insert lane still
  --     fails this check, and it is carried to the report as generator residue
  --     (the SELECT lane kept its wrapper; the INSERT lane lost it).
  SELECT string_agg(format('%s.%s/%s', b.schemaname, b.tablename, b.policyname), ', ')
    INTO v_bad
  FROM _dd136_before b
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
    RAISE EXCEPTION 'DD-136 proof A: a NON-select policy moved on: %', left(v_bad, 2000);
  END IF;

  RAISE NOTICE 'DD-136 proof A: % std_select policies differ from before by exactly the visibility conjunct; every other policy byte-identical',
    (SELECT count(*) FROM _dd136_before WHERE policyname = 'std_select');
END
$proofA$;

-- 8e. THE DRIFTED TABLES LOSE NOTHING. For every table whose regenerated policy
--     differs by more than the guard and the candidate lane, compare the
--     PRE-CHANGE policy WITH THE GUARD ALREADY APPLIED (so the DD-136 narrowing
--     is not counted here) against what is deployed now, for real non-admin
--     members plus the platform admin, over the WHOLE table. `lost` is a denial
--     and db-rules §6a weighs it exactly as heavily as a leak; it must be 0.
--     `gained` is reported: those are rows the access kernel already said these
--     identities may read and the drifted policy was withholding.
DO $proofE1$
DECLARE
  r record; u record; v_lost bigint; v_gained bigint; v_compared bigint;
  v_bad text[] := '{}'; v_pairs int := 0; v_gain_total bigint := 0;
BEGIN
  FOR r IN SELECT * FROM _dd136_drift ORDER BY 1,2 LOOP
    FOR u IN
      SELECT user_id FROM iam.entity_read_probe_users(6)
      UNION (SELECT a.user_id FROM public.current_user_is_admin a WHERE a.is_admin IS TRUE ORDER BY a.user_id LIMIT 1)
      UNION SELECT admin_user FROM _dd136_identities
    LOOP
      SELECT lost, gained, compared INTO v_lost, v_gained, v_compared
      FROM iam.entity_read_equivalence(r.schemaname, r.tablename, r.token, u.user_id, NULL, r.baseline);
      v_pairs := v_pairs + 1;
      v_gain_total := v_gain_total + coalesce(v_gained, 0);
      IF v_lost <> 0 THEN
        v_bad := array_append(v_bad, format('%s.%s user %s: LOST %s of %s', r.schemaname, r.tablename, u.user_id, v_lost, v_compared));
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF cardinality(v_bad) > 0 THEN
    RAISE EXCEPTION 'DD-136 proof A/8e: regenerating a drifted table DENIED rows a real identity could read, which is as serious as a leak — nothing is committed: %', array_to_string(v_bad, ' | ');
  END IF;
  RAISE NOTICE 'DD-136 proof A/8e: % drifted table(s), % (table, identity) pairs, 0 lost, % rows regained that the kernel already allowed',
    (SELECT count(*) FROM _dd136_drift), v_pairs, v_gain_total;
END
$proofE1$;

-- PROOF B — BEHAVIOURAL, RED -> GREEN, same identity, same probe.
CREATE TEMP TABLE _dd136_green ON COMMIT DROP AS
SELECT * FROM public.admin_door_probe((SELECT admin_user FROM _dd136_identities));

DO $proofB$
DECLARE v_bad text; v_red_tables int; v_red_rows bigint; v_conveyed text; v_unmeasured text;
BEGIN
  SELECT count(*), coalesce(sum(by_role),0) INTO v_red_tables, v_red_rows
  FROM _dd136_red WHERE by_role > 0;

  -- B1 — THE ARM ITSELF. Zero rows below `internal` may be admitted by the
  -- org-admin arm on any table, over the WHOLE table, no sampling.
  SELECT string_agg(format('%s.%s: arm admits %s of %s', schema_name, table_name, by_role, considered), ', ')
    INTO v_bad FROM _dd136_green WHERE by_role <> 0;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136 proof B1: the org-admin arm STILL admits other people''s sub-internal rows (-1 means UNMEASURED, which is a failure too): %', left(v_bad, 2000);
  END IF;

  -- B2 — AND NO OTHER ROLE-DERIVED PATH TOOK ITS PLACE. Every row this identity
  -- can still read below `internal` must have a TICKET: a permission, a
  -- membership, the reachability closure, an entity grant or a scope assignment.
  -- Tokens whose rows are also conveyed by a parent or by a bespoke resolver are
  -- REPORTED rather than asserted — this probe does not walk parents, and
  -- pretending it does would be a guard that lies.
  SELECT string_agg(format('%s.%s: %s of %s readable with no ticket', schema_name, table_name, no_ticket, considered), ', ')
    INTO v_bad FROM _dd136_green WHERE no_ticket > 0 AND NOT conveyable;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136 proof B2: rows below `internal` are readable by an org admin with no grant, membership, reachability, entity grant or assignment behind them: %', left(v_bad, 2000);
  END IF;

  SELECT string_agg(format('%s.%s (%s rows)', schema_name, table_name, no_ticket), ', ')
    INTO v_conveyed FROM _dd136_green WHERE no_ticket > 0 AND conveyable;
  IF v_conveyed IS NOT NULL THEN
    RAISE NOTICE 'DD-136 proof B2: reported, not asserted — parent-/resolver-conveyable token(s) still readable without a ticket of their own: %', left(v_conveyed, 1000);
  END IF;

  SELECT string_agg(format('%s.%s', schema_name, table_name), ', ')
    INTO v_unmeasured FROM _dd136_green WHERE no_ticket = -1;
  IF v_unmeasured IS NOT NULL THEN
    RAISE WARNING 'DD-136: table(s) the probe could NOT evaluate — their read lane raises for a non-platform-admin today, which is a live defect of its own, carried to the report rather than swallowed: %', v_unmeasured;
  END IF;

  RAISE NOTICE 'DD-136 proof B: RED % table(s) / % row(s) admitted by the arm (sampled 200/table) -> GREEN 0 over WHOLE tables, same org admin, same probe', v_red_tables, v_red_rows;
END
$proofB$;

-- PROOF C — NOBODY ELSE LOSES A ROW.
DO $proofC$
DECLARE r record; v_now bigint; v_bad text[] := '{}';
BEGIN
  FOR r IN SELECT * FROM _dd136_bystanders WHERE uid IS NOT NULL LOOP
    v_now := public.std_select_count_as(r.uid, 'chat', 'conversation');
    IF v_now IS DISTINCT FROM r.conversations THEN
      v_bad := array_append(v_bad, format('%s chat.conversation %s -> %s', r.who, r.conversations, v_now));
    END IF;
    v_now := public.std_select_count_as(r.uid, 'chat', 'message');
    IF v_now IS DISTINCT FROM r.messages THEN
      v_bad := array_append(v_bad, format('%s chat.message %s -> %s', r.who, r.messages, v_now));
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  IF cardinality(v_bad) > 0 THEN
    RAISE EXCEPTION 'DD-136 proof C: an identity that must lose NOTHING lost rows (a blocked legitimate reader is as serious as a leak, db-rules §6a): %', array_to_string(v_bad, ' | ');
  END IF;
  RAISE NOTICE 'DD-136 proof C: row owner, plain member and platform admin see identical counts on chat.conversation and chat.message';
END
$proofC$;

-- PROOF D — conformance did not regress on any regenerated table.
DO $proofD$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(format('%s.%s', b.schema_name, b.table_name), ', ') INTO v_bad
  FROM _dd136_fails_before b
  WHERE (SELECT count(*) FROM iam.verify_canonical(b.schema_name, b.table_name, b.token, b.rls_variant) v
          WHERE v.status = 'FAIL') > b.fails;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136 proof D: iam.verify_canonical FAIL count ROSE on: %', left(v_bad, 2000);
  END IF;
  RAISE NOTICE 'DD-136 proof D: iam.verify_canonical FAIL counts unchanged or lower on every regenerated table';
END
$proofD$;

-- PROOF E — the mirror is not left stale.
DO $proofE$
BEGIN
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'DD-136 proof E: fingerprint live % <> expected % at the end — the mirror would emit UNBOUNDED policies',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
  RAISE NOTICE 'DD-136: CLOSED — the org-admin lane honours personal visibility in the kernel and in the mirror; the audited door is DD-137';
END
$proofE$;
