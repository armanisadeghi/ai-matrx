-- chair-step: the inverse of scopesw2w_a_tag_set_refuses_a_scope_it_cannot_tag.sql — restores the body of custom.context_tags_set as it stood on production and the clone 2026-10-03 03:50Z (pg_get_functiondef md5 22ba936512abc891012a238f20c0ce33), in which an unknown scope id is dropped and the call answers ok:true.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_tags_set(text, uuid, uuid[]) 7683519edce25c199fde8556b2f1c6faebbba827b02be11707287c5f630f77b6
-- lock: custom

CREATE OR REPLACE FUNCTION custom.context_tags_set(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out jsonb;
  v_org uuid;
begin
  v_out := to_jsonb(public.set_entity_scopes(p_entity_type, p_entity_id, coalesce(p_scope_ids, '{}'::uuid[])));
  -- set_entity_scopes has decided (editor on the record, a member of every scope's organization); the one
  -- ladder then answers for this door by its own name for each organization a tag belongs to.
  for v_org in select distinct s.organization_id from context.scopes s where s.id = any(coalesce(p_scope_ids, '{}'::uuid[])) loop
    perform custom.assert_client_may_reach(v_org, 'custom.context_tags_set');
  end loop;
  return jsonb_build_object('ok', true, 'row', v_out);
end;
$function$;
