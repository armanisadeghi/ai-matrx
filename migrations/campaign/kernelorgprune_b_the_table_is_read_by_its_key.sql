-- lane: KERNEL-ORG-PRUNE
-- based-on: custom.confidential_anchor(uuid) c6f97221bede1359a81705071c2f9e7a7d02659a1316bdb034e2a2f7cfbada22
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) 1307788e338d60c66af8039fe2a9711116ecb7ef597e3ed032cdbe0472a9301c
--
-- KERNEL-ORG-PRUNE b (2026-10-08). Measured after kernelorgprune_a on live: a warm custom.has_visibility rose
-- from ~1.1 to ~1.5 ms. Two reads were the cause (pg_stat_xact_user_functions over 306 calls):
--  * custom.confidential_anchor (0.32 ms a call): planned generic, its LEFT JOIN to the row's Table hashed every
--    Table of the organization. The Table is now a scalar subquery on its primary key - at most one row, so the
--    same answer as the join - and runs as one pruned probe.
--  * custom.reaches_directly's read of the row, named by organization, was custom-planned on every call
--    (~0.2 ms); that one statement now runs under a generic plan (~0.02 ms) and the mode is restored at once.
-- Answers unchanged. Function bodies only: any hour. Inverse: migrations/inverse/kernelorgprune_b_the_table_is_read_by_its_key_down.sql

set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom.confidential_anchor(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_generic_plan'
AS $function$
-- THE CONFIDENTIAL ROW A RECORD ANSWERS TO, or null. A record of a Confidential Table answers to
-- itself; a record whose parent_id climbs (at most 16 hops) to one answers to that row — "children
-- inherit their parent" (access ladder). A Table, a field, a rule, a kernel row: null.
--
-- PERF-FIX-1 (2026-10-07): ASKED ONCE PER RECORD PER STATEMENT. One page of 38 rows asked this 272-404
-- times (the ladder asks it for every rung it tries, through custom.confidential_answer and
-- custom.reaches_directly) and each ask read `custom.record` by id across all sixteen partitions. The
-- answer is a function of the id and the snapshot, so the first ask leaves it in the statement memo
-- (platform.memo_k_*: fenced by statement, backend, seat and the transaction's first write) fenced
-- here by the snapshot as custom.visible_set is; a transaction that has written asks every time.
--
-- KERNEL-ORG-PRUNE (2026-10-08): EACH READ CARRIES THE ORGANIZATION. custom.record is hash-partitioned on
-- organization_id, so a read by id alone plans and probes all sixteen partitions. The row's organization, once
-- any helper in this statement has read it, sits in the statement memo ('custom.record_org:<id>'); the read
-- names it and touches one partition (a parent is tried in its child's organization). A miss falls back to the
-- read by id alone, so the answer is the same row either way. Plans are generic: one plan, pruned at run time.
-- KERNEL-ORG-PRUNE b: the Table is a scalar subquery on its primary key (at most one row, so the same answer as
-- the left join it replaces); as a generic plan the join hashed every Table of the organization (measured).
declare
  v_id     uuid := p_id;
  v_org    uuid;
  v_data   jsonb;
  v_level  text;
  v_hops   integer := 0;
  v_res    uuid;
  v_key    text;
  v_hit    text;
  v_try    uuid;
  v_class  text;
begin
  if p_id is null then return null; end if;
  if pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_key := 'custom.confidential_anchor:' || p_id::text || ':' || pg_catalog.pg_current_snapshot()::text;
    v_hit := platform.memo_k_get(v_key);
    if v_hit is not null then
      return nullif(v_hit, '-')::uuid;
    end if;
  end if;
  v_try := nullif(platform.memo_k_get('custom.record_org:' || p_id::text), '')::uuid;
  loop
    v_class := null;
    if v_try is not null then
      select r.organization_id, r.data,
             (select t.data ->> 'level' from custom.record t
               where t.organization_id = r.organization_id and t.id = r.table_id
                 and t.table_id = custom.table_kernel_id()),
             r.data_class
        into v_org, v_data, v_level, v_class
        from custom.record r
       where r.organization_id = v_try and r.id = v_id;
    end if;
    if v_class is null then
      select r.organization_id, r.data,
             (select t.data ->> 'level' from custom.record t
               where t.organization_id = r.organization_id and t.id = r.table_id
                 and t.table_id = custom.table_kernel_id())
        into v_org, v_data, v_level
        from custom.record r
       where r.id = v_id and r.data_class = 'record';
      if not found then exit; end if;
    elsif v_class <> 'record' then
      exit;
    end if;
    if v_try is distinct from v_org then
      perform platform.memo_k_put('custom.record_org:' || v_id::text, v_org::text);
    end if;
    v_try := v_org;
    if v_level = 'confidential' then v_res := v_id; exit; end if;
    exit when v_hops >= 16 or jsonb_typeof(v_data -> 'parent_id') is distinct from 'string';
    v_hops := v_hops + 1;
    begin
      v_id := (v_data ->> 'parent_id')::uuid;
    exception when invalid_text_representation then
      v_res := null;
      exit;
    end;
  end loop;
  if v_key is not null then
    perform platform.memo_k_put(v_key, coalesce(v_res::text, '-'));
  end if;
  return v_res;
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
  v_hint      uuid;     -- KERNEL-ORG-PRUNE
  v_pcm       text;     -- KERNEL-ORG-PRUNE b
  v_hit       boolean := false;  -- KERNEL-ORG-PRUNE b
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

  -- KERNEL-ORG-PRUNE (2026-10-08): the row is read in its organization when this statement already knows it
  -- (statement memo 'custom.record_org:<id>'), and the organization is left there for the kernel's own read of
  -- the row (platform.partitioned_row_attrs); a miss falls back to the read by id alone.
  if p_type = 'record' then
    v_hint := nullif(platform.memo_k_get('custom.record_org:' || p_id::text), '')::uuid;
    if v_hint is not null then
      -- KERNEL-ORG-PRUNE b: this one read plans generic (one plan, pruned at run time, ~0.02 ms) instead of a
      -- custom plan per call (~0.2 ms); the mode is put back on the next line, and an error rolls it back.
      v_pcm := pg_catalog.current_setting('plan_cache_mode');
      perform pg_catalog.set_config('plan_cache_mode', 'force_generic_plan', true);
      select r.organization_id, r.table_id, r.visibility, custom.containment_parent(r.data)
        into v_org, v_table, v_vis, v_parent
        from custom.record r
       where r.organization_id = v_hint and r.id = p_id;
      v_hit := found;   -- read before PERFORM, which sets FOUND itself
      perform pg_catalog.set_config('plan_cache_mode', v_pcm, true);
    end if;
    if not v_hit then
      select r.organization_id, r.table_id, r.visibility, custom.containment_parent(r.data)
        into v_org, v_table, v_vis, v_parent
        from custom.record r
       where r.id = p_id;
    end if;
    if v_org is not null and v_hint is distinct from v_org then
      perform platform.memo_k_put('custom.record_org:' || p_id::text, v_org::text);
    end if;
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
