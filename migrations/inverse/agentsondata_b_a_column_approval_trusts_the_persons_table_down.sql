-- lane: AGENTS-ON-DATA
-- Inverse of agentsondata_b: the door's body before it.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.agent_change_trust(p_organization_id uuid, p_approval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_row   custom.record;
  v_table uuid;
  v_conv  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.agent_change_trust');
  if not custom.work_approval_may_decide(p_organization_id, p_approval_id) then
    raise exception 'Only a person who can decide this change can allow the rest of this chat''s changes to that table.'
      using errcode = '42501';
  end if;
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  v_table := nullif(v_row.data ->> 'subject_table_id', '')::uuid;
  v_conv  := nullif(v_row.data ->> 'conversation_id', '')::uuid;
  if v_table is null or v_conv is null then
    raise exception 'This change did not come from an agent in a chat about one table, so there is nothing further to allow.'
      using errcode = '22023';
  end if;
  insert into custom.agent_table_trust (organization_id, table_id, conversation_id, trusted_by, approval_id)
  values (p_organization_id, v_table, v_conv, coalesce(v_me, '00000000-0000-0000-0000-000000000000'::uuid), p_approval_id)
  on conflict (organization_id, table_id, conversation_id)
  do update set revoked_at = null, trusted_by = excluded.trusted_by, approval_id = excluded.approval_id,
                trusted_at = now();
  return jsonb_build_object('table_id', v_table, 'conversation_id', v_conv);
end
$function$;
