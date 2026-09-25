-- chair-step: inverse of migrations/campaign/sourcekey_the_readers_stop_accepting_the_old_key.sql
-- (lane SOURCE-KEY): restores both readers to accepting either prefix.
-- lane: SOURCE-KEY
-- window-class: two function bodies.
-- based-on: custom.record_source_keys(uuid) (the body this file installs, once applied)
-- based-on: custom.record_source_table(text) (the body this file installs, once applied)

set local lock_timeout = '30s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom.record_source_keys(p_table_id uuid)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$ select array['record:' || p_table_id::text, 'custom_record:' || p_table_id::text] $function$;
REVOKE ALL ON FUNCTION custom.record_source_keys(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.record_source_table(p_key text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when p_key ~ '^(record|custom_record):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then substr(p_key, strpos(p_key, ':') + 1)::uuid
  end
$function$;
REVOKE ALL ON FUNCTION custom.record_source_table(text) FROM PUBLIC, anon, authenticated;
