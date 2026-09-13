-- iam_global_readable_super_admin_wall_dd170 — DD-170.
--
-- DD-165 (2026-09-12) walled every platform-staff READ arm so a row marked `visibility='personal'`
-- inside an organization-class table stays personal, EXCEPT one, named rather than hidden in that
-- migration's header: the kernel's `global_readable` system-organization super-admin arm —
-- `iam.has_access_for_base` admits a super admin to ANY row owned by a `global_readable` system org
-- with no visibility guard at all, and `iam.entity_read_expr` (the RLS-policy-text mirror of the same
-- lane) carries the identical hole. Measured then and re-measured here, unchanged: 8 personal rows
-- sit in the Matrx System org — browser.site_policy 4, mandate.binding 2, education.learn_doc 1,
-- agent.definition 1.
--
-- CLASSIFICATION (this migration's other half of DD-170 — "are they personal at all in a system
-- org?"): none of the 8 is a customer's private data.
--   - browser.site_policy (4): provider timeout/automation policy rows for aws_iam_identity_center,
--     google_workspace (x2) and coolify — `created_by` is NULL on every one. This is platform
--     reference content (how long a login session lasts on a given provider), not a person's row;
--     it is marked `personal` by generator default (SPEC-ACCESS §3.1) rather than a deliberate
--     visibility choice. Not test residue — live automation policy the browser agent reads today.
--   - mandate.binding (2): one has no `created_by` at all (2026-08-08, pre-dates the mandate
--     ownership column); the other is created_by admin@admin.com, 2026-08-31.
--   - education.learn_doc (1) and agent.definition (1, named "Content Plan Writer (E2E test)"): both
--     created_by admin@admin.com — the platform's own test/admin identity, not a customer.
--   `agent.definition`'s row is named as an E2E test artifact by its own title; it is flagged here as
--   a candidate for the owner to archive, not archived by this migration (deleting another
--   session's/account's row is not this generator's job, and destructive cleanup is out of scope for
--   a doctrine fix). The other 7 are legitimate platform content that happens to default to
--   `personal` visibility and are the reason the wall — not a reclassification — is the fix.
--
-- THE FIX: the SAME `visibility >= 'internal'` wall DD-165 gave the org-admin arm, given to this
-- arm too, in BOTH places DD-165's header named as required and declined to do in that pass:
--   1. THE KERNEL — `iam.has_access_for_base`: the live per-row SECURITY DEFINER decision.
--   2. THE MIRROR — `iam.entity_read_expr`: the inlined SQL text `iam.apply_rls` bakes into every
--      generated `std_select` policy, so the policy a real HTTP request runs against carries the
--      same wall the kernel does (walling the kernel alone changes nothing live; walling the mirror
--      alone is a wall that only looks like one — DD-165's own words, quoted because they are
--      exactly right here too).
-- Both keep DD-165's exact fallback for a table with no visibility column at all AND no registered
-- composition/containment parent (`not iam.table_has_visibility(...) and not
-- iam.token_is_parented_component(...)`) — such a table cannot hold a `personal` row in the first
-- place (`platform.entity_row_access_attrs` hard-codes 'personal' there), so walling it would remove
-- the arm's only lane for no reason.
--
-- REGENERATION: the four named tokens are regenerated under `iam.apply_rls` at the end of this
-- migration so the fix is live immediately. `check:row-visibility` census (2026-09-13): 337
-- std_select policies across the DB carry this arm's un-walled text, but only these four hold a
-- `personal` row owned by the global-readable system org today — the other 333 are textually
-- unwalled but behaviourally inert (zero system-org personal rows to expose) until they either gain
-- one or are swept in a dedicated regeneration campaign, tracked as DD-170's residue in the register
-- (the same scale of batch work DD-165 needed four rounds for; not attempted in one migration against
-- the live, shared, unbatched production database).
--
-- FINGERPRINT: `iam.entity_read_kernel_fingerprint()` hashes `has_access_for_base`'s source, so
-- changing it moves the hash; `iam.entity_read_kernel_expected()` is re-stamped to the new value at
-- the end of this migration so `check-admin-door`'s "mirror is current" assertion passes on a change
-- that was reviewed and deliberate, not silently.
--
-- RED (proven live, real identity, before this file ran): admin@admin.com (super admin, owns none of
-- the 4 browser.site_policy rows — created_by is NULL on all of them) read all 4 `personal` rows via
-- this arm alone (`select count(*) from browser.site_policy where visibility='personal'` as that
-- identity: 4). GREEN is asserted at the end of this migration and raises if it does not hold.

-- ============================== 1. THE KERNEL ==============================
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
  -- 🚨 DD-171 (2026-09-12) — CONTAINMENT NEVER CARRIES A PERSONAL ROW.
  -- True when this row may be reached THROUGH a container at all. See the header: the
  -- table_has_visibility half keeps every COMPONENT inheriting from its parent, because
  -- entity_row_access_attrs hard-codes o_vis := 'personal' for a table with no
  -- visibility column and a component has none BY CONTRACT (db-rules §6d-1).
  v_containment_carries boolean;
  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE SAME SOURCE THE MIRROR READS.
  -- iam.entity_read_expr decides which arms to EMIT from this function; this function
  -- decides the same lanes at runtime. One answer, one place. An unset or unregistered token
  -- resolves to `private` here rather than raising: the kernel cannot refuse, because
  -- refusing at runtime is denying a person their own data — so it fails toward privacy
  -- while iam.apply_rls refuses outright (chair R3, both directions).
  v_lanes platform.lane_set;
begin
  if v_uid is null then return false; end if;
  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et where et.token = p_type and et.is_active;
  if v_schema is null then return false; end if;
  v_lanes := iam.class_lanes(p_type);

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
  v_containment_carries := (v_vis is null
                            or v_vis >= 'internal'::platform.visibility
                            or not iam.table_has_visibility(v_schema, v_table));
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
    -- 🚨 DD-136b (2026-09-12) — AND A COMPONENT ASKS ITS PARENT.
    -- `not iam.table_has_visibility(...)` alone was too generous: 281 of the
    -- 305 tables it spared are COMPONENTS, and a component has no visibility
    -- column precisely BECAUSE its access is its parent's (db-rules §6d-1), not
    -- because it holds nothing private. It left every chat.message inside a
    -- `personal` conversation readable by the organization's admins after
    -- DD-136 had closed the conversation itself — 71,424 of them for one real
    -- admin. A component with a registered parent needs no role arm: its
    -- generated lane resolves the parent's accessible ids, so an admin who may
    -- read the parent still reads all of it, and an admin who may not, does not.
    -- DD-137b: and the CLASS decides whether this lane exists at all. coalesce(...,true)
    -- keeps a component/ledger token (NULL lanes — its access IS its parent's) exactly as
    -- it is; the parent it walks to is gated on its own class.
    if v_lanes.org_role_lane
       and v_is_org_admin
       and (v_vis >= 'internal'::platform.visibility
            or (not iam.table_has_visibility(v_schema, v_table)
                and not iam.token_is_parented_component(p_type)))
    then return true; end if;
  end if;
  if p_include_public and v_vis = 'public'::platform.visibility and p_required = 'viewer'::public.permission_level then return true; end if;
  if p_include_public and p_required = 'viewer'::public.permission_level
     and v_vis >= 'internal'::platform.visibility and v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
  -- DD-137b: our own staff go through the door too on the two private classes (§3.1
  -- derivation two). This is the runtime half of suppress_platform_admin_lane.
  -- DD-170 (2026-09-13): THE SAME WALL DD-165 GAVE THE OTHER STAFF ARMS, applied here too.
  -- This arm used to admit a super admin to ANY row owned by a global_readable system org
  -- with no visibility guard at all — the one staff arm DD-165 named but did not close
  -- (measured: 8 personal rows, browser.site_policy 4, mandate.binding 2, education.learn_doc 1,
  -- agent.definition 1). Same predicate as the org-admin arm above: a table with a real
  -- visibility column is walled at >= internal; a table with none at all (and not a parented
  -- component, which has no visibility concept of its own) keeps the arm it always had.
  if v_lanes.platform_admin_lane
     and v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
     and (v_vis >= 'internal'::platform.visibility
          or (not iam.table_has_visibility(v_schema, v_table) and not iam.token_is_parented_component(p_type)))
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
      and v_containment_carries
  loop
    if (rec.container_type, rec.container_id) is distinct from (p_type, p_id)
       and iam.has_access_for_base(v_uid, rec.container_type, rec.container_id, p_required,
             p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility))
    then return true; end if;
  end loop;
  -- DD-137b: the late org lanes, each answering to the class that owns it. The
  -- `visibility >= internal` guard is DD-136's and is unchanged — the class says whether
  -- the lane exists, the row's own value says how far it reaches.
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if v_lanes.org_role_lane then
      if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
      if v_is_org_admin then return true; end if;
    end if;
    if v_lanes.org_member_lane
       and p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  v_parent_include_public := p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility);
  for rec in
    select er.parent_type, er.fk_column from platform.entity_relationships er
    where er.child_type = p_type and er.kind in ('composition', 'containment')
      and v_containment_carries
    order by er.kind, er.parent_type, er.fk_column
  loop
    execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table) into v_parent_id using p_id;
    if v_parent_id is not null
       and iam.has_access_for_base(v_uid, rec.parent_type, v_parent_id, p_required, v_parent_include_public)
    then return true; end if;
  end loop;
  return false;
