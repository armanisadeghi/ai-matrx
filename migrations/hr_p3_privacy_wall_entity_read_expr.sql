-- HRB-003 follow-up — THE PRIVACY WALL reaches the entity / system / component lanes.
--
-- THE GAP, reproduced live before it was fixed. `hr_p3_suppress_platform_admin_lane_generator.sql`
-- emptied the four staff strings that `iam._apply_rls_unchecked` builds ITSELF, which
-- walls `restricted`, `ledger` and `personal`. But the `entity`, `system` and
-- `component` lanes do NOT build their own `std_select` — they delegate to
-- `iam.entity_read_expr`, the read-kernel MIRROR, and that function emits one more
-- staff arm of its own:
--
--     (organization_id is not null and (select public.is_super_admin())
--      and organization_id in (select so.organization_id
--                              from iam.system_orgs so where so.global_readable))
--
-- so a flagged token on any of those three variants kept a live `is_super_admin()`
-- read arm and `iam.verify_canonical`'s `privacy_wall` check FAILed immediately after
-- `apply_rls`, taking `canonical_certify_ok` false with it. Reproduced in rolled-back
-- transactions on FIVE tokens across all three affected variants before touching
-- anything: hr_leave_ledger (component), hr_payroll_export_line (component),
-- hr_credential (component), hr_department (entity), hr_record_class (system) — all
-- five FAILed identically. The work order that raised this called it a component-lane
-- bug; it is not. It is one shared builder, and entity and system had it too.
--
-- SPEC-DATA-MODEL §9.4 note 2 recorded hr_leave_ledger and hr_payroll_export_line as
-- OWED the flag because of exactly this. Both are unblocked by this file.
--
-- THE FIX is the same shape as the first half and no wider: read the token's
-- `suppress_platform_admin_lane` once, and omit that ONE arm when it is set. Nothing
-- else in the mirror moves. It costs a flagged customer table nothing — the arm can
-- only ever match a row owned by a `global_readable` SYSTEM org, which a customer's
-- HR row never is — and it is literally what SPEC-ACCESS §3.5 directs ("omit the
-- v_admin prefix and the is_super_admin() arm when true").
--
-- ── THE RE-PROOF (db-rules §6d kernel-change discipline), 2026-08-26 ──────────────
-- `iam.entity_read_expr` is the mirror the whole entity/system/component read model is
-- generated from, so this is the more dangerous of the two halves and was proved harder:
--
--   * FULL POPULATION, not a sample. The pre-change expression was cloned and both were
--     evaluated for EVERY live unflagged token that uses it — 199 entity + 230 component
--     + 37 system = **466 tokens, 466 byte-identical, 0 differing.**
--   * Policy-level head-to-head in ABORTED subtransactions across all six variants
--     (31 tokens incl. both newly-flagged ones): policy set, table `relacl` and
--     per-column `attacl` **identical 31/31**.
--   * Read results, deployed `std_select` qual vs the regenerated one over real rows with
--     real users' JWTs: **87 (user, token) pairs over 3,774 rows — 0 lost, 0 gained.**
--
-- ── THE FINGERPRINT IS AGAIN DELIBERATELY NOT RE-BASELINED ───────────────────────
-- `iam.entity_read_expr` is the MIRROR; `iam.entity_read_kernel_fingerprint()` hashes the
-- 16 kernel functions the mirror REPRODUCES, and `entity_read_expr` is not one of them.
-- Bumping the constant would falsely assert that the kernel itself was re-read. Live ==
-- expected before and after; asserted at the end of this file.
--
-- Idempotent (CREATE OR REPLACE). Applied live 2026-08-26.

CREATE OR REPLACE FUNCTION iam.entity_read_expr(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_has_org boolean;
  v_has_vis boolean;
  v_arms text[] := '{}';
  v_cands text[] := '{}';
  v_bespoke boolean := false;
  v_owner_col text;
  v_stale boolean := false;
  -- THE PRIVACY WALL (SPEC-ACCESS §3.5, D14.1/D19). This mirror builds the
  -- `std_select` body for the entity, system AND component lanes, so it owns the
  -- ONE remaining platform-staff arm those three variants carry: the system-org
  -- global-readable lane gated on `public.is_super_admin()`. `restricted`,
  -- `ledger` and `personal` build their own std_select inside
  -- `iam._apply_rls_unchecked` and are already walled there. Omitting the arm is
  -- exactly what §3.5 directs ("omit the v_admin prefix and the is_super_admin()
  -- arm when true"), and it costs a flagged customer table nothing: the arm can
  -- only ever match a row owned by a global_readable SYSTEM org, which a
  -- customer's HR row never is.
  v_suppress_admin boolean := false;
  rec record;
begin
  select coalesce(et.suppress_platform_admin_lane, false) into v_suppress_admin
  from platform.entity_types et where et.token = p_token;
  v_suppress_admin := coalesce(v_suppress_admin, false);
  -- 🚨 IS THE THING THIS MIRRORS STILL WHAT IT WAS? Between the sweep that
  -- certified 203 tables and the rollout an hour later, another lane rewrote
  -- `iam.has_access_for_base`: the `data_store`-only early lane became a general
  -- library-grant lane, "THE OPEN LIBRARY" appeared, and two curator lanes with
  -- it. Two tables' proofs flipped to `lost` and the gate refused them — the
  -- system working, but only because someone was running the gate. On a
  -- fingerprint mismatch this function DROPS THE BOUND and emits an unbounded
  -- iam.has_access call: exactly as correct as the pre-D249 policy, merely
  -- slower. Correct-and-slow is the only direction a read policy may fail in.
  v_stale := iam.entity_read_kernel_fingerprint()
             is distinct from iam.entity_read_kernel_expected();
  if v_stale then
    raise warning 'entity_read_expr: the access kernel has CHANGED since this '
      'expression was last proved against it (fingerprint % vs expected %). '
      'Emitting an UNBOUNDED iam.has_access lane for %.% — correct but slow. '
      'Re-read the kernel, update iam.entity_read_expr, re-run '
      'scripts/_verify_entity_read_equivalence.py --apply, then bump '
      'iam.entity_read_kernel_expected().',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected(),
      p_schema, p_table;
  end if;
  select exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='organization_id')
    into v_has_org;
  select exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='visibility'
                    and udt_schema='platform' and udt_name='visibility')
    into v_has_vis;

  -- ── SUFFICIENT ATTRIBUTE LANES ────────────────────────────────────────────
  -- Each is lifted from iam.has_access_for_base and each is a SUFFICIENT
  -- condition for it to return true, so a row admitted here was always visible.
  -- All read the row's own columns plus UNCORRELATED set subqueries, so every
  -- one is indexable.
  --
  -- array_append, never `||`: `text[] || <unknown literal>` resolves to
  -- array||array and tries to CAST the literal to text[] ("malformed array
  -- literal"), which is how this function failed on its first run.

  -- owner — `if v_owner = v_uid then return true`. CONDITIONAL, because a
  -- COMPONENT has no owner column at all (§6d-1: its access is its parent's),
  -- and this builder serves both variants. platform.entity_row_access_attrs
  -- falls back through created_by -> owner_id -> none, so the arm follows
  -- whichever exists and is simply absent when neither does.
  select case
           when exists (select 1 from information_schema.columns
                         where table_schema=p_schema and table_name=p_table
                           and column_name='created_by') then 'created_by'
           when exists (select 1 from information_schema.columns
                         where table_schema=p_schema and table_name=p_table
                           and column_name='owner_id') then 'owner_id'
         end
    into v_owner_col;
  if v_owner_col is not null then
    v_arms := array_append(v_arms, format('%I = (select auth.uid())', v_owner_col));
  end if;

  if v_has_vis then
    -- public lane — `p_include_public and v_vis = 'public'`
    v_arms := array_append(v_arms, 'visibility = ''public''');
  end if;

  -- 🚨 THE ORG ARMS ARE ONLY VALID WHEN THE KERNEL CAN SEE AN ORG.
  -- has_access_for_base reads o_org from platform.entity_row_access_attrs, whose
  -- first four branches all need an OWNER column (created_by or owner_id)
  -- alongside organization_id. A table with organization_id and NO owner column
  -- falls through to the fifth branch, which returns o_owner=NULL AND
  -- o_org=NULL — so the kernel's org-admin and system-org lanes CANNOT fire
  -- there, and emitting them would GRANT rows the kernel denies. 13 of the 195
  -- live component tables are exactly that shape (organization_id, no owner).
  if v_has_org and v_owner_col is not null then
    -- Every org arm is guarded `organization_id is not null` so the expression
    -- is TOTAL. `x in (select …)` yields NULL, not false, when x is NULL, and
    -- while a USING clause treats NULL as deny — so this is not an access
    -- change — a policy that evaluates to NULL is the kind of thing that reads
    -- as a bug forever after. has_access_for_base guards the same lanes with
    -- `v_org is not null` for the same reason.

    -- org-admin at viewer — `is_org_admin_for(v_uid, v_org)`
    v_arms := array_append(v_arms,
      '(organization_id is not null and organization_id in'
      ' (select om.organization_id from iam.organization_member om'
      ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))');

    if v_has_vis then
      -- global-readable system org at >= internal (db-rules §6e)
      v_arms := array_append(v_arms,
        '(organization_id is not null and visibility >= ''internal''::platform.visibility'
        ' and organization_id in'
        ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      -- org members at >= internal — the `iam.has_org_access_for` lane
      v_arms := array_append(v_arms,
        '(organization_id is not null and visibility >= ''internal''::platform.visibility'
        ' and organization_id in (select iam.my_orgs()))');
    end if;

    -- system org + super admin — THE LAST STAFF ARM on the entity/system/component
    -- lanes, and the one the privacy wall removes (see v_suppress_admin above).
    if not v_suppress_admin then
      v_arms := array_append(v_arms,
        '(organization_id is not null and (select public.is_super_admin())'
        ' and organization_id in'
        ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
    end if;
  end if;

  -- The old `data_store`-only early lane (public.user_can_read_data_store_via_grant)
  -- was GENERALISED by the kernel on 2026-08-23 into
  -- `user_can_read_via_library_grant` for EVERY token, so it needs no special
  -- case any more — the platform.entity_grants candidate above covers it. Left
  -- as a note rather than deleted silently: an earlier version of this function
  -- carried a per-row arm here, and the kernel moving underneath it is exactly
  -- what the fingerprint guard exists to catch.

  -- composition / containment parents. A child's own id appears in no id-set,
  -- so the FK is the lane.
  --
  -- 🚨 THE CHILD'S OWN VISIBILITY IS A BOUNDARY, and dropping that guard is a
  -- LEAK. has_access_for_base walks the parent with
  --     v_parent_include_public := p_include_public
  --                                and (v_vis is null or v_vis = 'public')
  -- so an `internal` child does NOT inherit access from a parent that is merely
  -- PUBLIC. Passing the default p_include_public = true instead made
  -- plan.node GAIN 24 rows and web.site GAIN 2 — rows whose own visibility is
  -- `internal` under a public parent. The prover caught it; nothing else would
  -- have.
  --
  -- The flag is per-ROW, so it is emitted as two arms rather than one. A table
  -- with NO visibility column takes the include_public = false arm alone:
  -- platform.entity_row_access_attrs returns 'personal' for such a table, and
  -- 'personal' is neither NULL nor 'public'.
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_token and er.kind in ('composition','containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    if exists (select 1 from information_schema.columns
                where table_schema=p_schema and table_name=p_table and column_name=rec.fk_column) then
      -- `%I is not null` is not decoration: has_access_for_base guards the walk
      -- with `if v_parent_id is not null`, and without it a NULL FK makes
      -- `NULL in (…)` evaluate to NULL rather than false. 10 of web.site's 45
      -- rows have a NULL brand_id, and they were the last thing standing
      -- between this expression and a total one.
      if p_variant = 'component' then
        -- 🚨 MIRROR THE DEPLOYED LANE HERE, NOT THE KERNEL, and the difference is
        -- not academic. The generated component policy calls the 2-arg
        -- `accessible_entity_ids(parent,'viewer')` — include_public => TRUE —
        -- while has_access_for_base computes
        --   v_parent_include_public := p_include_public and (v_vis is null or v_vis='public')
        -- and a component's v_vis resolves to 'personal', so the KERNEL walks
        -- with FALSE. The deployed lane is therefore MORE PERMISSIVE than the
        -- resolver it is supposed to express.
        --
        -- Measured: mirroring the kernel would have REMOVED 4,784 rows from
        -- runtime.global_execution_event and 4,734 from runtime.global_execution
        -- — live access, for children of public parents. D254 is a PERFORMANCE
        -- defect; re-scoping who can read what inside a performance fix is not
        -- this migration's business and would be indistinguishable, in the
        -- change log, from a bug. The disagreement is filed as its own finding.
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and %1$I in'
          ' (select unnest(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
          rec.fk_column, rec.parent_type));
      elsif v_has_vis then
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and (visibility is null or visibility = ''public'') and %1$I in'
          ' (select unnest(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
          rec.fk_column, rec.parent_type));
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and visibility is not null and visibility <> ''public'' and %1$I in'
          ' (select unnest(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      else
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and %1$I in'
          ' (select unnest(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      end if;
    end if;
  end loop;

  -- ── CANDIDATE SETS — every remaining lane, all of them id-PRODUCING ────────

  -- explicit grants (public.has_permission_for)
  v_cands := array_append(v_cands, format(
    'select p.resource_id from iam.permissions p where p.resource_type = %L'
    ' and (p.granted_to_user_id = (select auth.uid())'
    ' or p.granted_to_organization_id in (select iam.my_orgs()))'
    ' and p.status <> ''rejected'' and (p.expires_at is null or p.expires_at > now())', p_token));

  -- container membership + membership_grant
  v_cands := array_append(v_cands, format(
    'select m.container_id from iam.memberships m where m.container_type = %L'
    ' and m.user_id = (select auth.uid()) and m.deleted_at is null', p_token));

  -- association conveyance (platform.reachability). One has_access call per
  -- CONTAINER, not per row; the whole table is 4,501 rows across every type.
  v_cands := array_append(v_cands, format(
    'select r.item_id from platform.reachability r where r.item_type = %L'
    ' and r.max_level >= ''viewer''::public.permission_level'
    ' and iam.has_access(r.container_type, r.container_id, ''viewer'')', p_token));

  -- education assignment (public._edu_can_read_via_assignment), both arms
  v_cands := array_append(v_cands, format(
    'select a.source_id from platform.associations_live a where a.source_type = %L'
    ' and a.target_type = ''scope'' and a.role = ''assignment''', p_token));
  if p_token = 'fc_card' then
    v_cands := array_append(v_cands,
      'select link.source_id from platform.associations_live link'
      ' where link.source_type = ''fc_card'' and link.target_type = ''fc_set'''
      ' and link.role = ''member''');
  end if;

  -- ── THE LIBRARY LANES (kernel, 2026-08-23) — apply to EVERY token ─────────
  -- has_access_for_base now opens with TWO token-agnostic viewer lanes:
  --   public.user_can_read_via_library_grant(uid, type, id)
  --   public.library_is_open(type, id)            -- "THE OPEN LIBRARY"
  -- Both read `platform.entity_grants` keyed on (entity_type, entity_id), so a
  -- single id-set is a superset of both — the audience/industry/membership
  -- filtering inside them only ever NARROWS it, and a candidate set is allowed
  -- to be wide. Missing this is what made platform.rulebook lose 10 rows and
  -- rag.data_stores lose 5 on the rollout's own proof.
  v_cands := array_append(v_cands, format(
    'select g.entity_id from platform.entity_grants g where g.entity_type = %L', p_token));

  -- Curator lanes, token-specific and table-driven.
  if p_token = 'rulebook' then
    v_cands := array_append(v_cands,
      'select rb.id from platform.rulebook rb join iam.industry_curators ic'
      ' on ic.industry_id = rb.industry_id and ic.deleted_at is null'
      ' where ic.user_id = (select auth.uid()) and rb.deleted_at is null');
  end if;
  if p_token = 'seo_starter_pack' then
    v_cands := array_append(v_cands,
      'select sp.id from seo.starter_pack sp join iam.industry_curators ic'
      ' on ic.industry_id = sp.industry_id and ic.deleted_at is null'
      ' where ic.user_id = (select auth.uid())');
  end if;

  -- ── 🚨 BESPOKE RESOLVERS — the ladder is not always has_access_for_base ────
  -- `iam.has_access` -> `iam.has_access_for`, which DISPATCHES BY TOKEN:
  --     when p_type = 'file' then files.has_access_for(...)
  --     else iam.has_access_for_base(...)
  -- A token routed away from the base kernel has lanes this expression knows
  -- nothing about, so bounding its has_access call by base's candidate sets
  -- would DENY rows. That is not hypothetical: it cost `files.files` 7 rows in
  -- the 4,000-row proof, invisible at 60 rows, because a crawl artifact
  -- resolves through `files.crawl_site_conveys` and through nothing in base.
  --
  -- So the dispatch list is read from the live function body and any token this
  -- function does not explicitly understand keeps an UNBOUNDED has_access arm:
  -- slower, and exactly as correct as today. A new bespoke resolver added later
  -- degrades safely instead of silently denying rows.
  select coalesce(bool_or(true), false) into v_bespoke
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'iam' and p.proname = 'has_access_for'
    and p.prosrc ~ ('p_type\s*=\s*''' || p_token || '''');

  if v_bespoke and p_token <> 'file' then
    v_cands := '{}';   -- unknown bespoke resolver: refuse to bound it
  elsif p_token = 'file' then
    -- files.has_access_for = has_access_for_base OR
    --   (files.is_crawl_artifact(f) AND files.crawl_site_conveys(user, f)) at viewer.
    --
    -- ALL THREE branches of crawl_site_conveys become SUFFICIENT ARMS, because a
    -- candidate set here is not small: the file ids reachable through snapshots
    -- and screenshots are 6,971 + 5,945 + 8,655 ids, so bounding the definer
    -- call by them still meant ~22,000 per-row calls and files.files still timed
    -- out. Each branch is org-scoped AND pins the file, so each is a
    -- row-constructor IN against an UNCORRELATED set — evaluated once per query.
    --
    -- The parent-token sets come from `iam.accessible_entity_ids`, NOT from
    -- has_access per row, and the difference is not marginal (measured live as a
    -- real non-admin):
    --     has_access over all 7,014 web.snapshot rows      34.3s
    --     accessible_entity_ids('web_snapshot')             0.26s -> 1 id
    --     has_access over all 8,655 web.screenshot rows    70.9s
    --     accessible_entity_ids('web_screenshot')           0.31s -> 0 ids
    -- Same function family the kernel resolves through, asked set-wise.
    --
    -- `include_public => true` matches the kernel: crawl_site_conveys calls
    -- `iam.has_access_for(...)`, whose 4-arg base wrapper defaults it to true.

    -- Branch 1 — metadata-only site artifact. `ws.id::text` rather than casting
    -- the metadata value: the kernel guards that cast with a uuid regex because
    -- the field is free-form jsonb, and a policy that can raise
    -- `invalid input syntax for type uuid` is a table nobody can read at all.
    -- The metadata predicate also makes `is_crawl_artifact` true, so the arm
    -- implies BOTH halves of the kernel's crawl branch and cannot over-grant.
    v_arms := array_append(v_arms,
      '(metadata @> ''{"system_artifact": true, "artifact_domain": "web_crawl"}''::jsonb'
      ' and (organization_id, metadata->>''web_site_id'') in'
      ' (select ws.organization_id, ws.id::text from web.site ws'
      '   where ws.deleted_at is null'
      '     and ws.id = any(iam.accessible_entity_ids(''web_site'', ''viewer''::public.permission_level, 0, true))))');

    -- Branch 2 — snapshot body / markdown. The snapshot reference is itself what
    -- makes is_crawl_artifact true, so no metadata predicate is needed here.
    v_arms := array_append(v_arms,
      '((organization_id, id) in'
      ' (select s.organization_id, s.body_file_id from web.snapshot s'
      '   where s.deleted_at is null and s.body_file_id is not null'
      '     and s.id = any(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true))))');
    v_arms := array_append(v_arms,
      '((organization_id, id) in'
      ' (select s.organization_id, s.markdown_file_id from web.snapshot s'
      '   where s.deleted_at is null and s.markdown_file_id is not null'
      '     and s.id = any(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true))))');

    -- Branch 3 — screenshot image.
    v_arms := array_append(v_arms,
      '((organization_id, id) in'
      ' (select s.organization_id, s.file_id from web.screenshot s'
      '   where s.deleted_at is null and s.file_id is not null'
      '     and s.id = any(iam.accessible_entity_ids(''web_screenshot'', ''viewer''::public.permission_level, 0, true))))');
  end if;

  -- ── the bounded definer call ──────────────────────────────────────────────
  -- Everything the attribute lanes do not decide is decided exactly as before,
  -- by the same function — but only ever ASKED about ids a non-attribute lane
  -- could admit. A row outside both cannot be visible by any lane.
  if v_stale then
    v_cands := '{}';   -- stale mirror: never bound the definer call
  end if;

  if cardinality(v_cands) = 0 then
    v_arms := array_append(v_arms, format('iam.has_access(%L, id, ''viewer'')', p_token));
  else
    v_arms := array_append(v_arms, format(
      '(id in (%s) and iam.has_access(%L, id, ''viewer''))',
      array_to_string(v_cands, ' union '), p_token));
  end if;

  return array_to_string(v_arms, ' or ');
end;
$function$;

DO $guard$
BEGIN
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION
      'HRB-003: read-kernel fingerprint moved (live %, expected %) — entity_read_expr is the MIRROR, not the kernel; this change must not move it',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
  -- INVARIANT 1 — the wall actually walls: no FLAGGED token may emit a staff arm.
  IF EXISTS (
    SELECT 1 FROM platform.entity_types et
    WHERE et.is_active AND coalesce(et.audit_class,'entity')='entity'
      AND et.suppress_platform_admin_lane
      AND coalesce(et.rls_variant,'entity') IN ('entity','system','component')
      AND to_regclass(format('%I.%I', et.schema_name, et.table_name)) IS NOT NULL
      AND iam.entity_read_expr(et.schema_name, et.table_name, et.token,
            CASE WHEN et.is_component OR et.rls_variant='component' THEN 'component'
                 ELSE coalesce(et.rls_variant,'entity') END) LIKE '%is_super_admin%'
  ) THEN
    RAISE EXCEPTION 'HRB-003: a FLAGGED token still emits an is_super_admin() arm';
  END IF;

  -- INVARIANT 2 — the arm was not removed GLOBALLY. A first draft of this guard
  -- asserted every org-bearing unflagged token must carry the arm; that is FALSE
  -- (measured: 450 org-bearing unflagged tokens, 435 carry it, 15 do not, and the
  -- same 15 did not carry it before this change either — they take other branches
  -- in the mirror). The honest invariant is that the arm still exists in bulk;
  -- "unflagged output is unchanged" is a point-in-time proof, recorded in the
  -- header as 466/466 byte-identical, not something a migration can re-derive
  -- once the pre-change clone is gone.
  IF (SELECT count(*) FROM platform.entity_types et
      WHERE et.is_active AND coalesce(et.audit_class,'entity')='entity'
        AND NOT et.suppress_platform_admin_lane
        AND coalesce(et.rls_variant,'entity') IN ('entity','system','component')
        AND to_regclass(format('%I.%I', et.schema_name, et.table_name)) IS NOT NULL
        AND iam.entity_read_expr(et.schema_name, et.table_name, et.token,
              CASE WHEN et.is_component OR et.rls_variant='component' THEN 'component'
                   ELSE coalesce(et.rls_variant,'entity') END) LIKE '%is_super_admin%'
     ) < 100 THEN
    RAISE EXCEPTION 'HRB-003: the system-org arm has been removed from unflagged tokens en masse — the flag leaked past its own guard';
  END IF;
END
$guard$;
