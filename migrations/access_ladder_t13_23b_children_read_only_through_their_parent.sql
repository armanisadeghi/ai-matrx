-- access_ladder_t13_23b_children_read_only_through_their_parent.sql
-- chair-step: the regeneration trigger on platform.entity_types is DROPPED and re-created to also fire on rls_variant/is_component (a trigger's column list cannot change in place); the REVOKEs close EXECUTE on the new trigger and guard functions; the `true`-predicate CREATE POLICY text is inside the replaced generator body, unchanged. No data or policy is changed by this file.
--
-- T-13 step 2.3b (common-docs/projects/access-ladder/t13/PLAN.md). The law: children inherit their
-- parent and never carry access of their own (/policies/access-ladder.md).
--
-- Two generator defects found in step 2.3, fixed as a class:
--   1. platform._entity_types_class_regenerates fired only on a data_class change and returned early
--      for a component, so a table that BECAME a child kept its old organization/public policies.
--      It now also regenerates when a token becomes (or stops being) a child, and a new
--      platform._component_edge_regenerates regenerates a child when its composition edge is
--      registered or moved (so the order of "flip the variant" and "add the edge" does not matter).
--   2. iam.entity_read_expr emitted, for a child with stray visibility / organization_id /
--      created_by columns, a "visibility = 'public'" arm and the organization arms. For a component
--      it now emits only the parent arms (plus the kernel-bounded candidate arm, which confirms every
--      id through iam.has_access, and the declared anon-via-public-parent lane in the generator).
--      iam._apply_rls_unchecked stops walling a child's staff prefix on its stray visibility column,
--      so no generated child policy reads that column (T-13 phase 7 drops it).
--   3. Guard: iam.children_with_own_read_arms() — one row per child table whose read policies carry
--      an arm not derived from its parent. Zero rows or it failed (pnpm check:children-read-through-parent).
--      The 28 children with hand-written (bespoke) read policies are a named, shrink-only debt list.
--
-- Neither kernel member changes (iam.entity_read_expr and the generator are not kernel members):
-- the kernel fingerprint stays as recorded.
--
-- based-on: iam.entity_read_expr(text, text, text, text) 4d0fe2fea787c8fbc3812ba7c03c76ecc41d2b7028d94248d359625d1b649577
-- based-on: iam._apply_rls_unchecked(text, text, text, text) f88f1cd496e5f9b38e556695eb699d82f47e03453978784bee6b079bd2fc9235
-- based-on: platform._entity_types_class_regenerates() a468fc168ddf0c64decb6c3d26663a6d4cdb1f3202b1f075674f9e828cbb3378
-- based-on: trigger _entity_types_class_regenerates on platform.entity_types 9b6fbf913f126b677683c5d4659764efd080488cb2b64836050c28afa95a941a

-- ── 2. a child's read arms come only from its parent ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam.entity_read_expr(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
-- DD-171: containment never carries a personal row — the emitted parent-FK arm stops at internal.
declare
  v_t33_start integer; v_t33_child text[];
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
  -- MIRROR-LIVE-FORM (2026-09-27): custom.record asks its per-organization question instead of the
  -- whole-database record set. See the note at the candidate sets below.
  v_record_in_org boolean := false;
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

  -- ACCESS LADDER T-13 2.3b (2026-09-28): A CHILD CARRIES NO ACCESS OF ITS OWN
  -- (/policies/access-ladder.md, "Children inherit their parent"). A component's stray
  -- `visibility` column (dropped in T-13 phase 7) never opens a row: the public lane is the
  -- parent's, reached through the parent arm below or the declared anon-via-public-parent lane.
  if v_has_vis and p_variant <> 'component' then
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
  -- ACCESS LADDER T-13 2.3b (2026-09-28): and no organization arm on a child either — its
  -- organization_id / created_by / visibility are stray columns, never lanes. Owners, members,
  -- admins and staff of the parent reach the child through the parent arm below.
  if v_has_org and v_owner_col is not null and p_variant <> 'component' then
    -- Every org arm is guarded `organization_id is not null` so the expression
    -- is TOTAL. `x in (select …)` yields NULL, not false, when x is NULL, and
    -- while a USING clause treats NULL as deny — so this is not an access
    -- change — a policy that evaluates to NULL is the kind of thing that reads
    -- as a bug forever after. has_access_for_base guards the same lanes with
    -- `v_org is not null` for the same reason.

    -- org-admin at viewer — `is_org_admin_for(v_uid, v_org)`
    --
    -- ACCESS LADDER T-33 (2026-09-28): the arm asks iam.my_admin_orgs(), the organizations the caller
    -- owns or administers that are NOT archived — the set form of is_org_admin_for, same rule.
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
        '(organization_id is not null and ' || iam.org_lane_visibility_sql(p_token, '') || ' and organization_id in'
        ' (select iam.my_admin_orgs()))');
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
        ' (select iam.my_admin_orgs()))');
    end if;

    if v_has_vis then
      -- global-readable system org at >= internal (db-rules §6e)
      v_arms := array_append(v_arms,
        '(organization_id is not null and visibility >= ''internal''::platform.visibility'
        ' and organization_id in'
        ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      -- org members at >= internal — the `iam.has_org_access_for` lane
      --
      -- 🚨 SHARED-ONLY (2026-09-19) — AND THE ORGANIZATION ITSELF DECIDES WHETHER THIS LANE
      -- EXISTS. `iam.has_access_for_base` has asked that since VIS-2:
      --
      --     if v_lanes.org_member_lane and iam.has_org_access_for(v_uid, v_org) then
      --       if v_schema is distinct from 'custom' or not custom.store_is_open(v_org) then
      --         if p_required <= 'editor' then return true; end if;     -- the 2026-08-12 cap
      --       elsif p_required <= iam.member_lane_confers(...) then return true; end if;
      --
      -- and this mirror never learned it. VIS-2, LEVEL-FIX and GUARD-SWITCH each recorded the
      -- gap and each left it, because census 7 of `pnpm check:store-doors-decide` keeps
      -- `authenticated` holding no TABLE privilege anywhere in schema `custom`, so no policy
      -- built from this expression is reachable today. That is a fact about the grants, not
      -- about this function: the day one table grant appears in schema `custom`, an
      -- organization that has said `shared_only` hands every member every `internal` row
      -- through the policy text while every door refuses them — the kernel and its mirror
      -- disagreeing in the same breath, which is the exact shape of the defect the sixth pass
      -- found on the door side.
      --
      -- THE TWO GUARDS ARE THE KERNEL'S TWO LINES, in the same order and with the same
      -- posture. `custom.store_is_open` first: an organization that has not turned the record
      -- store on keeps the arm the kernel always had, so nothing changes for it. Then
      -- `iam.member_lane_open`, which is the knob and which fails toward TODAY'S behaviour on
      -- an unreadable registry — over-tightening a read policy denies a legitimate person
      -- their own data, which db-rules §6 treats as the same size of bug as a stranger let in.
      -- Only schema `custom` pays the two calls; every other token emits the arm unchanged.
      if p_schema = 'custom'
         and not exists (select 1 from platform.feature_knob k
                          where k.feature = 'custom' and k.key = 'system_enabled') then
        raise exception 'iam.entity_read_expr: schema custom''''s organization-member arm is held '
          'off by custom.store_is_open, which is the read of the custom/system_enabled knob - and '
          'that knob row does not exist, so the gate is on nothing. Restore the knob row or take '
          'the guard out deliberately; do not ship an arm gated on a switch that is not there.';
      end if;
      v_arms := array_append(v_arms,
        '(organization_id is not null and ' || iam.org_lane_visibility_sql(p_token, '')
        || ' and organization_id in (select iam.my_orgs())'
        || case when p_schema = 'custom'
                then ' and (not custom.store_is_open(organization_id)'
                     || ' or iam.member_lane_open(organization_id))'
                else '' end
        || ')');
    elsif v_lanes.resolved_class = 'organization' and p_schema <> 'custom'
          and not iam.token_is_parented_component(p_token) then
      -- 🚨 ACCESS LADDER (2026-09-28): ORGANIZATION MEANS EVERY MEMBER OPENS IT, visibility column or
      -- not. A table with no visibility column used to get NO member arm here, so coworkers were
      -- locked out of rows the kernel admits (rag.kg_clusters: iam.has_access true, SELECT 0 of 108).
      -- What a member SEES is the "Shown to" list filter, never row security. A child row opens only
      -- through its parent and a Private/Confidential row class stays closed — the same test as
      -- iam.personal_opens_row, which the kernel asks for such a row.
      v_arms := array_append(v_arms,
        '(organization_id is not null'
        || case when platform.child_parent_columns(p_token) is null then ''
                else format(' and %I is null', (platform.child_parent_columns(p_token))[1]) end
        || case when platform.row_class_column(p_token) is null then ''
                else format(' and coalesce(%I::text, ''organization'') not in (''private'', ''confidential'')',
                            platform.row_class_column(p_token)) end
        || ' and organization_id in (select iam.my_orgs()))');
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
  v_t33_start := coalesce(array_length(v_arms, 1), 0);
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
      if p_variant = 'component' and iam.read_lane_v2_edge_emits(p_token, rec.parent_type, rec.fk_column) then
        -- READ-LANE V2: use the parent policy's correlated arm where the declared edge supports it.
        v_arms := array_append(v_arms, iam.read_lane_v2_parent_arm(rec.parent_type, rec.fk_column));
      elsif p_variant = 'component' then
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
  -- ACCESS LADDER T-33 (2026-09-28): a row naming its parent record (platform.child_parent_columns)
  -- opens only through that parent — the container (folder) arms above do not apply to it.
  v_t33_child := platform.child_parent_columns(p_token);
  if v_t33_child is not null then
    for i33 in v_t33_start + 1 .. coalesce(array_length(v_arms, 1), 0) loop
      v_arms[i33] := format('(%I is null and %s)', v_t33_child[1], v_arms[i33]);
    end loop;
  end if;

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
  -- 🚨 MIRROR-LIVE-FORM (2026-09-27) — custom.record ASKS ABOUT THE ROW'S OWN ORGANIZATION.
  -- For custom.record the definer superset is `custom.visible_record_ids`, the ladder over every
  -- (organization, Table) the viewer can reach on the whole database. MIRROR-2 (2026-09-20) took it
  -- out of the LIVE std_select policy and put the same question back as its own top-level arm,
  -- `deleted_at is null and iam.record_visible_in_org(...) and iam.has_access(...)`, because
  --     id in (C1 ∪ C2…C6) ∧ H   ≡   (id in C1 ∧ H) ∨ (id in (C2…C6) ∧ H)
  -- and `iam.record_visible_in_org` is `id in C1` for a live row (C1 returns live rows only, hence
  -- `deleted_at is null`). This generator never learned it, so an `iam.apply_rls` on custom.record
  -- would have put the whole-database set back and census 12 judged a text that was not live.
  -- Only (custom, record, record) takes it: the memo's arguments are custom.record's own columns.
  v_record_in_org := p_schema = 'custom' and p_table = 'record' and p_token = 'record'
                     and p_variant <> 'component';
  -- Access ladder T-11 parts t/v: `file` and `folder` do not take the whole reachable set as a
  -- candidate. Their policies decide the owner, organization and folder lanes row by row (the arms
  -- above), and the rest of that set arrives through the lazy arms built below the `file` branch.
  if p_variant <> 'component' and not v_record_in_org and p_token not in ('file', 'folder') then
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

    -- Branches 2 and 3 — snapshot body / markdown and screenshot image. CORRELATED, read AS
    -- THE INVOKER, bounded by the SAME accessible-id rule as before (CS-32, R13, 2026-09-18).
    --
    -- THE ONLY CHANGE FROM THE SET FORM IS CORRELATION. Each arm still reads web.snapshot /
    -- web.screenshot inside a policy subquery, which runs with the QUERYING role's privileges
    -- and therefore under those tables' own RLS, and still bounds the snapshot by
    -- `iam.accessible_entity_ids(<parent token>, 'viewer', 0, true)`. Same authority, same
    -- inner RLS, same id rule. What changed is that the subquery now pins the snapshot to the
    -- file being examined, so the FK index answers it instead of the whole table being
    -- materialised into a pair set.
    --
    -- WHY NOT A SECURITY DEFINER HELPER ASKING iam.has_access. That was this lane's first
    -- attempt and an adversarial re-verify killed it: substituting `iam.has_access` for
    -- `std_select(snapshot) ∩ accessible_entity_ids` is NOT the same question. It differs in
    -- both directions, and today's data hid both. Planting `visibility = 'public'` on ONE
    -- web.site turned it into a 361-pair NARROWING for a non-member (361 old-only, 0 new-only),
    -- and has_access's owner lane is a structural WIDENING that is merely unreproducible while
    -- every snapshot creator happens to be an admin or owner. The equivalence "proof" that
    -- lane ran was a coincidence of one afternoon's rows, not a property of the expressions.
    -- Correlation is what made it fast; bypassing RLS only made it wrong.
    --
    -- NULL SEMANTICS ARE UNCHANGED. The set form was
    -- `(organization_id, id) in (select s.organization_id, s.body_file_id ...)`: a row
    -- constructor with a NULL on either side yields NULL, never true, so the row is excluded.
    -- The correlated form compares with `=`, which yields NULL for a NULL and matches nothing,
    -- so the row is excluded there too. `s.body_file_id is not null` is kept anyway rather
    -- than argued away.
    -- Repo guard: tests/test_cs32_crawl_arm_stays_correlated.py.
    v_arms := array_append(v_arms,
      '(coalesce((select bool_or(s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true))))'
      '           from web.snapshot s'
      '           where s.body_file_id = files.id'
      '             and s.organization_id = files.organization_id'
      '             and s.deleted_at is null and s.body_file_id is not null'
      '), false))');
    v_arms := array_append(v_arms,
      '(coalesce((select bool_or(s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true))))'
      '           from web.snapshot s'
      '           where s.markdown_file_id = files.id'
      '             and s.organization_id = files.organization_id'
      '             and s.deleted_at is null and s.markdown_file_id is not null'
      '), false))');
    v_arms := array_append(v_arms,
      '(coalesce((select bool_or(s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_screenshot'', ''viewer''::public.permission_level, 0, true))))'
      '           from web.screenshot s'
      '           where s.file_id = files.id'
      '             and s.organization_id = files.organization_id'
      '             and s.deleted_at is null and s.file_id is not null'
      '), false))');

  end if;

  -- 🚨 ACCESS LADDER T-11 PARTS t/v (2026-09-28) — WHAT iam.accessible_entity_ids ADDED, ASKED
  -- LAZILY, for `file` and `folder`. The bounded arm used to take the caller's WHOLE reachable set as
  -- a candidate (1.3 s for a coworker's files, 0.9 s for folders, paid by every list that met one row
  -- the caller cannot read). Of that set, the owner, public, organization-role, system-organization
  -- and containment (parent folder) lanes are already arms above, evaluated row by row. The rest is
  -- exactly these three, each ANDed with the same confirmation the set form gave it:
  --   1. the organization-member lane read from iam.organization_member (the set form's source),
  --      which still includes an ARCHIVED organization the member arm above (iam.my_orgs) leaves
  --      out — confirmed by iam.has_access as before;
  --   2. the child parent lane (platform.child_parent_columns: a child opens to whoever opens its
  --      parent record), asked once per statement as (parent type, parent id) pairs — confirmed by
  --      iam.has_access as before;
  --   3. the kernel-confirmed candidate lanes (grants, memberships, reachability, assignments,
  --      library grants), unconfirmed in the set and confirmed per row by iam.candidate_admits —
  --      the same iam.has_access_for_base question the set form asked of each candidate.
  -- Only these two tokens: the equivalence was proved for them (every id, three real accounts,
  -- parts t and v). Another token joins the list only with the same proof.
  if p_token in ('file', 'folder') and p_variant <> 'component' and not v_record_in_org then
    if v_lanes.org_member_lane and v_has_org and v_has_vis then
      v_arms := array_append(v_arms, format(
        '(organization_id in (select om.organization_id from iam.organization_member om'
        ' where om.user_id = (select auth.uid())) and %s'
        ' and iam.has_access(%L, id, ''viewer''::public.permission_level))',
        iam.org_lane_visibility_sql(p_token, ''), p_token));
    end if;
    if platform.child_parent_columns(p_token) is not null then
      v_arms := array_append(v_arms, format(
        '(%1$I is not null and %1$I <> %3$L and (%1$I, %2$I) in'
        ' (select c.parent_type, c.parent_id from iam.accessible_child_parents(%3$L) c)'
        ' and iam.has_access(%3$L, id, ''viewer''::public.permission_level))',
        (platform.child_parent_columns(p_token))[1], (platform.child_parent_columns(p_token))[2], p_token));
    end if;
    v_arms := array_append(v_arms, format(
      '(id in (select iam.unnest_uuids(iam.accessible_entity_candidates(%1$L)))'
      ' and iam.candidate_admits(%1$L, id))', p_token));
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
  -- MIRROR-LIVE-FORM: C1 for custom.record, as its own arm (see the candidate sets). Only when the
  -- call is bounded: an unbounded `iam.has_access` arm above already admits every row it would.
  if v_record_in_org and cardinality(v_cands) > 0 then
    v_arms := array_append(v_arms,
      '(deleted_at is null and iam.record_visible_in_org(organization_id, table_id, id, visibility,'
      ' created_by, ''viewer''::public.permission_level)'
      ' and iam.has_access(''record'', id, ''viewer''::public.permission_level))');
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
  -- T-33 fix: the organization-role arm is `organization_id in (select iam.my_admin_orgs())` since
  -- access_ladder_t33; both shapes are recognised so a private/confidential token still loses it.
  if not v_lanes.org_role_lane then
    if not exists (select 1 from unnest(v_arms) a where a like '(organization_id is not null and%'
                    and (a like '%om.role in (''owner'',''admin'')%' or a like '%iam.my_admin_orgs()%')) and v_has_org and v_owner_col is not null and p_variant <> 'component' then
      raise exception 'iam.entity_read_expr: %.% (token %) is class %, which emits no '
        'organization-role arm — but no arm carrying that lane was found to remove. The arm '
        'shapes have moved and this filter is now silently keeping a lane it was written to '
        'cut.', p_schema, p_table, p_token, v_lanes.resolved_class;
    end if;
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and (a like '%om.role in (''owner'',''admin'')%' or a like '%iam.my_admin_orgs()%')));
  end if;
  -- 🚨 DD-185 (2026-09-13) — THE §6e SYSTEM-ORGANIZATION ARM IS AN EVERY-SIGNED-IN-USER ARM,
  -- SO IT BELONGS TO THE TWO CLASSES WHOSE LANE SET IS WIDER THAN ONE ORGANIZATION.
  -- `org_member_lane` was doing double duty: it is TRUE for `confidential`, so the filter below
  -- kept the global-readable arm on every confidential token — and that arm asks nothing about
  -- membership at all. Measured on this database (B-65, rolled-back rehearsal): a NON-MEMBER read
  -- 8 rows of a confidential `audit_exemption` and 4 of `admin_markdown_sample` through it, and
  -- live today hr.earning_code (24 rows) and hr.auto_close_rule (2) sit behind it.
  -- This is DD-174's ledger-branch rule, character for character: the system-org arm exists only
  -- for `organization` and `public`. `private` loses it here too and then loses the member arm
  -- below; the two filters are independent because the lanes are.
  if not (v_lanes.resolved_class in ('organization','public')) then
    if v_lanes.org_member_lane and v_has_org and v_has_vis and v_owner_col is not null
       and p_variant <> 'component'
       and not exists (select 1 from unnest(v_arms) a
                        where a like '(organization_id is not null and%'
                          and a like '%so.global_readable%'
                          and a not like '%is_super_admin%') then
      raise exception 'iam.entity_read_expr: %.% (token %) is class %, which emits no '
        'global-readable system-organization read arm — but no arm carrying that lane was found '
        'to remove. The arm shapes have moved and this filter is now silently keeping a lane it '
        'was written to cut.', p_schema, p_table, p_token, v_lanes.resolved_class;
    end if;
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and a like '%so.global_readable%'
                                and a not like '%is_super_admin%'));
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

  -- 🚨 RC-A1 (2026-09-25, chair ruling: Google Drive behaviour): for a token that declares it
  -- (platform.trash_is_owner_only) every arm above is ANDed with the kernel's trash rule, so a
  -- row in its owner's trash is read by its owner only. platform_admin_read is a separate
  -- policy and keeps reading every row.
  if platform.trash_is_owner_only(p_token) and v_owner_col is not null and p_variant <> 'component'
     and exists (select 1 from information_schema.columns c
                  where c.table_schema = p_schema and c.table_name = p_table and c.column_name = 'deleted_at') then
    v_expr := format('(%s) and not platform.trash_hides(%L, deleted_at, %I, (select auth.uid()))',
                     v_expr, p_token, v_owner_col);
  end if;

  return v_expr;
end;
$function$;

CREATE OR REPLACE FUNCTION iam._apply_rls_unchecked(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$

declare
  -- ── POLICY-LOCK (2026-09-22) — THE FREEZE IS AS LONG AS THE TRANSACTION ──────────────
  -- Supabase's own `supautils` extension carries a `policy_grants` hook keyed on the ROLE and
  -- the COMMAND: every CREATE/ALTER/DROP POLICY run as `postgres` takes ACCESS EXCLUSIVE on the
  -- 23 `auth.*` / `storage.*` / `realtime.*` relations named in `supautils.policy_grants`, and
  -- PostgreSQL holds them until COMMIT. While they are held NOBODY can sign in, refresh a token,
  -- read a file or receive a realtime message. The setting is `sighup`, read from Supabase's
  -- configuration file, and cannot be changed by us (lane POLICY-LOCK bisected it on the dev
  -- clone; `SET`, `SET LOCAL` and `ALTER ROLE … SET` are all refused).
  --
  -- So the ONE lever we own is DURATION, and it was being thrown away: this function issued its
  -- first `drop policy` early and then did everything else — the policy creates, the 24 KB
  -- `iam.apply_table_grants`, the governance guard — inside the freeze it had opened. Measured on
  -- the clone 2026-09-22: `iam.apply_rls('iam','api_keys','iam_api_key')` = 4 481 ms total, of
  -- which `iam.apply_table_grants` alone is 4 222 ms. 970 tables on this database carry generated
  -- policies.
  --
  -- THE SHAPE, and it is a rule, not a tidy-up: compute everything first in plain reads, do every
  -- non-policy side effect (RLS on, anon grant/revoke, table grants, governance guard), and issue
  -- the drop/create POLICY statements LAST, back to back, with nothing between them. Nothing may
  -- be inserted between `iam._rls_emit_policies` and COMMIT.
  v_pol text[] := '{}'::text[];   -- the create-policy statements, built but NOT executed
  v_drop text[] := '{}'::text[];  -- the drop-policy statements, built but NOT executed
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_is_component boolean;
  v_has_user boolean;
  v_has_created boolean;
  v_owner_disagree bigint;  -- PERSONAL-OWNER (2026-09-25): rows where a lingering user_id names another owner
  v_personal_has_id boolean := false;  -- T-9: a personal row a grant can name
  v_personal_grant text := '';        -- T-9: the owner-grant arm, a format() template taking the level
  v_has_org boolean;
  v_has_del boolean;
  v_has_vis boolean;
  v_delpfx text := '';
  v_parent_expr_edit text := '';
  v_parent_expr_view text := '';
  v_parent_count integer := 0;
  -- THE ADMIN LANE. Leading arm of every generated policy; see the migration
  -- header for the 22s -> 40ms measurement that dictates the position.
  v_admin text := '(select public.is_platform_admin()) or ';
  -- THE PRIVACY WALL (HR D14.1 / D19, SPEC-ACCESS §3.5). When a token declares
  -- suppress_platform_admin_lane, AI Matrx staff get NO read arm on it: the
  -- v_admin prefix is emptied, the platform_admin_all policy is not created,
  -- and the is_super_admin() arms are removed from the restricted lane and from
  -- the entity system-org INSERT lane. Every other token is untouched — the
  -- column defaults false and these three strings keep their exact current text,
  -- so the emitted policy bytes for an unflagged token do not move.
  v_suppress_admin boolean := false;
  -- THE PUBLIC-PARENT ANON LANE (0580). Opt-in per token via
  -- platform.entity_types.component_anon_read_via_public_parent: a component
  -- has no visibility of its own — its access IS the parent's, INCLUDING the
  -- parent's public-ness. The authenticated composition arm already walks
  -- accessible_entity_ids(..., include_public => true), so without this lane
  -- the anon role saw strictly less than any signed-up stranger.
  v_required_anon_status text;
  v_anon_component boolean := false;
  v_anon_expr text := '';
  v_pdel boolean;
  v_excluded text[];
  -- 🚨 SUPER-ADMIN ONCE PER STATEMENT (2026-09-26, perf lane). Every super-admin arm is emitted as
  -- `(select public.is_super_admin())` — an InitPlan, evaluated once per statement — instead of a
  -- bare call PostgreSQL evaluated once per ROW (mandate.scan, 85k rows, paid it on every read).
  -- The function takes no row argument and is STABLE, so the answer is the same; only the count of
  -- calls changes. iam.verify_canonical and check-row-visibility accept both spellings.
  v_su_sel text := ' or (select public.is_super_admin())';
  v_su_ins text := '(select public.is_super_admin()) or ';
  v_sysorg_ins text := ' or (organization_id in (select organization_id from iam.system_orgs where global_readable) and (select public.is_super_admin()))';
  -- 🚨 DD-165 (2026-09-12) — A PERSONAL ROW STAYS PERSONAL INSIDE AN ORGANIZATION TABLE.
  -- The CLASS sets the DEFAULT lane set; a row's `visibility` only ever NARROWS it. So on a
  -- classed table that carries a real `platform.visibility` column, the platform-staff arms are
  -- emitted in their WALLED form: they admit a row only when `visibility >= 'internal'`, i.e.
  -- never a row the person marked `personal`. The owner arm, the sharing/grant lanes and
  -- `iam.has_access` are untouched, so the owner and everyone they shared with keep reading.
  -- These two strings are the READ (USING) forms; `v_admin`/`v_su_sel` keep their exact previous
  -- text and are still used in every WITH CHECK, because DD-165 is a rule about who may READ a
  -- person's private row, not about what an admin may write.
  v_vis_enum boolean := false;
  v_admin_read text;
  v_su_sel_read text;
  rec record;
  pol record;
  -- DD-147: the catalog of names THIS function authors, and the bespoke names it kept.
  v_authored text[];
  v_kept text[];
  v_client_read_only boolean := false;
  v_registry_rows integer;
  v_registry_token text;
  v_registry_variant text;
  -- DD-174: the ledger variant's lanes are read off the CLASS, not hardcoded.
  v_ledger_lanes platform.lane_set;
  v_sysorg_read text;
  -- DD-249: the anon lane is the CLASS's to grant, and this is where it is asked.
  v_pub_lanes platform.lane_set;
  -- DOORS-ONLY-4 (2026-09-21) -- A DOORS-ONLY SCHEMA'S WRITE LANES ARE THE GENERATOR'S,
  -- NOT SEVENTY-FIVE HAND-WRITTEN DROP-POLICY FILES.
  -- `platform` and `iam` are not client-writable schemas (chair ruling; VERIFIER-8 HIGH-3):
  -- every write goes through a named SECURITY DEFINER door, reads stay exactly as they are.
  -- The 255 residual triples DOORS-ONLY-3 left are all PERMISSIVE WRITE POLICIES with no
  -- grant behind them any more -- std_insert/std_update/std_delete and platform_admin_all --
  -- and every one of those names is emitted BELOW. Removing them by hand lasts until the
  -- next iam.apply_rls, which platform.provision calls, so one new table spec would put
  -- them all back on tables the guard had already recorded clean.
  -- Fix the class: the generator stops emitting them for a schema DECLARED doors-only in
  -- platform.schema_client_exposure.client_writes_doors_only, and emits the FOR SELECT twin
  -- platform_admin_select wherever it would have emitted platform_admin_all, so platform
  -- staff keep the identical read and lose only the write half of that FOR ALL policy.
  v_doors_only boolean := false;
  -- The registry flag and the schema declaration answer the same question -- may a CLIENT
  -- write this base table -- so the emit sites ask this one. The registry flag keeps its own
  -- strict refusals (duplicate rows, variant mismatch) below: those are about a MARKED
  -- relation's declaration being coherent, and a schema-wide rule must not start raising on
  -- a hundred tables that never declared anything.
  v_no_client_writes boolean := false;
  -- RC-A2c: the reference gate this token declares (platform.reference_gate), if any.
  v_ref_type_col text; v_ref_id_col text;
  -- READ-LANE V2 (P7): the token is enrolled in iam.read_lane_v2_rollout.
  v_v2 boolean := false;
  -- CLIENT DELETES REFUSED (chair 2026-09-26: archive, never hard-delete): the token emits no client
  -- DELETE policy, and iam.apply_table_grants issues no DELETE grant. Deletes go through archive doors.
  v_del_refused boolean := false;
begin
  select coalesce(is_component, false), coalesce(suppress_platform_admin_lane, false),
         coalesce(component_anon_read_via_public_parent, false), client_excluded_columns
    into v_is_component, v_suppress_admin, v_anon_component, v_excluded
  from platform.entity_types where token = p_token;

  -- D347: publication is an additional anonymous-only restriction, never an access grant.
  v_v2 := iam.read_lane_v2_enrolled(p_token);
  select coalesce(et.client_deletes_refused, false) into v_del_refused
    from platform.entity_types et where et.token = p_token;
  v_del_refused := coalesce(v_del_refused, false);

  select anonymous_read_status into v_required_anon_status
    from platform.entity_types where token = p_token;
  if v_required_anon_status is not null then
    if p_variant not in ('entity','system','restricted') or not exists (
      select 1 from pg_attribute where attrelid=to_regclass(v_tbl)
        and attname='status' and atttypid='text'::regtype and not attisdropped
    ) then
      raise exception 'apply_rls: anonymous_read_status requires an entity/system/restricted table with a text status column: %', v_tbl;
    end if;
    v_pol := array_append(v_pol, format(
      'create policy anon_status_gate on %s as restrictive for select to anon using (status = %L::text)',
      v_tbl, v_required_anon_status));
  end if;

  -- 🚨 RC-A2c (2026-09-25): a token that names the record it points at (platform.reference_gate)
  -- gets ONE restrictive policy for every command: a row whose target is set is visible to, and
  -- writable by, only someone who can view the target. Platform admins are exempt inside it, so
  -- platform_admin_read keeps reading every row (common-docs/policies/our-own-admin-database-access.md).
  select g.type_column, g.id_column into v_ref_type_col, v_ref_id_col
    from platform.reference_gate(p_token) g limit 1;
  if v_ref_id_col is not null then
    v_pol := array_append(v_pol, format(
      'create policy ref_target_gate on %1$s as restrictive for all to authenticated '
      'using ((select public.is_platform_admin()) or %2$I is null or %3$I is null '
      'or iam.has_access(%2$I, %3$I, ''viewer''::public.permission_level)) '
      'with check ((select public.is_platform_admin()) or %2$I is null or %3$I is null '
      'or iam.has_access(%2$I, %3$I, ''viewer''::public.permission_level))',
      v_tbl, v_ref_type_col, v_ref_id_col));
  end if;

  -- 🚨 ACCESS LADDER T-33 (2026-09-28): AN ARCHIVED ORGANIZATION IS CLOSED. ONE restrictive policy
  -- for every command and both client roles, so no permissive arm (author, public, anon, member,
  -- grant) reaches a row of an archived organization; platform admins are exempt inside it, like
  -- ref_target_gate. The predicate and the table test are shared: iam.org_open_predicate(),
  -- iam.org_open_gate_applies().
  if iam.org_open_gate_applies(p_schema, p_table) then
    v_pol := array_append(v_pol, format(
      'create policy org_open_gate on %1$s as restrictive for all to authenticated, anon using (%2$s) with check (%2$s)',
      v_tbl, iam.org_open_predicate()));
  end if;

  select count(*), coalesce(bool_or(client_read_only), false), max(token), max(rls_variant)
    into v_registry_rows, v_client_read_only, v_registry_token, v_registry_variant
  from platform.entity_types where schema_name=p_schema and table_name=p_table;
  if v_client_read_only and v_registry_rows > 1 then raise exception 'apply_rls: duplicate registry rows for marked %.%',p_schema,p_table using errcode='42501'; end if;
  if v_client_read_only then
    if v_registry_token is distinct from p_token then
      raise exception 'apply_rls: readonly registry token mismatch for %.% token %',p_schema,p_table,p_token using errcode='42501';
    end if;
    if v_registry_variant is null or v_registry_variant not in ('entity','system','restricted','personal','component','ledger','reference','detail') then
      raise exception 'apply_rls: readonly registry variant is missing or unknown for %.%',p_schema,p_table using errcode='42501';
    end if;
    if p_variant is distinct from v_registry_variant then
      raise exception 'apply_rls: readonly registry variant mismatch for %.% (supplied %, registered %)',p_schema,p_table,p_variant,v_registry_variant using errcode='42501';
    end if;
  end if;

  -- DOORS-ONLY-4. Read once, used at every emit site below.
  v_doors_only := platform.schema_is_doors_only(p_schema);
  -- 🚨 A TABLE WHOSE DOORS ARE NOT BUILT YET KEEPS ITS CLIENT WRITE LANES, AND SAYS SO.
  -- Declaring a schema doors-only closes every table in it at once, which on 2026-09-21
  -- closed platform.saved_view and platform.rulebook -- twenty-one write call sites across
  -- two repos, none of them moved to a door -- and saving a view answered 42501 for eleven
  -- minutes. A row in platform.doors_only_pending_cutover carries the reason and the owning
  -- lane; it can only KEEP what this table already generated, never open a closed one.
  if v_doors_only and platform.doors_only_cutover_pending(p_schema, p_table) then
    v_doors_only := false;
    raise notice
      'apply_rls: %.% is in a DOORS-ONLY schema but its doors are NOT BUILT YET, so its client write lanes were generated as before. Reason on file: %. Owner: %. The remedy is to build the door and move every caller in the same commit, then delete the platform.doors_only_pending_cutover row -- re-granting by hand would last until the next regeneration.',
      p_schema, p_table,
      (select d.reason from platform.doors_only_pending_cutover d where d.schema_name = p_schema and d.table_name = p_table),
      (select d.owner_lane from platform.doors_only_pending_cutover d where d.schema_name = p_schema and d.table_name = p_table);
  end if;
  v_no_client_writes := v_client_read_only or v_doors_only;

  if v_suppress_admin then
    v_admin := '';
    v_su_sel := '';
    v_su_ins := '';
    v_sysorg_ins := '';
  end if;

  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='user_id') into v_has_user;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='created_by') into v_has_created;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='organization_id') into v_has_org;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='deleted_at') into v_has_del;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='visibility') into v_has_vis;
  v_delpfx := case when v_has_del then 'deleted_at is null and ' else '' end;

  -- DD-165. The wall is keyed on the TYPED column only. A free-text `visibility` would make
  -- `visibility >= 'internal'` a TEXT comparison, and 'personal' > 'internal' alphabetically —
  -- the wall would silently admit exactly the rows it exists to exclude. iam.verify_canonical
  -- already FAILs a free-text visibility ('free-text kill'); this refuses to build a wall on one.
  -- `visibility` is NOT NULL on every table in the live cast but the predicate is written so an
  -- unset value denies rather than admits: `NULL >= 'internal'` is NULL, and a USING clause
  -- treats NULL as deny. Undeclared is the private end, the same direction chair R3 takes.
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='visibility'
      and udt_schema='platform' and udt_name='visibility') into v_vis_enum;
  v_admin_read := v_admin;
  v_su_sel_read := v_su_sel;
  -- ACCESS LADDER T-13 2.3b (2026-09-28): a child's stray `visibility` column is not a wall
  -- either; its staff prefix is the plain one (platform_admin_read reads every row anyway).
  if v_vis_enum and not (v_is_component or p_variant = 'component') then
    if v_admin <> '' then
      v_admin_read := '((visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())) or ';
    end if;
    if v_su_sel <> '' then
      v_su_sel_read := ' or (visibility >= ''internal''::platform.visibility and (select public.is_super_admin()))';
    end if;
  end if;

  execute format('alter table %s enable row level security', v_tbl);
  -- 🚨 DD-147 (2026-09-12) — THIS GENERATOR DROPS ONLY WHAT IT AUTHORED.
  -- The loop that used to live here read `for pol in select polname from pg_policy where polrelid
  -- = v_tbl::regclass loop drop policy ...` — EVERY policy, with no idea which of them it had
  -- written. In the B-30 rehearsal that removed the signed-out invitation-request lanes on
  -- `iam.invitations` / `iam.access_requests`, and two migrations restored them by hand. A
  -- generator that deletes work it did not do is not a generator, it is a hazard sitting behind
  -- an `apply` verb.
  -- `iam.generated_policy_names()` is the catalog of the names emitted below, and nothing else is
  -- touched. A bespoke policy is KEPT and NAMED out loud — never dropped, never silent. To remove
  -- one, say so on purpose: `iam.supersede_bespoke_policies(schema, table, names, reason)`.
  v_authored := iam.generated_policy_names();
  v_kept := '{}'::text[];
  for pol in select polname from pg_policy where polrelid = v_tbl::regclass order by polname loop
    if pol.polname = any (v_authored) then
      v_drop := v_drop || format('drop policy %I on %s', pol.polname, v_tbl);
    else
      v_kept := array_append(v_kept, pol.polname);
    end if;
  end loop;
  -- ADMIN-ACCESS (Arman 2026-09-24; access-belongs-to-the-person.md §7 item 3): the platform-admin
  -- READ lane is part of what this generator produces for EVERY table, every variant, and it
  -- ignores suppress_platform_admin_lane on purpose — that flag keeps governing the staff WRITE
  -- lanes, the std_* staff arm and the super-admin arms, never this read. It is in
  -- iam.generated_policy_names(), so the loop above dropped any previous copy.
  v_pol := v_pol || format(
    'create policy platform_admin_read on %s for select to authenticated using ((select public.is_platform_admin()))',
    v_tbl);
  -- The do-not-remove comment travels with the policy (common-docs/policies/our-own-admin-database-access.md).
  v_pol := v_pol || format('comment on policy platform_admin_read on %s is %L', v_tbl,
    'OUR OWN ADMIN DATABASE ACCESS - NEVER REMOVE, NARROW OR SUPERSEDE. This is how Arman and platform admins read every row through the admin system (aidream dashboard, admin.app.matrxserver.com, the Supabase-style table browser). Law: common-docs/policies/our-own-admin-database-access.md (Arman, 2026-09-24).');
  if cardinality(v_kept) > 0 then
    raise notice
      'apply_rls: %.% (token %) — % BESPOKE POLICY/POLICIES KEPT because this generator did not author them: %. They are live doors beside the generated set, and iam.verify_canonical reports them as bespoke_policy_present on every run. To remove one, name it: iam.supersede_bespoke_policies(''%'', ''%'', ARRAY[...], <reason>).',
      p_schema, p_table, p_token, cardinality(v_kept), array_to_string(v_kept, ', '), p_schema, p_table;
  end if;
  -- Marked relations preserve bespoke reads, but no bespoke write policy may apply to a client role.
  if v_client_read_only and exists (
    select 1
    from pg_policy p cross join lateral unnest(p.polroles) as role_oid
    where p.polrelid=v_tbl::regclass
      and p.polname = any(v_kept)
      and p.polcmd in ('*','a','w','d')
      and (role_oid=0 or pg_has_role('anon', role_oid, 'USAGE') or pg_has_role('authenticated', role_oid, 'USAGE'))
  ) then
    raise exception 'apply_rls: readonly %.% has an applicable bespoke mutation policy',p_schema,p_table using errcode='42501';
  end if;
  v_pol := v_pol || format(
    'create policy svc_all on %s for all to service_role using (true) with check (true)', v_tbl);
  -- Server-only restricted records stop before every client/staff policy.
  if p_variant = 'restricted' and not v_has_vis then
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= PERSONAL =======================
  -- A personal row's OWNER is the complete access boundary, and the owner column is created_by.
  -- 🚨 PERSONAL-OWNER (2026-09-25, Arman 2026-09-23: "user_id was retired in favour of
  -- created_by"). This branch used to key every policy on user_id and refuse a table without one,
  -- while the kernel (platform.entity_row_access_attrs) and the set lane (iam.accessible_entity_ids)
  -- read the owner from created_by — so on every personal table the RLS lane said yes and
  -- iam.has_access said no (admin@admin.com on its own 19 tool.mcp_user_conn rows), and the one
  -- sanctioned builder, platform.create_entity_table(p_variant => 'personal'), which only emits
  -- created_by, could not build a personal table at all. The TABLE is brought to the canonical
  -- shape (created_by) through the Entities system; the machinery is never adapted to a table.
  -- Referenced organizations and platform-admin status do not widen it.
  -- Guard: aidream tests/test_personal_variant_owner_is_created_by.py.
  if p_variant = 'personal' then
    if not v_has_created then
      raise exception using errcode = '42703',
        message = format('apply_rls: personal variant on %s.%s requires created_by, the owner column. user_id was retired in favour of created_by (2026-09-23): bring the table to the canonical shape through the Entities system (add created_by, backfill it from the owner, repoint every reader and writer), never by keying the generator on a legacy column.', p_schema, p_table);
    end if;
    if v_has_user then
      -- A table part-way through that move still carries user_id. Generating on created_by is only
      -- behaviour-preserving when the two name the SAME owner on every row; if they disagree
      -- anywhere, regenerating would silently move those rows' access boundary.
      execute format('select count(*) from %I.%I where created_by is distinct from user_id', p_schema, p_table)
        into v_owner_disagree;
      if v_owner_disagree > 0 then
        raise exception using errcode = '22023',
          message = format('apply_rls: %s.%s carries both user_id and created_by, and they disagree on %s row(s). Generating the personal policies on created_by would silently move the access boundary of those rows. Decide which column names the owner (for some tables user_id is the grantee, the billed person or the audited subject, not the creator), reconcile the rows, drop user_id, then re-run. Nothing was generated.', p_schema, p_table, v_owner_disagree);
      end if;
      raise notice 'apply_rls: %.% still carries the retired owner column user_id (it agrees with created_by on every row); the policies key on created_by — drop user_id once its readers are repointed.', p_schema, p_table;
    end if;
    -- 🚨 SHARING SITS OUTSIDE THE LADDER (access ladder T-9, 2026-09-26;
    -- common-docs/policies/access-ladder.md): any record at any level can be shared by its owner
    -- DIRECTLY with a person. Until this edit the personal lanes were owner-only, so a grant the
    -- owner made in iam.permissions reached nobody. The owner-grant arm is the entity variant's
    -- direct-grant arm and NOTHING ELSE: a grant to a PERSON (granted_to_user_id; a share never
    -- names an organization — iam._a_share_names_a_person), active and unexpired, at the level the
    -- command needs (viewer to read, editor to update, admin to delete). No organization lane, no
    -- platform-staff lane, no containment/reachability/scope lane is emitted here. A table with no
    -- `id` column has no row a grant can name, so it keeps the owner-only lanes.
    select exists (select 1 from information_schema.columns
      where table_schema=p_schema and table_name=p_table and column_name='id' and data_type='uuid')
      into v_personal_has_id;
    if v_personal_has_id then
      v_personal_grant := format(
        ' or id in (select p.resource_id from iam.permissions p where p.resource_type = %L'
        || ' and p.granted_to_user_id = (select auth.uid()) and p.status = ''active'''
        || ' and (p.expires_at is null or p.expires_at > now())'
        || ' and p.permission_level >= %%L::public.permission_level)', p_token);
    end if;
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s(created_by = (select auth.uid())%s))',
      v_tbl, v_delpfx, format(v_personal_grant, 'viewer'));
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (created_by = (select auth.uid())%s) with check (created_by = (select auth.uid())%s)',
      v_tbl, format(v_personal_grant, 'editor'), format(v_personal_grant, 'editor'));
    end if;
    if not v_no_client_writes and not v_del_refused then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid())%s)',
      v_tbl, format(v_personal_grant, 'admin'));
    end if;
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= REFERENCE =======================
  -- A global CATALOGUE. Rows that belong to no organization and no person, that every signed-in
  -- member reads and that only a DOOR writes. There is nothing to filter a read on -- that is the
  -- definition of the class, not a shortcut -- so this lane is the one place in the platform where
  -- `using (true)` is the CORRECT generated predicate, and it is generated rather than hand-written
  -- precisely so iam.verify_canonical can certify it (db-rules §6d: never hand-write policies).
  if p_variant = 'reference' then
    -- THE THREE REFUSALS. A column the reference read lane never reads is a SECOND, COMPETING
    -- ACCESS AUTHORITY -- the exact shape THE COMPONENT OWNERSHIP LAW (§6d-1) was written about,
    -- one variant over. The generator refuses rather than ignoring them, because ignoring is how a
    -- table ends up with a tenancy column that nothing enforces.
    if v_has_org then
      raise exception
        'apply_rls: reference variant on %.% carries organization_id -- a reference catalogue belongs to NO organization, and its read lane never looks at the column, so the column and the policy would disagree about who may read a row. If these rows really belong to an organization this is not reference data: register it as entity (or system, with a visibility column).',
        p_schema, p_table using errcode = '22023';
    end if;
    if v_has_user then
      raise exception
        'apply_rls: reference variant on %.% carries user_id -- a reference catalogue belongs to NO person. A table whose rows have an owner is `personal` (the owner is the whole boundary) or `entity`, never `reference`.',
        p_schema, p_table using errcode = '22023';
    end if;
    if v_has_created then
      raise exception
        'apply_rls: reference variant on %.% carries created_by -- on the entity family that column IS the access key (§6d-1), and this lane never reads it. Leaving it here means two authorities disagree about who may read a row. Drop the column, rename it to a real domain-authorship column, or register the table as `entity`.',
        p_schema, p_table using errcode = '22023';
    end if;
    -- THE ONE READ LANE, AND ITS NAME SAYS WHAT IT IS.
    v_pol := v_pol || format(
      'create policy ref_all_members_read on %s for select to authenticated using (true)', v_tbl);
    -- THE ANON LANE IS THE CLASS'S, NOT THE VARIANT'S (DD-249). `public` is the one class whose
    -- lane set includes anon. On any other class the key is WITHDRAWN here, so clearing the class
    -- and re-running removes the lane completely -- the symmetry the component anon lane has.
    v_pub_lanes := iam.class_lanes(p_token);
    if v_pub_lanes.anon_lane then
      -- The policy is the access RULE; the grant is the access. A schema declared CLOSED in
      -- `platform.schema_client_exposure` gets the rule and never the key.
      if platform.schema_is_client_exposed(p_schema) then
        v_pol := v_pol || format('create policy pub_read on %s for select to anon using (true)', v_tbl);
        execute format('grant select on %s to anon', v_tbl);
      else
        execute format('revoke all on %s from anon', v_tbl);
        raise notice
          'apply_rls: %.% is data_class=public but schema % is declared CLOSED to client roles in platform.schema_client_exposure -- no pub_read policy and no anon grant were issued, so the anonymous lane is inert until the schema is opened.',
          p_schema, p_table, p_schema;
      end if;
    else
      execute format('revoke select on %s from anon', v_tbl);
    end if;
    -- READ-ONLY CLIENT GRANT: iam.apply_table_grants gives this variant the `v_client_read_only`
    -- path, so there is no INSERT/UPDATE/DELETE privilege behind any policy anybody could write.
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- Nothing to govern: no owner, no organization, no visibility, and no client write lane at all.
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= DETAIL (polymorphic parent) =======================
  -- 🚨 RC-A2 (2026-09-23, rich-content STORE-DESIGN §3.8 / P2) — A DETAIL'S ACCESS IS ITS
  -- PARENT'S, AND ITS PARENT IS NAMED BY THE ROW ITSELF: `(entity_type, entity_id)`.
  -- `platform.comments` was generated as an `entity`, so a comment was read by its OWN
  -- `visibility` plus organization membership, never by access to the record it sits on.
  -- Measured live 2026-09-23 (scripts/campaign-tests/rca2_comments_follow_the_parent.sql): a
  -- plain member of an organization read, added to and soft-deleted the comments on another
  -- member's PERSONAL note, task and CRM party. A comment quotes what it is about, so a private
  -- record leaked through its comments. Arman's rule: access follows the thing.
  --
  -- This is the `component` law with a polymorphic parent: a component names its parent with a
  -- typed foreign key registered in platform.entity_relationships, a detail names it with a
  -- (token, id) pair, so the lane asks the kernel about that pair directly.
  --   read   — viewer on the parent.
  --   insert — the author is the caller AND commenter on the parent (the rung that exists for
  --            adding to a thing without editing it).
  --   update — the author, still holding commenter on the parent.
  --   delete — the author, or admin on the parent.
  -- NO platform-staff lane and NO organization lane: this branch returns before either is
  -- emitted. Staff and org admins reach a detail exactly as far as iam.has_access lets them
  -- reach its parent — which is DD-136/DD-165's wall, inherited instead of re-implemented.
  -- A `visibility` column on a detail is never read here (a Detail carries no visibility,
  -- Doctrine §1.1); iam.verify_canonical WARNs it as a stray second authority to remove.
  --
  -- COST (D146). The read is one iam.has_access per candidate row. Every client read of a
  -- detail today goes through a door that has already filtered to ONE parent (public.cmt_list
  -- asks once per call), so a direct table read pays it only across the rows it asked for. A
  -- set-wise form needs a per-token id set, which a polymorphic parent cannot name in advance.
  -- 🚨 1294 (2026-09-26) — A MAPPED DETAIL READS SET-WISE. A detail whose declaration names a
  -- preferred typed pointer (platform.detail_parent_columns positions 4-5; rag.kg_chunks) is read
  -- through the kernel's SET forms instead of one walk per row: the preferred arm asks
  -- iam.accessible_entity_ids(<preferred type>) exactly as a component asks its parent, and the
  -- polymorphic arm asks platform.detail_readable_parents(<token>) — one kernel walk per distinct
  -- (type value, id value). Both are the kernel's answer, so the policy and iam.has_access(<token>, id)
  -- agree row for row. RC-A1: a trashed row stays readable to its author only. Client writes are
  -- refused outright (client_read_only): the rows are written by the server.
  if p_variant = 'detail' and (platform.detail_parent_columns(p_token))[4] is not null then
    declare
      v_dc   text[] := platform.detail_parent_columns(p_token);
      v_arms text[] := array[]::text[];
      v_read text;
    begin
      if not v_no_client_writes then
        raise exception
          'apply_rls: %.% is a mapped detail (platform.detail_parent_columns declares a preferred pointer) and is read-only to clients — set platform.entity_types.client_read_only for token % first; its rows are written by the server.',
          p_schema, p_table, p_token using errcode = '22023';
      end if;
      if not v_has_created then
        raise exception
          'apply_rls: detail variant on %.% requires created_by — the author, who alone reads a trashed row',
          p_schema, p_table using errcode = '22023';
      end if;
      v_arms := v_arms || format(
        '(%1$I is not null and %1$I in (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
        v_dc[4], v_dc[5]);
      if v_dc[2] is not null then
        v_arms := v_arms || case
          when v_dc[1] is null then format(
            '(%1$I is null and %2$I::text in (select p.id_value from platform.detail_readable_parents(%3$L) p))',
            v_dc[4], v_dc[2], p_token)
          else format(
            '(%1$I is null and (%2$I::text, %3$I::text) in (select p.type_value, p.id_value from platform.detail_readable_parents(%4$L) p))',
            v_dc[4], v_dc[1], v_dc[2], p_token)
        end;
      end if;
      v_read := '(' || array_to_string(v_arms, ' or ') || ')';
      if exists (select 1 from information_schema.columns
                  where table_schema = p_schema and table_name = p_table and column_name = 'deleted_at') then
        v_read := v_read || ' and not (deleted_at is not null and created_by is distinct from (select auth.uid()))';
      end if;
      v_pol := v_pol || format('create policy std_select on %s for select to authenticated using (%s)', v_tbl, v_read);
      perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: declare the plan before any policy DDL
      perform iam.apply_table_grants(p_schema, p_table, p_variant);
      perform iam.apply_governance_guard(p_schema, p_table, p_token);
      perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
      return;
    end;
  end if;
  if p_variant = 'detail' then
    if not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table
                      and column_name='entity_type' and data_type='text')
       or not exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table
                      and column_name='entity_id' and data_type='uuid') then
      raise exception
        'apply_rls: detail variant on %.% requires entity_type text and entity_id uuid — the (token, id) of the record each row belongs to. A row that cannot name its parent cannot inherit its parent''s access.',
        p_schema, p_table using errcode = '22023';
    end if;
    if not v_has_created then
      raise exception
        'apply_rls: detail variant on %.% requires created_by — the author, who alone may edit a row',
        p_schema, p_table using errcode = '22023';
    end if;
    v_pol := v_pol || format(
      case when exists (select 1 from information_schema.columns
                    where table_schema=p_schema and table_name=p_table and column_name='deleted_at')
      -- 🚨 RC-A2b (2026-09-25): a soft-deleted detail is read by its author only. The realtime
      -- feed is authorized by this same policy, so it stops carrying deleted text too
      -- (verify-RC-A2 F4). platform_admin_read, emitted above for every table, still reads it.
      then 'create policy std_select on %s for select to authenticated using (platform.detail_parent_access(entity_type, entity_id, ''viewer''::public.permission_level) and not (deleted_at is not null and created_by is distinct from (select auth.uid())))'
      else 'create policy std_select on %s for select to authenticated using (platform.detail_parent_access(entity_type, entity_id, ''viewer''::public.permission_level))' end,
      v_tbl);
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()) and platform.detail_parent_access(entity_type, entity_id, ''commenter''::public.permission_level))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (created_by = (select auth.uid()) and platform.detail_parent_access(entity_type, entity_id, ''commenter''::public.permission_level)) with check (created_by = (select auth.uid()) and platform.detail_parent_access(entity_type, entity_id, ''commenter''::public.permission_level))',
      v_tbl);
    end if;
    if not v_no_client_writes and not v_del_refused then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()) or platform.detail_parent_access(entity_type, entity_id, ''admin''::public.permission_level))',
      v_tbl);
    end if;
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- created_by is the author and the edit key, so the governance tier stays: an UPDATE may not
    -- transfer authorship or re-home a row.
    perform iam.apply_governance_guard(p_schema, p_table, p_token);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- Covers the commands a variant emits no policy for at all. Permissive, so it
  -- can only ever ADD rows, and only for the accounts is_platform_admin() knows.
  -- THE PRIVACY WALL: a token that declares suppress_platform_admin_lane does
  -- not get this policy at all. Dropping it AFTER apply_rls was the rejected
  -- alternative (SPEC-ACCESS §3.5) — it breaks iam.verify_canonical and the next
  -- regeneration silently puts it back.
  if not v_suppress_admin then
    -- DD-165: the USING half is the READ/act boundary (SELECT, and the old row of UPDATE and
    -- DELETE), so it carries the wall. The WITH CHECK half is unchanged: this is not a rule about
    -- what an admin may write. `svc_all` is a separate policy, so every server-side job that runs
    -- as `service_role` is untouched by this.
    -- DOORS-ONLY-4 -- THE FOR SELECT TWIN, AND WHY IT IS A BRANCH AND NOT A REMOVAL.
    -- platform_admin_all is FOR ALL, which means it is the platform-staff READ policy as
    -- well as the write one. Removing it to clear the residual write surface would take
    -- staff reads away on seventy-five tables (the warning DOORS-ONLY-2 left in capitals).
    -- So in a doors-only schema the SAME predicate is emitted FOR SELECT under a name that
    -- says so, and the write half simply never exists: staff write through the same doors
    -- everybody else does.
    -- The outer gate stays v_client_read_only, NOT v_no_client_writes: a MARKED relation
    -- gets no platform-staff policy at all today, and handing it one here would widen reads
    -- on a table nobody asked this lane about.
    if not v_client_read_only then
      if not v_doors_only then
        v_pol := v_pol || format(
          'create policy platform_admin_all on %s for all to authenticated '
          || 'using (%s) with check ((select public.is_platform_admin()))',
          v_tbl,
          case when v_vis_enum
               then '(visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())'
               else '(select public.is_platform_admin())' end);
      end if;
      -- ONE ADMIN READ (Arman 2026-09-27): the doors-only FOR SELECT twin platform_admin_select is
      -- retired. platform_admin_read, emitted for every table, is the one admin read. The old name
      -- stays in iam.generated_policy_names() only so a regeneration drops stale copies.
    end if;
  end if;

  if p_variant = 'ledger' then
    -- SET-WISE ORG LANE (D146). `organization_id in (select iam.my_orgs())` is
    -- the identical predicate to `iam.has_org_access(organization_id)` (both
    -- read iam.organization_member for auth.uid()), but it is uncorrelated, so
    -- it is evaluated ONCE per query instead of once per candidate row. A
    -- ledger is by definition the biggest table in its feature — this is the
    -- variant where the per-row definer call is guaranteed to bite.
    -- THE GLOBAL-READABLE SYSTEM-ORG LANE (db-rules §6e, added 2026-08-21).
    -- Global content is owned by a `global_readable` system org and is readable
    -- by every authenticated user. The `entity` family implements that through
    -- iam.has_access; the ledger lane did not, so the SAME row was readable on
    -- an entity table and invisible on a ledger table. `iam.organizations`
    -- 39c38960-… (Matrx System) has ZERO members, so before this every
    -- system-org ledger row was unreadable by literally everyone —
    -- including the user who created it. Found on batch.work_item: 18 of 20
    -- rows, 16 of them created by the user who could not see them.
    -- Set-wise on purpose: both arms are uncorrelated subqueries, so each is
    -- one hashed SubPlan per query, never a per-row call (D146).
    -- 🚨 DD-174 (2026-09-12) — THE LEDGER'S LANES ARE ITS CLASS'S LANES.
    -- Until this edit the two paragraphs above were unconditional: EVERY ledger got an
    -- organization-member lane and the global-readable system-org lane, whatever its class said.
    -- `iam.class_lanes` and this variant therefore disagreed on 27 live tokens, and the variant won
    -- in silence. Measured on this database, 2026-09-12, in rolled-back rehearsals:
    --   billing.usage_ledger   class `private`  — an org admin would have read 1,520 rows of OTHER
    --                          people's spend, a non-member 313. `private` has no org lane at all.
    --   platform.knob_override_audit  class `confidential` — 27 of its 88 rows belong to a
    --                          global_readable system org, so the system-org arm handed a
    --                          CONFIDENTIAL audit to every signed-in account, non-members included
    --                          (measured: three principals 0 -> 27, a non-member 17 -> 44).
    -- So: the organization lane is emitted only when the class grants one, and the system-org arm
    -- only for the two classes whose lane set is wider than one organization (`organization` and
    -- `public`). For every `organization`-class ledger — all 12 of them — the emitted bytes are
    -- IDENTICAL to what this function emitted before, which the forcing test asserts character for
    -- character rather than trusting the reading.
    v_ledger_lanes := iam.class_lanes(p_token);
    if not v_ledger_lanes.org_member_lane then
      raise exception
        'apply_rls: %.% (token %) resolves to class %, whose lane set has NO organization-member lane — and the ledger variant emits an organization read lane and nothing else. Generating it here would hand every member of a row''s organization a table whose class says only its owner may read it (measured on billing.usage_ledger: an organization admin 0 -> 1,520 rows of other people''s spend). Nothing was generated. If the table carries user_id, its variant is `personal` — a personal row''s user_id is the complete access boundary; otherwise correct data_class on platform.entity_types with a stored reason.',
        p_schema, p_table, p_token, v_ledger_lanes.resolved_class;
    end if;
    v_sysorg_read := case
      when v_ledger_lanes.resolved_class in ('organization','public')
        then ' or organization_id in (select organization_id from iam.system_orgs where global_readable)'
      else '' end;
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s('
      || 'organization_id is not null and ('
      || 'organization_id in (select iam.my_orgs())%s)))',
      v_tbl, v_admin_read, v_sysorg_read);
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= COMPONENT =======================
  -- Access IS the parent's. No created_by clause is emitted here, ever.
  if v_is_component or p_variant = 'component' then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_token and er.kind = 'composition'
      order by er.parent_type, er.fk_column
    loop
      v_parent_count := v_parent_count + 1;
      v_parent_expr_edit := v_parent_expr_edit
        || case when v_parent_expr_edit = '' then '' else ' or ' end
        || format('%I in (select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))',
                  rec.fk_column, rec.parent_type);
      v_parent_expr_view := v_parent_expr_view
        || case when v_parent_expr_view = '' then '' else ' or ' end
        || format('%I in (select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level)))',
                  rec.fk_column, rec.parent_type);
    end loop;

    if v_parent_count = 0 then
      raise exception
        'apply_rls: component % has no composition parent in platform.entity_relationships', p_token;
    end if;

    -- Reads resolve the SMALL parent id sets, then the caller's row predicate
    -- uses the child's indexed foreign keys. Never resolve the CHILD token as a
    -- set — that materializes every accessible child id (D183).
    -- D254: the trailing arm was an UNBOUNDED per-row iam.has_access — the same
    -- D146 shape D249 removed from `entity`, and the reason a user could not read
    -- the version history of their own files (files.file_versions, 50,423 rows,
    -- ~7ms/row = ~350s). It now comes from the SAME builder the entity lane uses:
    -- iam.entity_read_expr already reads this token's parents out of
    -- entity_relationships, gates its org/visibility arms on those columns
    -- existing, and bounds the definer call by the id-producing lanes. A second
    -- component-shaped copy of that logic is how the two would drift.
    if v_v2 then
      -- READ-LANE V2 (P2): a lane admin skips std_select; platform_admin_read admits every row.
      v_pol := v_pol || format(
        'create policy std_select on %s for select to authenticated using (%s(%s(%s)))',
        v_tbl, iam.read_lane_v2_guard(), v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token, 'component'));
    else
      v_pol := v_pol || format(
        'create policy std_select on %s for select to authenticated using (%s(%s))',
        v_tbl, v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token, 'component'));
    end if;

    -- THE PUBLIC-PARENT ANON LANE (0580). Emitted only for a flagged token.
    -- The policy admits a row when a composition parent is public and live;
    -- the arm's parent subquery ALSO passes through the parent's own RLS for
    -- the anon role (pub_read: public + not deleted), so the two agree by
    -- construction. Per the soft-delete doctrine, the anon lane — and only the
    -- anon lane — filters the child's own deleted_at (v_delpfx).
    if v_anon_component then
      if v_excluded is not null and cardinality(v_excluded) > 0 then
        raise exception
          'apply_rls: % declares component_anon_read_via_public_parent AND client_excluded_columns — a table-level anon grant would expose to anon what is withheld from authenticated. Resolve the contradiction first.',
          p_token;
      end if;
      v_anon_expr := '';
      for rec in
        select er.fk_column, et.schema_name as pschema, et.table_name as ptable
        from platform.entity_relationships er
        join platform.entity_types et on et.token = er.parent_type
        where er.child_type = p_token and er.kind = 'composition'
        order by er.parent_type, er.fk_column
      loop
        if exists (select 1 from information_schema.columns
                    where table_schema = rec.pschema and table_name = rec.ptable
                      and column_name = 'visibility') then
          -- A policy subquery runs with the QUERYING role's privileges: if anon
          -- cannot SELECT the parent, every anon query on the child errors with
          -- 42501 instead of filtering. Refuse the misconfiguration loudly.
          -- READ-LANE V2 (2026-09-27): the anon arm reads the parent's id, visibility and (when present)
          -- deleted_at, and nothing else. A parent that grants anon exactly those COLUMNS (a column-level
          -- design, e.g. content_ir.kind_definition) serves the arm as well as a table-level grant does;
          -- refusing it was a false refusal that kept four content_ir components from regenerating.
          if not (has_table_privilege('anon', format('%I.%I', rec.pschema, rec.ptable)::regclass, 'SELECT')
                  or (has_column_privilege('anon', format('%I.%I', rec.pschema, rec.ptable)::regclass, 'id', 'SELECT')
                      and has_column_privilege('anon', format('%I.%I', rec.pschema, rec.ptable)::regclass, 'visibility', 'SELECT')
                      and (not exists (select 1 from information_schema.columns
                                        where table_schema = rec.pschema and table_name = rec.ptable
                                          and column_name = 'deleted_at')
                           or has_column_privilege('anon', format('%I.%I', rec.pschema, rec.ptable)::regclass, 'deleted_at', 'SELECT')))) then
            raise exception
              'apply_rls: % declares component_anon_read_via_public_parent but parent %.% has no anon SELECT grant — the policy subquery would 42501 for every anon query. Apply the parent''s canonical RLS (its pub_read lane grants anon) first.',
              p_token, rec.pschema, rec.ptable;
          end if;
          select exists (select 1 from information_schema.columns
                          where table_schema = rec.pschema and table_name = rec.ptable
                            and column_name = 'deleted_at') into v_pdel;
          v_anon_expr := v_anon_expr
            || case when v_anon_expr = '' then '' else ' or ' end
            || format('(%1$I is not null and %1$I in (select p.id from %2$I.%3$I p where %4$sp.visibility = ''public''))',
                      rec.fk_column, rec.pschema, rec.ptable,
                      case when v_pdel then 'p.deleted_at is null and ' else '' end);
        end if;
      end loop;
      if v_anon_expr = '' then
        raise exception
          'apply_rls: % declares component_anon_read_via_public_parent but no composition parent carries a visibility column — nothing can be public here; clear the flag',
          p_token;
      end if;
      v_pol := v_pol || format('create policy pub_read on %s for select to anon using (%s(%s))',
        v_tbl, v_delpfx, v_anon_expr);
      -- The policy is the access RULE; the grant is the access. A schema declared CLOSED in
      -- `platform.schema_client_exposure` gets the rule and never the grant — this is the one
      -- client-role grant in the RLS generator that does not go through
      -- `iam.apply_table_grants`, so it carries the same check rather than inheriting one.
      if platform.schema_is_client_exposed(p_schema) then
        execute format('grant select on %s to anon', v_tbl);
      else
        execute format('revoke all on %s from anon', v_tbl);
        raise notice
          'apply_rls: %.% declares component_anon_read_via_public_parent and its pub_read policy was created, but schema % is declared CLOSED in platform.schema_client_exposure — the anon SELECT grant was NOT issued, so the lane is inert until the schema is opened.',
          p_schema, p_table, p_schema;
      end if;
    else
      -- Symmetry: clearing the flag and re-running apply_rls removes the lane
      -- completely (the policy died in the drop loop above; the grant dies here).
      execute format('revoke select on %s from anon', v_tbl);
    end if;

    -- A new row cannot have a direct grant yet, so INSERT must be authorized
    -- through a structural parent. No orphan/created_by lane: a component with
    -- no parent is not a component.
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (%s(%s))',
      v_tbl, v_admin, v_parent_expr_edit);
    end if;

    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (%s(%s) or iam.has_access(%L, id, ''editor'')) '
      || 'with check (%s(%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_admin_read, v_parent_expr_edit, p_token, v_admin, v_parent_expr_edit, p_token);
    end if;

    if not v_no_client_writes and not v_del_refused then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (%s(%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_admin_read, v_parent_expr_edit, p_token);
    end if;

    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, 'component');
    -- A component has no owner column and no visibility of its own: its access
    -- IS its parent's (THE COMPONENT OWNERSHIP LAW). There is nothing to govern
    -- here, so the governance-column tier deliberately does not apply.
    -- READ-LANE V2 LOCK ORDER: every relation the regenerated policies read is locked (ACCESS SHARE)
    -- HERE — before drop_governance_guard, whose trigger DDL is what first takes the 23-relation
    -- auth/storage/realtime lock (measured on the clone 2026-09-26), and before the policy statements —
    -- so a wait on a busy relation never happens inside the sign-in freeze.
    if v_v2 then perform iam.read_lane_v2_lock_policy_reads(p_schema, p_table, p_token); end if;
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  -- ======================= ENTITY FAMILY =======================
  -- Here `created_by` IS the owner, and that is exactly why it is an access key.
  if not v_has_created then
    raise exception
      'apply_rls: standard entity %.% lacks created_by — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;
  if not v_has_org then
    raise exception
      'apply_rls: standard entity %.% lacks organization_id — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;
  -- 🚨 ACCESS LADDER T-21 (2026-09-28): AN ENTITY'S id IS A uuid, OR NOTHING IS GENERATED. Every read lane
  -- below compares `id` with uuid sets (iam.accessible_entity_ids, iam.permissions.resource_id,
  -- iam.memberships.container_id, platform.reachability, platform.associations_live, platform.entity_grants)
  -- and hands it to iam.has_access(token, uuid). A text id (extend.wbx_guidance) made this generator die in the
  -- middle of the emit with 42883 `operator does not exist: text = uuid`, and a table with no id at all
  -- (users.user_preferences) died with 42703 `column "id" does not exist` — neither naming the table or the
  -- remedy. Both are refused here, up front, in words.
  if not exists (select 1 from pg_attribute a where a.attrelid = v_tbl::regclass and a.attname = 'id' and not a.attisdropped) then
    raise exception using errcode = '42703',
      message = format('apply_rls: standard entity %s.%s has no id column. Its read lanes and iam.has_access name a row by a uuid id, so nothing was generated.', p_schema, p_table),
      hint = 'Base-retrofit it (platform.retrofit_entity adds id uuid not null default gen_random_uuid() with a unique index; the natural key stays the primary key), then re-run.';
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid = v_tbl::regclass and a.attname = 'id' and not a.attisdropped and a.atttypid <> 'uuid'::regtype) then
    raise exception using errcode = '42804',
      message = format('apply_rls: standard entity %s.%s has an id of type %s, not uuid. Its read lanes compare id with uuid sets and hand it to iam.has_access(token, uuid), so nothing was generated.',
                       p_schema, p_table, (select format_type(a.atttypid, a.atttypmod) from pg_attribute a where a.attrelid = v_tbl::regclass and a.attname = 'id' and not a.attisdropped)),
      hint = 'Convert id to uuid in its own migration (and the writers that mint it), then re-run. A catalogue that belongs to no organization and no person is registered as the reference variant instead, which reads no id.';
  end if;

  if p_variant = 'restricted' then
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s%s(created_by = (select auth.uid())%s))',
      v_tbl, v_admin_read, v_delpfx, v_su_sel_read);
      -- 🚨 DD-249 (2026-09-15) — THE ANON LANE IS THE CLASS'S, NOT THE VARIANT'S.
      -- Until this edit `pub_read` was emitted on the presence of a `visibility` COLUMN and
      -- nothing else, so the variant granted an anonymous read lane that `iam.class_lanes`
      -- never issued. Exactly the DD-174 shape, one variant over: the generator out-voted the
      -- class in silence, and `iam.verify_canonical` has been WARNing `class_lanes_match_policy`
      -- on 233 live tokens ever since. Measured on this database, 2026-09-15: of those 233,
      -- 223 had NO anon privilege of any kind (`iam.apply_table_grants` never grants anon on
      -- the entity/restricted path) — a door with no key, which is worse than no door because
      -- it reads as an anonymous lane to everyone auditing the table. The other 10 carried
      -- hand-written anon column grants and the lane was LIVE: 5 of them held public rows
      -- (app.definition 81, platform.categories 355, education.learn_doc 11,
      -- agent.message_template 8, workbench.notes 2) on a class that says no stranger may read.
      -- So the lane is now asked of the class, once, in the one place that decides it.
    if v_has_vis then
      v_pub_lanes := iam.class_lanes(p_token);
      if v_pub_lanes.anon_lane then
        v_pol := v_pol || format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
          v_tbl, v_delpfx);
      end if;
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (%s(created_by = (select auth.uid()) and (%sorganization_id is null or iam.has_org_access(organization_id))))',
      v_tbl, v_admin, v_su_ins);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (%s created_by = (select auth.uid())%s) with check (%s created_by = (select auth.uid())%s)',
      v_tbl, v_admin_read, v_su_sel_read, v_admin, v_su_sel);
    end if;
    if not v_no_client_writes and not v_del_refused then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (%s created_by = (select auth.uid())%s)',
      v_tbl, v_admin_read, v_su_sel_read);
    end if;
    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- `restricted` is already owner-or-super-admin on UPDATE — the whole row is
    -- governed, so a per-column tier would be redundant.
    perform iam.drop_governance_guard(p_schema, p_table);
    perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
    return;
  end if;

  if p_variant = 'system' and not v_has_vis then
    raise exception 'apply_rls: system variant on %.% requires a visibility column', p_schema, p_table;
  end if;
  -- D249: the read lane is a disjunction of INDEXABLE predicates, not a per-row
  -- SECURITY DEFINER call. `iam.entity_read_expr` inlines the SUFFICIENT
  -- attribute lanes of has_access_for_base (owner / public / org / system-org /
  -- org-admin / parent-fk) and keeps `iam.has_access` for everything else,
  -- reached only for ids the remaining id-producing lanes could admit. Same
  -- move the `ledger` (0439) and `component` lanes already made; `entity` was
  -- the last variant still asking the question one row at a time.
  if v_v2 then
    -- READ-LANE V2 (P2): a lane admin skips std_select; platform_admin_read admits every row.
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s(%s(%s)))',
      v_tbl, iam.read_lane_v2_guard(), v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token));
  else
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%s(%s))',
      v_tbl, v_admin_read, iam.entity_read_expr(p_schema, p_table, p_token));
  end if;

  -- DD-249, the entity/system tail. `system` keeps its unconditional anon lane: a system
  -- table IS the platform's own published catalogue (63 of its 134 tokens already resolve
  -- `public`), and `iam.verify_canonical.class_lanes_match_policy` exempts that variant by
  -- name. Every other token here asks its class.
  if v_has_vis then
    v_pub_lanes := iam.class_lanes(p_token);
    if p_variant = 'system' or v_pub_lanes.anon_lane then
      v_pol := v_pol || format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
        v_tbl, v_delpfx);
    end if;
  end if;
  -- NOTE (D146): the INSERT lanes below keep `iam.has_org_access(...)`. A WITH
  -- CHECK is evaluated once per INSERTED row, never across a scan, so the
  -- per-row-definer timeout class does not reach them.
  if not v_no_client_writes then
  v_pol := v_pol || format(
    'create policy std_insert on %s for insert to authenticated with check (%s(created_by = (select auth.uid()) and (organization_id is null or iam.has_org_access(organization_id)%s)))',
    v_tbl, v_admin, v_sysorg_ins);
  end if;
  if not v_no_client_writes then
  v_pol := v_pol || format(
    'create policy std_update on %s for update to authenticated using (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))) with check (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor'')))',
    v_tbl, v_admin_read, p_token, v_admin, p_token);
  end if;
  if not v_no_client_writes and not v_del_refused then
  v_pol := v_pol || format(
    'create policy std_delete on %s for delete to authenticated using (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''admin'')))',
    v_tbl, v_admin_read, p_token);
  end if;

  perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
  perform iam.apply_table_grants(p_schema, p_table, p_variant);

  -- THE GOVERNANCE-COLUMN TIER. RLS is row-level and cannot say "this column
  -- needs a higher level", so the column axis of the tiered model is a
  -- generated BEFORE UPDATE trigger, emitted here beside the policies.
  -- READ-LANE V2 LOCK ORDER: locked before apply_governance_guard, whose trigger DDL is what first takes
  -- the auth/storage/realtime lock, and before the policy statements (see the component branch).
  if v_v2 then perform iam.read_lane_v2_lock_policy_reads(p_schema, p_table, p_token); end if;
  perform iam.apply_governance_guard(p_schema, p_table, p_token);

  perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
