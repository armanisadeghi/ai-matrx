-- Inverse of campaign/pressfence_the_final_switch_is_never_refused_by_the_copy_fence.sql: restores production's body of custom._older_table_copy_refusal(uuid) as it was before (SUITE-HEALTH-3 / COPY-WRITABLE).
-- lane: PRESS-FENCE

CREATE OR REPLACE FUNCTION custom._older_table_copy_refusal(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_name text;
  v_org  uuid;
begin
  if p_table_id is null or platform.table_lives_in(p_table_id) is distinct from 'older' then
    return null;
  end if;
  select d.organization_id, coalesce(nullif(d.table_name, ''), 'this table')
    into v_org, v_name
    from workbench.udt_datasets d where d.id = p_table_id and d.deleted_at is null;
  if not found then
    return null;
  end if;
  -- A PERSON TESTS THE COPY (COPY-WRITABLE). Her own write is allowed; the fence notes it and
  -- the switch replaces it with the older table's rows.
  if platform.write_is_a_persons_own() then
    return null;
  end if;
  -- THE NAME ONLY TO WHO MAY OPEN THE COPY (SUITE-HEALTH-3). The same may-open ladder every
  -- door asks, about the copy by its id. A caller it refuses is still refused the write; the
  -- sentence just names nothing. A copy that is not in the record store is not named either.
  if exists (select 1 from custom.record r where r.id = p_table_id) then
    begin
      perform custom.assert_client_may_open(v_org, p_table_id, 'custom._older_table_copy_refusal', 'viewer', 'table');
    exception when insufficient_privilege or null_value_not_allowed then
      v_name := 'this table';
    end;
  else
    v_name := 'this table';
  end if;
  return format('This is the new system''s test copy of %s; the older table is still the one in use for agents, automations and integrations until an owner switches Data tables on the organization''s settings page. Write it at /data/%s.',
                v_name, p_table_id);
end;
$function$;
