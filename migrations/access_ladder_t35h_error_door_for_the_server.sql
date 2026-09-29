-- lane: access-ladder T-35h — the server's service-role writers reach ops.system_error through its door.
-- matrx-frontend's four server-side error writers (admin client) now call ops.record_system_error over
-- PostgREST; the door (T-35f) is server_only, so the service role is the only role granted it.
set local lock_timeout = '2s';

grant execute on function ops.record_system_error(jsonb) to service_role;
