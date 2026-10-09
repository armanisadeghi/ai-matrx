-- chair-step: undo hotdoors7_b - restores custom.data_home_changed_by as before HOT-DOORS-7 (one custom.hub_changed_by per ask) and drops custom.hub_changed_by_many and its door row. Run AFTER the inverse of hotdoors7_c, BEFORE the inverse of hotdoors7_a.
-- lane: HOT-DOORS-7
-- ground-standing-ok: c — iam._memo_ask's 'hub' kind calls custom.data_home_changed_by only (never the dropped function); inverse c runs first anyway
-- based-on: custom.data_home_changed_by(jsonb) 729be76c102a209e3439bfacb2e2e4459753b9c73de391b18389a510ab4a6e2e
-- based-on: custom.hub_changed_by_many(jsonb, text) 0b9f1fa423e22b056fc5982ec1590c6a5367fff4711ebfa15fd38329674b9d1f

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.data_home_changed_by(p_asks jsonb)
 RETURNS TABLE(organization_id uuid, id uuid, at timestamp with time zone, who text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ask jsonb;
  v_org uuid;
  v_pre jsonb;  -- PERF-FIX-4
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
    -- PERF-FIX-4 d: only `s` (the viewer answer) is read from this. For an id exactly one row carries, of a
    -- Table that is not the Table kernel, that answer is custom.reaches_directly at viewer (custom._seen_one's
    -- own rule: the ladder's fourth arm is asked only of Table-kernel rows), asked here in ONE set call;
    -- every other id is asked of custom.levels_of, as before.
    with ids as materialized (
      select distinct z.id from unnest(array(
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
                                     and r.table_id is distinct from custom.table_kernel_id())) z(id)
    ), one as materialized (
      select i.id,
             (select count(*) = 1 and min(r.table_id::text)::uuid is distinct from custom.table_kernel_id()
                from custom.record r where r.id = i.id) as single
        from ids i
    ), direct as materialized (
      select m.target as id, jsonb_build_object('s', coalesce(m.reaches, false)) as v
        from custom.reaches_directly_many(custom.query_principal(),
               array(select o.id from one o where o.single), 'record', 'viewer'::public.permission_level) m
    )
    select coalesce((select jsonb_object_agg(d.id::text, d.v) from direct d), '{}'::jsonb)
        || custom.levels_of(custom.query_principal(), array(select o.id from one o where not o.single))
      into v_pre;
    perform platform.memo_k_put('custom.hub_levels:' || custom.query_principal()::text || ':'
                                || pg_catalog.pg_current_snapshot()::text, v_pre::text);
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

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'hub_changed_by_many';
drop function if exists custom.hub_changed_by_many(jsonb, text);
