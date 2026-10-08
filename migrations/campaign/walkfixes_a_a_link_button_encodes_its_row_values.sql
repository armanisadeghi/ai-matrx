-- lane: WALK-FIXES
-- based-on: custom.button_press(uuid, uuid, uuid) 3eed0e6a7c7a9608c0d9204549820c0d66eabe0c1fd44f2f32b180f845743218
--
-- WALK-FIXES (2026-10-08), D3: a link button's row values are URL-encoded. "Search supplier" opened
-- https://example.com/search?q=Demolish old cabinets; it now opens ?q=Demolish%20old%20cabinets. A value
-- that begins the link (a column that holds a whole address) is kept as it is. Function body only: any hour.
-- Inverse: migrations/inverse/walkfixes_a_a_link_button_encodes_its_row_values_down.sql
-- Test: scripts/campaign-tests/walkfixes_a_a_link_button_encodes_its_row_values.sql

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.button_press(p_organization_id uuid, p_record_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- NOTION-PROPS-2 (2026-10-08): PRESS A BUTTON ON A ROW. The button column's config.button says what a press does:
--   run_action      one of the table's row actions on this row, through custom.action_run (its own rights,
--                   confirm and steps — that is how a button sets fields);
--   run_automation  one of the table's automations on this row, through custom._automation_run (the steps a
--                   write would run), as an editor of the row; answers the run's status and words;
--   open_url        answers the link with every {{field id}} filled from the row, each value percent-encoded
--                   unless it begins the link (WALK-FIXES D3); the client opens it.
-- A button with nothing set up yet (Notion's importer brings label only) is refused by name.
declare
  v_rec    custom.record;
  v_field  jsonb;
  v_btn    jsonb;
  v_do     text;
  v_label  text;
  v_auto   jsonb;
  v_values jsonb;
  v_fields jsonb;
  v_byid   jsonb;
  v_url    text;
  v_run    uuid;
  v_row    jsonb;
  v_txt    text;
  k        text;
  v        jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.button_press');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.button_press');

  select r.* into v_rec from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id
     and r.data_class = 'record' and r.deleted_at is null;
  if v_rec.id is null then
    raise exception 'There is no such row here.' using errcode = '23503',
          hint = 'It may have been archived, or it belongs to another organization. Nothing ran.';
  end if;
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.button_press',
                                        'viewer'::public.permission_level, 'record');

  select f.data into v_field from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_rec.table_id::text;
  if v_field is null or custom.field_kind_of(v_field) is distinct from 'button' then
    raise exception 'That is not a button on this row''s table.' using errcode = '22023',
          hint = 'NOTION-PROPS-2: pass the id of a button column of the row''s own table. Nothing ran.';
  end if;
  v_btn := coalesce(v_field -> 'config' -> 'button', '{}'::jsonb);
  v_do := v_btn ->> 'do';
  v_label := coalesce(nullif(btrim(v_btn ->> 'label'), ''), v_field ->> 'label', 'This button');
  if v_do is null then
    raise exception '"%" has nothing set up to do yet.', v_label using errcode = '22023',
          hint = 'Open the column''s settings and choose what a press does: open a link, run an automation or run a row action.';
  end if;

  if v_do = 'run_action' then
    return jsonb_build_object('do', 'run_action', 'label', v_label,
             'result', custom.action_run(p_organization_id, (v_btn ->> 'action_id')::uuid, array[p_record_id]));
  end if;

  v_values := coalesce(custom.record_values(p_organization_id, p_record_id), '{}'::jsonb);
  v_fields := custom._automation_fields(p_organization_id, v_rec.table_id);
  select coalesce(jsonb_object_agg(f.key, coalesce(v_values -> (f.value ->> 'key'), 'null'::jsonb)), '{}'::jsonb)
    into v_byid from jsonb_each(v_fields) f;

  if v_do = 'open_url' then
    v_url := v_btn ->> 'url';
    for k, v in select key, value from jsonb_each(v_byid) loop
      v_txt := case when jsonb_typeof(v) = 'string' then v #>> '{}'
                    when v is null or jsonb_typeof(v) = 'null' then '' else v::text end;
      -- WALK-FIXES D3 (2026-10-08): a value that BEGINS the link (a column holding a whole address) goes in
      -- as it is; anywhere else it is one part of the link and is percent-encoded, so "Demolish old cabinets"
      -- arrives as q=Demolish%20old%20cabinets and an & or # in a row's value never breaks the link.
      if left(v_url, length('{{' || k || '}}')) = '{{' || k || '}}' then
        v_url := v_txt || substr(v_url, length('{{' || k || '}}') + 1);
      end if;
      v_url := replace(v_url, '{{' || k || '}}',
                 (select coalesce(string_agg(case when t.c ~ '^[A-Za-z0-9_.~-]$' then t.c
                                                  else upper(regexp_replace(encode(convert_to(t.c, 'UTF8'), 'hex'), '(..)', '%\1', 'g')) end,
                                             '' order by t.n), '')
                    from regexp_split_to_table(v_txt, '') with ordinality as t(c, n)));
    end loop;
    if v_url !~* '^(https?://|mailto:|tel:)' then
      raise exception '"%" opens a link, and with this row''s values it is not one.', v_label using errcode = '22023',
            hint = 'A link starts with https://, mailto: or tel:. Nothing was opened.';
    end if;
    return jsonb_build_object('do', 'open_url', 'label', v_label, 'url', v_url);
  end if;

  -- run_automation: it changes things, so the presser edits this row.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.button_press',
                                          'editor'::public.permission_level, 'record');
  select a into v_auto
    from custom.record t, jsonb_array_elements(coalesce(t.data -> 'automations', '[]'::jsonb)) a
   where t.organization_id = p_organization_id and t.id = v_rec.table_id
     and a ->> 'id' = v_btn ->> 'automation_id' and (a ->> 'archived_at') is null;
  if v_auto is null then
    raise exception '"%" runs an automation this table no longer has.', v_label using errcode = '23503',
          hint = 'Choose another automation in the column''s settings. Nothing ran.';
  end if;
  v_run := custom._automation_run(p_organization_id, v_rec.table_id, p_record_id, v_auto, v_byid, v_fields, null,
             jsonb_build_object('on', 'button_pressed', 'field', p_field_id, 'operation', 'pressed'));
  select r.data into v_row from custom.record r where r.organization_id = p_organization_id and r.id = v_run;
  return jsonb_build_object('do', 'run_automation', 'label', v_label, 'run_id', v_run,
           'automation', v_row ->> 'automation', 'status', v_row ->> 'status', 'says', v_row ->> 'says');
end
$function$;
