-- chair-step: this file creates ONE new client-callable function (custom.entity_fields_across,
-- SECURITY DEFINER), declares it in platform.client_callable_door and GRANTs EXECUTE on it to
-- authenticated (PUBLIC's default EXECUTE is cleared at birth by the DDL guard). It replaces no live body, alters no table and revokes nothing. Its inverse
-- revokes the grant, deletes the declaration row and drops the function.
--
-- LANE 7 · W2 FIX ROUND 2 — ONE READ OF A STANDARD TABLE'S FIELDS ACROSS EVERY ORGANIZATION A
-- LIST SPANS.
--
-- A standard list (CRM people, deals) spans every organization the person belongs to (the active
-- organization is never a list filter), and each organization adds its own custom fields to a
-- registry token. The only door was custom.entity_fields(org, token): one call per organization,
-- plus custom.field_options per Choice field — 98 calls measured on /crm then /crm/deals for an
-- operator in ~35 organizations. This door answers the same question once:
--   {"fields": [ {id, organization_id, ...the Field document..., options: {key: {label, id,
--                retired, ...}}} ... ],
--    "unavailable": [ {organization_id, reason} ... ]}
-- Each organization is admitted by the same two checks custom.entity_fields makes
-- (custom.assert_store_door, custom.assert_client_may_reach), in the same order; one that refuses
-- is NAMED under "unavailable" with the store's own sentence, never silently dropped and never
-- failing the others. The options are custom.choice_options (the same read the choice trigger
-- uses), so a list's Choice picker and the store agree on keys and labels.

CREATE OR REPLACE FUNCTION custom.entity_fields_across(p_token text, p_organization_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org         uuid;
  v_fields      jsonb := '[]'::jsonb;
  v_unavailable jsonb := '[]'::jsonb;
  v_one         jsonb;
begin
  -- The token first: an unknown or field-less token is refused by name, as entity_fields does.
  perform custom.entity_table(p_token);
  if coalesce(cardinality(p_organization_ids), 0) > 200 then
    raise exception 'One read covers at most 200 organizations, and this asked for %.', cardinality(p_organization_ids)
      using errcode = '22023',
            hint = 'Ask in parts; a list spans the organizations the person belongs to.';
  end if;
  foreach v_org in array coalesce(p_organization_ids, '{}'::uuid[]) loop
    begin
      perform custom.assert_store_door(v_org, 'custom.entity_fields');
      perform custom.assert_client_may_reach(v_org, 'custom.entity_fields');
    exception when others then
      v_unavailable := v_unavailable || jsonb_build_array(
        jsonb_build_object('organization_id', v_org, 'reason', sqlerrm));
      continue;
    end;
    select coalesce(jsonb_agg(
             f.data
             || jsonb_build_object('id', f.id, 'organization_id', f.organization_id)
             || jsonb_build_object('options',
                  case when f.data ->> 'type' = 'list'
                        and coalesce(nullif(f.data ->> 'options_table_id', ''),
                                     nullif(f.data -> 'config' ->> 'options_table_id', '')) is not null
                       then custom.choice_options(v_org,
                              coalesce(nullif(f.data ->> 'options_table_id', ''),
                                       nullif(f.data -> 'config' ->> 'options_table_id', ''))::uuid)
                  end)
             order by coalesce((f.data ->> 'sort')::numeric, 100), f.data ->> 'label'), '[]'::jsonb)
      into v_one
      from custom.record f
     where f.organization_id = v_org
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'table_token' = p_token;
    v_fields := v_fields || v_one;
  end loop;
  return jsonb_build_object('fields', v_fields, 'unavailable', v_unavailable);
end
$function$;

INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers)
VALUES
  ('custom', 'entity_fields_across', 'p_token text, p_organization_ids uuid[]',
   ARRAY['text'::regtype, 'uuid[]'::regtype]::oid[],
   'Every organization in p_organization_ids is admitted by custom.assert_store_door and custom.assert_client_may_reach (the two checks custom.entity_fields makes) before anything of it is read; one that refuses is named under "unavailable" and nothing of it is returned. p_token is a registry token checked by custom.entity_table. It answers Field definitions and their choice options, which custom.entity_fields and custom.field_options already hand every member, and never a value.',
   'migrations/campaign/lane7w2_b_one_read_of_a_tables_fields_across_organizations.sql', true);

GRANT EXECUTE ON FUNCTION custom.entity_fields_across(text, uuid[]) TO authenticated;
