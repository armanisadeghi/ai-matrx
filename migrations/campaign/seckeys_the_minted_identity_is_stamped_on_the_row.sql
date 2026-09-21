-- lane: SECURITY-KEYS
-- based-on: iam.api_key_identity_must_be_minted() 0d792088a123a6808bb70be9962256ed42e6808ddfeef1e47c3a1f156740d4f1
--
-- CRITICAL-1, the server's half of the invariant (VERIFIER-8 2026-09-21;
-- feedback 2bf46257-ac5f-4213-8a32-af2498979de9).
--
-- The trigger applied at 14:28:06 UTC already refuses any `iam.api_keys` row whose
-- `service_user_id` is not a door-minted `auth.users` principal. The aidream API-key
-- authenticator must refuse the same shape — a key it has already loaded must not be allowed
-- to adopt an identity the database would not have issued — and to do that it needs the
-- verdict ON THE ROW, because `aidream` reads this table through the ORM and the repo forbids
-- raw SQL outside migrations (`aidream/CLAUDE.md`: "ZERO raw SQL outside db/migrations/").
--
-- So the trigger that already performs the check now RECORDS it: on every accepted insert or
-- identity change it stamps `metadata.identity_kind = 'api_key_service'`. The stamp is
-- unforgeable — no client role holds INSERT or UPDATE on this table any more (14:25:44 UTC),
-- and the trigger overwrites the key on every write, so a value supplied by any writer is
-- replaced by the one the database just proved. A row without the stamp is a row this trigger
-- never blessed, and the server refuses it.
--
-- The three existing rows (all `revoked`, all issued by the real door, all pointing at a
-- `provider = 'api_key'` principal — verified before this file was written) are backfilled, so
-- the server's rule has no grandfather clause and no legitimate key is denied by it.
--
-- ADDITIVE: replaces a function this lane created 22 minutes ago and stamps a metadata key on
-- three of our own rows. Nothing dropped, nothing renamed, no customer data touched.
-- Inverse (rehearsal only): re-apply the previous body from
--   seckeys_a_key_may_only_carry_a_minted_identity.sql.
-- Guard: `aidream/aidream/services/api_keys/tests/test_identity_must_be_minted.py`, red-then-green.

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

  -- The verdict, written where the server can read it through the ORM. Always overwritten,
  -- never merged from the incoming value, so no writer can assert it for itself.
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object('identity_kind', 'api_key_service');

  return new;
end;
$$;

-- The three keys that predate the trigger. Each was issued by iam.api_key_create and points at
-- a provider = 'api_key' principal; the subquery re-proves that rather than trusting it.
update iam.api_keys k
   set metadata = coalesce(k.metadata, '{}'::jsonb)
     || jsonb_build_object('identity_kind', 'api_key_service')
 where k.metadata->>'identity_kind' is distinct from 'api_key_service'
   and exists (
     select 1 from auth.users u
      where u.id = k.service_user_id
        and u.raw_app_meta_data->>'provider' = 'api_key'
   );

comment on function iam.api_key_identity_must_be_minted() is
  'CRITICAL-1 (VERIFIER-8 2026-09-21): refuses any iam.api_keys row whose service_user_id is not a door-minted API-key principal, and stamps metadata.identity_kind = ''api_key_service'' on every row it blesses so the aidream authenticator can refuse an unblessed key without raw SQL. The last line of defence under the grants and the RLS policies — it holds against service_role and against any future policy mistake.';