end;

$function$;

-- ── 1. becoming a child regenerates ────────────────────────────────────────────────────────────
set local lock_timeout = '2s';

create or replace function platform._entity_types_class_regenerates()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  -- ACCESS LADDER T-13 2.3b (2026-09-28): becoming a child (or stopping being one) is a change of
  -- WHO READS THE TABLE, exactly like a class change, so it regenerates too. Before this, a table
  -- flipped to `component` kept its organization-member and public policies (four T-8 children).
  v_was_child boolean := (old.is_component or old.rls_variant = 'component');
  v_is_child  boolean := (new.is_component or new.rls_variant = 'component');
  v_child_flip boolean;
begin
  v_child_flip := v_was_child is distinct from v_is_child;
  if new.data_class is not distinct from old.data_class and not v_child_flip then return new; end if;
  if not v_child_flip and new.rls_variant in ('component','ledger') then return new; end if;
  if not new.is_active then return new; end if;
  if to_regclass(format('%I.%I', new.schema_name, new.table_name)) is null then return new; end if;
  -- A regeneration inside the provisioner's own window would be a second one on a table it is
  -- still building; create_entity_table calls apply_rls itself, right after.
  if platform.is_provisioning() then return new; end if;  -- wave 3: a proof only the provisioner can write, never the forgeable `matrx.provisioner` GUC
  -- DD-163 (2026-09-12): iam.apply_rls refuses machinery by construction, so regenerating here is
  -- not something this trigger can do — and raising instead meant a machinery token's class could
  -- never be corrected. Say so; never pretend the policies moved.
  if new.audit_class = 'machinery' then
    raise notice 'DD-163: % changed class % -> % (child: % -> %), and its policies were NOT regenerated: audit_class is machinery and iam.apply_rls refuses machinery by construction (db-rules §1). Its policies remain the bespoke set its own feature wrote.',
      new.token, old.data_class, new.data_class, v_was_child, v_is_child;
    return new;
  end if;

  if v_is_child then
    -- A child with no usable composition edge yet cannot be generated; the edge trigger
    -- (platform._component_edge_regenerates) regenerates it the moment the edge is registered.
    if not exists (select 1 from platform.entity_relationships er
                    where er.child_type = new.token and er.kind = 'composition'
                      and exists (select 1 from information_schema.columns c
                                   where c.table_schema = new.schema_name and c.table_name = new.table_name
                                     and c.column_name = er.fk_column)) then
      raise notice 'T-13 2.3b: % became a child but has no composition parent edge yet, so its policies were NOT regenerated now; registering the edge regenerates them (platform._component_edge_regenerates).',
        new.token;
      return new;
    end if;
    raise notice 'T-13 2.3b: % became a child; regenerating its policies from its parent in this commit', new.token;
    perform iam.apply_rls(new.schema_name, new.table_name, new.token, 'component');
    return new;
  end if;

  raise notice 'DD-137b: % changed class %s -> %s (child: % -> %); regenerating its policies in this commit',
    new.token, old.data_class, new.data_class, v_was_child, v_is_child;
  perform iam.apply_rls(new.schema_name, new.table_name, new.token, new.rls_variant);
  return new;
