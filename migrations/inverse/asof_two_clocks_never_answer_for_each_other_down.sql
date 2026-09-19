-- STORE-ASOF (2 of 4) — THE INVERSE. `history.value_in_force` is new, so it goes; and
-- `custom.query_record_as_of` goes back to the body that let a 2027 period answer as today
-- and blanked every undated key under a world date.

set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function custom.query_record_as_of(p_organization_id uuid, p_record_id uuid,
                                                    p_recorded_at timestamptz default null,
                                                    p_world_on date default null,
                                                    p_required text default 'viewer')
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc jsonb;
  v_out jsonb := '{}'::jsonb;
  v_key text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_record_as_of');
  if not custom.query_can_see(p_organization_id, p_record_id, p_required) then
    return null;
  end if;
  if p_recorded_at is null then
    select r.data into v_doc from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  else
    v_doc := history.record_at(p_organization_id, p_record_id, p_recorded_at);
    v_doc := coalesce(v_doc -> 'data', v_doc);
  end if;
  if v_doc is null then
    return null;
  end if;
  if p_world_on is null then
    return v_doc;
  end if;
  for v_key in select jsonb_object_keys(v_doc) loop
    v_out := v_out || jsonb_build_object(v_key, history.value_in_document(v_doc, v_key, p_world_on));
  end loop;
  return v_out;
end;
$fn$;

drop function if exists history.value_in_force(jsonb, text, date);
