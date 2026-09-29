-- chair-step: inverse of tableapi1_a_person_can_hold_a_key_that_is_them.sql — puts back the CRITICAL-1 trigger and iam.api_key_revoke exactly as they were, drops the three personal-key doors, their door rows, the restrictive SELECT policy and the four knob rows. A personal key minted in between stays in iam.api_keys but can no longer be listed or revoked by its person; revoke it first.
--
-- inverse of tableapi1_a_person_can_hold_a_key_that_is_them.sql
-- The two bodies below are pg_get_functiondef read from production on 2026-09-29 before the up.

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION iam.api_key_identity_must_be_minted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if new.service_user_id is null then
    raise exception 'api_keys: service_user_id is required'
      using errcode = '23502';
  end if;

  if not exists (
    select 1 from auth.users u
     where u.id = new.service_user_id
       and u.raw_app_meta_data->>'provider' = 'api_key'
  ) then
    raise exception 'api_keys: service_user_id is not an API-key service identity, so this key would authenticate as somebody who never issued it' using errcode = '42501',
            hint = 'The identity a key carries is minted by iam.api_key_create, which creates a dedicated auth.users principal stamped provider = ''api_key''. A key may never point at a human user account. CRITICAL-1, 2026-09-21.',
            detail = jsonb_build_object('service_user_id', new.service_user_id)::text;
  end if;

  -- The verdict, written where the server can read it through the ORM. Always overwritten,
  -- never merged from the incoming value, so no writer can assert it for itself.
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object('identity_kind', 'api_key_service');

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.api_key_revoke(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_row iam.api_keys%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'api_key_revoke: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM iam.api_keys WHERE id = p_id;
  IF NOT FOUND THEN
    raise exception 'api_key_revoke: unknown API key' using errcode = 'P0001', detail = jsonb_build_object('id', p_id)::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM iam.memberships m
    WHERE m.user_id = v_caller
      AND m.container_type = 'organization'
      AND m.container_id = v_row.organization_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'api_key_revoke: only an organization OWNER may revoke API keys'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'revoked' THEN
    RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'revoked_at', v_row.revoked_at);
  END IF;

  UPDATE iam.api_keys
     SET status = 'revoked', revoked_at = now(), updated_by = v_caller
   WHERE id = p_id
  RETURNING * INTO v_row;

  UPDATE iam.memberships
     SET deleted_at = now(), updated_by = v_caller
   WHERE user_id = v_row.service_user_id
     AND container_type = 'organization'
     AND container_id = v_row.organization_id
     AND deleted_at IS NULL;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'revoked_at', v_row.revoked_at);
END;
$function$;

drop policy if exists api_keys_personal_rows_are_their_owners on iam.api_keys;

delete from platform.client_callable_door
 where schema_name = 'iam'
   and function_name in ('personal_api_key_create', 'personal_api_key_list', 'personal_api_key_revoke');

drop function if exists iam.personal_api_key_create(text, uuid, timestamp with time zone);
drop function if exists iam.personal_api_key_list();
drop function if exists iam.personal_api_key_revoke(uuid);
drop function if exists iam.oauth_client_is_dynamic(uuid);

delete from platform.feature_knob
 where (feature, key) in (('api_keys', 'personal_key_max_age_days'),
                          ('table_api', 'requests_per_minute_per_server'),
                          ('table_api', 'bulk_max_rows'),
                          ('mcp', 'oauth_dynamic_clients_enabled'));
