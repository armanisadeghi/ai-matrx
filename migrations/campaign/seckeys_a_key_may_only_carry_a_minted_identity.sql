-- lane: SECURITY-KEYS
-- CRITICAL-1, the deepest layer (VERIFIER-8 2026-09-21; feedback 2bf46257-ac5f-4213-8a32-af2498979de9)
--
-- `seckeys_api_keys_have_exactly_one_door.sql` stopped CLIENTS from writing this table.
-- This stops ANY writer — including `service_role`, including a future policy or grant
-- mistake, including a hand-written statement — from creating a key whose `service_user_id`
-- is a real human. That column is the identity a presented key adopts, so a key pointing at
-- a person IS an impersonation of that person, whatever wrote the row.
--
-- WHAT A LEGITIMATE IDENTITY LOOKS LIKE, AND WHY "service_user_id = created_by" IS THE WRONG
-- TEST. `iam.api_key_create` mints a DEDICATED `auth.users` principal for every key and
-- stamps it `raw_app_meta_data->>'provider' = 'api_key'`. So on a real key the service user
-- is NEVER the human who created it — requiring them to be equal would refuse every key the
-- product has ever issued. The real invariant is that the identity was MINTED BY THE DOOR,
-- and the provider stamp is that server-minted delegation, written in a schema (`auth`) no
-- client role can write at all. All three rows the table holds today satisfy it.
--
-- The trigger fires only when `service_user_id` is actually set or changed, so it costs one
-- indexed lookup on key creation and nothing on a `last_used_at` telemetry write.
--
-- ADDITIVE: a new function and a new trigger. Nothing dropped, nothing renamed.
-- Inverse (rehearsal only):
--   drop trigger api_keys_identity_must_be_minted on iam.api_keys;
--   drop function iam.api_key_identity_must_be_minted();
-- Guard: `aidream/tests/test_api_key_identity_must_be_minted.py` proves the server half
-- refuses the same shape, red-then-green.

create or replace function iam.api_key_identity_must_be_minted()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
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
    raise exception
      'api_keys: service_user_id % is not an API-key service identity, so this key would authenticate as somebody who never issued it',
      new.service_user_id
      using errcode = '42501',
            hint = 'The identity a key carries is minted by iam.api_key_create, which creates a dedicated auth.users principal stamped provider = ''api_key''. A key may never point at a human user account. CRITICAL-1, 2026-09-21.';
  end if;

  return new;
end;
$$;

create trigger api_keys_identity_must_be_minted
  before insert or update of service_user_id on iam.api_keys
  for each row execute function iam.api_key_identity_must_be_minted();

comment on function iam.api_key_identity_must_be_minted() is
  'CRITICAL-1 (VERIFIER-8 2026-09-21): refuses any iam.api_keys row whose service_user_id is not a door-minted API-key principal. The last line of defence under the grants and the RLS policies — it holds against service_role and against any future policy mistake, because a key pointing at a human is an impersonation of that human no matter what wrote the row.';
