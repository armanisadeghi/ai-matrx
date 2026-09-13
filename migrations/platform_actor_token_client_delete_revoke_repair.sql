-- Repair the client-role DELETE grant detected by
-- hr.punch_write_path_conformance(). Legitimate actor-token writes execute
-- through owner-backed SECURITY DEFINER functions; browser roles retain only
-- their RLS-scoped SELECT access.

begin;

revoke insert, update, delete on table platform.actor_token from public;
revoke insert, update, delete on table platform.actor_token from anon;
revoke insert, update, delete on table platform.actor_token from authenticated;

grant insert, update, delete on table platform.actor_token to service_role;

do $verify$
declare
  v_role text;
  v_privilege text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_privilege in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(v_role, 'platform.actor_token', v_privilege) then
        raise exception '% still has % on platform.actor_token', v_role, v_privilege;
      end if;
    end loop;
  end loop;

  foreach v_privilege in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', 'platform.actor_token', v_privilege) then
      raise exception 'service_role lost % on platform.actor_token', v_privilege;
    end if;
  end loop;
end
$verify$;

commit;
