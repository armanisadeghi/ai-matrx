-- lane: SECURITY-SWEEP
-- Chair ruling 2. `browser.account_binding.credential_item_id` names WHICH SAVED LOGIN a cloud
-- browser binding spends — choosing it client-side is choosing somebody else's stored
-- credential. The bindings are written by aidream (the cloud browser's capture-result door,
-- reached from `features/cloud-browser/service.ts::recordCaptureOutcome` through
-- `POST /browser-manager/runs/<id>/capture-result`), never over PostgREST.
--
-- IT WAS BLOCKED ON A `select("*")`, AND THAT IS NOW FIXED. The one reader,
-- `features/cloud-browser/service.ts`, read the whole row and handed it to `mapBinding`, which
-- uses EIGHT columns and never this one. In the same change that ships this file the read
-- became a named `ACCOUNT_BINDING_COLUMNS` list and `BindingRow` became a `Pick<...>` of
-- exactly those columns. A screen never needs a credential to render.
--
-- ADDITIVE for the app.
-- Inverse: migrations/inverse/secsweep_the_account_binding_credential_leaves_the_client_grant.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` — the baseline shrinks again.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('browser','account_binding','credential_item_id','component')
    ) as t(schema_name, table_name, column_name, variant)
  loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = r.schema_name and table_name = r.table_name
         and column_name = r.column_name
    ) then
      raise exception 'secsweep: %.% has no column % — the census is stale, stopping',
        r.schema_name, r.table_name, r.column_name;
    end if;
    if not exists (
      select 1 from platform.entity_types
       where schema_name = r.schema_name and table_name = r.table_name
         and rls_variant = r.variant
    ) then
      raise exception
        'secsweep: %.% has no platform.entity_types row with rls_variant % — refusing to re-grant',
        r.schema_name, r.table_name, r.variant;
    end if;

    update platform.entity_types
       set client_excluded_columns = (
             select array_agg(distinct x order by x)
               from unnest(coalesce(client_excluded_columns, '{}'::text[])
                           || array[r.column_name]) x)
     where schema_name = r.schema_name and table_name = r.table_name
       and not (r.column_name = any (coalesce(client_excluded_columns, '{}'::text[])));

    perform iam.apply_table_grants(r.schema_name, r.table_name, r.variant);

    if has_column_privilege('authenticated',
         format('%I.%I', r.schema_name, r.table_name)::regclass, r.column_name, 'INSERT')
       or has_column_privilege('authenticated',
         format('%I.%I', r.schema_name, r.table_name)::regclass, r.column_name, 'UPDATE') then
      raise exception
        'secsweep: %.%.% is STILL client-writable after the exclusion — refusing to report a fix that did not happen',
        r.schema_name, r.table_name, r.column_name;
    end if;

    raise notice 'secsweep: %.%.% is no longer writable or readable by a client role',
      r.schema_name, r.table_name, r.column_name;
  end loop;
end $$;

comment on column browser.account_binding.credential_item_id is
  'Which saved login this binding spends. Written by aidream through the cloud browser''s capture-result door; withheld from every client role by platform.entity_types.client_excluded_columns, so the one reader uses a named column list. SECURITY-SWEEP, 2026-09-21.';
