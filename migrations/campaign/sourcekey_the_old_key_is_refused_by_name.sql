-- chair-step: lane SOURCE-KEY, step 2 of 2. The store stops ACCEPTING the retired event-source key `custom_record:<table id>` on write: a schedule trigger (scheduler.sch_trigger.config.entity_type) or a webhook (files.webhooks.resource_types) that names it is refused 23514 by name, whoever writes it, where step 1 turned it into `record:<table id>` with a NOTICE. Readers keep reading both for this release (custom.record_source_keys / record_source_table are unchanged). Apply ONLY when @ai-matrx/records carrying recordSourceKey (the release after 0.58.6) is installed in matrx-frontend and the frontend that saves the store's key (matrx-frontend 5bdf48635a) is live on production. Inverse: migrations/inverse/sourcekey_the_old_key_is_refused_by_name_down.sql (restores step 1's rewrite).
-- lane: SOURCE-KEY
-- window-class: one function body.
-- based-on: custom._record_source_key_is_record() 3f29f3d0bd6192c636b0c9c0a87fc5ea0bdce86d6f05dead05a822fa7e32e7a3
--
-- Suite: scripts/campaign-tests/sourcekey_the_old_key_is_refused_red_green.sql (and
-- sourcekey_a_row_change_is_a_record_event_red_green.sql stays GREEN: it accepts either step).

set local lock_timeout = '30s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom._record_source_key_is_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- Nested, never one AND: plpgsql does not promise to stop at the table test, and a webhook row
  -- has no `config` (found by running it: "record "new" has no field "config"").
  if tg_table_schema = 'scheduler' and tg_table_name = 'sch_trigger' then
    if new.config ->> 'entity_type' like 'custom\_record:%' then
      raise exception 'This schedule names a record-store table''s changes by the retired key %; the key is record:%.',
        new.config ->> 'entity_type', substr(new.config ->> 'entity_type', length('custom_record:') + 1)
        using errcode = '23514',
              hint = 'Build it with recordSourceKey(tableId) from @ai-matrx/records, or take the entity_type custom.record_change_actions answers. Nothing was saved.';
    end if;
  elsif tg_table_schema = 'files' and tg_table_name = 'webhooks' then
    if array_to_string(new.resource_types, ',') like '%custom\_record:%' then
      raise exception 'This webhook names a record-store table''s changes by the retired key (%); the key is record:<table id>.',
        array_to_string(new.resource_types, ',')
        using errcode = '23514',
              hint = 'Declare it with custom.table_webhook_declare, which writes record:<table id>. Nothing was saved.';
    end if;
  end if;
  return new;
end
$function$;
REVOKE ALL ON FUNCTION custom._record_source_key_is_record() FROM PUBLIC, anon, authenticated;
