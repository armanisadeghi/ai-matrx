-- draft: deep-lane read-lane-v2 — lands in the 2026-09-27 window before users.integration_connections is regenerated
-- read_lane_v2_c_integration_connections_excluded_columns — declare the columns a signed-in client must
-- NEVER hold on users.integration_connections, so iam.apply_table_grants (which grants every live column
-- not declared excluded) keeps them withheld when the table is regenerated.
--
-- Chair ruling 2026-09-26: signed-in users must never get vault_secret_key or credential_item_id; created_by
-- only if the declared state wants it. It does not: authenticated holds no privilege on any of the three
-- today, and no client read names them (matrx-frontend features/{storage-connections,github-integration,
-- marketing/bing,marketing/google} select CONNECTION_SELECT without them). custom_fields is NOT excluded:
-- its platform-standard grant is the chair-approved catch-up class.
-- Registry declaration only — no grant, no policy statement. Guarded: exactly one row, and only when the
-- declaration is empty today (never overwrites someone else's).
do $$
declare n integer;
begin
  update platform.entity_types
     set client_excluded_columns = array['vault_secret_key', 'credential_item_id', 'created_by']
   where token = 'integration_connection' and schema_name = 'users' and table_name = 'integration_connections'
     and is_active and client_excluded_columns is null;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'read_lane_v2_c: expected to declare exactly one registry row, touched % — the declaration may already exist; read it before re-running', n;
  end if;
end $$;
