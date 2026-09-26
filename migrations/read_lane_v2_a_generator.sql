-- draft: deep-lane read-lane-v2 functions rehearsed on the clone; production waits for the proof batch
-- based-on: iam.entity_read_expr(text, text, text, text) 2aebd0e3ff51d51bed60d61d23955478a2838bac6cea9eb6d43c534e6de7a843
-- based-on: iam._apply_rls_unchecked(text, text, text, text) 506790d2e3f0e9cb629c14197f91d199132e3cef288ba250226a5f96a1e51b69
-- based-on: iam.apply_table_grants(text, text, text) a04e5cef93d3559725194cd19d70ec8469ce3d20436b11ac2aff3d0460061bef
-- based-on: iam.entity_read_equivalence(text, text, text, uuid, integer, text) 7976497bb8c2aec420227dddd1b440662264d96664808721ae79ff79e8512fa7
-- based-on: public.std_select_count_as(uuid, text, text) 525b6888daa419413b24453f7776245b919d68f99f9603016e5178e59d873860
-- based-on: iam.verify_canonical(text, text, text, text) 3a3e4964e02efb001c52815b5de80c7f67a26f896b50484c1c584fc2feb50f45
-- read_lane_v2_a_generator — the RLS generator learns two faster read shapes, switched on per table.
--
-- Design, measurements, attack and the chair's approval (2026-09-26):
-- common-docs/projects/rich-content-unification/evidence/generator-perf-design.md
--
-- THE DEFECT (production, 2026-09-26, rolled back): a member's `chat.conversation_summary` built
-- four 86k-id access sets (2.4 s) because a component's parent arm is an uncorrelated
-- `fk IN (set)` — planned only as a hashed SubPlan, never per row — and a lane admin's flash-card
-- list ran 4,087 per-row iam.has_access calls (2.0 s) because permissive policies are OR-ed in
-- reverse name order and std_select is evaluated before platform_admin_read.
--
-- THE CHANGE. Functions only — no policy statement, no freeze. Nothing changes for any table until
-- a batch file enrolls its token in iam.read_lane_v2_rollout (P7) and regenerates it:
--   P1 iam.entity_read_expr: an eligible component edge asks the parent's own read through a
--      correlated probe, with the set form as its fallback outside row security.
--   P2 iam._apply_rls_unchecked: an enrolled std_select is guarded so a lane admin skips it.
--   P3 iam.entity_read_equivalence / public.std_select_count_as: evaluate the table unaliased, so
--      correlated arms parse (files.files already failed); the mirror carries the P2 guard.
--   P4 iam.verify_canonical: judges std_select without the exact guard literal.
--   P5 iam.verify_canonical: read_lane_v2_parents_eligible.
--   P6 iam.apply_table_grants: refuses to withdraw a signed-in read another table's policy uses.
-- The 16 kernel functions are untouched: iam.entity_read_kernel_fingerprint() is unchanged.
-- ── P7: the rollout table. A token listed here gets the new read-lane shapes (P1, P2) on its next
-- iam.apply_rls; every other regeneration emits exactly today's bytes. Written by the batch files,
-- one row per table, in the same transaction as that table's regeneration. Server-only.
create table if not exists iam.read_lane_v2_rollout (
  token       text primary key,
  batch       text not null,
  enrolled_at timestamptz not null default now()
);
comment on table iam.read_lane_v2_rollout is
  'Read-lane v2 rollout (common-docs projects/rich-content-unification/evidence/generator-perf-design.md, P7). A token here gets the component parent-probe arm (P1) and the lane-admin std_select guard (P2) on its next iam.apply_rls. Retired when every generated table is through.';
revoke all on iam.read_lane_v2_rollout from public, anon, authenticated;
grant select on iam.read_lane_v2_rollout to service_role;

create or replace function iam.read_lane_v2_enrolled(p_token text)
returns boolean language sql stable set search_path to 'pg_catalog' as $$
  select exists (select 1 from iam.read_lane_v2_rollout r where r.token = p_token)
$$;

-- ── P2: the guard. Only NARROWS std_select: a lane admin gets false here and every row through
-- platform_admin_read (unconditional, emitted by the same iam.apply_rls call). Everyone else: true.
create or replace function iam.read_lane_v2_guard()
returns text language sql immutable as $$
  select '((select public.is_platform_admin()) is not true) and '::text
$$;

-- The guard exactly as PostgreSQL deparses it inside a std_select USING clause. Every reader that
-- matches admin text in std_select strips THIS literal (never a pattern), so an admin ARM anywhere
-- still counts. Proven equal to a real pg_get_expr by the functions migration's own check.
create or replace function iam.read_lane_v2_guard_deparsed()
returns text language sql immutable as $$
  select '(( SELECT is_platform_admin() AS is_platform_admin) IS NOT TRUE) AND '::text
$$;

-- `authenticated` can read the `id` of this relation (the only column the P1 probe touches).
create or replace function iam.read_lane_v2_auth_reads_id(p_rel regclass)
returns boolean language sql stable set search_path to 'pg_catalog' as $$
  select exists (select 1 from pg_attribute a where a.attrelid = p_rel and a.attname = 'id' and not a.attisdropped)
     and has_schema_privilege('authenticated', (select c.relnamespace from pg_class c where c.oid = p_rel), 'USAGE')
     and has_column_privilege('authenticated', p_rel, 'id', 'SELECT')
$$;

-- ── P1 eligibility, structural half (conditions 1–5 of the design). Independent of enrollment.
create or replace function iam.read_lane_v2_edge_structural_ok(p_child text, p_parent text, p_fk text)
returns boolean language plpgsql stable set search_path to 'pg_catalog' as $$
declare
  c record; p record; v_prel regclass; v_crel regclass;
