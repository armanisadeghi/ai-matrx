-- Invitation codes are credentials, not public catalog rows. Exact-code
-- validation runs at the server boundary; anonymous callers must never be able
-- to enumerate the table. The consume helper remains service-role-only until
-- the account-creation flow owns an atomic validate-and-consume transaction.

BEGIN;

UPDATE users.invitation_codes
   SET organization_id = '39c38960-d30c-4840-b0c1-c9960de95582',
       visibility = 'personal'::platform.visibility
 WHERE organization_id IS NULL
    OR visibility = 'public'::platform.visibility;

ALTER TABLE users.invitation_codes
  ALTER COLUMN visibility SET DEFAULT 'personal'::platform.visibility;

DROP POLICY IF EXISTS pub_read ON users.invitation_codes;

REVOKE SELECT, INSERT, UPDATE, DELETE
  ON users.invitation_codes
  FROM anon;

REVOKE EXECUTE
  ON FUNCTION public.mark_invitation_code_used(text, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.mark_invitation_code_used(text, uuid)
  TO service_role;

DO $$
DECLARE
  v_public_rows integer;
  v_anon_table_privileges integer;
  v_anon_column_privileges integer;
BEGIN
  SELECT count(*)
    INTO v_public_rows
    FROM users.invitation_codes
   WHERE visibility = 'public'::platform.visibility
      OR organization_id IS NULL;

  IF v_public_rows <> 0 THEN
    RAISE EXCEPTION
      'invitation code privacy verification failed: % public/unowned rows',
      v_public_rows;
  END IF;

  SELECT count(*)
    INTO v_anon_table_privileges
    FROM information_schema.role_table_grants
   WHERE table_schema = 'users'
     AND table_name = 'invitation_codes'
     AND grantee = 'anon'
     AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');

  IF v_anon_table_privileges <> 0 THEN
    RAISE EXCEPTION
      'invitation code privacy verification failed: % anon table privileges',
      v_anon_table_privileges;
  END IF;

  SELECT count(*)
    INTO v_anon_column_privileges
    FROM information_schema.column_privileges
   WHERE table_schema = 'users'
     AND table_name = 'invitation_codes'
     AND grantee = 'anon'
     AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE');

  IF v_anon_column_privileges <> 0 THEN
    RAISE EXCEPTION
      'invitation code privacy verification failed: % anon column privileges',
      v_anon_column_privileges;
  END IF;
END $$;

COMMIT;