end; $function$

;

-- ============================== 2. THE MIRROR ==============================
CREATE OR REPLACE FUNCTION iam.entity_read_expr(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
-- DD-171: containment never carries a personal row — the emitted parent-FK arm stops at internal.
declare
  v_has_org boolean;
  v_has_vis boolean;
  v_arms text[] := '{}';
  v_cands text[] := '{}';
  v_bespoke boolean := false;
  v_owner_col text;
  v_cand text;
  v_expr text;
  v_selfref text;
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
  -- DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE ONE SOURCE. Which org lanes exist at
  -- all is a REGISTRY fact, true on every token whether or not it has a visibility column.
  -- iam.has_access_for_base reads the SAME function at runtime, so generation-time truth and
  -- runtime truth cannot drift by a single statement (db-rules §6d).
  v_lanes platform.lane_set;
  rec record;
begin
  select coalesce(et.suppress_platform_admin_lane, false) into v_suppress_admin
  from platform.entity_types et where et.token = p_token;
  v_suppress_admin := coalesce(v_suppress_admin, false);
  v_lanes := iam.class_lanes(p_token);
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
  if v_owner_col is not null and p_variant <> 'component' then
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
    elsif not iam.token_is_parented_component(p_token) then
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
    end if;

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
    -- lanes. DD-170 (2026-09-13): walled the same way as the org-admin arm above — the
    -- kernel (iam.has_access_for_base) got this wall first; mirroring it here is the other
    -- half, because the policy TEXT is what a real HTTP read runs against, not the kernel
    -- alone. v_suppress_admin still removes the arm entirely (the privacy wall).
    if not v_suppress_admin then
      if v_has_vis then
        v_arms := array_append(v_arms,
          '(organization_id is not null and visibility >= ''internal''::platform.visibility'
          ' and (select public.is_super_admin())'
          ' and organization_id in'
          ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      elsif not iam.token_is_parented_component(p_token) then
        v_arms := array_append(v_arms,
          '(organization_id is not null and (select public.is_super_admin())'
          ' and organization_id in'
          ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      end if;
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
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
          rec.fk_column, rec.parent_type));
      elsif v_has_vis then
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and (visibility is null or visibility = ''public'') and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
          rec.fk_column, rec.parent_type));
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and visibility >= ''internal''::platform.visibility and visibility <> ''public'' and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      else
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      end if;
    end if;
  end loop;

  -- ── CANDIDATE SETS — every remaining lane, all of them id-PRODUCING ────────

  -- SECURITY DEFINER candidate superset. The raw candidates below remain for
  -- their cheap indexed paths, but protected reachability/entity-grant rows
  -- are intentionally invisible to ordinary users. accessible_entity_ids
  -- reads them inside the canonical boundary and this policy still confirms
  -- every returned id through iam.has_access() below.
  -- D266 (2026-09-12): NEVER on a component. §6d — "Component SELECT resolves
  -- its composition PARENT IDs and filters on the child FKs — never call
  -- accessible_entity_ids on the child token" (the 12.9M-UUID
  -- seo.search_performance_daily class, 2026-08-13). A component's candidate
  -- set is exactly what was proven on 2026-08-26.
  if p_variant <> 'component' then
    v_cands := array_append(v_cands, format(
      'select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level, 0, true))',
      p_token));
  end if;

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

  -- ── THE CURATOR LANES ─────────────────────────────────────────────────────
  -- 🚨 A CANDIDATE SET MAY NEVER READ THE POLICY'S OWN TABLE. These two lanes
  -- used to be emitted as `select rb.id from platform.rulebook rb join
  -- iam.industry_curators ...`, i.e. a SELECT policy on platform.rulebook whose
  -- USING clause selects from platform.rulebook. Postgres answers that with
  -- `42P17 infinite recursion detected in policy for relation "rulebook"` and
  -- the table becomes unreadable for every non-superuser role — measured live
  -- 2026-09-12, every signed-in GET 500 from 11:10:40Z, the moment DD-136's
  -- step 7 first regenerated the table through this generator.
  --
  -- The kernel's own curator lane is a SECURITY DEFINER door:
  --     if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
  --       if p_required = 'viewer' then return true; end if; ...
  --     if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id)
  --       then return true; end if;
  -- so the arm below is that same viewer lane, evaluated the same way, outside
  -- RLS and therefore outside the recursion. It is a SUFFICIENT arm rather than
  -- a candidate set because a boolean door cannot produce an id set, and it
  -- needs no `iam.has_access` confirmation: the kernel grants exactly this.
  if p_token = 'rulebook' then
    v_arms := array_append(v_arms,
      'public.is_rulebook_curator((select auth.uid()), id)');
  end if;
  if p_token = 'seo_starter_pack' then
    v_arms := array_append(v_arms,
      'public.is_pack_curator((select auth.uid()), id)');
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
      '     and ws.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_site'', ''viewer''::public.permission_level, 0, true)))))');

    -- Branch 2 — snapshot body / markdown. The snapshot reference is itself what
    -- makes is_crawl_artifact true, so no metadata predicate is needed here.
    v_arms := array_append(v_arms,
      '((organization_id, id) in'
      ' (select s.organization_id, s.body_file_id from web.snapshot s'
      '   where s.deleted_at is null and s.body_file_id is not null'
      '     and s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true)))))');
    v_arms := array_append(v_arms,
      '((organization_id, id) in'
      ' (select s.organization_id, s.markdown_file_id from web.snapshot s'
      '   where s.deleted_at is null and s.markdown_file_id is not null'
      '     and s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true)))))');

    -- Branch 3 — screenshot image.
    v_arms := array_append(v_arms,
      '((organization_id, id) in'
      ' (select s.organization_id, s.file_id from web.screenshot s'
      '   where s.deleted_at is null and s.file_id is not null'
      '     and s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_screenshot'', ''viewer''::public.permission_level, 0, true)))))');
  end if;

  -- ── the bounded definer call ──────────────────────────────────────────────
  -- Everything the attribute lanes do not decide is decided exactly as before,
  -- by the same function — but only ever ASKED about ids a non-attribute lane
  -- could admit. A row outside both cannot be visible by any lane.
  if v_stale then
    v_cands := '{}';   -- stale mirror: never bound the definer call
  end if;

  -- 🚨 NO CANDIDATE SET MAY READ THE POLICY'S OWN TABLE (2026-09-12).
  -- A SELECT policy whose USING clause selects from its own relation raises
  -- `42P17 infinite recursion detected in policy for relation "..."` and the
  -- table becomes unreadable for every non-superuser role — not slow, not
  -- subtly wrong: 500 on every read. The industry-curator lane was exactly that
  -- for 14 days and went live the moment DD-136 regenerated the table.
  -- `iam.memberships` carries the same latent shape through the membership
  -- candidate (`select m.container_id from iam.memberships m ...`, token
  -- `membership`), so this is a CLASS, not two tokens.
  --
  -- The safe direction is the one this function already takes for a stale
  -- kernel fingerprint and for an unknown bespoke resolver: DROP THE BOUND and
  -- emit the unbounded `iam.has_access` lane. Correct, slower, and it can never
  -- deny a row — the opposite of silently omitting the offending lane, which
  -- WOULD deny rows. It screams so the lane gets a SECURITY DEFINER door of its
  -- own (see the curator lanes above) rather than living on as a slow path.
  v_selfref := '(from|join)[[:space:]]*\(?[[:space:]]*(' || p_schema || '\.)?'
               || p_table || '([^a-z0-9_]|$)';
  if cardinality(v_cands) > 0 then
    foreach v_cand in array v_cands loop
      if v_cand ~* v_selfref then
        raise warning 'entity_read_expr: a candidate lane for %.% READS THAT TABLE '
          'ITSELF (the 42P17 class). Dropping the bound and emitting an unbounded '
          'iam.has_access lane for %.% — correct but slow. Give the lane a SECURITY '
          'DEFINER door instead. Lane: %', p_schema, p_table, p_schema, p_table, v_cand;
        v_cands := '{}';
        exit;
      end if;
    end loop;
  end if;

  if cardinality(v_cands) = 0 then
    v_arms := array_append(v_arms, format('iam.has_access(%L, id, ''viewer'')', p_token));
  else
    v_arms := array_append(v_arms, format(
      '(id in (%s) and iam.has_access(%L, id, ''viewer''))',
      array_to_string(v_cands, ' union '), p_token));
  end if;

  -- ══ DD-137b — THE CLASS DECIDES WHICH LANES EXIST AT ALL (§3.1, F-5) ═══════════════
  -- DD-136 decided how WIDE the organization lanes are on the tables that HAVE a visibility
  -- column. On the 371 active tokens that do not, its guard could not be written at all, so
  -- the org-role arm was emitted unguarded and an organization admin read every member''s
  -- rows there (66 users.user_feedback rows and 96 transcripts.studio_runs for one real
  -- admin, measured 2026-09-12). The class answers that question the same way on all 672
  -- tokens, column or no column: a `private` or `confidential` token emits NO
  -- organization-role arm, a `private` token emits no organization-member arm either, and
  -- both close the platform-staff arm — our own staff go through the door too.
  --
  -- coalesce(..., true) is the component/ledger case spelled out: those tokens have NO class
  -- of their own (db-rules §6d-1) and keep exactly the behaviour they have always had; the
  -- parent they resolve through is gated on ITS class.
  -- 🚨 THE ORG-ARM PREFIX IS THE ANCHOR, AND IT IS LOAD-BEARING (DD-137b3a). Every
  -- organization arm this function builds opens with `(organization_id is not null and` —
  -- the generator''s own totality guard, on all four of them. Matching a lane''s INNER text
  -- alone is not enough: `iam.my_orgs()` also lives inside the bounded candidate arm, in the
  -- explicit-grant candidate, so a bare match deleted the whole sharing lane from every
  -- `private` token. The class is a FLOOR (§3.6) — ordinary sharing opens above it per item
  -- and per person, and cancelling that is over-tightening, which db-rules §6 treats as the
  -- same size of bug as a stranger let in.
  if not v_lanes.org_role_lane then
    if not exists (select 1 from unnest(v_arms) a where a like '(organization_id is not null and%'
                    and a like '%om.role in (''owner'',''admin'')%') and v_has_org and v_owner_col is not null and p_variant <> 'component' then
      raise exception 'iam.entity_read_expr: %.% (token %) is class %, which emits no '
        'organization-role arm — but no arm carrying that lane was found to remove. The arm '
        'shapes have moved and this filter is now silently keeping a lane it was written to '
        'cut.', p_schema, p_table, p_token, v_lanes.resolved_class;
    end if;
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and a like '%om.role in (''owner'',''admin'')%'));
  end if;
  if not v_lanes.org_member_lane then
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and (a like '%iam.my_orgs()%' or a like '%so.global_readable%')
                                and a not like '%is_super_admin%'));
  end if;
  if not v_lanes.platform_admin_lane then
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%' and a like '%is_super_admin%'));
  end if;
  -- The OWNER arm is never filtered. Over-tightening is a defect too: db-rules §6 — "a
  -- legitimate user blocked from their own data is as serious a bug as a stranger let in".
  if p_variant <> 'component' and v_owner_col is not null
     and not (format('%I = (select auth.uid())', v_owner_col) = any(v_arms)) then
    raise exception 'iam.entity_read_expr: the class filter removed the OWNER arm from %.% '
      '(token %). No class has ever excluded the owner and none may.', p_schema, p_table, p_token;
  end if;

  v_expr := array_to_string(v_arms, ' or ');

  -- 🚨 THE LAST WALL. The candidate filter above degrades safely, so anything
  -- still reading the table here is an ARM — hand-written, with no safe
  -- degradation available and no way to bound it. That is a coding error in
  -- this function, and a coding error that ships makes the table unreadable
  -- (42P17) for everyone. It dies here, at generation time, naming the table,
  -- instead of at 11:10 on a Saturday in every user's browser.
  -- Repo guard: pnpm check:rls-self-reference.
  if v_expr ~* v_selfref then
    raise exception
      'iam.entity_read_expr: an ARM built for %.% (token %, variant %) reads '
      '%.% ITSELF — a policy that selects from its own relation raises 42P17 '
      'and makes the table unreadable. Route the lane through a SECURITY '
      'DEFINER door (see the curator lanes) instead of a join on the entity.',
      p_schema, p_table, p_token, p_variant, p_schema, p_table;
  end if;

  return v_expr;
