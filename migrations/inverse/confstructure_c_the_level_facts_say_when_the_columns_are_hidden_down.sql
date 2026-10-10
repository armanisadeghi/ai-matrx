-- chair-step: lane DATA-DEFECTS-1 inverse - restores custom.table_level_facts to the body it had before confstructure_c (no structure_hidden key).

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.table_level_facts(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- What a table's settings screen shows: its level, its readers, who may change the level, whether THIS
-- caller may, and the last approval an organization's admin gave. Anybody who may know the table may ask.
declare
  v_org   uuid;
  v_data  jsonb;
  v_who   text;
  v_admin boolean := false;
  v_last  jsonb;
begin
  select t.organization_id, t.data into v_org, v_data
    from custom.record t
   where t.id = p_table_id and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null;
  if v_org is null then
    raise exception 'You do not have access to this table, so % has nothing to show you.', 'custom.table_level_facts'
      using errcode = '42501';
  end if;
  begin
    perform custom.assert_client_may_reach(v_org, 'custom.table_level_facts');
    perform custom.assert_may_know_table(v_org, p_table_id, 'custom.table_level_facts');
  exception when insufficient_privilege then
    raise exception 'You do not have access to this table, so % has nothing to show you.', 'custom.table_level_facts'
      using errcode = '42501';
  end;
  v_who := custom._table_approver(v_org, v_data);
  if auth.uid() is not null then
    v_admin := public.is_org_admin_for(auth.uid(), v_org);
  end if;
  select jsonb_build_object('level', a.level, 'reason', a.reason, 'approver_role', a.approver_role,
                            'approver_user_id', a.approver_user_id, 'approved_on', a.approved_on)
    into v_last
    from platform.class_approval_by_org_admin a
   where a.token = 'custom.table:' || p_table_id::text and a.organization_id = v_org
   order by a.id desc limit 1;
  return jsonb_build_object(
    'table_id', p_table_id,
    'organization_id', v_org,
    'level', coalesce(v_data ->> 'level', 'organization'),
    'readers', coalesce(v_data -> 'readers', '[]'::jsonb),
    'maker_is_reader', coalesce(v_data -> 'maker_is_reader' = 'true'::jsonb, false),
    'set_by', v_who,
    'can_set', (v_who = 'org_admin' and v_admin),
    'last_approval', v_last);
end
$function$;
