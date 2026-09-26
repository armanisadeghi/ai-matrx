-- draft: deep-lane read-lane-v2 — lands in the 2026-09-27 window after read_lane_v2_d_client_declarations
-- read_lane_v2_e_users_client_declarations — declare, in the registry, the two client-access facts the two
-- users.* tables already live by, so iam.apply_rls regenerates them with NO widening (chair rulings 2026-09-26):
--   * users.integration_connections: credential_present, credential_stable, capability_health are read by
--     clients and written only by the server (authenticated holds SELECT only on them today).
--   * users.credential_attachments: no client hard delete — archive, never delete (Arman's law); today no
--     signed-in client can delete one (only the platform_admin_write_delete lane).
-- Registry declaration only. Guarded: exactly the intended rows, and never over someone else's declaration.
do $$
declare n integer;
begin
  update platform.entity_types
     set client_read_only_columns = array['credential_present', 'credential_stable', 'capability_health']
   where token = 'integration_connection' and schema_name = 'users' and table_name = 'integration_connections'
     and is_active and client_read_only_columns is null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'read_lane_v2_e: integration_connection read-only columns: touched % rows, expected 1', n; end if;

  update platform.entity_types
     set client_deletes_refused = true
   where token = 'credential_attachment' and schema_name = 'users' and table_name = 'credential_attachments'
     and is_active and not client_deletes_refused;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'read_lane_v2_e: credential_attachment deletes refused: touched % rows, expected 1', n; end if;
end $$;
