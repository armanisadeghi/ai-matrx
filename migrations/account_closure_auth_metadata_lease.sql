-- chair-step: Account closure requires Auth-row serialization without a parallel journal table.
-- Server-only fenced lock for auth.users.raw_app_meta_data.account_closure.
-- The journal is intentionally retained with the identity and never deletes user data.

create function public.account_closure_claim(
  p_user_id uuid,
  p_token uuid,
  p_initial_journal jsonb default '{}'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  v_metadata jsonb;
  v_journal jsonb;
  v_until timestamptz := pg_catalog.now() + interval '5 minutes';
begin
  select raw_app_meta_data into v_metadata
  from auth.users where id = p_user_id for update;
  if not found then raise exception 'account_closure_user_not_found' using errcode = 'P0002'; end if;
  v_metadata := coalesce(v_metadata, '{}'::jsonb);
  v_journal := coalesce(v_metadata->'account_closure', p_initial_journal, '{}'::jsonb);
  if jsonb_typeof(v_journal) <> 'object' then raise exception 'account_closure_journal_invalid' using errcode = '22023'; end if;
  if (v_journal #>> '{lease,expires_at}')::timestamptz > pg_catalog.now()
     and v_journal #>> '{lease,token}' <> p_token::text then
    return null;
  end if;
  v_journal := jsonb_set(v_journal, '{lease}', jsonb_build_object('token', p_token::text, 'expires_at', v_until), true);
  update auth.users set raw_app_meta_data = v_metadata || jsonb_build_object('account_closure', v_journal)
  where id = p_user_id;
  return v_journal;
end;
$fn$;

create function public.account_closure_write(
  p_user_id uuid,
  p_token uuid,
  p_journal jsonb
) returns boolean
language plpgsql volatile security definer set search_path = '' as $fn$
declare v_metadata jsonb; v_until timestamptz;
begin
  if jsonb_typeof(p_journal) <> 'object' then raise exception 'account_closure_journal_invalid' using errcode = '22023'; end if;
  select raw_app_meta_data into v_metadata from auth.users where id = p_user_id for update;
  if not found then raise exception 'account_closure_user_not_found' using errcode = 'P0002'; end if;
  v_until := (v_metadata #>> '{account_closure,lease,expires_at}')::timestamptz;
  if v_metadata #>> '{account_closure,lease,token}' <> p_token::text or v_until <= pg_catalog.now() then return false; end if;
  p_journal := jsonb_set(p_journal, '{lease}', jsonb_build_object('token', p_token::text, 'expires_at', pg_catalog.now() + interval '5 minutes'), true);
  update auth.users set raw_app_meta_data = coalesce(v_metadata, '{}'::jsonb) || jsonb_build_object('account_closure', p_journal) where id = p_user_id;
  return true;
end;
$fn$;

create function public.account_closure_release(p_user_id uuid, p_token uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $fn$
declare v_metadata jsonb; v_journal jsonb;
begin
  select raw_app_meta_data into v_metadata from auth.users where id = p_user_id for update;
  if not found then raise exception 'account_closure_user_not_found' using errcode = 'P0002'; end if;
  if v_metadata #>> '{account_closure,lease,token}' <> p_token::text then return false; end if;
  v_journal := (v_metadata->'account_closure') - 'lease';
  update auth.users set raw_app_meta_data = v_metadata || jsonb_build_object('account_closure', v_journal) where id = p_user_id;
  return true;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('public', 'account_closure_claim', 'p_user_id uuid, p_token uuid, p_initial_journal jsonb', array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[], 'The user id is checked by the server route before it obtains this service-only lock; the token is an opaque fence and never identifies a record.', 'account_closure_auth_metadata_lease', 'server_only: the authenticated account lifecycle route uses the service key after a fresh Auth identity check, so no browser calls this function.', false, false),
  ('public', 'account_closure_write', 'p_user_id uuid, p_token uuid, p_journal jsonb', array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[], 'The user id was freshly authenticated by the server route; the matching unexpired opaque token fences every journal write.', 'account_closure_auth_metadata_lease', 'server_only: the account lifecycle route writes its journal with the service key only after a fresh caller-to-user-id authorization check.', false, false),
  ('public', 'account_closure_release', 'p_user_id uuid, p_token uuid', array['uuid'::regtype, 'uuid'::regtype]::oid[], 'The user id is authorized by the server route and only the matching opaque lease token can release the lock.', 'account_closure_auth_metadata_lease', 'server_only: the account lifecycle server route releases only its own fence token; this operation has no browser call surface.', false, false);

revoke all on function public.account_closure_claim(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.account_closure_write(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.account_closure_release(uuid, uuid) from public, anon, authenticated;
grant execute on function public.account_closure_claim(uuid, uuid, jsonb) to service_role;
grant execute on function public.account_closure_write(uuid, uuid, jsonb) to service_role;
grant execute on function public.account_closure_release(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
