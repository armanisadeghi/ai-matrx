-- chair-step: replaces custom._automation_run(uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid, jsonb) (same signature and grants; no table, column, index or policy touched): a notify step that names no link now links the notice to the row it is about (/data/<table>/r/<row>), so a date-arrives reminder in the bell opens the row. A step that names its own link keeps it.
-- lock: custom
-- lane: NOTION-SMALL-2
-- based-on: custom._automation_run(uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid, jsonb) aac7e8f557bb09fbeb84977a1ac78a0f663e13bb428d85266740f1fc390b31f3
--
-- The inverse is `migrations/inverse/notionsmall2_d_a_reminder_opens_its_row_down.sql`.
--
CREATE OR REPLACE FUNCTION custom._automation_run(p_organization_id uuid, p_table_id uuid, p_record_id uuid, p_automation jsonb, p_byid jsonb, p_fields jsonb, p_change_id uuid, p_trigger jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- NOTION-PROPS-2 (2026-10-08): ONE AUTOMATION'S RUN ON ONE ROW, lifted verbatim out of custom._automation_fire so a
-- button press (custom.button_press) runs an automation through exactly the steps a write does. Writes the
-- automation_run row and answers its id. No client lane: called by the fire trigger and the button door only.
declare
  c_depth_max constant integer := 3;
  v_a       jsonb := p_automation;
  v_spec    jsonb := p_automation -> 'spec';
  v_depth   integer := coalesce(nullif(current_setting('custom.automation_depth', true), '')::integer, 0);
  v_act     jsonb;
  v_n       integer;
  v_steps   jsonb;
  v_status  text;
  v_says    text;
  v_stepsay text;
  v_started timestamptz;
  v_me      uuid := custom.query_principal();
  v_patch   jsonb;
  k         text;
  v         jsonb;
  v_field   jsonb;
  v_tfields jsonb;
  v_rid     uuid;
  v_cand    uuid;
  v_cnt     integer;
  v_scan    integer;
  v_to      uuid;
  v_text    text;
  v_msg     text;
  v_hint    text;
  v_res     jsonb;
  v_run     uuid;
  v_subj    text;
  v_dl      text;
begin
  v_started := clock_timestamp();
  v_steps := '[]'::jsonb;
  v_status := 'ran';
  v_says := 'Every step finished.';
  v_n := 0;

  if v_depth >= c_depth_max then
    v_status := 'stopped';
    v_says := format('Stopped after %s rounds: this automation keeps changing the record that starts it.', c_depth_max);
  else
    perform set_config('custom.automation_depth', (v_depth + 1)::text, true);
    for v_act in select e from jsonb_array_elements(v_spec -> 'actions') e loop
      v_n := v_n + 1;
      v_stepsay := null;
      begin
        if v_act ->> 'do' = 'set' then
          v_patch := '{}'::jsonb;
          for k, v in select key, value from jsonb_each(v_act -> 'values') loop
            v_field := p_fields -> k;
            if v_field is null then
              raise exception 'A property this step sets is gone, so it cannot run until it is edited.' using errcode = '23503';
            end if;
            v_patch := v_patch || jsonb_build_object(v_field ->> 'key',
                         custom._action_coerce(v_field, custom._automation_value(v, p_byid, v_me), p_organization_id));
          end loop;
          perform custom.record_update(p_organization_id, p_record_id, v_patch);
          v_stepsay := 'Set ' || (select string_agg(f.value ->> 'label', ', ') from jsonb_each(p_fields) f
                                   where (v_act -> 'values') ? f.key) || ' on this row.';

        elsif v_act ->> 'do' = 'add_row' then
          v_tfields := custom._automation_fields(p_organization_id, (v_act ->> 'table_id')::uuid);
          v_patch := '{}'::jsonb;
          for k, v in select key, value from jsonb_each(v_act -> 'values') loop
            v_field := v_tfields -> k;
            if v_field is null then
              raise exception 'A property this step sets is gone, so it cannot run until it is edited.' using errcode = '23503';
            end if;
            v_patch := v_patch || jsonb_build_object(v_field ->> 'key',
                         custom._action_coerce(v_field, custom._automation_value(v, p_byid, v_me), p_organization_id));
          end loop;
          v_rid := custom.record_write(p_organization_id, (v_act ->> 'table_id')::uuid, v_patch);
          v_stepsay := 'Added a row to the other table.';
          v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', 'add_row', 'status', 'done',
                       'says', v_stepsay, 'record_id', v_rid));
          continue;

        elsif v_act ->> 'do' = 'edit_rows' then
          v_tfields := custom._automation_fields(p_organization_id, (v_act ->> 'table_id')::uuid);
          v_cnt := 0;
          v_scan := 0;
          for v_cand in select x.id from custom.record x
                         where x.organization_id = p_organization_id and x.table_id = (v_act ->> 'table_id')::uuid
                           and x.data_class = 'record' and x.deleted_at is null
                         order by x.created_at limit 2000 loop
            v_scan := v_scan + 1;
            exit when v_cnt >= coalesce((v_act ->> 'limit')::integer, 100);
            v_res := custom.record_values(p_organization_id, v_cand);
            if custom._fx_truthy(custom.rule_eval(p_organization_id,
                 custom._automation_bind(v_act -> 'where', p_byid), v_res,
                 coalesce(custom.rule_context(p_organization_id, v_cand), '{}'::jsonb)
                   || jsonb_build_object('fx_self_id', v_cand, 'fx_table_id', (v_act ->> 'table_id')::uuid))) then
              v_patch := '{}'::jsonb;
              for k, v in select key, value from jsonb_each(v_act -> 'values') loop
                v_field := v_tfields -> k;
                if v_field is null then
                  raise exception 'A property this step sets is gone, so it cannot run until it is edited.' using errcode = '23503';
                end if;
                v_patch := v_patch || jsonb_build_object(v_field ->> 'key',
                             custom._action_coerce(v_field, custom._automation_value(v, p_byid, v_me), p_organization_id));
              end loop;
              perform custom.record_update(p_organization_id, v_cand, v_patch);
              v_cnt := v_cnt + 1;
            end if;
          end loop;
          v_stepsay := format('Edited %s row%s in the other table.', v_cnt, case when v_cnt = 1 then '' else 's' end);
          v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', 'edit_rows', 'status', 'done',
                       'says', v_stepsay, 'edited', v_cnt));
          continue;

        elsif v_act ->> 'do' = 'notify' then
          v_to := case
            when v_act -> 'to' ? 'person' then (v_act -> 'to' ->> 'person')::uuid
            when v_act -> 'to' ? 'field' then case when (p_byid ->> (v_act -> 'to' ->> 'field'))
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   then (p_byid ->> (v_act -> 'to' ->> 'field'))::uuid end
            else nullif(v_a ->> 'created_by', '')::uuid end;
          if v_to is null then
            raise exception 'There is no person to tell: the property is empty on this row.' using errcode = '22023';
          end if;
          if not iam.is_org_member(v_to, p_organization_id) then
            raise exception 'That person is not a member of this organization.' using errcode = '22023';
          end if;
          v_text := v_act ->> 'text';
          for k, v in select key, value from jsonb_each(p_byid) loop
            v_text := replace(v_text, '{{' || k || '}}',
                        case when jsonb_typeof(v) = 'string' then v #>> '{}' when v is null or jsonb_typeof(v) = 'null' then '' else v::text end);
          end loop;
          -- HR-360-2 (2026-10-08): the action may carry its own SUBJECT and a LINK (both templated with the same
          -- {{property}} words as the text, plus {{record_id}} and {{organization_id}}), so the notice opens the
          -- thing it is about and its in-app and email subject says what happened. A link written with its origin is
          -- stored as the path (the notice router resolves a path against the reader's own host); only a path that
          -- starts with a slash is kept.
          v_subj := coalesce(nullif(btrim(v_act ->> 'subject'), ''), v_spec ->> 'name');
          v_dl   := nullif(btrim(v_act ->> 'link'), '');
          for k, v in select key, value from jsonb_each(p_byid) loop
            v_subj := replace(v_subj, '{{' || k || '}}',
                        case when jsonb_typeof(v) = 'string' then v #>> '{}' when v is null or jsonb_typeof(v) = 'null' then '' else v::text end);
            v_dl := replace(v_dl, '{{' || k || '}}',
                        case when jsonb_typeof(v) = 'string' then v #>> '{}' when v is null or jsonb_typeof(v) = 'null' then '' else v::text end);
          end loop;
          v_dl := replace(replace(v_dl, '{{record_id}}', p_record_id::text), '{{organization_id}}', p_organization_id::text);
          v_dl := regexp_replace(v_dl, '^https?://[^/]+', '');
          if v_dl is not null and left(v_dl, 1) <> '/' then v_dl := null; end if;
          -- NOTION-SMALL-2: a notice about a row opens that row when the step names no link of its own (a date-arrives
          -- reminder had a subject and a body but nothing to press).
          v_dl := coalesce(v_dl, '/data/' || p_table_id::text || '/r/' || p_record_id::text);
          v_res := communication.notify_from_sql(p_organization_id, 'records.changed', v_to, null, null,
                     jsonb_build_object('notice', jsonb_build_object('body', v_text, 'subject', v_subj)),
                     v_dl, 'custom.record', p_record_id,
                     'automation:' || (v_a ->> 'id') || ':' || coalesce(p_change_id::text, gen_random_uuid()::text) || ':' || v_n::text);
          v_stepsay := coalesce(v_res ->> 'say', 'Told them.');

        elsif v_act ->> 'do' = 'webhook' then
          if not coalesce(files.is_safe_webhook_url(v_act ->> 'url'), false) then
            raise exception 'That webhook address is not a public https address any more, so nothing was sent.' using errcode = '22023';
          end if;
          perform net.http_post(url := v_act ->> 'url',
                    body := jsonb_build_object('event', 'automation.fired', 'automation_id', v_a ->> 'id',
                              'automation', v_spec ->> 'name', 'table_id', p_table_id, 'record_id', p_record_id,
                              'operation', p_trigger ->> 'operation', 'changed_field_ids', p_trigger -> 'changed_field_ids', 'trigger', p_trigger ->> 'on'),
                    headers := '{"Content-Type": "application/json"}'::jsonb);
          v_stepsay := 'Sent the webhook.';

        elsif v_act ->> 'do' = 'agent' then
          v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', 'agent', 'status', 'waiting',
                       'says', 'Waiting for a person: an agent''s changes are confirmed by a person. Open this record''s chat to ask it.',
                       'prompt', v_act ->> 'prompt'));
          if v_status = 'ran' then
            v_status := 'waiting';
            v_says := 'Waiting for a person to run the agent step.';
          end if;
          continue;
        end if;
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', v_act ->> 'do', 'status', 'done', 'says', v_stepsay));
      exception when others then
        get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
        v_steps := v_steps || jsonb_build_array(jsonb_build_object('n', v_n, 'do', v_act ->> 'do', 'status', 'failed',
                     'says', v_msg, 'hint', v_hint));
        v_status := 'failed';
        v_says := format('Step %s did not run: %s', v_n, v_msg);
        exit;
      end;
    end loop;
    perform set_config('custom.automation_depth', v_depth::text, true);
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'automation_run', jsonb_build_object(
            'automation_id', v_a ->> 'id', 'automation', v_spec ->> 'name', 'table_id', p_table_id,
            'record_id', p_record_id, 'change_id', p_change_id, 'status', v_status, 'says', v_says,
            'trigger', p_trigger,
            'steps', v_steps, 'ran_by', v_me,
            'started_at', v_started, 'finished_at', clock_timestamp()))
  returning id into v_run;
  return v_run;
end
$function$;
