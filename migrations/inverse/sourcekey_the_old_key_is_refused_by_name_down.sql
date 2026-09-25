-- chair-step: inverse of migrations/campaign/sourcekey_the_old_key_is_refused_by_name.sql (lane SOURCE-KEY): restores step 1's body, which turns an older client's custom_record:<table id> key into record:<table id> with a NOTICE instead of refusing it.
-- lane: SOURCE-KEY
-- window-class: one function body.
-- based-on: custom._record_source_key_is_record() 4cbcf4829632ab6644264541e9a6665c4c6314030eadfd994ed82024da7a06b2

set local lock_timeout = '2s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom._record_source_key_is_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_old text;
begin
  if tg_table_schema = 'scheduler' and tg_table_name = 'sch_trigger' then
    v_old := new.config ->> 'entity_type';
    if v_old like 'custom\_record:%' then
      new.config := jsonb_set(new.config, '{entity_type}', to_jsonb('record:' || substr(v_old, length('custom_record:') + 1)));
      raise notice 'This schedule named a record-store table''s changes by the retired key %; it is saved as % (lane SOURCE-KEY).',
        v_old, new.config ->> 'entity_type'
        using hint = 'Update @ai-matrx/records: its recordChangeTrigger writes record:<table id>. The old key will soon be refused.';
    end if;
  elsif tg_table_schema = 'files' and tg_table_name = 'webhooks' then
    if array_to_string(new.resource_types, ',') like '%custom\_record:%' then
      v_old := array_to_string(new.resource_types, ',');
      new.resource_types := array(
        select case when r like 'custom\_record:%' then 'record:' || substr(r, length('custom_record:') + 1) else r end
          from unnest(new.resource_types) with ordinality u(r, i) order by i);
      raise notice 'This webhook named a record-store table''s changes by the retired key (%); it is saved as % (lane SOURCE-KEY).',
        v_old, array_to_string(new.resource_types, ',')
        using hint = 'Use custom.table_webhook_declare, which writes record:<table id>. The old key will soon be refused.';
    end if;
  end if;
  return new;
end
$function$;
REVOKE ALL ON FUNCTION custom._record_source_key_is_record() FROM PUBLIC, anon, authenticated;
