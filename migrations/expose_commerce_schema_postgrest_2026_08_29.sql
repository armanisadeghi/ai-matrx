-- Commerce intake and review are direct-Supabase browser surfaces. Register the
-- existing, canonically RLS-protected schema with PostgREST without restating
-- (and therefore risking truncation of) the fleet-wide schema list.

do $migration$
declare
  exposed_schemas text;
begin
  select split_part(setting, '=', 2)
    into exposed_schemas
  from unnest(
    (select rolconfig from pg_roles where rolname = 'authenticator')
  ) as setting
  where setting like 'pgrst.db_schemas=%';

  if exposed_schemas is null then
    raise exception 'authenticator is missing its pgrst.db_schemas setting';
  end if;

  if not ('commerce' = any(string_to_array(replace(exposed_schemas, ' ', ''), ','))) then
    execute format(
      'alter role authenticator set pgrst.db_schemas = %L',
      exposed_schemas || ', commerce'
    );
  end if;
end
$migration$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
