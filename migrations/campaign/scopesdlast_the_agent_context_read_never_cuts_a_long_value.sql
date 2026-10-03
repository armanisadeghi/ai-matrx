-- chair-step: it REPLACES the body of one lane-9 scope door, public.get_scope_context (signature, SECURITY DEFINER, search_path and grants unchanged). Additive only: on the store path (custom/scope_readers_read_the_store on) a text cell of a value kept as a file is the first words with the file NAMED plus a `whole_value` key (expand → the store's client hands the whole text), exactly as custom.resolve_context and custom.context_resolve hand it; a text still waiting for its file is answered whole from custom.whole_value_parked. Every other cell, and the whole old-tables path (switch off), is the same. No table, index, policy, grant or data row is touched.
-- lane: SCOPES-ON-THE-STORE
-- based-on: public.get_scope_context(uuid, uuid[], boolean) 45684a2bb47cce4151c0c7b00983b6f222f2d0174dbef614dfcf5676841900d5
-- lock: custom
--
-- Inverse: migrations/inverse/scopesdlast_the_agent_context_read_never_cuts_a_long_value_down.sql.
--
-- THE USE CASE. Castellano & Reyes, LLP's workers' compensation matter (scope 2645730c…) holds its
-- official QME report, 139,950 characters — kept by the store as a file (ebad7d37…), the cell its
-- first 1000. aidream's agent Tier-B context (scope_system/context_source.py → render_agent_context)
-- reads a scope's values through public.get_scope_context; on the store path the door answered
-- `v_scope.data -> key` — those 1000 characters with nothing saying more exists — so an agent
-- reasoning over the matter would have read one page of a 40-page report as if it were all of it.
-- Guard: scripts/campaign-tests/scopesdlast_get_scope_context_never_cuts_a_long_value_red_green.sql.

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
  v_cap    bigint;
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

  -- SCOPES-D-LAST (lane 9, 2026-10-02): A TEXT KEPT AS A FILE IS NEVER HANDED AS ITS FIRST WORDS ALONE.
  -- A value over the store's ceiling is a file; the cell holds its first 1000 characters. Each text
  -- cell is the one agent cell (custom._ctx_agent_cell — what custom.resolve_context and
  -- custom.context_resolve hand): the first words with the file NAMED and `whole_value.expand`, so
  -- the store's client (aidream scope_system/context_source.py) hands the whole text; a text still
  -- waiting for its file is answered whole from the waiting row. Every other cell is unchanged.
  v_cap := custom.agent_context_value_cap(v_scope.organization_id);

  select jsonb_agg(x.cell order by x.srt, x.label, x.fid)
    into v_result
    from (
      select f.id as fid, coalesce(nullif(f.data ->> 'sort', '')::int, 0) as srt, f.data ->> 'label' as label,
             case when p_include_empty then
               (i - 'id' - 'status' - 'tags')
               || jsonb_build_object('item_id', f.id,
                    'has_value', v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null')
               || custom.scope_value_columns(v_scope.organization_id, f.data, i ->> 'value_type', coalesce(a.ac -> 'value', v_scope.data -> (f.data ->> 'key')))
               || case when a.ac ? 'whole_value' then jsonb_build_object('whole_value', a.ac -> 'whole_value') else '{}'::jsonb end
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
               || custom.scope_value_columns(v_scope.organization_id, f.data, i ->> 'value_type', coalesce(a.ac -> 'value', v_scope.data -> (f.data ->> 'key')))
               || case when a.ac ? 'whole_value' then jsonb_build_object('whole_value', a.ac -> 'whole_value') else '{}'::jsonb end
             end as cell
        from custom.scope_items_of(v_scope.organization_id, v_scope.table_id) f
        cross join lateral (select custom.scope_item_row_of(f) as i) j
        cross join lateral (select case when jsonb_typeof(v_scope.data -> (f.data ->> 'key')) = 'string'
                                        then custom._ctx_agent_cell(v_scope.data, v_scope.data, f.data ->> 'key',
                                                                    v_scope.organization_id, v_scope.id, v_cap)
                                   end as ac) a
       where (p_item_ids is null or f.id = any (p_item_ids))
         and (p_include_empty
              or (v_scope.data ? (f.data ->> 'key') and jsonb_typeof(v_scope.data -> (f.data ->> 'key')) <> 'null'))
    ) x;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;
