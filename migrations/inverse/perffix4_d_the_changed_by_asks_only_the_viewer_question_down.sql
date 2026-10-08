-- chair-step: undo perffix4_d_the_changed_by_asks_only_the_viewer_question.sql - restores custom.data_home_changed_by exactly as perffix4_a left it
-- lane: PERF-FIX-4
-- based-on: custom.data_home_changed_by(jsonb) b576c0fdb4e5bf0be96157b559b415b9f528c9caf8f2b9892698c480308f6b73

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
