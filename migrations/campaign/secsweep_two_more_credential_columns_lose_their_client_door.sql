-- lane: SECURITY-SWEEP — the second batch of chair ruling 2
-- ("credential/secret/token-hash columns never client-writable at all").
-- Same mechanism, same reasoning and the same per-column census as
-- `secsweep_a_credential_column_is_never_client_writable.sql`; read that file's header first.
--
--   esign.provider.credentials           the e-signature provider's own API credentials, on a
--       `restricted` table served over PostgREST with a table-level INSERT/UPDATE grant. The
--       frontend does not touch the `esign` schema at all: there is no `.schema("esign")`
--       call and no `.from("provider")` under `features/esign` anywhere in matrx-frontend, and
--       no `select("*")` either, so nothing reads or writes this column from a browser today.
--       A client that could write it could point the platform's signing at credentials it
--       chose.
--   tool.mcp_user_conn.credential_item_id   which Vault item an MCP connection draws its
--       bearer from, on a `personal` table. Its only two frontend callers
--       (`features/tool-registry/mcp-admin/services/mcpAdmin.service.ts`) are
--       `select("id", { count: "exact", head: true })` counts — nothing writes the row, and
--       nothing reads this column. `features/secrets/FEATURE.md` already says out loud that
--       "MCP is a vault consumer, not a token store"; the connection is minted and refreshed
--       by aidream. Choosing this id client-side is choosing whose stored credential the
--       server will spend.
--
-- ADDITIVE for the app; the declaration is what makes it survive a regeneration.
-- Inverse: migrations/inverse/secsweep_two_more_credential_columns_lose_their_client_door.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` — the baseline shrinks again.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('esign','provider',       'credentials',        'restricted'),
      ('tool', 'mcp_user_conn',  'credential_item_id', 'personal')
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

comment on column esign.provider.credentials is
  'The e-signature provider''s own API credentials. Server-side only; withheld from every client role by platform.entity_types.client_excluded_columns. SECURITY-SWEEP, 2026-09-21.';
comment on column tool.mcp_user_conn.credential_item_id is
  'Which Vault item this MCP connection spends. Minted and refreshed by aidream — MCP is a vault consumer, not a token store. Withheld from every client role. SECURITY-SWEEP, 2026-09-21.';