end;
$function$

;

-- ============================== 3. RE-STAMP THE FINGERPRINT ==============================
-- `iam.entity_read_kernel_expected()` is a hardcoded baseline; the kernel change above moved
-- `iam.entity_read_kernel_fingerprint()`'s live value, so the baseline is re-stamped to match —
-- a deliberate, reviewed re-proof, not the silent drift the fingerprint guard exists to catch.
DO $fp$
DECLARE
  v_new_fp text;
BEGIN
  SELECT iam.entity_read_kernel_fingerprint() INTO v_new_fp;
  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text LANGUAGE sql IMMUTABLE AS $body$ select %L::text $body$$f$,
    v_new_fp
  );
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'dd170: fingerprint re-stamp failed to take — actual % expected %',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
  RAISE NOTICE 'dd170: entity_read_kernel_expected() re-stamped to %', v_new_fp;
END
$fp$;

-- ============================== 4. REGENERATE THE FOUR NAMED TOKENS ==============================
-- Picks up the new mirror text immediately, closing the live exposure on the 8 personal rows.
SELECT iam.apply_rls('browser', 'site_policy', 'browser_site_policy', 'system');
SELECT iam.apply_rls('mandate', 'binding', 'mandate_binding', 'entity');
SELECT iam.apply_rls('education', 'learn_doc', 'learn_doc', 'entity');
SELECT iam.apply_rls('agent', 'definition', 'agent', 'entity');

-- ============================== 5. GREEN, PROVEN, NOT ASSUMED ==============================
DO $green$
DECLARE
  v_count int;
BEGIN
  -- The exact RED case, re-run as the same identity, inside this migration: a super admin who
  -- owns none of the four browser.site_policy personal rows must now read zero of them.
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claim.sub = '87a6e699-3622-4869-8843-d0867456c0dd';
  SELECT count(*) INTO v_count FROM browser.site_policy WHERE visibility = 'personal';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'dd170: GREEN failed — super admin (non-owner) still reads % of 4 personal browser.site_policy rows',
      v_count;
  END IF;
  RESET role;
  RAISE NOTICE 'dd170 GREEN: super admin (non-owner) reads 0 of 4 personal browser.site_policy rows (was 4)';
END
$green$;
