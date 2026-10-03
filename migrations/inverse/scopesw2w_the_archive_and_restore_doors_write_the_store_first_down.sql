-- chair-step: the inverse of scopesw2w_the_archive_and_restore_doors_write_the_store_first.sql — restores the bodies of custom.context_scope_archive, context_scope_restore, context_type_archive and context_type_restore exactly as production holds them on 2026-10-03 (sha256 3fede810…, 0354c434…, 58005257…, 3450e18a…), in which each door decides and writes through the old function and the store follows.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_scope_archive(uuid) 47eb54051cc0639204eb1c2c0f22e179b618d5b5c9400ec9701883f1c16f4f2b
-- based-on: custom.context_scope_restore(uuid) 1a498d1d57cf2a59bf942cc45a7ba19fa2b2ac497a1ee58bda48ce8e4285b595
-- based-on: custom.context_type_archive(uuid) 5cad9df015f2ad3e050ee4c1691e581035bc37e71a134d542e0fafa283002eea
-- based-on: custom.context_type_restore(uuid) f666c820a4992641738cf754568aa2ce88c9d4d74302d781e4bede3c07d9ed34
-- lock: custom

CREATE OR REPLACE FUNCTION custom.context_scope_archive(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid := (select s.organization_id from context.scopes s where s.id = p_scope_id);
  v_row jsonb;
begin
  -- The old function decides first, in its own sentences; then the one ladder answers for this door by
  -- its own name (SCOPES-OLD-WRITERS: a definer door goes through the ladder itself).
  v_row := public.delete_scope(p_scope_id);
  if v_org is not null then
    perform custom.assert_client_may_reach(v_org, 'custom.context_scope_archive');
  end if;
  return custom._ctx_answer(v_org, p_scope_id, v_row);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.context_scope_restore(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid := (select s.organization_id from context.scopes s where s.id = p_scope_id);
  v_row jsonb;
begin
  -- The old function decides first, in its own sentences; then the one ladder answers for this door by
  -- its own name (SCOPES-OLD-WRITERS: a definer door goes through the ladder itself).
  v_row := public.restore_scope(p_scope_id);
  if v_org is not null then
    perform custom.assert_client_may_reach(v_org, 'custom.context_scope_restore');
  end if;
  return custom._ctx_answer(v_org, p_scope_id, v_row);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.context_type_archive(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid := (select t.organization_id from context.scope_types t where t.id = p_type_id);
  v_row jsonb;
begin
  -- The old function decides first, in its own sentences; then the one ladder answers for this door by
  -- its own name (SCOPES-OLD-WRITERS: a definer door goes through the ladder itself).
  v_row := public.delete_scope_type(p_type_id);
  if v_org is not null then
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_archive');
  end if;
  return custom._ctx_answer(v_org, p_type_id, v_row);
end;
$function$;


CREATE OR REPLACE FUNCTION custom.context_type_restore(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid := (select t.organization_id from context.scope_types t where t.id = p_type_id);
  v_row jsonb;
begin
  -- The old function decides first, in its own sentences; then the one ladder answers for this door by
  -- its own name (SCOPES-OLD-WRITERS: a definer door goes through the ladder itself).
  v_row := public.restore_scope_type(p_type_id);
  if v_org is not null then
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_restore');
  end if;
  return custom._ctx_answer(v_org, p_type_id, v_row);
end;
$function$;


