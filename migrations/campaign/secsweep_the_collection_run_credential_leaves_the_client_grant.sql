-- lane: SECURITY-SWEEP
-- Chair ruling 2, the third batch. `seo.collection_run.credential_reference_id` names WHICH
-- STORED CREDENTIAL an AI-visibility collection run spends — a client that could choose it
-- could spend somebody else's. The runs are created by aidream
-- (`aidream/api/routers/seo_collections.py:272` passes `credential_reference_id=` into the
-- create path); nothing in any client repository writes this table.
--
-- IT WAS BLOCKED ON A `select("*")`, AND THAT IS NOW FIXED. `client_excluded_columns` withholds
-- a column from SELECT as well as INSERT/UPDATE, and
-- `features/marketing/competitors/data.ts` read `seo.collection_run` with `select("*")`, so
-- excluding the column here would have 42501'd a live screen. In the same change that ships
-- this file, that read became a named `COMPETITOR_RUN_COLUMNS` list and its row type became a
-- `Pick<...>` of the columns the workspace actually uses. Every other reader was already a
-- named list (`RUN_COLUMNS` in `features/marketing/data/collection-runs.ts`, `select("result")`
-- in `features/marketing/authority/data.ts`, and the run detail page's own list). A screen
-- never needs a credential to render.
--
-- ADDITIVE for the app.
-- Inverse: migrations/inverse/secsweep_the_collection_run_credential_leaves_the_client_grant.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` — the baseline shrinks again.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('seo','collection_run','credential_reference_id','entity')
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

comment on column seo.collection_run.credential_reference_id is
  'Which stored credential this collection run spends. Chosen server-side by aidream; withheld from every client role by platform.entity_types.client_excluded_columns, so every reader of this table uses a named column list. SECURITY-SWEEP, 2026-09-21.';
