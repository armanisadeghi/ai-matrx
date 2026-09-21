-- lane: SECURITY-SWEEP — the inverse of
-- migrations/campaign/secsweep_a_credential_column_is_never_client_writable.sql
--
-- Removes the six declared exclusions and re-derives the grants, putting each table back on
-- a table-level grant to `authenticated`. It re-opens six credential columns to every signed-in
-- person, which is the defect the up-migration closed: run it only to prove the pair is
-- reversible (rule 27, up → inverse → up), never to leave the database in this state.

do $$
declare
  r record;
  c record;
begin
  for r in
    select * from (values
      ('platform','egress_device',    'token_hash',                'entity'),
      ('platform','action_request',   'token_hash',                'entity'),
      ('crm',     'sending_identity', 'domain_verification_token', 'entity'),
      ('workflow','trigger',          'webhook_secret',            'entity'),
      ('web',     'crawl_schedule',   'claim_token',               'component'),
      ('browser', 'login_attempt',    'credential_item_id',        'component')
    ) as t(schema_name, table_name, column_name, variant)
  loop
    -- Remove ONLY this lane's name. An exclusion another lane declared on the same table
    -- survives, and the array becomes NULL rather than empty when nothing is left, which is
    -- the shape apply_table_grants reads as "no declaration".
    update platform.entity_types
       set client_excluded_columns = nullif(
             (select coalesce(array_agg(x order by x), '{}'::text[])
                from unnest(coalesce(client_excluded_columns, '{}'::text[])) x
               where x <> r.column_name),
             '{}'::text[])
     where schema_name = r.schema_name and table_name = r.table_name;

    -- A table-level REVOKE does not remove COLUMN-level grants, and the up-migration left one
    -- per remaining column. If they survived, apply_table_grants would see a partial
    -- column-grant design with no declaration behind it and refuse ("UNDECLARED column-level
    -- grant design"). So every column grant is removed by name first — the same loop
    -- apply_table_grants itself runs when it closes a schema.
    for c in select attname from pg_attribute
              where attrelid = format('%I.%I', r.schema_name, r.table_name)::regclass
                and attnum > 0 and not attisdropped loop
      execute format('revoke all (%I) on %I.%I from authenticated',
        c.attname, r.schema_name, r.table_name);
    end loop;
    execute format('revoke all on %I.%I from authenticated', r.schema_name, r.table_name);
    perform iam.apply_table_grants(r.schema_name, r.table_name, r.variant);
  end loop;
end $$;
