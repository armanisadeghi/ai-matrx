-- target: branch,production
-- additive: yes
--   It REPLACES one function body, custom.carrying_edges_in(uuid), with the same signature,
--   security (DEFINER), volatility (STABLE), search_path and grants. No table, column, trigger,
--   policy, grant or door row is touched; no row is written.
-- guard: custom/system_enabled
-- lane: CARRYING-EDGES-PERF
-- lock: custom
-- based-on: custom.carrying_edges_in(uuid) 4b4e40a753ab9e5455d5ea18325578dd8cecb1ecd01d3b1887f3513ba185bd7a
--
-- CARRYING-EDGES-PERF — A RECORD WALK READS ONLY THE EDGES THAT CAN REACH A RECORD.
--
-- THE REGRESSION (measured on production, 2026-09-27). At 10:32–10:33Z association-type rows made
-- scopes and records carrying CONTAINERS of workflows, scheduled tasks, transcripts, agents, apps,
-- message templates and canvas items, and ~21.5k associations were written 10:00–13:00Z. The edge
-- set of admin's Workspace went from under a thousand to 4,061 edges, and every one of the new ones
-- has a NON-record item. `custom.carrying_edges_in` read all 29,409 associations of the
-- organization, twice, to build it: ~40 ms per call inside the database, 115–190 ms as a call.
-- Its two callers ask it again for every Table row the ladder judges (arm 4 of
-- custom.has_visibility -> custom.table_has_a_visible_record) and for every (member, Table) the read
-- door plans (custom.visible_set -> custom.read_door_carried_ids). One member's read-door plans
-- over the organization's 60 Tables took 5.5 s, 3.6 s of it this function (109 calls); census 12
-- of check:store-doors-decide went from 53–62 s to past its 9-minute budget.
--
-- WHY THE PRUNE IS EXACT. Both callers ask about RECORDS only:
--   * custom.table_has_a_visible_record keeps edges whose item is a record;
--   * custom.read_door_carried_ids climbs UP from edges whose item is a record, through edges whose
--     item is the container just reached, and walks DOWN from an admitted container, keeping only
--     the records it ends at.
-- Every edge either walk can use therefore has an item that IS a record or that is itself a
-- container on a path down to a record. So this body first works out, from the rules, the types
-- that can be such a container — `reach`: `record`, plus every container type of a rule (or of a
-- live `custom.carrying_rule` edge of this organization, whose types are the rows' own) whose item
-- type is already in `reach`, to a fixpoint — and returns exactly the edges whose item type is in
-- it. An edge left out leads only to nodes from which no record can be reached: it can never add a
-- container to UP (so `o_containers` and the ladder ceiling are unchanged), never add a record to
-- DOWN, and never be the only way round a cycle guard (the guards are per path). Arm 3, the
-- portal's naming Field, is record-to-record and is kept whole.
--   Over-approximating `reach` (a rule no live edge uses) only keeps more edges — still exact.
-- Today `reach` is {record}: no association-type rule carries a record, so arm 1 contributes no
-- edge a record walk can use, and 4,061 edges become 68.
--
-- AND IT STARTS FROM THE RULES. Arm 1 joins the active rules whose item type is in `reach` to
-- `idx_assoc_org_pair_live (organization_id, source_type, target_type)`; arm 2 joins the active
-- carrying rules to `idx_assoc_org_role_live (organization_id, role)` — both built by the sibling
-- file `carryingedgesperf_the_carrying_edges_have_their_indexes.sql`, applied first. Without them
-- this body is still exact, only as slow as the one it replaces.
--
-- PROOF: scripts/campaign-tests/carryingedgesperf_green.sql (the STORE-READ-PERF-2 parity
-- harness: every door answer byte-identical before and after on the fixture and live data, the
-- walks' own answers for every member and Table of every shared_only organization, and a plant
-- that prunes to record items only goes red).

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.carrying_edges_in(p_organization_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, item_type text, item_id uuid, conveys_max permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- THE CARRYING EDGES OF ONE ORGANIZATION THAT A RECORD WALK CAN USE (CARRYING-EDGES-PERF,
-- 2026-09-27): every edge whose item is a record, or is a container on some path down to a record.
-- An edge whose item can never lead to a record is left out — both callers walk to records only,
-- so no answer of theirs can depend on it. See the campaign file for the argument.
begin
  return query
    with recursive
    -- arm 2's edges, once: the rule is a ROLE, so the types are the rows' own
    e2 as materialized (
      select case when cr.container_side = 'source' then a.source_type else a.target_type end as c_type,
             case when cr.container_side = 'source' then a.source_id   else a.target_id   end as c_id,
             case when cr.container_side = 'source' then a.target_type else a.source_type end as i_type,
             case when cr.container_side = 'source' then a.target_id   else a.source_id   end as i_id,
             cr.conveys_max as c_max
        from custom.carrying_rule cr
        -- one index probe per rule (idx_assoc_org_role_live), the organization's rows and the
        -- organization-less ones; never the organization's whole association set
        cross join lateral (
          select x.source_type, x.source_id, x.target_type, x.target_id
            from platform.associations x
           where x.organization_id = p_organization_id and x.role = cr.role and x.deleted_at is null
          union all
          select x.source_type, x.source_id, x.target_type, x.target_id
            from platform.associations x
           where x.organization_id is null and x.role = cr.role and x.deleted_at is null
        ) a
       where cr.is_active
    ),
    -- arm 1's rules, with the side each one names as the container
    r1 as materialized (
      select r.source_type, r.target_type, r.label, r.container_side, r.conveys_max,
             case when r.container_side = 'source' then r.source_type else r.target_type end as ct,
             case when r.container_side = 'source' then r.target_type else r.source_type end as it
        from platform.association_types r
       where r.is_active
         and r.container_side = any (array['source', 'target'])
    ),
    pairs as (
      select r1.ct, r1.it from r1
      union
      select e2.c_type, e2.i_type from e2
    ),
    -- the types that are a record, or can contain one at any depth
    reach (t) as (
      select 'record'::text
      union
      select p.ct from pairs p join reach on p.it = reach.t
    )
    -- arm 1 — platform.containment_edges, from the rules whose item can lead to a record
    select case when r.container_side = 'source' then a.source_type else a.target_type end,
           case when r.container_side = 'source' then a.source_id   else a.target_id   end,
           case when r.container_side = 'source' then a.target_type else a.source_type end,
           case when r.container_side = 'source' then a.target_id   else a.source_id   end,
           r.conveys_max
      from r1 r
      -- one index probe per rule (idx_assoc_org_pair_live), and only for a rule whose item can
      -- lead to a record
      cross join lateral (
        select x.source_type, x.source_id, x.target_type, x.target_id
          from platform.associations x
         where x.organization_id = p_organization_id
           and x.source_type = r.source_type and x.target_type = r.target_type
           and (r.label is null or r.label = x.label) and x.deleted_at is null
        union all
        select x.source_type, x.source_id, x.target_type, x.target_id
          from platform.associations x
         where x.organization_id is null
           and x.source_type = r.source_type and x.target_type = r.target_type
           and (r.label is null or r.label = x.label) and x.deleted_at is null
      ) a
     where r.it in (select reach.t from reach)
    union
    -- arm 2 — the custom.carrying_rule arm of custom.carrying_edges
    select e2.c_type, e2.c_id, e2.i_type, e2.i_id, e2.c_max
      from e2
     where e2.i_type in (select reach.t from reach)
    union
    -- arm 3 — A PORTAL'S NAMING FIELD (PORTAL, 2026-09-20). The record the Field points at is
    -- the container; the record holding the Field is the item. This is what makes "only theirs"
    -- answerable without a per-portal query: an outsider holding her own client record reaches
    -- exactly the records that name it, at the level the portal declared, through the same
    -- ladder as everything else on this platform.
    select 'record'::text, a.target_id, 'record'::text, a.source_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null
       and a.organization_id = p_organization_id
       and pt.organization_id = p_organization_id
       and a.source_type = 'record'
       and a.target_type = 'record';
end
$function$;
