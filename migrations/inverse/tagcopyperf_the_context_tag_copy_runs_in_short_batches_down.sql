-- chair-step: inverse of tagcopyperf_the_context_tag_copy_runs_in_short_batches.sql (lane TAG-COPY-PERF) — puts custom.context_tag_copy back to its production body of 2026-09-27 (the whole organization in one statement: long transactions holding auth.users again), drops custom.context_tag_copy_batch and removes the knob context/follow_batch_rows. Run it only together with reverting aidream's batched follow (matrx_records.movers.context_follow), which calls the batch door and says so by name when it is missing.
-- lane: TAG-COPY-PERF
-- based-on: custom.context_tag_copy(uuid) 94872339696774ee76e8544f67b77f3dcec08c7eae28dbdc657c8d9a88bffc54
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom.context_tag_copy(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  g         record;
  v_twin    platform.associations%rowtype;
  v_other   boolean;
  v_want    boolean;
  v_meta    jsonb;
  v_via_t   text;
  v_via_id  uuid;
  n_made    int := 0;
  n_revived int := 0;
  n_archived int := 0;
  n_updated int := 0;
  n_same    int := 0;
  n_current int := 0;
  n_waiting int := 0;
  n_refused int := 0;
  v_refused jsonb := '[]'::jsonb;
  v_did     text;
begin
  if p_organization_id is null then
    raise exception 'custom.context_tag_copy: name the organization whose tags to copy'
      using errcode = '22004';
  end if;
  -- WHO IS WRITING, NAMED (the provenance stamp refuses an automated write that does not say).
  if coalesce(current_setting('app.actor_system', true), '') = '' then
    perform set_config('app.actor_system', 'matrx_records.context_follow', true);
  end if;

  -- EVERY SCOPE TAG TYPE HAS ITS STORE TWIN (lane PROOF-DEFECTS, D3). SC-4 P4 registered the
  -- `<kind> -> record` twins once; a `<kind> -> scope` type registered after it (app, 2026-09-25;
  -- processed_document "about", 2026-09-25) had none, the direction guard refused its copy, and the
  -- whole organization's follow stopped. The twin is registered here, the moment a copy needs it:
  -- same label, container side and conveyance. A row already there is never changed.
  insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
  select a.source_type, 'record', a.label, a.container_side, a.conveys_max, true,
         'SC-4 P4: the record store''s copy of a context tag (role context_tag), twin of '
         || a.source_type || ' -> scope; same label, container side and conveyance. Written only by the context follow until the switch.'
    from platform.association_types a
   where a.target_type = 'scope' and a.is_active
     and not exists (select 1 from platform.association_types t
                      where t.source_type = a.source_type and t.target_type = 'record')
  on conflict (source_type, target_type) do nothing;

  -- A scope whose copy Record has not landed yet waits for the copy (counted, never guessed).
  select count(distinct a.id) into n_waiting
    from platform.associations a
    join context.scopes s on s.id = a.target_id
   where a.target_type = 'scope' and s.organization_id = p_organization_id
     and not exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = a.target_id
                        and r.data_class = 'record');

  -- ONE TAG PER (source, scope): two old edges between the same two ends (a plain tag and a
  -- class assignment) are one copied tag, live while either is, shaped by the live one.
  for g in
    select distinct x.source_type, x.source_id, x.target_id
      from platform.associations x
      join context.scopes s on s.id = x.target_id
     where x.target_type = 'scope'
       and s.organization_id = p_organization_id
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = x.target_id
                      and r.data_class = 'record')
  loop
    begin
      -- ONE BODY FOR ONE TAG (SCOPES-WRITE-THROUGH): the per-edge write-through calls the same.
      v_did := custom._ctx_store_tag(p_organization_id, g.source_type, g.source_id, g.target_id);
      case v_did
        when 'made' then n_made := n_made + 1;
        when 'revived' then n_revived := n_revived + 1;
        when 'updated' then n_updated := n_updated + 1;
        when 'current' then n_current := n_current + 1;
        when 'archived' then n_archived := n_archived + 1;
        when 'same_edge_already_there' then n_same := n_same + 1;
        else null;
      end case;
    exception
      when check_violation or foreign_key_violation or insufficient_privilege or raise_exception then
        -- ONE TAG THE STORE REFUSES IS NAMED, AND THE REST OF THE ORGANIZATION IS COPIED
        -- (lane PROOF-DEFECTS, D3). The follow files ops.system_error for every refused tag.
        n_refused := n_refused + 1;
        if jsonb_array_length(v_refused) < 20 then
          v_refused := v_refused || jsonb_build_array(jsonb_build_object(
            'pair', g.source_type || ' -> record',
            'source_id', g.source_id,
            'scope_id', g.target_id,
            'sqlstate', sqlstate,
            'says', left(split_part(sqlerrm, E'\n', 1), 300)));
        end if;
    end;
  end loop;

  -- A COPIED TAG WHOSE OLD EDGE IS GONE ALTOGETHER (hard-deleted on the old side) is archived.
  with gone as (
    update platform.associations t
       set deleted_at = now(), deleted_via_type = null, deleted_via_id = null
     where t.target_type = 'record' and t.role = 'context_tag' and t.deleted_at is null
       and exists (select 1 from context.scopes s where s.id = t.target_id and s.organization_id = p_organization_id)
       and not exists (select 1 from platform.associations x
                        where x.target_type = 'scope' and x.target_id = t.target_id
                          and x.source_type = t.source_type and x.source_id = t.source_id)
    returning 1)
  select n_archived + count(*) into n_archived from gone;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'made', n_made, 'revived', n_revived, 'archived', n_archived, 'updated', n_updated,
    'current', n_current, 'same_edge_already_there', n_same, 'waiting_for_the_record', n_waiting,
    'refused', n_refused, 'refused_tags', v_refused);
end;
$function$

;

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'context_tag_copy_batch';
drop function if exists custom.context_tag_copy_batch(uuid, jsonb, integer);

delete from platform.feature_knob where feature = 'context' and key = 'follow_batch_rows';
