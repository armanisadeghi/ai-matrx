-- lane: KERNEL-SHADOW
-- based-on: iam.has_access_for_many(uuid, uuid[], text, text) 6a1e710e976d90e55936cc0c563a26e4a6245ba589a16c5c912c275bc0b25a29
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) 3415e881eb8bc82e861690da433af5e21f72257ee9520257190e351008408e9f
-- based-on: custom.reaches_directly_many(uuid, uuid[], text, permission_level) 2de6a63e2f802cfc506d25885915f1b9fcf06ab2a571b3a2bc77ecafdbfaaba3
-- =============================================================================
-- KERNEL-SHADOW h — adversarial review B, hardened (each reproduced, then proven, in a rolled-back
-- transaction on live before this file):
--   1. The set form never grants the public lane on published_to_web alone: such a row goes to the
--      kernel. (A CHECK tying the two columns was not chosen: it is an ALTER TABLE on the hot store
--      table, inside the T-13 campaign's own columns, whose contract phase retires one of them.)
--   2. A NULL type and 3. a NULL level go to the kernel, which answers them its own way.
--   4. One output row per target.
--   5. The hand-off memo key carries pg_current_snapshot(), as custom.confidential_anchor's does.
-- Revert of the swap is unchanged: update platform.feature_knob set value = '{"on": false, "off_for": []}'
--   where feature = 'access' and key = 'kernel_set_form';
-- Inverse: migrations/inverse/kernel_shadow_h_review_b_hardening_down.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION iam.has_access_for_many(p_person uuid, p_targets uuid[], p_level text, p_type text DEFAULT 'record'::text)
 RETURNS TABLE(target uuid, allowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- KERNEL-SHADOW (2026-10-07). THE SET FORM OF THE ACCESS KERNEL: one row per distinct non-null
-- target, `allowed` = iam.has_access_for(p_person, p_type, target, p_level) — the same answer,
-- resolved once for the whole set instead of once per target. The rule it implements, lane by lane,
-- is common-docs/systems/platform/access/KERNEL.md. It is SHADOW ONLY until Arman decides the swap:
-- iam.has_access_for_shadow asks both forms and returns the old one.
--
-- WHAT IS SET-BASED. The person is resolved once (organizations, admin seats, store switch,
-- member-lane level per organization and Table). The target rows are read in ONE statement. Grants,
-- record memberships, scope assignments and Library grants are one semi-join each over the set.
-- Every clock clause (a grant's expiry) is the statement's own now().
--
-- WHAT IS NOT, AND GOES TO THE ONE-AT-A-TIME KERNEL (iam.has_access_for, unchanged), so the answer is
-- the kernel's by construction:
--   * every type but `record` (the hot path; other types are a later wave, KERNEL.md § Waves);
--   * the whole call, when the registry no longer says what this body assumes about `record`
--     (a reference gate, an owner-only trash rule, a detail or child pointer, a containment or
--     composition parent, or a class whose "Only me" rows do not open to the organization);
--   * one target, when its id is carried by more than one row, when it sits in a global-readable
--     system organization (those arms read the row column T-13 retires, which this body may not), or
--     when platform.reachability holds a container for it.
-- A Confidential row is answered by custom.confidential_answer itself, exactly as the kernel asks it.
--
-- THE PUBLIC LANE: the kernel asks the row column T-13 retires (= 'public'), which this body may not
-- read. A row published_to_web marks, that no other lane opens, is asked of the kernel (KERNEL-SHADOW h).
-- Known one-way gap, fail-closed: a row the kernel would open ONLY because its row column says public
-- while published_to_web says false (possible only with the T-13 dual-write trigger bypassed) is
-- refused here; the shadow and the sweep report it as a disagreement.
declare
  v_req     public.permission_level;
  v_lanes   platform.lane_set;
  v_set_ok  boolean;
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  -- KERNEL-SHADOW h: a NULL level is NOT viewer - the kernel answers a NULL level its own way (owner and
  -- organization admins only), so a NULL level, like a NULL or non-record type, goes to the kernel.
  v_req := p_level::public.permission_level;

  if p_person is null then
    return query select distinct x, false from unnest(p_targets) x where x is not null;
    return;
  end if;

  -- The registry facts this body is written against, asked of the same functions the kernel asks.
  v_set_ok := coalesce(p_type = 'record' and v_req is not null
    and exists (select 1 from platform.entity_types et
                 where et.token = 'record' and et.is_active
                   and et.schema_name = 'custom' and et.table_name = 'record'
                   and et.rls_variant is distinct from 'detail')
    and platform.reference_gate_columns('record') is null
    and not coalesce(platform.trash_is_owner_only('record'), false)
    and platform.detail_parent_columns('record') is null
    and platform.child_parent_columns('record') is null
    and not exists (select 1 from platform.entity_relationships er
                     where er.child_type = 'record' and er.kind in ('composition', 'containment'))
    and coalesce(iam.personal_opens_row('record', 'custom', 'record', null), false), false);

  if not v_set_ok then
    return query
      select u.x, coalesce(iam.has_access_for(p_person, p_type, u.x, v_req), false)
        from (select distinct x from unnest(p_targets) x where x is not null) u(x);
    return;
  end if;

  v_lanes := iam.class_lanes('record');

  return query
  with
  t as materialized (
    select distinct x as id from unnest(p_targets) x where x is not null
  ),
  -- The person, once.
  my_orgs as materialized (
    select distinct om.organization_id as org
      from iam.organization_member om
     where om.user_id = p_person
  ),
  global_orgs as materialized (
    select s.organization_id as org from iam.system_orgs s where s.global_readable
  ),
  -- The rows, once.
  w as materialized (
    select t.id,
           r.organization_id as org,
           r.created_by      as owner,
           r.published_to_web as pub,
           r.table_id        as tbl,
           count(r.id) over (partition by t.id) as n_rows
      from t
      left join custom.record r on r.id = t.id
  ),
  -- Per organization the targets live in: archived, admin seat, member access, store switch.
  orgs as materialized (
    select o.org,
           exists (select 1 from iam.organizations x where x.id = o.org and x.archived_at is not null) as archived,
           public.is_org_admin_for(p_person, o.org) as is_admin,
           iam.has_org_access_for(p_person, o.org)  as has_access,
           custom.store_is_open(o.org)              as store_open
      from (select distinct w.org from w where w.org is not null and w.n_rows = 1) o
  ),
  -- Per target: the semi-joins.
  x as materialized (
    select w.id, w.org, w.owner, w.pub, w.tbl, w.n_rows,
           o.archived, o.is_admin, o.has_access, o.store_open,
           (w.org in (select g.org from global_orgs g)) as in_global_org,
           exists (select 1 from platform.reachability rc
                    where rc.item_type = 'record' and rc.item_id = w.id) as has_container,
           -- the Confidential anchor is provably absent when no row of class `record` carries the
           -- id, or exactly one does whose Table is not Confidential and whose document names no
           -- parent (custom.confidential_anchor's own loop stops at that first row)
           (select count(c.id) = 0
                   or (count(c.id) = 1
                       and not coalesce(bool_or((ct.data ->> 'level') = 'confidential'), false)
                       and not coalesce(bool_or(jsonb_typeof(c.data -> 'parent_id') = 'string'), false))
              from custom.record c
              left join custom.record ct
                on ct.organization_id = c.organization_id and ct.id = c.table_id
               and ct.table_id = custom.table_kernel_id()
             where c.id = w.id and c.data_class = 'record') as anchor_free,
           exists (select 1 from platform.entity_grants eg
                    where eg.entity_type = 'record' and eg.entity_id = w.id) as has_library_row,
           -- public.has_permission_for, as a semi-join
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and coalesce(p.status, 'active') <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and (p.granted_to_user_id = p_person
                           or (p.granted_to_organization_id is not null
                               and p.granted_to_organization_id in (select m.org from my_orgs m)))
                      and case v_req
                            when 'viewer' then p.permission_level in ('viewer', 'commenter', 'edit_content', 'editor', 'admin')
                            when 'commenter' then p.permission_level in ('commenter', 'edit_content', 'editor', 'admin')
                            when 'edit_content' then p.permission_level in ('edit_content', 'editor', 'admin')
                            when 'editor' then p.permission_level in ('editor', 'admin')
                            when 'admin' then p.permission_level = 'admin'
                          end) as grant_hit,
           -- iam.grant_addressed_level(...) is not null: a grant addressed to this person speaks
           -- for this row, so the member lane's default does not (VIS-19)
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and p.status <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and coalesce(p.is_public, false) = false
                      and (p.granted_to_user_id = p_person
                           or p.granted_to_organization_id in (select m.org from my_orgs m))
                      and p.permission_level is not null) as addressed,
           -- a record membership (iam.membership_grant)
           exists (select 1 from iam.memberships m
                     join iam.membership_grant g
                       on g.member_role = m.role and g.container_type in ('record', '*')
                    where m.container_type = 'record' and m.container_id = w.id
                      and m.user_id = p_person and m.deleted_at is null
                      and g.confers >= v_req) as membership_hit,
           -- public._edu_can_read_via_assignment (the record arm)
           exists (select 1 from platform.associations_live a
                     join iam.memberships m
                       on m.container_type = 'scope' and m.container_id = a.target_id
                      and m.user_id = p_person and m.status = 'active' and m.deleted_at is null
                    where a.source_type = 'record' and a.source_id = w.id
                      and a.target_type = 'scope' and a.role = 'assignment') as edu_hit
      from w
      left join orgs o on o.org = w.org
  ),
  -- Which targets this body answers, and which still need the member lane's level.
  y as materialized (
    select x.*,
           (x.n_rows > 1 or x.in_global_org or x.has_container) as to_kernel,
           case when x.n_rows = 1 and not x.archived and not x.anchor_free
                     and not x.in_global_org and not x.has_container
                then custom.confidential_answer(p_person, x.id, v_req) end as conf
      from x
  ),
  early as materialized (
    select y.*,
           coalesce(y.n_rows = 1 and not y.to_kernel and not y.archived and y.conf is null
            and (
              (v_req = 'viewer' and y.has_library_row
                 and (public.user_can_read_via_library_grant(p_person, 'record', y.id)
                      or public.library_is_open('record', y.id)))
              or y.owner = p_person
              or y.grant_hit
              or y.membership_hit
              or (v_req = 'viewer' and y.edu_hit)
              or (v_lanes.org_role_lane and y.is_admin)
              or (v_lanes.org_member_lane and y.has_access and not y.store_open
                  and v_req <= 'editor'::public.permission_level)
            ), false) as early_yes  -- a row with no creator makes `owner = p_person` null, never yes
      from y
  ),
  -- The member lane's level (iam.member_lane_confers), per organization and Table, asked only
  -- where nothing earlier answered and only where the kernel itself would reach that arm.
  confers as materialized (
    select q.org, q.tbl,
           iam.member_lane_confers(p_person, q.org, 'record', null, q.tbl, true) as lvl
      from (select distinct e.org, e.tbl from early e
             where e.n_rows = 1 and not e.to_kernel and not e.archived and e.conf is null
               and not e.early_yes
               and not (v_req = 'viewer' and e.pub)
               and v_lanes.org_member_lane and e.has_access and e.store_open
               and not e.addressed) q
  )
  -- KERNEL-SHADOW h: one row per target (an id two rows carry is asked of the kernel once).
  select distinct on (e.id) e.id,
         case
           when e.to_kernel then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           when e.n_rows = 0 then false
           when e.archived then false
           when e.conf is not null then e.conf
           when e.early_yes then true
           -- KERNEL-SHADOW h: the public lane is never granted on published_to_web alone. A row it
           -- would open, and nothing else opens, is asked of the kernel, which reads the row column
           -- itself - so a row written with the T-13 dual-write trigger bypassed answers exactly as before.
           when v_req = 'viewer' and e.pub then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           else coalesce(
                  v_lanes.org_member_lane and e.has_access and e.store_open and not e.addressed
                  and v_req <= (select c.lvl from confers c
                                 where c.org = e.org and c.tbl is not distinct from e.tbl),
                  false)
         end
    from early e
   order by e.id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.reaches_directly(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- DOES SOMETHING REACH THIS ROW? Arms 1, 2 and 3 of the one ladder, and nothing else. This is
-- not a second ladder: `custom.has_visibility` has no copy of these arms any more, it calls
-- this. The split exists because a Table answers YES to a fourth question — "may this person
-- know it" — that must never be read as "it carries everything inside it".
declare
  rec         record;
  v_org       uuid;
  v_table     uuid;
  v_cap       public.permission_level;
  v_cap_asked boolean := false;
  v_vis       platform.visibility;
  -- KERNEL-TAILS arm 3b
  v_parent    uuid;
  v_child     uuid;
  v_named     public.permission_level;
  v_spec      public.permission_level;
  v_hops      integer := 0;
  v_conf      boolean;  -- CHAIR-CONFIDENTIAL-STORE
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- 🚨 CHAIR-CONFIDENTIAL-STORE (2026-10-02) — A ROW OF A CONFIDENTIAL TABLE IS ANSWERED BY ONE
  -- QUESTION AND NO ARM BELOW. The same call the access kernel makes (iam.has_access_for_base), so
  -- the store's ladder and the platform's agree by construction: arm 1's organization lanes, arm 2's
  -- membership default, arm 3's carrying, 3b's named parent and 4's scope membership are all lanes
  -- a Confidential row does not have. Owner, the people its rules name, and shares addressed to the
  -- person are inside the answer.
  if p_type = 'record' then
    v_conf := custom.confidential_answer(p_user_id, p_id, p_required);
    if v_conf is not null then
      return v_conf;
    end if;
  end if;

  if p_type = 'record' then
    select r.organization_id, r.table_id, r.visibility, custom.containment_parent(r.data)
      into v_org, v_table, v_vis, v_parent
      from custom.record r
     where r.id = p_id;
  end if;

  -- CD-LADDER (2026-10-03): AN ARCHIVED ORGANIZATION IS CLOSED TO EVERYONE (access ladder T-33). The
  -- kernel refuses every row of it, grants and ownership included, so no arm below may open one.
  if v_org is not null
     and exists (select 1 from iam.organizations o where o.id = v_org and o.archived_at is not null) then
    return false;
  end if;

  -- ARM 1 — THE PLATFORM'S OWN ACCESS KERNEL, asked and not reimplemented. Ownership, grant
  -- rows, the organization lanes (which honour the row's own `visibility`, DD-136), the
  -- containment walk, the public and global-readable system-organization arms.
  --
  -- IT IS GOVERNED BY THE CAP TOO (LADDER-CAP). One of the lanes inside it IS the organization
  -- default — the least specific rung there is — and leaving arm 1 alone let that lane overrule
  -- a grant somebody addressed to this person on the record's TABLE or on a home of it. The cap
  -- carries the lanes addressed to nobody (ownership, the admin lanes, public grants) at the top
  -- level, so nothing arm 1 exists for is taken away.
  -- KERNEL-SHADOW stage 1 (2026-10-07): the answer custom.reaches_directly_many resolved for this very
  -- target with the set form (iam.has_access_for_many) earlier in THIS statement, when the knob
  -- access/kernel_set_form is on; otherwise, and whenever that memo is absent, the kernel itself.
  if coalesce(platform.memo_k_get('iam.kernel_set:' || p_user_id::text || ':' || p_type || ':'
                                  || p_required::text || ':' || p_id::text
                                  || ':' || pg_catalog.pg_current_snapshot()::text)::boolean,
              iam.has_access_for(p_user_id, p_type, p_id, p_required)) then
    if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19), under the same
  -- cap. It is a VETO and never turns a no into a yes, so it is asked where an arm would say
  -- yes and not on a walk that ends in no. A refusal ENDS the walk: arm 3 is less specific still
  -- and is governed by the same cap, so it could only be refused as well.
  if iam.effective_level(p_user_id, p_type, p_id, v_org, v_table) >= p_required then
    if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING, including (since SHARED-ONLY) the Table a record lives
  -- in. An ancestor conveys at most `conveys_max`, and the first ancestor that conveys enough
  -- AND that this principal reaches at that level answers true — subject to the same cap.
  -- 🚨 SHARE-TAILS (2026-09-25) — A PERSONAL RECORD IS CARRIED BY NOTHING. The access kernel
  -- already says so (`iam.has_access_for_base`: `v_containment_carries` is false below
  -- `internal`) and so does the Table edge (`custom.carrying_edges_of` arm 3, DD-136: "reached by a
  -- grant and by its creator and by nothing else"); this loop alone still let a Home carry a
  -- personal Table to every member who reaches the Home through the member lane — which is how a
  -- Table set to "Only people I share it with" stayed open to the whole organization (measured on
  -- the clone, 2026-09-25). Its owner and a grant addressed to it are answered above, untouched.
  if v_vis is not null and v_vis < 'internal'::platform.visibility then
    return false;
  end if;

  for rec in
    select a.container_type, a.container_id
      from custom.visibility_ancestors(p_type, p_id) a
     where a.max_level >= p_required
     order by a.depth
  loop
    -- THE TERMINAL TABLE HAS ITS OWN NAMED FORM (LEAK-T10). It is the one ancestor the
    -- set-based door also has to ask about, on its own, for a whole page at once — so the
    -- question lives in one body that both callers run, and neither can drift from the other.
    if (rec.container_type = 'record' and rec.container_id = v_table
        and custom.table_carries_its_rows(p_user_id, rec.container_id, p_required))
       or (not (rec.container_type = 'record' and rec.container_id = v_table)
           and iam.has_access_for(p_user_id, rec.container_type, rec.container_id, p_required))
    then
      if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
    end if;
  end loop;

  -- ARM 3b — A RECORD OWNED BY A RECORD SHE IS NAMED ON (lane KERNEL-TAILS, 2026-09-25; chair
  -- ruling for v1store_fixes_green 4d). A person named on a record holds that level — never above
  -- editor — on the records it OWNS (children made through custom.relation_own: the child's
  -- parent_id AND an "owned" relation row from the parent), the way a Notion sub-page inherits its
  -- parent's share, and on their owned children in turn. The nearest explicit grant decides: a
  -- child that carries its own grant for her answers with that grant (the addressed cap's rung 1,
  -- the row itself), and an owned ancestor on the way up that is named for her ends the walk.
  -- WHY IT IS ITS OWN ARM. Arm 3 already carries a live parent's share through the containment
  -- edge. But custom.record_delete archives a container BEFORE its cascade asks about the
  -- children (the order that stops a containment loop), the archive soft-deletes that edge, and
  -- the named editor who may delete the parent was refused its owned child at "viewer" — the
  -- organization's member default, all that was left. This arm reads the ownership itself (the
  -- relation row, which the archive keeps) and the parent's NAMED grant (which the archive keeps),
  -- and admits an archived parent only while it belongs to the archive running in this
  -- transaction (custom.archive_took). A record merely contained, carried or linked is not owned
  -- and gains nothing here; a personal child already returned above (DD-136).
  if p_type = 'record' and v_parent is not null and p_required <= 'editor'::public.permission_level then
    v_child := p_id;
    while v_parent is not null and v_hops < 16 loop
      v_hops := v_hops + 1;
      exit when not exists (
        select 1 from custom.record rel
         where rel.organization_id = v_org and rel.data_class = 'relation' and rel.deleted_at is null
           and rel.data @> jsonb_build_object('kind', 'owned', 'from', v_parent::text, 'to', v_child::text));
      exit when not exists (
        select 1 from custom.record pr
         where pr.organization_id = v_org and pr.id = v_parent
           and (pr.deleted_at is null
                or strpos(coalesce(current_setting('custom.archive_took', true), ''), v_parent::text) > 0));
      select max(g.permission_level) into v_named
        from iam.permissions g
       where g.resource_type = 'record' and g.resource_id = v_parent and g.granted_to_user_id = p_user_id
         and g.status <> 'rejected' and (g.expires_at is null or g.expires_at > now());
      if v_named is not null then
        if least(v_named, 'editor'::public.permission_level) >= p_required then
          v_spec := custom.addressed_cap_specific(p_user_id, p_type, p_id, v_org, v_table);
          if v_spec is null or p_required <= v_spec then
            return true;
          end if;
        end if;
        exit;
      end if;
      v_child := v_parent;
      -- an owned ancestor that carries its own grant for her is the nearest explicit grant, and
      -- it was answered no above (or it would have carried through arm 1): the walk ends.
      exit when exists (
        select 1 from iam.permissions g
         where g.resource_type = 'record' and g.resource_id = v_child and g.granted_to_user_id = p_user_id
           and g.status <> 'rejected' and (g.expires_at is null or g.expires_at > now()));
      select custom.containment_parent(pr.data) into v_parent
        from custom.record pr where pr.organization_id = v_org and pr.id = v_child;
    end loop;
  end if;

  -- ARM 4 — A SCOPE MEMBERSHIP (lane SC-3', P7's read arm, 2026-09-24). A person the
  -- organization admitted to ONE record — a student to one class — reads that record and the
  -- records it carries, at viewer and never above. Last, because it is the only arm that reads
  -- `iam.memberships`, and every cheaper reason has already answered no. It does not reach the
  -- record's Table: `custom.scope_member_reaches` walks the record's carriers and a Table is
  -- where that walk stops, so the other classes stay unlisted.
  if p_type = 'record' and custom.scope_member_reaches(p_user_id, p_id, p_required) then
    return true;
  end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.reaches_directly_many(p_user_id uuid, p_targets uuid[], p_type text DEFAULT 'record'::text, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS TABLE(target uuid, reaches boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- PERF-FIX-2 (2026-10-07). THE SET FORM OF custom.reaches_directly: one row per distinct non-null
-- target, `reaches` = custom.reaches_directly(p_user_id, p_type, target, p_required) - that very
-- function, asked for each target, so it is not a second ladder and cannot drift from it.
-- What it shares is the one question that function and the access kernel each ask first about a
-- record: does it have a Confidential anchor (custom.confidential_anchor, twice per record, each a
-- read by id across all sixteen partitions). Here it is read ONCE for every target together. A
-- target that no row of class `record` carries, or that exactly one such row carries whose Table is
-- not Confidential and whose document names no parent, has no anchor - custom.confidential_anchor's
-- own loop stops at that first row - and the statement memo is given the very "none" ('-') that
-- function would leave there (only while the transaction has written nothing, as it does). Every
-- other target is left to the anchor function, as before.
-- KERNEL-SHADOW (2026-10-07): the shadow call at the end; see there.
declare
  v_kernel uuid := custom.table_kernel_id();
  v_snap   text := pg_catalog.pg_current_snapshot()::text;
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  if p_user_id is not null and p_type = 'record' and pg_catalog.pg_current_xact_id_if_assigned() is null then
    perform platform.memo_k_put('custom.confidential_anchor:' || q.id::text || ':' || v_snap, '-')
       from (
         select u.id,
                count(w.id) as n_rec,
                coalesce(bool_or((t.data ->> 'level') = 'confidential'), false) as conf_tbl,
                coalesce(bool_or(jsonb_typeof(w.data -> 'parent_id') = 'string'), false) as has_parent
           from (select distinct x as id from unnest(p_targets) x where x is not null) u
           left join custom.record w on w.id = u.id and w.data_class = 'record'
           left join custom.record t
             on t.organization_id = w.organization_id and t.id = w.table_id and t.table_id = v_kernel
          group by u.id
       ) q
      where q.n_rec = 0 or (q.n_rec = 1 and not q.conf_tbl and not q.has_parent);
  end if;
  -- KERNEL-SHADOW stage 1 (2026-10-07): arm 1 of custom.reaches_directly (the access kernel) is asked
  -- ONCE for the whole set through iam.has_access_for_many and handed to each per-target call through
  -- the statement memo - only while the knob access/kernel_set_form is on for this person and the
  -- transaction has written nothing (the memo's own rule). A failure of the set form is a WARNING and
  -- every target is asked one at a time, as before.
  if p_user_id is not null and pg_catalog.pg_current_xact_id_if_assigned() is null
     and iam.kernel_set_form_on(p_user_id) then
    begin
      perform platform.memo_k_put('iam.kernel_set:' || p_user_id::text || ':' || p_type || ':'
                                  || p_required::text || ':' || m.target::text
                                  || ':' || pg_catalog.pg_current_snapshot()::text,
                                  case when m.allowed then 'true' else 'false' end)
         from iam.has_access_for_many(p_user_id, p_targets, p_required::text, p_type) m;
    exception when others then
      raise warning 'KERNEL-SET-FORM: iam.has_access_for_many failed (% %); answering one at a time',
        sqlstate, sqlerrm;
    end;
  end if;
  return query
    select u.x, custom.reaches_directly(p_user_id, p_type, u.x, p_required)
      from (select distinct x from unnest(p_targets) x where x is not null) u(x);
  -- KERNEL-SHADOW (2026-10-07): for the people the knob access/kernel_shadow names, ask the set form
  -- of the access kernel beside the one-at-a-time form and log any disagreement. Asked AFTER the
  -- answer above, so nothing it does can change that answer; its own return value is not used here.
  if p_user_id is not null and iam.kernel_shadow_on(p_user_id) then
    perform iam.has_access_for_shadow(p_user_id, p_targets, p_required::text, p_type,
                                      'custom.reaches_directly_many');
  end if;
end;
$function$;
