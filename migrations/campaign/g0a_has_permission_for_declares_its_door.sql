-- chair-step: one INSERT into platform.client_callable_door, a registry table the additive allow-list names, but this file also has to spell the signature the way the SHAPE GUARD renders it rather than the way a migration session does, and that is worth a person's eye. `public.has_permission_for` is the grant-reading half of the permissions system; it is SECURITY DEFINER and carries NO door row on either database, so the first migration that replaces its body is refused at COMMIT by `provision_shape_guard`. Declaring the door changes no grant and no behaviour: it writes down, in data, what is already true of who may call it.
--
-- G0A — `public.has_permission_for` DECLARES ITS DOOR.
--
-- WHY THE SIGNATURE IS A LITERAL AND NOT `pg_get_function_identity_arguments`.
-- `platform._provision_shape_settled()`'s debt arm matches on
--     d.identity_args = new.detail ->> 'identity_args'
-- and BOTH sides of that comparison are rendered by a SECURITY DEFINER function whose
-- `search_path` is `pg_catalog`, so the catalogue writes `p_required_permission
-- public.permission_level`. A migration session, which can see `public`, renders the same
-- function `p_required_permission permission_level`, the strings differ by five characters and
-- the guard concludes the door does not exist. Measured 2026-09-18: the dynamic form passed on
-- the rehearsal copy and was refused on the main database. So the literal is written out, in
-- the guard's own rendering, taken from the guard's own refusal message.
--
-- WHAT IS DECLARED, measured rather than assumed: prosecdef = true; EXECUTE is held by
-- `postgres` and `service_role` and by nobody else — `authenticated` and `anon` hold none.
-- A server-only lane is therefore the honest declaration AND the one that changes nothing;
-- declaring it a client door is what would move a grant.

set lock_timeout = '5s';
set statement_timeout = '120s';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'public', 'has_permission_for',
       'p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission public.permission_level',
       platform.door_argtypes(p.proargtypes),
       'p_user_id is the user whose access is being decided and is never taken from a client: every caller passes auth.uid() or a server-side identity. p_resource_type and p_resource_id name the row, and the function answers only whether the grants it reads confer p_required_permission on THAT row; an unknown resource type answers false rather than raising. NULL rule: any NULL argument answers false, because no grant row can match it — a NULL is never a wildcard here.',
       'g0a_has_permission_for_declares_its_door.sql',
       'server_only: this is the grant-reading half of the permissions system, called from SECURITY DEFINER policy helpers and from server code running as postgres or service_role. EXECUTE is held by postgres and service_role only; authenticated and anon hold none, measured on both databases 2026-09-18. No client path reaches it, and opening one is a decision with its own step.',
       false, false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'has_permission_for'
  and not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'public' and d.function_name = 'has_permission_for'
                     and d.identity_argtypes = platform.door_argtypes(p.proargtypes));
