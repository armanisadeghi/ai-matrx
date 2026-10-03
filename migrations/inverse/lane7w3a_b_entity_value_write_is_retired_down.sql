-- chair-step: the inverse of lane7w3a_b_entity_value_write_is_retired.sql. It re-creates custom.entity_value_write exactly as it
-- was (byte for byte), re-declares its door row and re-grants EXECUTE to authenticated.

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION custom.entity_value_write(p_organization_id uuid, p_token text, p_record_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  t          record;
  v_doc      jsonb;
  v_key      text;
  v_n        int;
  v_level    public.permission_level;
  v_mask     jsonb;
  v_undecl   text[] := '{}'::text[];
  v_refused  text[] := '{}'::text[];
  v_list     text;
begin
  perform custom.assert_entity_door(p_organization_id, 'custom.entity_value_write');
  select * into t from custom.entity_table(p_token);
  perform custom.assert_entity_is_organization_scoped(t.token, t.label, t.has_organization);

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'A write names the fields it is setting and what to set them to.'
      using errcode = '22023',
            hint = 'Pass {"key": value}. A key set to null clears that value; a key left out is left alone. Nothing was written.';
  end if;

  execute format('select coalesce(x.custom_fields, %L::jsonb) from %I.%I x where x.id = $1 and x.organization_id = $2',
                 '{}', t.schema_name, t.table_name)
    into v_doc using p_record_id, p_organization_id;
  if v_doc is null then
    raise exception 'There is no % you can open with that id in this organization.', t.label
      using errcode = '02000',
            hint = 'DOOR-1 decides reading and writing with the same question: a row you may not open is a row you may not change.';
  end if;
  if jsonb_typeof(v_doc) <> 'object' then v_doc := '{}'::jsonb; end if;

  -- THE RUNG FOR AN EDIT. The UPDATE below matching the row is what proves `editor`; a row it
  -- does not match writes nothing and is refused by name, so `editor` is the floor asked here.
  v_level := greatest(coalesce(custom.entity_seat_level(p_organization_id, p_token, p_record_id),
                               'viewer'::public.permission_level),
                      'editor'::public.permission_level);
  v_mask  := custom.entity_read_mask(p_organization_id, p_token, v_level, 'edit');

  for v_key in select k from jsonb_object_keys(p_patch) k order by k loop
    -- Who wrote it is the session's to say; the guard trigger checks these two against it.
    continue when v_key in ('_actor', '_on_behalf_of');
    if not (v_mask -> 'declared') ? v_key then
      v_undecl := v_undecl || v_key;
    elsif not (v_mask -> 'visible') ? v_key then
      v_refused := v_refused || v_key;
    end if;
  end loop;

  if cardinality(v_undecl) > 0 then
    select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_undecl) x;
    raise exception '% has no field called %, so there is nowhere to keep %; adding a field is an owner''s or an admin''s to do.',
                    t.label, v_list, case when cardinality(v_undecl) = 1 then 'that value' else 'those values' end
      using errcode = '23514',
            hint = 'REC-1 / REC-51: a value with no field is a value nobody will ever see. Nothing was written.';
  end if;
  if cardinality(v_refused) > 0 then
    select string_agg(format('"%s"', coalesce(v_mask -> 'labels' ->> x, x)), ', ' order by x) into v_list
      from unnest(v_refused) x;
    raise exception 'You can see this %, but % % not yours to change; that takes % access or a share of %, so nothing was written.',
                    t.label, v_list, case when cardinality(v_refused) = 1 then 'is' else 'are' end,
                    v_mask -> 'notices' -> v_refused[1] ->> 'needs',
                    case when cardinality(v_refused) = 1 then 'that one field' else 'each field' end
      using errcode = '42501',
            hint = 'DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through.';
  end if;

  for v_key in select k from jsonb_object_keys(p_patch) k loop
    if jsonb_typeof(p_patch -> v_key) = 'null' and left(v_key, 1) <> '_' then
      v_doc := v_doc - v_key;
      if jsonb_typeof(v_doc -> '_values') = 'object' then
        v_doc := jsonb_set(v_doc, '{_values}', (v_doc -> '_values') - v_key);
      end if;
    else
      v_doc := jsonb_set(v_doc, array[v_key], p_patch -> v_key, true);
    end if;
  end loop;

  execute format('update %I.%I x set custom_fields = $1 where x.id = $2 and x.organization_id = $3',
                 t.schema_name, t.table_name)
    using v_doc, p_record_id, p_organization_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'You can see this %, but it is not yours to change.', t.label
      using errcode = '42501',
            hint = 'DOOR-1: this door writes as YOU, through the table''s own access rules. It would take the editor level, or a share of this row with you. Nothing was written.';
  end if;

  return custom.entity_record_read(p_organization_id, p_token, p_record_id);
end
$function$;

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, identity_argtypes)
SELECT 'custom', 'entity_value_write', 'p_organization_id uuid, p_token text, p_record_id uuid, p_patch jsonb', 'migrations/campaign/entityfields_the_doors_a_person_reaches.sql', 'SECURITY INVOKER: p_record_id is written by an UPDATE running as the caller, so the standard table''s own update policy decides and a row the caller may not change writes zero rows and is refused by name. p_organization_id is checked by custom.assert_client_may_reach and is in the predicate; NULL is refused by name. p_token is a registry token.',
       true, array[2950, 25, 2950, 3802]::oid[]
WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door WHERE schema_name = 'custom' AND function_name = 'entity_value_write');

GRANT EXECUTE ON FUNCTION custom.entity_value_write(uuid, text, uuid, jsonb) TO authenticated;