begin
  if p_child is null or p_parent is null or p_child = p_parent then return false; end if;
  if not exists (select 1 from platform.entity_relationships er
                  where er.child_type = p_child and er.parent_type = p_parent
                    and er.fk_column = p_fk and er.kind = 'composition') then
    return false;
  end if;
  select et.schema_name, et.table_name, et.rls_variant into c
    from platform.entity_types et where et.token = p_child and et.is_active;
  select et.schema_name, et.table_name into p
    from platform.entity_types et where et.token = p_parent and et.is_active;
  if c.table_name is null or p.table_name is null or c.rls_variant is distinct from 'component' then
    return false;
  end if;
  v_crel := to_regclass(format('%I.%I', c.schema_name, c.table_name));
  v_prel := to_regclass(format('%I.%I', p.schema_name, p.table_name));
  if v_crel is null or v_prel is null then return false; end if;
  -- the child carries the FK; the parent does NOT carry a same-named column (the correlation
  -- must bind to the child row)
  if not exists (select 1 from pg_attribute a where a.attrelid = v_crel and a.attname = p_fk and not a.attisdropped)
     or exists (select 1 from pg_attribute a where a.attrelid = v_prel and a.attname = p_fk and not a.attisdropped) then
    return false;
  end if;
  -- the parent's row security is ON and a signed-in client can read its id
  if not (select relrowsecurity from pg_class where oid = v_prel) then return false; end if;
  if not iam.read_lane_v2_auth_reads_id(v_prel) then return false; end if;
  -- the parent's signed-in read is exactly its generated policy set
  if not exists (select 1 from pg_policy po where po.polrelid = v_prel and po.polname = 'std_select') then
    return false;
  end if;
  if exists (select 1 from pg_policy po
              where po.polrelid = v_prel and po.polcmd in ('r','*')
                and (0::oid = any (po.polroles) or 'authenticated'::regrole::oid = any (po.polroles))
                and po.polname <> all (iam.generated_policy_names())) then
    return false;
  end if;
  -- no bespoke resolver behind the parent token (the same test iam.entity_read_expr uses)
  if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
              where n.nspname = 'iam' and pr.proname = 'has_access_for'
                and pr.prosrc ~ ('p_type\s*=\s*''' || p_parent || '''')) then
    return false;
  end if;
  return true;
end $$;

-- ── P1 nesting depth, computed from the registry as if every token were enrolled, so the cap does
-- not depend on the order the batches run in. depth(t) = 0 when t emits no P1 arm; otherwise
-- 1 + the deepest parent it probes. An edge emits P1 only when depth(parent) <= 1, so a policy never
-- expands more than two nested parent reads (measured: web.crawl_event, four deep, planned in 162 ms).
create or replace function iam.read_lane_v2_depth(p_token text, p_path text[] default '{}')
returns integer language plpgsql stable set search_path to 'pg_catalog' as $$
declare
  rec record; v_d integer := 0; v_pd integer;
begin
  if p_token = any (p_path) or cardinality(p_path) > 16 then return 0; end if;
  for rec in select er.parent_type, er.fk_column from platform.entity_relationships er
              where er.child_type = p_token and er.kind = 'composition' and er.parent_type <> p_token
  loop
    if iam.read_lane_v2_edge_structural_ok(p_token, rec.parent_type, rec.fk_column) then
      v_pd := iam.read_lane_v2_depth(rec.parent_type, p_path || p_token);
      if v_pd <= 1 then v_d := greatest(v_d, v_pd + 1); end if;
    end if;
  end loop;
  return v_d;
end $$;

create or replace function iam.read_lane_v2_edge_emits(p_child text, p_parent text, p_fk text)
returns boolean language sql stable set search_path to 'pg_catalog' as $$
  select iam.read_lane_v2_enrolled(p_child)
     and iam.read_lane_v2_edge_structural_ok(p_child, p_parent, p_fk)
     and iam.read_lane_v2_depth(p_parent) <= 1
$$;

-- The P1 arm. Under row security (every client read) it is "the parent row is visible to this
-- person under the parent's own policies" — a correlated EXISTS the planner can answer with a pkey
-- probe. Outside row security (postgres / service_role evaluating the text: the provers) it falls
-- back to exactly the set form it replaces, and the same if the parent's row security is ever off.
create or replace function iam.read_lane_v2_parent_arm(p_parent text, p_fk text)
returns text language plpgsql stable set search_path to 'pg_catalog' as $$
declare
  v_ptbl text;
begin
  select format('%I.%I', et.schema_name, et.table_name) into v_ptbl
    from platform.entity_types et where et.token = p_parent and et.is_active;
  return format(
    '(%1$I is not null and exists (select 1 from %2$s p__ where p__.id = %1$I'
    ' and ((select row_security_active(%3$L::regclass))'
    ' or p__.id in (select iam.unnest_uuids(iam.accessible_entity_ids(%4$L, ''viewer''::public.permission_level, 0, true))))))',
    p_fk, v_ptbl, v_ptbl, p_parent);
end $$;

-- Taken by iam._apply_rls_unchecked BEFORE its first policy statement, so a wait on a parent
-- happens before the auth/storage/realtime freeze starts, never inside it.
create or replace function iam.read_lane_v2_lock_parents(p_token text)
returns void language plpgsql set search_path to 'pg_catalog' as $$
declare rec record;
begin
  for rec in select distinct format('%I.%I', pe.schema_name, pe.table_name) as ptbl
               from platform.entity_relationships er
               join platform.entity_types pe on pe.token = er.parent_type and pe.is_active
              where er.child_type = p_token and er.kind = 'composition'
                and iam.read_lane_v2_edge_emits(p_token, er.parent_type, er.fk_column)
              order by 1
  loop
    execute format('lock table %s in access share mode', rec.ptbl);
  end loop;
end $$;

-- ── P6: a parent's client read cannot be withdrawn while another table's policy reads it.
create or replace function iam.read_lane_v2_refuse_withdraw(p_rel regclass, p_had_read boolean)
returns void language plpgsql stable set search_path to 'pg_catalog' as $$
declare v_children text;
begin
  if not p_had_read or iam.read_lane_v2_auth_reads_id(p_rel) then return; end if;
  select string_agg(distinct format('%s (policy %s)', po.polrelid::regclass, po.polname), ', ')
    into v_children
    from pg_depend d join pg_policy po on po.oid = d.objid
   where d.classid = 'pg_policy'::regclass and d.refclassid = 'pg_class'::regclass
     and d.refobjid = p_rel and po.polrelid <> p_rel;
  if v_children is not null then
    raise exception 'apply_table_grants: this would withdraw the signed-in read of % while other tables'' policies read it: %. Every read of those tables would fail with 42501. Regenerate them first (iam.apply_rls falls back to the set form when the parent is not readable), then withdraw.',
      p_rel, v_children using errcode = '42501';
  end if;
end $$;

-- ── P5: a component whose std_select probes a parent that is no longer eligible.
create or replace function iam.read_lane_v2_stale_edges(p_schema text, p_table text, p_token text)
returns text language plpgsql stable set search_path to 'pg_catalog' as $$
declare
  v_sel text; rec record; v_bad text;
begin
  select pg_get_expr(po.polqual, po.polrelid) into v_sel from pg_policy po
   where po.polrelid = to_regclass(format('%I.%I', p_schema, p_table)) and po.polname = 'std_select';
  if v_sel is null or v_sel not like '%row_security_active(%' then return null; end if;
  for rec in select er.parent_type, er.fk_column, format('%I.%I', pe.schema_name, pe.table_name) as ptbl
               from platform.entity_relationships er
               join platform.entity_types pe on pe.token = er.parent_type
              where er.child_type = p_token and er.kind = 'composition'
  loop
    if position(('FROM ' || rec.ptbl || ' p__') in v_sel) > 0
       and not iam.read_lane_v2_edge_structural_ok(p_token, rec.parent_type, rec.fk_column) then
      v_bad := coalesce(v_bad || '; ', '') || format('%s via %s', rec.ptbl, rec.fk_column);
    end if;
  end loop;
  if v_bad is null then return null; end if;
  return 'std_select probes a parent that is no longer eligible (row security off, signed-in read withdrawn, a hand-written policy added, or a bespoke resolver): '
         || v_bad || ' — re-run iam.apply_rls on this table (it falls back to the set form).';
end $$;

revoke all on function iam.read_lane_v2_enrolled(text), iam.read_lane_v2_guard(), iam.read_lane_v2_guard_deparsed(),
  iam.read_lane_v2_auth_reads_id(regclass), iam.read_lane_v2_edge_structural_ok(text,text,text),
  iam.read_lane_v2_depth(text,text[]), iam.read_lane_v2_edge_emits(text,text,text),
  iam.read_lane_v2_parent_arm(text,text), iam.read_lane_v2_lock_parents(text),
  iam.read_lane_v2_refuse_withdraw(regclass,boolean), iam.read_lane_v2_stale_edges(text,text,text)
  from public, anon, authenticated;

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
        '(organization_id is not null and visibility >= ''internal''::platform.visibility'
        ' and organization_id in (select iam.my_orgs())'
        || case when p_schema = 'custom'
                then ' and (not custom.store_is_open(organization_id)'
                     || ' or iam.member_lane_open(organization_id))'
                else '' end
        || ')');
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
      if p_variant = 'component' and iam.read_lane_v2_edge_emits(p_token, rec.parent_type, rec.fk_column) then
        -- READ-LANE V2 (P1, generator-perf-design.md): the parent row is visible to this person
        -- under the parent's own policies — a correlated probe the planner can answer per row —
        -- with the set form below as its fallback outside row security.
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
  v_su_sel text := ' or public.is_super_admin()';
  v_su_ins text := 'public.is_super_admin() or ';
  v_sysorg_ins text := ' or (organization_id in (select organization_id from iam.system_orgs where global_readable) and public.is_super_admin())';
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
begin
  select coalesce(is_component, false), coalesce(suppress_platform_admin_lane, false),
         coalesce(component_anon_read_via_public_parent, false), client_excluded_columns
    into v_is_component, v_suppress_admin, v_anon_component, v_excluded
  from platform.entity_types where token = p_token;

  -- D347: publication is an additional anonymous-only restriction, never an access grant.
  v_v2 := iam.read_lane_v2_enrolled(p_token);

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
  if v_vis_enum then
    if v_admin <> '' then
      v_admin_read := '((visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())) or ';
    end if;
    if v_su_sel <> '' then
      v_su_sel_read := ' or (visibility >= ''internal''::platform.visibility and public.is_super_admin())';
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
    v_pol := v_pol || format(
      'create policy std_select on %s for select to authenticated using (%screated_by = (select auth.uid()))',
      v_tbl, v_delpfx);
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_update on %s for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()))',
      v_tbl);
    end if;
    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()))',
      v_tbl);
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
    if not v_no_client_writes then
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
      else
        v_pol := v_pol || format(
          'create policy platform_admin_select on %s for select to authenticated using (%s)',
          v_tbl,
          case when v_vis_enum
               then '(visibility >= ''internal''::platform.visibility) and (select public.is_platform_admin())'
               else '(select public.is_platform_admin())' end);
      end if;
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
          if not has_table_privilege('anon', format('%I.%I', rec.pschema, rec.ptable)::regclass, 'SELECT') then
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

    if not v_no_client_writes then
    v_pol := v_pol || format(
      'create policy std_delete on %s for delete to authenticated using (%s(%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_admin_read, v_parent_expr_edit, p_token);
    end if;

    perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
    perform iam.apply_table_grants(p_schema, p_table, 'component');
    -- A component has no owner column and no visibility of its own: its access
    -- IS its parent's (THE COMPONENT OWNERSHIP LAW). There is nothing to govern
    -- here, so the governance-column tier deliberately does not apply.
    perform iam.drop_governance_guard(p_schema, p_table);
    -- READ-LANE V2: every parent a P1 arm reads is locked (ACCESS SHARE) HERE, before the first
    -- policy statement, so a wait on a busy parent never happens inside the sign-in freeze.
    if v_v2 then perform iam.read_lane_v2_lock_parents(p_token); end if;
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
    if not v_no_client_writes then
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
  if not v_no_client_writes then
  v_pol := v_pol || format(
    'create policy std_delete on %s for delete to authenticated using (%s(created_by = (select auth.uid()) or iam.has_access(%L, id, ''admin'')))',
    v_tbl, v_admin_read, p_token);
  end if;

  perform iam._rls_plan_is(v_tbl, v_pol, v_kept);  -- POLICY-LOCK: the grants rail asks the caller what the policy set is ABOUT to be
  perform iam.apply_table_grants(p_schema, p_table, p_variant);

  -- THE GOVERNANCE-COLUMN TIER. RLS is row-level and cannot say "this column
  -- needs a higher level", so the column axis of the tiered model is a
  -- generated BEFORE UPDATE trigger, emitted here beside the policies.
  perform iam.apply_governance_guard(p_schema, p_table, p_token);

  perform iam._rls_emit_policies(v_drop, v_pol);  -- POLICY-LOCK: the freeze starts here and ends at COMMIT
end;

$function$;

CREATE OR REPLACE FUNCTION iam.apply_table_grants(p_schema text, p_table text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_rel regclass := v_tbl::regclass;
  -- READ-LANE V2 (P6): did a signed-in client read this table's id when we started?
  v_v2_had_read boolean := iam.read_lane_v2_auth_reads_id(v_tbl::regclass);
  v_rls_on boolean;
  v_n_pol integer;
  v_live_cols integer;
  v_granted_cols integer;
  v_declared text[];
  v_missing text;
  v_excluded_now text;
  v_kept text;
  v_override text;
  v_column text;
  v_stamped boolean;
  v_exposed boolean;
  v_closed_reason text;
  v_client_read_only boolean := false;
  -- DOORS-ONLY-4 -- THE GRANT HALF OF THE SAME RULING. Without this the policy change is
  -- worthless: iam.apply_rls calls this function at the end of every generation, and the
  -- default arm below issues the entity variant's write grants -- so regenerating a
  -- platform/iam table to stop emitting its write POLICIES would hand its write GRANTS
  -- straight back and reopen all eighty-seven tables the last three lanes closed.
  -- A schema declared doors-only takes the read-only client grant, as a marked relation does.
  v_doors_only boolean := false;
  v_no_client_writes boolean := false;
  v_registry_rows integer;
  v_registry_variant text;
  v_role text;
  v_privilege text;
  -- POLICY-LOCK (2026-09-22): the two rails below ask "what does this table look like NOW".
  -- `iam._apply_rls_unchecked` now calls this function BEFORE it issues any policy DDL — because
  -- every CREATE/ALTER/DROP POLICY freezes sign-in for the rest of the transaction (supautils'
  -- `policy_grants` hook) and this function is 4.2 of `apply_rls`'s 4.5 seconds. So the generator
  -- DECLARES the policy set it is about to write, in a transaction-local setting keyed on this
  -- exact table, and the rails read the declared state instead of the stale catalogue. No signature
  -- changed (a defaulted extra argument would have made every 3-argument call ambiguous, 42725);
  -- any other caller passes nothing and the rails behave exactly as they did.
  v_plan text;
  v_plan_n integer;
  v_plan_anon boolean;
begin
  v_plan := coalesce(nullif(current_setting('iam.rls_plan', true), ''), '');
  if v_plan <> '' and split_part(v_plan, '|', 1) = v_tbl then
    v_plan_n := nullif(split_part(v_plan, '|', 2), '')::integer;
    v_plan_anon := nullif(split_part(v_plan, '|', 3), '')::boolean;
  end if;
  select c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)
    into v_rls_on, v_n_pol
  from pg_class c where c.oid = v_rel;

  -- THE SAFETY RAIL. Never widen a table whose only protection is the absence
  -- of a grant.
  if not v_rls_on then
    raise exception
      'apply_table_grants: %.% has RLS DISABLED — refusing to grant. Enable RLS and apply policies first (this table is a hole, not a closed door).',
      p_schema, p_table;
  end if;
  if coalesce(v_plan_n, v_n_pol) = 0 then
    raise exception
      'apply_table_grants: %.% has RLS enabled but ZERO policies — refusing to grant. Apply canonical policies first.%',
      p_schema, p_table,
      case when v_plan_n is not null
        then ' (the caller declared a policy plan for this table in this transaction and it is empty, so nothing would protect the rows this grant opens)'
        else '' end;
  end if;
  -- 🚨 THE SCHEMA'S DECLARED EXPOSURE OUTRANKS EVERYTHING BELOW, INCLUDING THE VARIANT.
  -- A schema declared CLOSED in `platform.schema_client_exposure` receives NO grant to any
  -- client role from any provisioning path — not SELECT, not the variant's write grants, not
  -- `service_role`'s bypass. This is a PLATFORM primitive and not one schema's special case:
  -- the registry is the declaration, this function is the one place every provisioning path
  -- funnels its table grants through, and `platform.provision` re-reads the catalogue at the
  -- end of its transaction to prove the schema is still closed.
  -- Without it, a REVOKE issued after a provision lasts exactly until the next provision into
  -- the same schema — measured on the rehearsal branch 2026-09-17: schema `custom` closed by
  -- four REVOKEs, one `platform.provision(spec)` later the new table read
  -- `authenticated=arwd/postgres, service_role=arwdDxtm/postgres`.
  select e.client_exposed, e.reason into v_exposed, v_closed_reason
    from platform.schema_client_exposure e
   where e.schema_name = p_schema;

  if v_exposed is not null and not v_exposed then
    execute format('revoke all on %s from public', v_tbl);
    execute format('revoke all on %s from anon', v_tbl);
    execute format('revoke all on %s from authenticated', v_tbl);
    execute format('revoke all on %s from service_role', v_tbl);
    -- A table-level REVOKE does not remove a column-level grant, and a column grant is
    -- exactly the shape this function issues elsewhere, so it is removed by name.
    for v_column in select attname from pg_attribute
                     where attrelid = v_rel and attnum > 0 and not attisdropped loop
      execute format('revoke all (%I) on %s from public', v_column, v_tbl);
      execute format('revoke all (%I) on %s from anon', v_column, v_tbl);
      execute format('revoke all (%I) on %s from authenticated', v_column, v_tbl);
      execute format('revoke all (%I) on %s from service_role', v_column, v_tbl);
    end loop;
    -- CLOSED MEANS CLOSED TO CLIENT ROLES (chair ruling 2026-09-25, common-docs/policies/
    -- our-own-admin-database-access.md): the admin system's server door reads as service_role,
    -- so service_role keeps SELECT — read only, nothing else — on every relation, closed or not.
    execute format('grant select on %s to service_role', v_tbl);
    raise notice
      'apply_table_grants: %.% — schema % is declared CLOSED to client roles in platform.schema_client_exposure (%). NO grant was issued to PUBLIC, anon or authenticated and every standing one was revoked; service_role holds SELECT only (the admin door''s read); the % variant''s grants were NOT applied. To open the schema: %',
      p_schema, p_table, p_schema, v_closed_reason, p_variant,
      -- RAISE understands `%` and nothing else — a `%L` here prints the argument with a
      -- literal L stuck to it and hands the reader a statement that does not parse. The
      -- quoting is format()'s job, one level in.
      format('update platform.schema_client_exposure set client_exposed = true, reason = %L, declared_by = %L where schema_name = %L; -- then re-run the provisioner',
             '<why this schema may be reached by client roles>', '<who decided>', p_schema);
    perform iam.read_lane_v2_refuse_withdraw(v_rel, v_v2_had_read);
    return;
  end if;

  select count(*), coalesce(bool_or(et.client_read_only), false), max(et.rls_variant)
    into v_registry_rows, v_client_read_only, v_registry_variant
  from platform.entity_types et where et.schema_name=p_schema and et.table_name=p_table;
  if v_client_read_only and v_registry_rows > 1 then raise exception 'apply_table_grants: duplicate registry rows for marked %.%', p_schema,p_table using errcode='42501'; end if;
  if v_client_read_only then
    if v_registry_variant is null or v_registry_variant not in ('entity','system','restricted','personal','component','ledger','reference') then
      raise exception 'apply_table_grants: readonly registry variant is missing or unknown for %.%', p_schema,p_table using errcode='42501';
    end if;
    if p_variant is distinct from v_registry_variant then
      raise exception 'apply_table_grants: readonly registry variant mismatch for %.% (supplied %, registered %)', p_schema,p_table,p_variant,v_registry_variant using errcode='42501';
    end if;
  end if;

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
      'apply_table_grants: %.% is in a DOORS-ONLY schema but its doors are NOT BUILT YET, so its client write lanes were generated as before. Reason on file: %. Owner: %. The remedy is to build the door and move every caller in the same commit, then delete the platform.doors_only_pending_cutover row -- re-granting by hand would last until the next regeneration.',
      p_schema, p_table,
      (select d.reason from platform.doors_only_pending_cutover d where d.schema_name = p_schema and d.table_name = p_table),
      (select d.owner_lane from platform.doors_only_pending_cutover d where d.schema_name = p_schema and d.table_name = p_table);
  end if;
  v_no_client_writes := v_client_read_only or v_doors_only;

  -- 🚨 DD-248 — THE STAMPED-WRITE REGISTER OUTRANKS THE VARIANT.
  -- A table in `platform.stamped_write_table` carries a column that says who produced
  -- the row (`context.context_item_values.authored_by`). That is worth nothing unless
  -- exactly ONE code path can set it, and a client DML grant is a second path with no
  -- code in it at all. Such a table gets the read-only client grant whatever variant it
  -- is called with, so this generator can never be the thing that re-opens it: B-139
  -- found the cell table declared `component`, which grants insert/update/delete, and
  -- correcting that by hand would have lasted exactly until the next regeneration.
  -- The variant still decides everything else about the table (its access-lane shape as
  -- a component, its policies) — only the write privilege is withheld here.
  select exists (
    select 1 from platform.stamped_write_table s
     where s.schema_name = p_schema and s.table_name = p_table
  ) into v_stamped;

  if p_variant = 'restricted' and not exists (
    select 1 from information_schema.columns where table_schema=p_schema and table_name=p_table and column_name='visibility'
  ) then
    execute format('revoke all on %s from public', v_tbl);
    execute format('revoke all on %s from anon', v_tbl);
    execute format('revoke all on %s from authenticated', v_tbl);
    for v_column in select attname from pg_attribute where attrelid=v_rel and attnum>0 and not attisdropped loop
      execute format('revoke all (%I) on %s from public', v_column, v_tbl);
      execute format('revoke all (%I) on %s from anon', v_column, v_tbl);
      execute format('revoke all (%I) on %s from authenticated', v_column, v_tbl);
    end loop;
    if v_client_read_only then
      foreach v_role in array array['public','anon','authenticated'] loop
        foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
          if has_table_privilege(v_role,v_rel,v_privilege) then raise exception 'apply_table_grants: readonly effective table mutation remains for % %',v_role,v_privilege using errcode='42501'; end if;
        end loop;
        if has_any_column_privilege(v_role,v_rel,'INSERT,UPDATE,REFERENCES') then raise exception 'apply_table_grants: readonly effective column mutation remains for %',v_role using errcode='42501'; end if;
        if has_table_privilege(v_role,v_rel,'SELECT') or has_any_column_privilege(v_role,v_rel,'SELECT') then raise exception 'apply_table_grants: readonly restricted effective client read remains for %',v_role using errcode='42501'; end if;
      end loop;
    end if;
    execute format('grant all on %s to service_role', v_tbl);
    perform iam.read_lane_v2_refuse_withdraw(v_rel, v_v2_had_read);
    return;
  end if;

  -- ── THE COLUMN-EXCLUSION DESIGN (db-rules §6d-2) ─────────────────────────
  -- Declared in the registry, never inferred from the catalog. `ADD COLUMN`
  -- leaves attacl NULL, so a new column and a deliberately-excluded one are
  -- indistinguishable in the ACLs; inferring the set would silently hide every
  -- future column from clients (proven live, 2026-08-21). The declaration is
  -- the intent; the ACLs are only its artifact.
  select et.client_excluded_columns into v_declared
  from platform.entity_types et
  where et.schema_name = p_schema and et.table_name = p_table
  limit 1;

  if v_declared is not null and cardinality(v_declared) = 0 then
    v_declared := null;
  end if;

  -- A declared name that is not a live column is a stale declaration, and a
  -- stale declaration is how an exclusion quietly stops excluding anything.
  if v_declared is not null then
    select string_agg(x, ', ') into v_missing
    from unnest(v_declared) x
    where not exists (select 1 from pg_attribute a
                       where a.attrelid = v_rel and a.attname = x
                         and a.attnum > 0 and not a.attisdropped);
    if v_missing is not null then
      raise exception
        'apply_table_grants: %.% declares client_excluded_columns that do not exist: % — fix or clear the declaration (db-rules §6d-2).',
        p_schema, p_table, v_missing;
    end if;
  end if;

  -- The override means, and has always meant, DELIBERATELY RETIRE this design.
  begin
    v_override := current_setting('iam.allow_column_grant_override', true);
  exception when others then
    v_override := null;
  end;

  if v_declared is not null and not v_client_read_only
     and coalesce(v_override, '') in ('on', 'true', '1', 'yes') then
    raise notice
      'apply_table_grants: OVERRIDE ACCEPTED — %.% column-grant design (excluded: %) is being RETIRED for this call; table-level grants replace it. Clear entity_types.client_excluded_columns to make that permanent.',
      p_schema, p_table, array_to_string(v_declared, ', ');
    v_declared := null;
  end if;

  -- An UNDECLARED design still refuses, exactly as the rail did before — that
  -- is the lane protecting every table not yet migrated to a declaration.
  if v_declared is null then
    select count(*),
           count(*) filter (where a.attacl::text like '%authenticated=%')
      into v_live_cols, v_granted_cols
    from pg_attribute a
    where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped;

    if v_granted_cols > 0 and v_granted_cols < v_live_cols
       and coalesce(v_override, '') not in ('on', 'true', '1', 'yes') then
      select string_agg(a.attname, ', ' order by a.attnum) into v_excluded_now
      from pg_attribute a
      where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
        and (a.attacl is null or a.attacl::text not like '%authenticated=%');
      raise exception
        'apply_table_grants: %.% runs an UNDECLARED column-level grant design for `authenticated` (% of % columns granted; EXCLUDED: %) — refusing to issue table-level grants, which would silently REOPEN those columns. Declare it: UPDATE platform.entity_types SET client_excluded_columns = ARRAY[...] WHERE schema_name=%L AND table_name=%L; then re-run. To retire the design instead: set local iam.allow_column_grant_override = ''on''; (db-rules §6d-2)',
        p_schema, p_table, v_granted_cols, v_live_cols, v_excluded_now, p_schema, p_table;
    end if;
  end if;

  execute format('revoke all on %s from authenticated', v_tbl);

  -- DOORS-ONLY-4: a table-level withdrawal does not remove a COLUMN grant, and a column
  -- grant is exactly the shape this function issues when client_excluded_columns is
  -- declared -- so on some of these tables `authenticated` holds no table privilege and a
  -- fistful of column ones, which has_any_column_privilege (what the doors-only guard asks)
  -- still sees.
  if v_no_client_writes then
    foreach v_role in array array['public','anon','authenticated'] loop
      execute format('revoke insert, update, delete, truncate, references, trigger on %s from %I', v_tbl, v_role);
      for v_column in select attname from pg_attribute where attrelid=v_rel and attnum>0 and not attisdropped loop
        execute format('revoke insert (%I), update (%I), references (%I) on %s from %I',v_column,v_column,v_column,v_tbl,v_role);
      end loop;
    end loop;
  end if;

  -- `reference` joins the read-only client lane for the same reason the ledger is on it: the
  -- rows are written by a door, never by a client. A catalogue whose client grant carried
  -- INSERT/UPDATE/DELETE would make every generated write policy optional -- the privilege would
  -- be there whatever the policy said, and correcting it by hand would last exactly until the next
  -- regeneration (DD-248's lesson).
  if p_variant in ('ledger','reference') or v_stamped or v_no_client_writes then
    -- Append-only org log: reads only; writes belong to a SECURITY DEFINER writer.
    if v_stamped and p_variant <> 'ledger' then
      raise notice
        'apply_table_grants: %.% is a STAMPED-WRITE table (platform.stamped_write_table) — issuing the READ-ONLY client grant instead of the % variant''s write grants. Its writes belong to its declared SECURITY DEFINER doors, which stamp the author from the caller (DD-248).',
        p_schema, p_table, p_variant;
    end if;
    if v_declared is null then
      execute format('grant select on %s to authenticated', v_tbl);
    else
      execute format('grant select (%s) on %s to authenticated',
                     iam._client_grant_column_list(v_rel, v_declared), v_tbl);
    end if;
  else
    if v_declared is null then
      execute format('grant select, insert, update, delete on %s to authenticated', v_tbl);
    else
      v_kept := iam._client_grant_column_list(v_rel, v_declared);
      -- DELETE has no column form and needs none: removing a row you are
      -- already permitted to remove reveals nothing about an excluded column.
      execute format('grant select (%1$s), insert (%1$s), update (%1$s) on %2$s to authenticated',
                     v_kept, v_tbl);
      execute format('grant delete on %s to authenticated', v_tbl);
    end if;
  end if;

  -- THE ASSERTION IS THE FORCING FUNCTION. This is the one place every provisioning path
  -- funnels its table grants through, so it is the one place that can PROVE the client write
  -- privilege is gone rather than assume the withdrawal above did its job (DOORS-ONLY-4
  -- extends it from the marked-relation flag to the doors-only schema declaration).
  if v_no_client_writes then
    foreach v_role in array array['public','anon','authenticated'] loop
      foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if has_table_privilege(v_role,v_rel,v_privilege) then raise exception 'apply_table_grants: readonly effective table mutation remains for % %',v_role,v_privilege using errcode='42501'; end if;
      end loop;
      if has_any_column_privilege(v_role,v_rel,'INSERT,UPDATE,REFERENCES') then raise exception 'apply_table_grants: readonly effective column mutation remains for %',v_role using errcode='42501'; end if;
    end loop;
  end if;

  if v_declared is not null then
    raise notice
      'apply_table_grants: %.% column-exclusion design PRESERVED (withheld from authenticated: %).',
      p_schema, p_table, array_to_string(v_declared, ', ');
  end if;

  -- 🚨 THE OPT-IN ANONYMOUS READ LANE'S KEY (chair ruling 2026-09-22, DD-249 / R12).
  -- A policy is the access RULE; the grant is the ACCESS. platform.categories' anonymous
  -- lane has been live on THIRTEEN hand-written column ACLs that nobody declared and nothing
  -- regenerates -- the same shape as the iam.api_keys column-exclusion design DOORS-ONLY-4
  -- had to declare before that table could regenerate. It is the generator's output now.
  --
  -- The excluded set is DECLARED, never inferred, for db-rules 6d-2's reason: ADD COLUMN
  -- leaves attacl NULL, so inferring it would hand every future column to anonymous readers
  -- the day somebody adds one.
  --
  -- 🚨 IT GRANTS AND NEVER REVOKES, deliberately. The symmetric half -- withdrawing anon's
  -- SELECT where the flag is absent -- would take away four OTHER live anonymous lanes that
  -- DD-249 measured and this lane has not censused (app.definition 81 public rows,
  -- education.learn_doc 11, agent.message_template 8, workbench.notes 2). That withdrawal
  -- belongs with that census, not with this flag.
  declare
    v_anon_optin boolean;
    v_anon_excluded text[];
  begin
    select coalesce(et.client_anonymous_public_read, false), et.client_anonymous_excluded_columns
      into v_anon_optin, v_anon_excluded
      from platform.entity_types et
     where et.schema_name = p_schema and et.table_name = p_table and et.is_active
     limit 1;
    if coalesce(v_anon_optin, false) then
      if not platform.schema_is_client_exposed(p_schema) then
        raise notice
          'apply_table_grants: %.% declares client_anonymous_public_read but schema % is CLOSED to client roles in platform.schema_client_exposure -- the pub_read rule exists and NO anon grant was issued, so the anonymous lane is inert until the schema is opened.',
          p_schema, p_table, p_schema;
      elsif v_anon_excluded is null then
        execute format('grant select on %s to anon', v_tbl);
      else
        execute format('grant select (%s) on %s to anon',
                       iam._client_grant_column_list(v_rel, v_anon_excluded), v_tbl);
        raise notice
          'apply_table_grants: %.% anonymous read lane issued, withholding from anon: %.',
          p_schema, p_table, array_to_string(v_anon_excluded, ', ');
      end if;
    end if;
  end;
  -- 🚨 THE SYMMETRIC HALF OF THE OPT-IN (lane ANON-LANES, DD-249 / R12). The block above
  -- GRANTS the anonymous read lane to a table that declared it. This one is what makes that
  -- flag a CONTRACT rather than an additive convenience: on a REGISTERED table whose class
  -- resolves no anonymous lane and which declared none, an `anon` SELECT grant is access
  -- nobody decided, and it does not survive a generation.
  --
  -- A KEY WITH NO DOOR is revoked on sight: no permissive SELECT-capable policy reaches
  -- `anon`, so the grant cannot return one row, and leaving it is how the catalogue starts
  -- lying about who can read what.
  --
  -- A LIVE LANE IS NEVER SILENTLY DELETED. If a policy DOES reach `anon`, a signed-out page
  -- is probably reading this table right now, so the generator REFUSES and names both ways
  -- out -- the same shape as the UNDECLARED column-grant refusal above (db-rules 6d-2).
  -- `anon_lane_pending_withdrawal_reason` downgrades that refusal to a notice and can only
  -- KEEP what the table already has.
  declare
    v_w_token text;
    v_w_optin boolean;
    v_w_pending text;
    v_w_live_policy boolean;
    v_w_col text;
  begin
    select et.token, coalesce(et.client_anonymous_public_read, false),
           et.anon_lane_pending_withdrawal_reason
      into v_w_token, v_w_optin, v_w_pending
      from platform.entity_types et
     where et.schema_name = p_schema and et.table_name = p_table and et.is_active
     limit 1;
    -- An UNREGISTERED table has no declaration to make and no class to resolve, so this arm
    -- says nothing about it. Revoking there would be this function guessing.
    if v_w_token is not null
       and not coalesce(v_w_optin, false)
       and not (iam.class_lanes(v_w_token)).anon_lane
       and (has_table_privilege('anon', v_rel, 'SELECT')
            or has_any_column_privilege('anon', v_rel, 'SELECT')) then
      -- POLICY-LOCK: when the generator has declared its plan, the question "will a permissive
      -- anon SELECT policy reach this table" is answered by the plan, not by the catalogue — the
      -- catalogue still holds the policies the generator is about to drop, and reading it here
      -- would refuse a regeneration for a lane that is being removed in this very transaction.
      if v_plan_anon is not null then
        v_w_live_policy := v_plan_anon;
      else
        select exists (
          select 1 from pg_policy p
           where p.polrelid = v_rel and p.polpermissive and p.polcmd in ('r','*')
             and (p.polroles = '{0}'::oid[]
                  or 'anon' = any(select pg_get_userbyid(x) from unnest(p.polroles) x)))
          into v_w_live_policy;
      end if;
      if v_w_pending is not null then
        raise notice
          'apply_table_grants: %.% carries an anonymous read grant it never declared, and a PENDING WITHDRAWAL row is keeping it: %. It was NOT revoked and NOT widened. The remedy is one of the two below, then clear entity_types.anon_lane_pending_withdrawal_reason.',
          p_schema, p_table, v_w_pending;
      elsif v_w_live_policy then
        raise exception
          'apply_table_grants: %.% has a LIVE anonymous read lane it never declared -- `anon` holds SELECT and a permissive SELECT policy reaches it, so a signed-out page may be reading this table right now. Refusing to regenerate rather than silently deleting a public page. TWO legal fixes. (1) THE ROWS ARE MEANT FOR ANONYMOUS READERS: UPDATE platform.entity_types SET client_anonymous_public_read = true, client_anonymous_public_read_reason = %L, client_anonymous_excluded_columns = ARRAY[...] WHERE schema_name = %L AND table_name = %L; -- the array is the columns `anon` must NOT hold, declared not inferred (db-rules 6d-2). (2) NOBODY READS IT ANONYMOUSLY: drop the policy that reaches `anon` and revoke its grant in a migration with an inverse. If neither can be decided today, record WHY in entity_types.anon_lane_pending_withdrawal_reason and this refusal becomes a notice.',
          p_schema, p_table, '<which signed-out surface serves these rows>', p_schema, p_table
          using errcode = '42501';
      else
        execute format('revoke select on %s from anon', v_tbl);
        for v_w_col in select attname from pg_attribute
                        where attrelid = v_rel and attnum > 0 and not attisdropped loop
          execute format('revoke select (%I) on %s from anon', v_w_col, v_tbl);
        end loop;
        raise notice
          'apply_table_grants: %.% held an `anon` SELECT grant that NO SELECT-capable policy reaches -- a key with no door, which could never return a row -- and it declared no anonymous lane. WITHDRAWN (table-level and every column). If a signed-out reader was meant to exist here, it was already reading nothing: declare the lane AND give the table a policy that reaches `anon`.',
          p_schema, p_table;
      end if;
    end if;
  end;
  -- service_role is the server's bypass lane and always needs full reach.
  execute format('grant all on %s to service_role', v_tbl);
  perform iam.read_lane_v2_refuse_withdraw(v_rel, v_v2_had_read);
end;
$function$;

CREATE OR REPLACE FUNCTION iam.entity_read_equivalence(p_schema text, p_table text, p_token text, p_user uuid, p_limit integer DEFAULT NULL::integer, p_baseline text DEFAULT NULL::text)
 RETURNS TABLE(lost bigint, gained bigint, compared bigint)
 LANGUAGE plpgsql
AS $function$
declare
  v_old text;
  v_new text;
  v_src text;
  v_variant text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);

  -- An EXPLICIT baseline exists for exactly one situation: the deployed policy
  -- is the thing being repaired, so comparing against it would compare a
  -- mistake with itself.
  v_old := p_baseline;
  if v_old is null then
    select p.qual into v_old
    from pg_policies p
    where p.schemaname = p_schema and p.tablename = p_table and p.policyname = 'std_select';
  end if;

  if v_old is null then
    raise exception
      'entity_read_equivalence: %.% has no std_select policy — there is no baseline to compare against (it has never been canonicalized)',
      p_schema, p_table;
  end if;

  select case when et.is_component or et.rls_variant = 'component' then 'component' else 'entity' end
    into v_variant
  from platform.entity_types et where et.token = p_token;

  -- THE PRIVACY WALL (0582). The candidate must be what iam.apply_rls WOULD
  -- emit for this token — which, for a suppress_platform_admin_lane token, has
  -- no platform-staff arm at all. Hardcoding it here made every walled table
  -- report the admin's whole row set as `gained`.
  v_new := format('%s(%s)',
                  iam.platform_admin_read_prefix(p_token),
                  iam.entity_read_expr(p_schema, p_table, p_token, coalesce(v_variant, 'entity')));
  -- READ-LANE V2 (P2): an enrolled token's std_select carries the lane-admin guard; so does the mirror.
  if iam.read_lane_v2_enrolled(p_token) then
    v_new := format('%s(%s)', iam.read_lane_v2_guard(), v_new);
  end if;

  -- READ-LANE V2 (P3): the table is evaluated UNALIASED. PostgreSQL deparses an outer reference
  -- inside a policy subquery qualified by the table's own name, so an aliased `(select …) s` made
  -- every correlated arm unparseable here (files.files failed this way before read-lane v2).
  v_src := case when p_limit is null then 'true'
                else format('id in (select s__.id from %I.%I s__ order by s__.id limit %s)', p_schema, p_table, p_limit) end;

  return query execute format(
    'select count(*) filter (where (%1$s) and not (%2$s))::bigint,'
    '       count(*) filter (where (%2$s) and not (%1$s))::bigint,'
    '       count(*)::bigint from %3$I.%4$I where %5$s',
    v_old, v_new, p_schema, p_table, v_src);
end;
$function$;

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
  execute format('select count(*)::bigint from %I.%I where (%s)', p_schema, p_table, v_qual)  -- READ-LANE V2 (P3): unaliased, so correlated arms parse
    into v_n;
  perform set_config('request.jwt.claims', '', true);
  return v_n;
end;
$function$;

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
    ELSIF v_registry_variant IS NULL OR v_registry_variant NOT IN ('entity','system','restricted','personal','component','ledger') THEN
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
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='created_by' AND c.confrelid='auth.users'::regclass),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='updated_by' AND c.confrelid='auth.users'::regclass)
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

  check_name:='base_created_by_fk'; status:=CASE WHEN NOT f_cb THEN 'SKIP' WHEN fk_cb THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_cb AND NOT fk_cb THEN 'created_by missing FK -> auth.users' END; RETURN NEXT;

  check_name:='base_updated_by';
  IF f_ub THEN status:='PASS'; detail:=NULL;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing updated_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no actor columns (§6d-1) — every write is stamped into history.row_versions';
  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference catalogue has no actor columns -- every write goes through a door and the actor is stamped into history.row_versions';
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
      v_expected:=array_append(v_expected,'platform_admin_select');
    END IF;
  END IF;
  -- D347: certify the declared restriction, including role and permissiveness.
  SELECT anonymous_read_status INTO v_required_anon_status
    FROM platform.entity_types WHERE token=p_token;
  -- RC-A2c: a token that points at another record carries the restrictive ref_target_gate.
  IF EXISTS (SELECT 1 FROM platform.reference_gate(p_token)) THEN
    v_expected:=array_append(v_expected,'ref_target_gate');
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
  check_name:='platform_admin_read_present';
  IF v_relkind NOT IN ('r','p') OR NOT COALESCE(v_rls,false) THEN status:='SKIP'; detail:='not an RLS table';
  ELSIF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=v_tbl AND polname='platform_admin_read' AND polcmd='r' AND polpermissive) THEN status:='PASS'; detail:=NULL;
  ELSE status:='FAIL'; detail:='no permissive platform_admin_read FOR SELECT policy — the admin system reads every table (Arman 2026-09-24; common-docs/policies/our-own-admin-database-access.md); re-run iam.apply_rls or create it'; END IF;
  RETURN NEXT;

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
        v_rest := replace(replace(replace(r_pol.q, iam.read_lane_v2_guard_deparsed(), ''), w_admin, ''), w_super, '');
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
       AND v_sel NOT LIKE '%user_id%'
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE
      WHEN v_sel LIKE v_owner_pat
       AND v_sel NOT LIKE '%user_id%'
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN NULL ELSE 'personal std_select must require created_by = auth.uid() (the owner column the kernel reads; user_id retired 2026-09-23), must not key on user_id, and must omit platform_admin_all — re-run iam.apply_rls' END;
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
    IF (COALESCE(v_sel,'') LIKE '%has_access(entity_type, entity_id, ''viewer''::%'
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

$function$;

-- The guard literal that every reader strips must be what PostgreSQL really prints. Proven here, on
-- a throwaway expression, inside this transaction.
do $$
declare v text;
begin
  create temp table _rlv2_probe (id uuid) on commit drop;
  execute 'create view pg_temp._rlv2_probe_v as select 1 from pg_temp._rlv2_probe where '
          || iam.read_lane_v2_guard() || '(id is not null)';
  select pg_get_viewdef('pg_temp._rlv2_probe_v'::regclass) into v;
  if position(rtrim(iam.read_lane_v2_guard_deparsed()) in v) = 0 then
    raise exception 'read_lane_v2: the deparsed guard % is not what PostgreSQL prints: %', iam.read_lane_v2_guard_deparsed(), v;
  end if;
  drop view pg_temp._rlv2_probe_v;
end $$;