end
$function$;

drop trigger _entity_types_class_regenerates on platform.entity_types;
create trigger _entity_types_class_regenerates
  after update of data_class, rls_variant, is_component on platform.entity_types
  for each row execute function platform._entity_types_class_regenerates();

create or replace function platform._component_edge_regenerates()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  et record;
begin
  -- ACCESS LADDER T-13 2.3b (2026-09-28): a child's read policy is built from its composition
  -- edges, so registering or moving one is the other half of "becoming a child".
  if new.kind <> 'composition' then return new; end if;
  if tg_op = 'UPDATE' and new.kind is not distinct from old.kind
     and new.child_type is not distinct from old.child_type
     and new.parent_type is not distinct from old.parent_type
     and new.fk_column is not distinct from old.fk_column then
    return new;
  end if;
  select t.token, t.schema_name, t.table_name, t.audit_class into et
    from platform.entity_types t
   where t.token = new.child_type and t.is_active and (t.is_component or t.rls_variant = 'component');
  if not found then return new; end if;
  if to_regclass(format('%I.%I', et.schema_name, et.table_name)) is null then return new; end if;
  if platform.is_provisioning() then return new; end if;
  if et.audit_class = 'machinery' then
    raise notice 'T-13 2.3b: composition edge % -> % registered on machinery child %; its policies were NOT regenerated (iam.apply_rls refuses machinery).',
      new.child_type, new.parent_type, et.token;
    return new;
  end if;
  if not exists (select 1 from information_schema.columns c
                  where c.table_schema = et.schema_name and c.table_name = et.table_name
                    and c.column_name = new.fk_column) then
    raise notice 'T-13 2.3b: composition edge % -> % names column %, which %.% does not have; policies NOT regenerated until the column exists.',
      new.child_type, new.parent_type, new.fk_column, et.schema_name, et.table_name;
    return new;
  end if;
  raise notice 'T-13 2.3b: composition edge % -> % registered; regenerating %''s policies from its parents in this commit',
    new.child_type, new.parent_type, et.token;
  perform iam.apply_rls(et.schema_name, et.table_name, et.token, 'component');
  return new;
