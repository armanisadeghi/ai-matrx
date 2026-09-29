-- chair-step: it CREATES one restrictive SELECT policy on iam.api_keys so a personal-key row is visible only to the person it is (and to platform admins). No row, function or grant changes. CREATE POLICY takes the platform's sign-in freeze (an ACCESS EXCLUSIVE lock on auth.users) for the moment it runs, which is why it is its own file.
-- lane: TABLE-API-1
-- lock: iam
--
-- TABLE-API-1 — A PERSONAL KEY'S ROW IS ITS PERSON'S ALONE.
--
-- Companion of tableapi1_a_person_can_hold_a_key_that_is_them.sql. Without it, iam.api_keys'
-- std_select lets every member of the key's default organization read a personal key's row over
-- PostgREST (its name, its display prefix, who made it) — never the secret or its hash, which
-- the column grant already withholds. A person's credential is theirs: restrictive, so it narrows
-- every permissive policy, and platform admins keep their read (our own admin access is never
-- removed).

set local lock_timeout = '3s';

-- ── 5. a personal key's row is its person's alone ────────────────────────────────────────
create policy api_keys_personal_rows_are_their_owners on iam.api_keys
  as restrictive
  for select
  to authenticated
  using (
    coalesce(metadata->>'identity_kind', '') <> 'personal_key'
    or created_by = (select auth.uid())
    or (select public.is_platform_admin())
  );
