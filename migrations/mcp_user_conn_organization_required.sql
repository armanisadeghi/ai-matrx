-- based-on: public.upsert_mcp_connection(uuid, uuid, mcp_transport, text, uuid) 739180a7c7ece4e51e8f637c0a6f2492e0f078084b4751b65db076fdabdd8b09
-- chair-step: SET NOT NULL on tool.mcp_user_conn.organization_id (owner ruling 2026-08-21, NO NULL ORG). Every live writer in both repos supplies an organization, 0 of 33 rows lack one, and the one RPC that accepted a missing one now refuses it in this same file.
-- mcp_user_conn_organization_required.sql
--
-- NO NULL ORG (owner ruling 2026-08-21) for tool.mcp_user_conn — the ddl guard's
-- open `nullable_org` finding.
--
-- Writer census (2026-09-27, both repos + DB):
--   * matrx-frontend features/agents/services/mcp.service.ts connectMcpServer →
--     rpc upsert_mcp_connection with p_organization_id = requireSelectedOrgId()
--     (throws OrganizationRequired; never null). The only client writer.
--   * aidream services/mcp_connections/service.py — both McpUserConn.create paths
--     pass organization_for_request(ctx) (raises OrganizationRequired); the
--     reconnect update never touches organization_id.
--   * No trigger, default, view or cron job writes the column.
--   * Live: 33 rows, 0 with a null organization.
-- The one hole was the RPC itself: p_organization_id DEFAULT NULL was accepted
-- and inserted. It now refuses by name (22004). The DEFAULT stays in the
-- signature (a default cannot be removed by CREATE OR REPLACE); an omitted
-- argument is refused, never filled in.

do $fix$
declare
  v_def text;
  v_old text := E'    -- The organization is where a NEW connection is filed — named by the caller, never chosen here.\n';
  v_new text := E'    -- The organization is where a NEW connection is filed — named by the caller, never chosen here.\n'
             || E'    IF p_organization_id IS NULL THEN\n'
             || E'        RAISE EXCEPTION USING ERRCODE = ''22004'',\n'
             || E'          MESSAGE = ''upsert_mcp_connection: name the organization this connection is filed in (p_organization_id).'';\n'
             || E'    END IF;\n';
  v_n integer;
begin
  v_def := pg_get_functiondef('public.upsert_mcp_connection(uuid,uuid,mcp_transport,text,uuid)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'upsert_mcp_connection anchor found % times, expected 1', v_n; end if;
  execute replace(v_def, v_old, v_new);
end $fix$;

alter table tool.mcp_user_conn alter column organization_id set not null;

do $assert$
begin
  if not (select attnotnull from pg_attribute where attrelid = 'tool.mcp_user_conn'::regclass and attname = 'organization_id') then
    raise exception 'organization_id is still nullable';
  end if;
  if not has_function_privilege('authenticated', 'public.upsert_mcp_connection(uuid,uuid,mcp_transport,text,uuid)', 'execute') then
    raise exception 'authenticated lost EXECUTE on upsert_mcp_connection';
  end if;
end $assert$;

update platform.ddl_guard_log
   set acknowledged_at = now(),
       acknowledged_by = 'mcp_user_conn_organization_required.sql',
       ack_reason = 'organization_id set NOT NULL after a writer census of both repos and the DB; upsert_mcp_connection now refuses a missing organization.'
 where rule = 'nullable_org' and object_ref = 'tool.mcp_user_conn' and acknowledged_at is null;
