-- lane: PERF-FIX-4
-- based-on: custom.hub_changed_by(uuid, text, uuid[]) d366b28ae13fcdb4236ed23302a08c419960aae1b7581448cebc75ba526dc961
-- based-on: custom.data_home_changed_by(jsonb) 25f15ef76def22977b007606dc1af23900b630ddf36d24d448a5604a8a81f149
--
-- PERF-FIX-4 (2026-10-07). Who changed each row: the ladder is asked once for the page, not once per organization.
--   custom.hub_changed_by (structure arm) asked custom.levels_of about its organization's dashboards, digests,
--   checklists and boards: one levels_of call per organization the home lists (17 for admin@admin.com, 19 for
--   test@test.com), each paying levels_of's and the set kernel's fixed cost (~1.0-1.2 s of a 2.7-3.5 s data_home
--   under the signed-in role). custom.data_home_changed_by now asks levels_of ONCE for every such id of every
--   organization in its asks and leaves the answer in the statement memo; hub_changed_by reads it when the memo
--   holds every id it needs, else asks as before. levels_of answers each id on its own (its class key starts with
--   the row's organization), so the answer per id is the same whichever ids are asked beside it.
--   Session switch for proofs and revert of the read path: set_config('mx.data_home_set', 'off', true).
-- Function bodies only: any hour.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.hub_changed_by(p_organization_id uuid, p_kind text, p_ids uuid[])
 RETURNS TABLE(id uuid, at timestamp with time zone, who text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ids    uuid[] := coalesce(p_ids, array[]::uuid[]);
  v_people jsonb;
  v_set    record;
  -- STORE-READ-PERF-4: asked once per call, not once per row.
  v_owner  boolean := custom.query_is_store_owner();
  v_levels jsonb := '{}'::jsonb;
  v_need   uuid[];  -- PERF-FIX-4
  v_pre    jsonb;   -- PERF-FIX-4
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
    -- STORE-READ-PERF-3: the organization's Tables are answered together, by custom.visible_set's
    -- Table-kernel answer (custom.has_visibility about every live Table, asked once per group of
    -- look-alike Tables); any other id, and every id when that answer stops, is asked on its own.
    if exists (select 1 from custom.record t
                where t.organization_id = p_organization_id and t.id = any (v_ids)
                  and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
      v_set := custom.visible_set(custom.query_principal(), p_organization_id, custom.table_kernel_id(),
                                  'viewer'::public.permission_level);
    else
      select true as o_fallback, '{}'::uuid[] as o_carried_visible into v_set;
    end if;
    -- STORE-READ-PERF-4: every other id (a dashboard, rule, checklist or template) is answered by the
    -- same ladder through custom.levels_of, all of them in one call (once per class of records the
    -- ladder cannot tell apart; its 's' is exactly custom.has_visibility at viewer).
    if not v_owner then
      v_need := array(
                    select r.id from custom.record r
                     where r.organization_id = p_organization_id and r.id = any (v_ids)
                       and coalesce(r.data_class, 'record') <> 'record'
                       -- only rows levels_of can answer by class (a row of a Table that is not the
                       -- Table kernel); every other id is asked on its own, as before
                       and r.table_id is not null
                       and r.table_id is distinct from custom.table_kernel_id());
      -- PERF-FIX-4 (2026-10-07): custom.data_home_changed_by asks custom.levels_of ONCE for these ids of
      -- every organization it is asked about and leaves the answer in the statement memo; when every id
      -- needed here is in it, the answer is read from there. levels_of answers each id on its own (its
      -- class key starts with the row's organization; a class shares one answer), so the answer about an
      -- id never depends on which other ids were asked beside it. Otherwise (asked directly, a partial
      -- memo, a transaction that has written, or mx.data_home_set = off) it is asked here, as before.
      if pg_catalog.pg_current_xact_id_if_assigned() is null
         and coalesce(current_setting('mx.data_home_set', true), '') <> 'off' then
        v_pre := platform.memo_k_get('custom.hub_levels:' || coalesce(custom.query_principal()::text, '-') || ':'
                                     || pg_catalog.pg_current_snapshot()::text)::jsonb;
      end if;
      if v_pre is not null and v_pre ?& v_need::text[] then
        select coalesce(jsonb_object_agg(k.k, v_pre -> k.k), '{}'::jsonb) into v_levels
          from unnest(v_need::text[]) as k(k);
      else
        v_levels := custom.levels_of(custom.query_principal(), v_need);
      end if;
    end if;
    return query
      with people as materialized (
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
         and (v_owner
              or case
                   when not v_set.o_fallback
                        and r.table_id = custom.table_kernel_id() and r.deleted_at is null
                     then r.id = any (v_set.o_carried_visible)
                   when v_levels ? r.id::text
                     then coalesce((v_levels -> r.id::text ->> 's')::boolean, false)
                   else custom.has_visibility(custom.query_principal(), 'record', r.id,
                                              'viewer'::public.permission_level)
                 end);

  elsif p_kind = 'form' then
    return query
      with people as materialized (
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
      with people as materialized (
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
         and (v_owner
              or p.client_table_id in (select v from custom.query_visible_ids(p_organization_id,
                                                                            custom.table_kernel_id()) v));
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.data_home_changed_by(p_asks jsonb)
 RETURNS TABLE(organization_id uuid, id uuid, at timestamp with time zone, who text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ask jsonb;
  v_org uuid;
begin
  -- WHO CHANGED EACH ROW, FOR EVERY ORGANIZATION THE HOME SHOWS, IN ONE CALL (lane DATA-HOME-2).
  -- p_asks = [{"organization_id": …, "kind": "structure"|"form"|"portal", "ids": [...]}, …].
  -- Each organization is decided HERE, in this door's own name, before custom.hub_changed_by —
  -- the store's own answer — is asked about it.
  if p_asks is null or jsonb_typeof(p_asks) <> 'array' then
    raise exception 'custom.data_home_changed_by takes a list of asks, one per organization and kind'
      using errcode = '22023',
            hint = 'Send [{"organization_id": "<uuid>", "kind": "structure", "ids": ["<uuid>", ...]}].';
  end if;
  if jsonb_array_length(p_asks) > 200 then
    raise exception 'custom.data_home_changed_by was asked % things at once', jsonb_array_length(p_asks)
      using errcode = '54000', hint = 'Ask about at most 200 (organization, kind) pairs at a time.';
  end if;
  -- STORE-READ-PERF-3 (2026-09-28): one walk for every organization asked (see
  -- custom.tables_seen_once_per_group); each custom.hub_changed_by below reads its organization's
  -- part from this statement's memo. It decides nothing: every organization is still decided in
  -- this door's name below, and without it every answer is the same, only slower.
  -- DATA-HOME-2 (2026-09-29): an organization whose answer is already in THIS statement's memo is
  -- not walked again — custom.data_home asks once for the whole page and then calls this door.
  perform count(*)
     from custom.tables_seen_once_per_group(custom.query_principal(), array(
            select distinct (e ->> 'organization_id')::uuid
              from jsonb_array_elements(p_asks) e
             where e ->> 'kind' in ('structure', 'form', 'portal')
               and (e ->> 'organization_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               and exists (select 1 from iam.organization_member m
                            where m.organization_id = (e ->> 'organization_id')::uuid
                              and m.user_id = custom.query_principal())
               -- PERF-FIX-2: the key the walk writes ends in the snapshot; without it this never matched
               and platform.memo_k_get('custom.tables_seen:' || custom.query_principal()::text || ':'
                                       || (e ->> 'organization_id') || ':' || pg_catalog.pg_current_snapshot()::text) is null));
  -- PERF-FIX-4 (2026-10-07): the ladder's answer about every structure id the asks name that
  -- custom.hub_changed_by would hand to custom.levels_of (a row that is not a business row, of a Table
  -- other than the Table kernel), asked ONCE for all the organizations together instead of once per
  -- organization, and left in the statement memo for custom.hub_changed_by to read (only while the
  -- transaction has written nothing - the memo's own rule; mx.data_home_set = off skips it). It decides
  -- nothing: hub_changed_by still decides every organization in its own name, and reads an id from here
  -- only when the memo holds every id it needs.
  if pg_catalog.pg_current_xact_id_if_assigned() is null
     and coalesce(current_setting('mx.data_home_set', true), '') <> 'off'
     and custom.query_principal() is not null
     and not custom.query_is_store_owner() then
    perform platform.memo_k_put('custom.hub_levels:' || custom.query_principal()::text || ':'
                                || pg_catalog.pg_current_snapshot()::text,
                                custom.levels_of(custom.query_principal(), array(
                                  with a as materialized (
                                    select (e ->> 'organization_id')::uuid as org, (i #>> '{}')::uuid as id
                                      from jsonb_array_elements(p_asks) e
                                      cross join lateral jsonb_array_elements(
                                        case when jsonb_typeof(e -> 'ids') = 'array' then e -> 'ids' else '[]'::jsonb end) i
                                     where jsonb_typeof(e) = 'object'
                                       and e ->> 'kind' = 'structure'
                                       and (e ->> 'organization_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                       and jsonb_typeof(i) = 'string'
                                       and (i #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                  )
                                  select distinct r.id
                                    from a
                                    join custom.record r on r.organization_id = a.org and r.id = a.id
                                   where coalesce(r.data_class, 'record') <> 'record'
                                     and r.table_id is not null
                                     and r.table_id is distinct from custom.table_kernel_id()))::text);
  end if;
  for v_ask in select * from jsonb_array_elements(p_asks) loop
    v_org := (v_ask ->> 'organization_id')::uuid;
    perform custom.assert_client_may_reach(v_org, 'custom.data_home_changed_by');
    return query
      select v_org, c.id, c.at, c.who
        from custom.hub_changed_by(
               v_org,
               v_ask ->> 'kind',
               array(select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(v_ask -> 'ids', '[]'::jsonb)) e)) c;
  end loop;
end;
$function$
;
