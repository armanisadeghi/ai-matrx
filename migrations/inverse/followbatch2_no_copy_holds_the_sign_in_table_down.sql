-- chair-step: inverse of followbatch2_no_copy_holds_the_sign_in_table.sql (lane FOLLOW-BATCH-2) — puts custom.context_tag_copy(uuid) back to its TAG-COPY-PERF body (a one-transaction loop over the batch door: long transactions holding auth.users again) and removes the knobs copy/max_auth_lock_ms and copy/batch_records. Run it only together with reverting aidream's batched copies (matrx_records.movers), which read copy/batch_records and fall back to 10 by name when it is missing.
-- lane: FOLLOW-BATCH-2
-- based-on: custom.context_tag_copy(uuid) fb10872f3939fe237d58d780767bfbfc86a5f2c7183484f74ba515f87deafab1
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.context_tag_copy(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cursor jsonb := null;
  b        jsonb;
  v_out    jsonb := jsonb_build_object('organization_id', p_organization_id,
                      'made', 0, 'revived', 0, 'archived', 0, 'updated', 0, 'current', 0,
                      'same_edge_already_there', 0, 'waiting_for_the_record', 0, 'refused', 0,
                      'refused_tags', '[]'::jsonb);
  k        text;
begin
  -- ONE TRANSACTION: the caller holds it. The context follow does NOT call this; it calls
  -- custom.context_tag_copy_batch and commits every step (lane TAG-COPY-PERF). This door stays for
  -- SQL tests and hand repairs, where one transaction is what the caller asked for.
  if p_organization_id is null then
    raise exception 'custom.context_tag_copy: name the organization whose tags to copy'
      using errcode = '22004';
  end if;
  loop
    b := custom.context_tag_copy_batch(p_organization_id, v_cursor, 1000);
    foreach k in array array['made','revived','archived','updated','current','same_edge_already_there','refused'] loop
      v_out := jsonb_set(v_out, array[k], to_jsonb((v_out->>k)::int + coalesce((b->>k)::int, 0)));
    end loop;
    if b ? 'waiting_for_the_record' and b->'waiting_for_the_record' <> 'null'::jsonb then
      v_out := jsonb_set(v_out, '{waiting_for_the_record}', b->'waiting_for_the_record');
    end if;
    if jsonb_array_length(v_out->'refused_tags') < 20 then
      v_out := jsonb_set(v_out, '{refused_tags}', (
        select coalesce(jsonb_agg(e), '[]'::jsonb) from (
          select e from jsonb_array_elements((v_out->'refused_tags') || coalesce(b->'refused_tags', '[]'::jsonb)) e limit 20) q));
    end if;
    v_cursor := b->'next';
    exit when v_cursor is null or v_cursor = 'null'::jsonb;
  end loop;
  -- In one transaction nothing else will flush what the batches deferred: flush it here.
  loop
    exit when platform.reachability_flush(500) = 0;
  end loop;
  return v_out;
end;
$function$
;

comment on function custom.context_tag_copy(uuid) is
  'SC-4 P4. Makes one organization''s copied context tags (<kind> -> record, role context_tag) equal its old tags (<kind> -> scope), old side winning: made, revived, re-shaped, archived (never deleted). An edge the store already holds between the same ends under record or custom_record is the same tag. Called by the context follow (matrx_records.movers.context_follow) inside its copy of the organization.';
delete from platform.feature_knob where feature = 'copy' and key in ('max_auth_lock_ms', 'batch_records');
