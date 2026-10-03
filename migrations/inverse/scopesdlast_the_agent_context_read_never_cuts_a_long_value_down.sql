-- chair-step: the inverse of scopesdlast_the_agent_context_read_never_cuts_a_long_value.sql — restores the body of public.get_scope_context as it stood on production and the clone 2026-10-02 (pg_get_functiondef, byte for byte). Body replacement only; signature, security, search_path and grants unchanged.
-- lane: SCOPES-ON-THE-STORE
-- based-on: public.get_scope_context(uuid, uuid[], boolean) eb661e3e86b194bf9e5e15d347ff908da7bdf69af4af09c2604b94bd31a31d45
-- lock: custom

CREATE OR REPLACE FUNCTION public.get_scope_context(p_scope_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[], p_include_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope  custom.record;
  v_result jsonb;
  v_levels jsonb;
begin
  -- THE SWITCH (custom/scope_readers_read_the_store, OFF): until the owner flips it the old tables answer.
  if not coalesce((platform.knob_resolve('custom', 'scope_readers_read_the_store', null) #>> '{}')::boolean, false) then
    return context.get_scope_context_from_the_image(p_scope_id, p_item_ids, p_include_empty);
  end if;
  -- SCOPES-READS-TREE: the scope is a Record of a live scope Table; its values are the Record's.
  select r.* into v_scope
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.id = p_scope_id
     and r.deleted_at is null
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
     and t.data ->> 'kept_for' = 'context';

  if v_scope.id is null then
    return '{}'::jsonb;
  end if;

  -- THE MEMBRANE: the store's own two questions, as custom.read_record asks them — the
  -- organization's wall, then the one ladder.
  if auth.role() is distinct from 'service_role' then
    begin
      perform custom.assert_client_may_reach(v_scope.organization_id, 'public.get_scope_context');
      v_levels := custom.levels_of(auth.uid(), array[p_scope_id]);
    exception when insufficient_privilege or null_value_not_allowed then
      v_levels := '{}'::jsonb;
    end;
    if not coalesce((v_levels -> (p_scope_id::text) ->> 's')::boolean, false) then
      raise exception '%', format('You do not have access to "%s". Ask someone who can already open it to share it with you.',
                                  v_scope.data ->> 'name')
        using errcode = '42501';
    end if;
  end if;

  select jsonb_agg(x.cell order by x.srt, x.label, x.fid)
    into v_result
    from (
      select f.id as fid, coalesce(nullif(f.data ->> 'sort', '')::int, 0) as srt, f.data ->> 'label' as label,
             case when p_include_empty then
               (i - 'id' - 'status' - 'tags')
               || jsonb_build_object('item_id', f.id,
                    'has_value', v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null')
               || custom.scope_value_columns(v_scope.organization_id, f.data, i ->> 'value_type', v_scope.data -> (f.data ->> 'key'))
               || jsonb_build_object(
                    'version', case when v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'
                                    then to_jsonb(coalesce(nullif(v_scope.data -> '_values' -> (f.data ->> 'key') ->> 'ver', '')::int, 1)) end,
                    'updated_at', case when v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'
                                       then v_scope.data -> '_values' -> (f.data ->> 'key') -> 'at' end)
             else
               jsonb_build_object('item_id', f.id, 'key', i -> 'key', 'slug', i -> 'slug', 'display_name', i -> 'display_name',
                                  'value_type', i -> 'value_type', 'custom_component', i -> 'custom_component',
                                  'allowed_reference_types', i -> 'allowed_reference_types', 'max_items', i -> 'max_items',
                                  'allowed_scope_type_ids', i -> 'allowed_scope_type_ids', 'reference_source', i -> 'reference_source')
               || custom.scope_value_columns(v_scope.organization_id, f.data, i ->> 'value_type', v_scope.data -> (f.data ->> 'key'))
             end as cell
        from custom.scope_items_of(v_scope.organization_id, v_scope.table_id) f
        cross join lateral (select custom.scope_item_row_of(f) as i) j
       where (p_item_ids is null or f.id = any (p_item_ids))
         and (p_include_empty
              or (v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'))
    ) x;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;
