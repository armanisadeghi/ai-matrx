-- chair-step: it REPLACES the body of one store door, custom.levels_of (signature, SECURITY DEFINER, search_path and grants unchanged). Same answer for every seat: a membership row on a record makes that record walk the ladder on its own only when the row is THIS person's, and then the person's own (kind, role, status) rows join the class key, so a person's scopes of one organization and Table are walked once; the viewer answer `s` is taken from the rung the halving already found instead of a fifth ladder walk; and a record a class may not speak for (a Confidential Table's row, a row with a parent) is walked on its own. No other function, no table, index, policy, grant, door row or data row is touched.
-- lane: CHAIR-READPERF
-- based-on: custom.levels_of(uuid, uuid[]) a1d15061bc7c3bcf51fa4633d1b6fa583e50846a23efa67feb9bb07edf5e89b6
-- lock: custom
--
-- Inverse: migrations/inverse/chairreadperf_b_the_class_walk_folds_in_the_persons_own_membership_down.sql.
--
-- WHY (chair sublane READPERF, 2026-10-03; lane 9 sublane G measured it on the clone): the first record
-- of a class costs the member ~27 ms (custom.effective_level ~23 ms, three ladder walks by halving, then
-- a fourth walk for `s`), and every record NAMED by a membership row was a class of its own. A scope's
-- memberships name it (its members), so admin's Workspace "Classes" — 13 scopes, 13 own-membership rows
-- — took ~330 ms against the old hand-off's 17 ms, and a one-scope type ~45 ms against 5–8 ms.
--
-- WHAT CHANGES, AND WHY THE ANSWER IS THE SAME.
--  1. A membership row names a record FOR THIS PERSON only when it is this person's. Every reader of
--     iam.memberships on the ladder's path filters `m.user_id = <the person>`: iam.has_access_for_base
--     (container_type = the node's type, role -> iam.membership_grant, deleted_at is null),
--     custom.scope_member_reaches (container_type 'scope', status 'active', deleted_at is null),
--     public._edu_can_read_via_assignment (the person's scope memberships, reached through an
--     association FROM the record, which is a naming row below anyway) and iam._reach_node_lanes
--     (deleted_at is null). Somebody else's membership on the record is read by none of them, so two
--     records that differ only by other people's memberships get the same answer, and the class key
--     carries this person's own live rows as (container_type/role/status, sorted) so two records on
--     which the person holds different memberships are never one class.
--  2. `s` = custom.has_visibility(person, 'record', id, 'viewer') is read off the rung: when
--     custom.effective_level answers null its halving asked the lowest rung (viewer) last and heard no;
--     when it answers viewer it asked viewer and heard yes; above viewer the ladder is monotone (the
--     halving already rests on it: "a yes at editor is a yes at viewer"), so viewer is yes.
--  3. The class memo rested on "every input the ladder reads about one record is a column of it or a
--     row naming it", and two inputs are neither: custom.confidential_answer reads the record's own
--     reader values when its Table is Confidential, and custom.reaches_directly reads
--     custom.containment_parent(data) — a `parent_id` inside the document. Such a record is now walked
--     on its own (its Table's `level`, read by the Table's key, and `jsonb_typeof(data -> 'parent_id')`),
--     which only ever narrows a class: a record walked alone gets exactly the ladder's answer.
--
-- Lane 9's figure after this file, measured on the clone with scripts/campaign-tests/chairreadperf_timing.ts,
-- is in common-docs/projects/data-doctrine-adoption/v6/ (CHAIR-READPERF).

CREATE OR REPLACE FUNCTION custom.levels_of(p_user_id uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- STORE-READ-PERF-2 (2026-09-25). THE RUNG, ONCE PER CLASS, FOR A SET OF RECORDS.
--
-- Answers, for each id, exactly what the one ladder answers about it for this person:
--   l = custom.effective_level(p_user_id, <its organization>, id)   (the rung the mask needs)
--   s = custom.has_visibility(p_user_id, 'record', id, 'viewer')   (the read door's own check)
-- as {"<id>": {"l": <level or null>, "s": <bool>}}.
--
-- WHY IT MAY ASK ONCE PER CLASS. Every input the ladder reads about ONE record is either a
-- column of that record — its organization, its Table, its `visibility`, whether it is live,
-- whether this person created it (`iam.owner_of` reads `created_by`), whether its document names
-- a parent, whether its Table is Confidential — or a row somewhere else that NAMES that record by
-- id: a grant (`iam.permissions`), a membership THIS PERSON holds on it (`iam.memberships`, record
-- or scope — nothing on the ladder reads anybody else's), a library grant
-- (`platform.entity_grants`), a closure row (`platform.reachability`), a carrying edge
-- (`custom.carrying_edges_of` arms 1a/1b/2a/2b/4 — every arm but the Table the record lives in),
-- or an assignment to a scope (`public._edu_can_read_via_assignment`). Everything else the ladder
-- reads — the organization's lanes and knobs, the Table's own grants and carrying, whether this
-- person is an admin, owns a record in the organization, or holds any grant anywhere — is the same
-- for every record that shares those columns. So two records with the same columns, the same own
-- memberships and NO other row naming either of them get the same answer at every rung, and the
-- ladder is asked once for the class.
--
-- A record that is NAMED by any such row, a row of the kernel Table (arm 4 of has_visibility
-- reads the Table's contents), a record with no Table, a record of a Confidential Table or with a
-- parent in its document (CHAIR-READPERF), an id that is not a record, and every record while
-- `record` has a registered FK containment parent (custom.visible_set's first stop) is asked on
-- its own, exactly as before. The class memo lives in this one call and nowhere else, so it can
-- never outlive the snapshot it was answered in.
--
-- SCOPES-HANDOFF-BUDGET (2026-09-28). An association that TARGETS the record names it only when it
-- is one of the carrying arms that read it from that side — arm 1a (an active association type
-- whose container is the SOURCE) and arm 2a (an active carrying rule of that role whose container
-- is the SOURCE) — exactly as the source-side test below has always matched arms 1b/2b/4. It used
-- to be ANY live association targeting the record, and every scope a transcript, an agent or a
-- workflow is tagged with carries a `context_tag` edge whose container is the scope itself (the
-- target side), so every scope of a type was walked on its own: 1,166 ladder walks for one type.
-- No other arm of the ladder reads an association that targets the record (visibility_ancestors
-- and addressed_cap read only custom.carrying_edges_of; has_access_for_base reads grants,
-- memberships and platform.reachability, each still a naming row here).
--
-- CHAIR-READPERF (2026-10-03). The person's OWN memberships on a record are part of its class key
-- (`mine` below: container_type/role/status of each live row, sorted), not a reason to walk it alone;
-- a scope names its members, and every scope of a type was a class of its own for a member of all
-- of them. `s` is read off the rung the halving found (null: viewer was asked and said no; viewer:
-- it was asked and said yes; above: the ladder is monotone, as the halving itself assumes).
declare
  v_out    jsonb := '{}'::jsonb;
  v_memo   jsonb := '{}'::jsonb;
  v_ks     text[] := array[]::text[];
  v_vs     jsonb[] := array[]::jsonb[];
  v_v      jsonb;
  v_fk     boolean;
  v_kernel uuid := custom.table_kernel_id();
  v_key    text;
  v_l      public.permission_level;
  v_s      boolean;
  r        record;
begin
  if p_user_id is null or p_ids is null or cardinality(p_ids) = 0 then
    return v_out;
  end if;

  v_fk := exists (select 1 from platform.entity_relationships er
                   where er.child_type = 'record' and er.kind in ('composition', 'containment'));

  for r in
    select u.id, x.organization_id, x.table_id, x.visibility, x.deleted_at is null as live,
           x.created_by is not distinct from p_user_id as own, x.id is not null as found,
           -- a Confidential Table's row and a row with a parent answer from their own document
           (t.data ->> 'level' = 'confidential') is true
             or jsonb_typeof(x.data -> 'parent_id') = 'string' as alone,
           -- this person's own live memberships on it, the only ones the ladder reads
           (select string_agg(m.container_type || '/' || coalesce(m.role, '') || '/' || coalesce(m.status, ''), ','
                              order by m.container_type, m.role, m.status)
              from iam.memberships m
             where m.container_type in ('record', 'scope') and m.container_id = u.id
               and m.user_id = p_user_id and m.deleted_at is null) as mine,
           ( exists (select 1 from iam.permissions p
                      where p.resource_type = 'record' and p.resource_id = u.id)
          or exists (select 1 from platform.entity_grants g
                      where g.entity_type = 'record' and g.entity_id = u.id)
          or exists (select 1 from platform.reachability rr
                      where rr.item_type = 'record' and rr.item_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.target_type = 'record' and a.target_id = u.id
                        and ( exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'source')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'source')))
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                        and ( a.target_type = 'scope'
                           or a.relation_field_id is not null and exists (
                                select 1 from custom.portal_table pt where pt.names_via_field_id = a.relation_field_id)
                           or exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'target')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'target'))) ) as named
      from (select distinct unnest(p_ids) as id) u
      left join custom.record x on x.id = u.id
      left join custom.record t on t.organization_id = x.organization_id and t.id = x.table_id
     where u.id is not null
  loop
    if not r.found or v_fk or r.table_id is null or r.table_id = v_kernel or r.named or r.alone then
      v_key := null;
    else
      v_key := r.organization_id::text || ':' || r.table_id::text || ':' || r.visibility::text || ':'
            || r.live::text || ':' || r.own::text || ':' || coalesce(r.mine, '');
    end if;

    if v_key is not null and v_memo ? v_key then
      v_ks := v_ks || r.id::text;
      v_vs := v_vs || (v_memo -> v_key);
      continue;
    end if;

    v_l := custom.effective_level(p_user_id, r.organization_id, r.id);
    v_s := v_l is not null;
    v_v := jsonb_build_object('l', v_l, 's', v_s);
    v_ks := v_ks || r.id::text;
    v_vs := v_vs || v_v;
    if v_key is not null then
      v_memo := v_memo || jsonb_build_object(v_key, v_v);
    end if;
  end loop;
  -- SCOPES-HANDOFF-BUDGET: the answers are gathered in two arrays and made one object at the end
  -- (appending to a jsonb object copies it whole, so a set of n ids cost n^2 bytes).
  select coalesce(jsonb_object_agg(k.k, k.v), '{}'::jsonb) into v_out
    from unnest(v_ks, v_vs) as k(k, v);
  return v_out;
end;
$function$;
