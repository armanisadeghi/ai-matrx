-- chair-step: public.list_context_value_refs reads the references from the store. Since 2026-10-05 05:50:37Z the value door writes no context.context_value_refs row, so a reference saved since was not found. ADDS custom._ctx_value_refs_of (what a stored value points at: a text fence read the old indexer's way, a reference column's scope ids / {token,id} / File Records' file ids; no client grant). REPLACES public.list_context_value_refs (every current value of a scope Record, matched by that reading; _scope_readable as before). Same answer, rolled back on live, every (ref_type, ref_key) the old index held + table/dataset twins + one unknown, admin and test@test.com: 30/31 rows identical; the one gone is a team_members reference the store value no longer holds (rewritten 2026-09-28 19:55 after the old row). created_at is now when the current value was set in the store (the old value row's own time is not kept there). Guard scripts/campaign-tests/scopesfts1e_a_new_reference_is_found_by_what_it_points_at_red_green.sql RED (R1/R2 []) then GREEN.
-- lane: FINISH-THE-SWITCH (FTS-1e, scopes finish, item 1)
-- based-on: public.list_context_value_refs(text, text) e503ef3411598442d7b79470395b08fe1960b1929a6cf601ffb61b7889ea2a6e
-- lock: custom
--
-- Inverse: migrations/inverse/scopesfts1e_value_references_are_read_from_the_store_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy asks which records point at "Knee Clinic North"; Dr. Maya Ellison's
-- home clinic, saved today, is in the answer.

CREATE OR REPLACE FUNCTION custom._ctx_value_refs_of(p_org uuid, p_value jsonb, p_field jsonb)
 RETURNS TABLE(ref_type text, ref_key text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- WHAT A STORED CONTEXT VALUE POINTS AT (FTS-1e): the old indexer's reading (context.index_reference_value),
  -- asked of the value the scope's Record holds.
  -- A fence kept as text (any field): the old indexer's own words — its type, each item's key.
  select s.env ->> 'type', context.reference_item_ref_key(s.env ->> 'type', it)
    from (select context.parse_reference_fence(p_value #>> '{}') as env where jsonb_typeof(p_value) = 'string') s
   cross join lateral jsonb_array_elements(case when jsonb_typeof(s.env -> 'items') = 'array' then s.env -> 'items' else '[]'::jsonb end) it
   where context.reference_item_ref_key(s.env ->> 'type', it) is not null
  union all
  -- A reference column (custom._ctx_value_of's three shapes): a File column holds File Records (the old fence
  -- named the file, which the File Record carries as data.file_id); a typed column holds {token, id}; a scope
  -- column holds the scope ids.
  select case when p_field ->> 'relation_target' = '11111111-0000-4000-8000-000000000006' then 'file'
              when jsonb_typeof(e) = 'object' then e ->> 'token'
              else 'scope' end,
         case when p_field ->> 'relation_target' = '11111111-0000-4000-8000-000000000006'
                then coalesce((select x.data ->> 'file_id' from custom.record x
                                where x.organization_id = p_org and x.id::text = e #>> '{}'), e #>> '{}')
              when jsonb_typeof(e) = 'object' then e ->> 'id'
              else e #>> '{}' end
    from jsonb_array_elements(case when p_field ->> 'type' = 'relation' then
                                case jsonb_typeof(p_value) when 'array' then p_value
                                                           when 'string' then jsonb_build_array(p_value)
                                                           else '[]'::jsonb end
                              else '[]'::jsonb end) e
   where (jsonb_typeof(e) = 'object' and e ->> 'id' is not null)
      or (jsonb_typeof(e) = 'string' and context.parse_reference_fence(e #>> '{}') is null)
$function$;
revoke all on function custom._ctx_value_refs_of(uuid, jsonb, jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_context_value_refs(p_ref_type text, p_ref_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_result jsonb; v_keys text[];
BEGIN
  IF v_uid IS NULL OR p_ref_type IS NULL OR p_ref_key IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- THE STORE IS THE INDEX (FTS-1e): every current value a scope's Record holds whose reference points at
  -- (p_ref_type, p_ref_key), read by custom._ctx_value_refs_of. A File column holds File Records, so a file is
  -- also looked for by the Records that carry it. A table reference is kept as 'dataset' by the store.
  v_keys := array[p_ref_key];
  IF p_ref_type = 'file' THEN
    v_keys := v_keys || coalesce((select array_agg(x.id::text) from custom.record x
                                   where x.table_id = '11111111-0000-4000-8000-000000000006'::uuid
                                     and x.data ->> 'file_id' = p_ref_key), '{}'::text[]);
  END IF;

  WITH r AS MATERIALIZED (
    select r.id, r.organization_id, r.table_id, r.data, r.updated_at
      from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
     where r.data_class = 'record'
       and exists (select 1 from unnest(v_keys) kk where strpos(r.data::text, kk) > 0)
  ), c AS MATERIALIZED (
    select r.*, f.id as fid, f.data as fdata, f.data ->> 'key' as k
      from r
      join custom.record f on f.organization_id = r.organization_id and f.table_id = custom.field_kernel_id()
                          and f.data ->> 'entity_definition_id' = r.table_id::text
                          and substr(f.id::text, 15, 1) <> '5'
     where coalesce(jsonb_typeof(r.data -> (f.data ->> 'key')), 'null') <> 'null'
       and exists (select 1 from custom._ctx_value_refs_of(r.organization_id, r.data -> (f.data ->> 'key'), f.data) x
                    where x.ref_key = p_ref_key
                      and (x.ref_type = p_ref_type
                           or (x.ref_type = 'dataset' and p_ref_type in ('table', 'dataset'))))
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'scope_id', c.id, 'scope_name', c.data ->> 'name', 'scope_type_id', c.table_id,
      'organization_id', c.organization_id,
      'context_item_id', c.fid, 'item_key', c.k, 'item_display_name', c.fdata ->> 'label',
      'value_id', (c.data -> '_sources' -> (c.data -> '_values' -> c.k ->> 'src') ->> 'old_value_id')::uuid,
      'is_current', true,
      'created_at', coalesce((c.data -> '_values' -> c.k ->> 'at')::timestamptz, c.updated_at)
    )
  ) INTO v_result
  FROM c
  WHERE context._scope_readable(c.id, 'viewer');

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;
