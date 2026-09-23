-- lock: custom
-- lane: ARGS-RULED-2
-- based-on: custom.hub_changed_by(uuid, text, uuid[]) 8b9e43135e6596c57a37a3a6e484f3b18beedc6e4a53ae1bc111e64bc709e415
--
-- ARGS-RULED-2 — `custom.hub_changed_by` DESCRIBES ONLY WHAT THE CALLER MAY OPEN.
--
-- The hub decorates each structure, form and portal with "changed <when> by <whom>". Its
-- `form` arm narrows the ids it is handed through `custom.query_visible_ids`; its `structure`
-- and `portal` arms narrowed by ORGANIZATION ONLY. MEASURED 2026-09-22 on the MAIN database,
-- in an organization whose data store is set to `member_default_visibility = shared_only`:
-- `custom.read_record` refused a member a colleague's Table (42501) and `hub_changed_by`
-- returned that same Table's last-changed time and the NAME of the person who changed it.
-- Across organizations the door was always clean (the organization wall and the
-- `organization_id` predicate); this is the half inside one.
--
-- THE FIX asks the same question the store's read door asks: a structure row survives only
-- when `custom.has_visibility(caller, 'record', id, viewer)`; a portal only when its client
-- Table is in the caller's visible set — the form arm's own expression. The server lane
-- (`custom.query_is_store_owner()`) is unchanged.
--
-- Seat suite: scripts/campaign-tests/argsruled2_holes_green.sql clauses 2, 3a; red twin
-- scripts/campaign-tests/argsruled2_holes_red.sql. Inverse:
-- migrations/inverse/argsruled2_the_hub_describes_only_what_you_may_open_down.sql.

set lock_timeout = '4s';

create or replace function custom.hub_changed_by(p_organization_id uuid, p_kind text, p_ids uuid[])
 RETURNS TABLE(id uuid, at timestamp with time zone, who text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ids    uuid[] := coalesce(p_ids, array[]::uuid[]);
  v_people jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.hub_changed_by');

  if p_kind not in ('structure', 'form', 'portal') then
    raise exception 'custom.hub_changed_by does not know the kind %', coalesce(p_kind, '(null)')
      using errcode = '22023',
            hint = 'The kinds are: structure (a Table, dashboard, rule, checklist or work '
                   'template), form (a form, booking page or capture sheet) and portal.';
  end if;

  if array_length(v_ids, 1) is null then
    return;
  end if;
  if array_length(v_ids, 1) > 500 then
    raise exception 'custom.hub_changed_by was asked about % things at once', array_length(v_ids, 1)
      using errcode = '54000',
            hint = 'Ask about at most 500 at a time — that is one page of a hub, and more '
                   'than a person reads.';
  end if;

  if p_kind = 'structure' then
    return query
      with people as (
        select custom.history_people(
                 p_organization_id,
                 array(select distinct coalesce(r.updated_by, r.created_by)
                         from custom.record r
                        where r.organization_id = p_organization_id
                          and r.id = any (v_ids)
                          and coalesce(r.updated_by, r.created_by) is not null)) as m
      )
      select r.id,
             coalesce(r.updated_at, r.created_at),
             people.m #>> array[coalesce(r.updated_by, r.created_by)::text, 'name']
        from custom.record r cross join people
       where r.organization_id = p_organization_id
         and r.id = any (v_ids)
         -- THE BOUND. A person's own business row is never answered here.
         and coalesce(r.data_class, 'record') <> 'record'
         -- AND THE LADDER (ARGS-RULED-2, 2026-09-22). A structure the caller may not open is
         -- a structure this door does not describe — not when it last changed, not who changed
         -- it. Until this line the arm narrowed by organization only, so in an organization set
         -- to "only what is shared" a member was told who last edited a colleague's private
         -- Table that custom.read_record refuses her. The form arm below always asked.
         and (custom.query_is_store_owner()
              or custom.has_visibility(custom.query_principal(), 'record', r.id,
                                       'viewer'::public.permission_level));

  elsif p_kind = 'form' then
    return query
      with people as (
        select custom.history_people(
                 p_organization_id,
                 array(select distinct coalesce(f.updated_by, f.created_by)
                         from custom.anon_form f
                        where f.organization_id = p_organization_id
                          and f.id = any (v_ids)
                          and coalesce(f.updated_by, f.created_by) is not null)) as m
      )
      select f.id,
             coalesce(f.updated_at, f.created_at),
             people.m #>> array[coalesce(f.updated_by, f.created_by)::text, 'name']
        from custom.anon_form f cross join people
       where f.organization_id = p_organization_id
         and f.id = any (v_ids)
         and f.table_id in (select v from custom.query_visible_ids(p_organization_id,
                                                                   custom.table_kernel_id()) v);

  else
    return query
      with people as (
        select custom.history_people(
                 p_organization_id,
                 array(select distinct p.created_by
                         from custom.portal p
                        where p.organization_id = p_organization_id
                          and p.id = any (v_ids)
                          and p.created_by is not null)) as m
      )
      select p.id,
             p.created_at,
             people.m #>> array[p.created_by::text, 'name']
        from custom.portal p cross join people
       where p.organization_id = p_organization_id
         and p.id = any (v_ids)
         -- A portal is described only to somebody who may see the Table its clients live in —
         -- the same set the form arm asks, for the same reason (ARGS-RULED-2).
         and (custom.query_is_store_owner()
              or p.client_table_id in (select v from custom.query_visible_ids(p_organization_id,
                                                                            custom.table_kernel_id()) v));
  end if;
end;
$function$
;