end
$function$;

revoke all on function platform._component_edge_regenerates() from public, anon, authenticated;

create trigger _component_edge_regenerates
  after insert or update on platform.entity_relationships
  for each row execute function platform._component_edge_regenerates();

-- ── 3. guard ───────────────────────────────────────────────────────────────────────────────────
create or replace function iam.children_with_own_read_arms()
 returns table(check_name text, token text, table_name text, policy_name text)
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- ACCESS LADDER T-13 2.3b guard. One row per child (registered component) whose read policies
  -- carry an arm not derived from its parent. ZERO ROWS OR IT FAILED.
  --   own_arm_in_std_select   std_select reads the child's own organization / visibility / owner
  --                           columns, the organization-admin set, or the system-organization lane
  --   no_parent_arm           std_select does not name every composition parent column
  --   anon_read_not_via_parent pub_read on a child that does not declare the anon-via-public-parent
  --                           lane, or whose text does not ask the parent's `visibility = 'public'`
  --   bespoke_read_policy     any other permissive client read policy (hand-written), outside the debt list
  --   bespoke_debt_cleared    a debt-list child now clean: take it off the list (the list only shrinks)
  with debt(token) as (
    -- Hand-written read policies on children, found 2026-09-28 (T-13 2.3b census). Each needs its
    -- own review before it is superseded by the generated set; the list may only shrink.
    select unnest(array['analysis_result', 'credential_attachment', 'data_store_members',
      'embeddings_google_gemini_2_1536', 'embeddings_oai_3_small_1536', 'embeddings_voyage_4_large_1024',
      'embeddings_voyage_code_3_1024', 'feedback_comments', 'feedback_user_messages', 'file_analysis',
      'global_execution_control', 'integration_connection_resource', 'kg_chunk_entities', 'kg_edges',
      'kg_entity_aliases', 'org_industries', 'organization_preferences', 'sms_webhook_logs', 'structure',
      'studio_cleaned_segments', 'studio_concept_items', 'studio_module_segments', 'studio_raw_segments',
      'studio_session_settings', 'udt_dataset_row_versions', 'udt_dataset_template_fields', 'user_follows',
      'webhook_deliveries'])
  ),
  child as (
    select et.token, et.schema_name, et.table_name, coalesce(et.component_anon_read_via_public_parent, false) anon_flag,
           to_regclass(format('%I.%I', et.schema_name, et.table_name)) rel
      from platform.entity_types et
     where et.is_active and (et.is_component or et.rls_variant = 'component')
  ),
  pol as (
    select c.token, c.schema_name || '.' || c.table_name tbl, c.anon_flag, p.polname::text polname,
           pg_get_expr(p.polqual, p.polrelid) qual
      from child c join pg_policy p on p.polrelid = c.rel
     where p.polpermissive and p.polcmd in ('r', '*')
       and (p.polroles = '{0}'::oid[]
            or exists (select 1 from unnest(p.polroles) r
                        where pg_get_userbyid(r) in ('anon', 'authenticated')))
  ),
  found as (
    select 'own_arm_in_std_select'::text, token, tbl, polname from pol
     where polname = 'std_select'
       and qual ~ '(\(organization_id IS NOT NULL\)|\mvisibility\M|\m(created_by|owner_id) = \( SELECT auth\.uid|my_admin_orgs|global_readable)'
    union all
    select 'no_parent_arm', pol.token, pol.tbl, pol.polname from pol
     where pol.polname = 'std_select'
       and exists (select 1 from platform.entity_relationships er
                    where er.child_type = pol.token and er.kind = 'composition'
                      and pol.qual !~ ('\m' || er.fk_column || '\M'))
    union all
    select 'anon_read_not_via_parent', token, tbl, polname from pol
     where polname = 'pub_read' and (not anon_flag or qual !~ 'p\.visibility = ''public''')
    union all
    select 'bespoke_read_policy', token, tbl, polname from pol
     where polname not in ('std_select', 'pub_read', 'platform_admin_read', 'platform_admin_all',
                           'platform_admin_only', 'platform_admin_select', 'org_open_gate')
       and token not in (select token from debt)
  )
  select * from found
  union all
  select 'bespoke_debt_cleared', d.token, null, null from debt d
   where not exists (select 1 from pol
                      where pol.token = d.token
                        and pol.polname not in ('std_select', 'pub_read', 'platform_admin_read', 'platform_admin_all',
                                                'platform_admin_only', 'platform_admin_select', 'org_open_gate'))
  order by 1, 2, 4;
$function$;

revoke all on function iam.children_with_own_read_arms() from public, anon, authenticated;

comment on function iam.children_with_own_read_arms() is
  'Access ladder T-13 2.3b guard: one row per child table with a read arm not derived from its parent (own org/visibility/owner arm, missing parent arm, anon lane not via a public parent, or a hand-written read policy outside the shrink-only debt list). Zero rows or it failed (pnpm check:children-read-through-parent).';
