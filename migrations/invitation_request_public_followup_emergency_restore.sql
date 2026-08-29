-- Temporary compatibility for the already-deployed public request action.
-- Step 1 creates the private row; the optional step 2 may update only its five
-- follow-up answers and step marker. The durable application path performs
-- both writes through the server-only admin client.

BEGIN;

REVOKE UPDATE, DELETE
  ON users.invitation_requests
  FROM anon;

GRANT UPDATE (
  phone,
  biggest_obstacle,
  referral_source,
  current_ai_systems,
  recent_project,
  step_completed
)
  ON users.invitation_requests
  TO anon;

GRANT SELECT (id, status)
  ON users.invitation_requests
  TO anon;

DROP POLICY IF EXISTS invitation_request_public_return_id
  ON users.invitation_requests;

CREATE POLICY invitation_request_public_return_id
  ON users.invitation_requests
  FOR SELECT
  TO anon
  USING (
    created_at >= statement_timestamp() - interval '2 hours'
    AND created_at <= statement_timestamp() + interval '1 minute'
  );

DROP POLICY IF EXISTS invitation_request_public_followup
  ON users.invitation_requests;

CREATE POLICY invitation_request_public_followup
  ON users.invitation_requests
  FOR UPDATE
  TO anon
  USING (
    status = 'pending'
    AND step_completed = 1
    AND created_by IS NULL
    AND organization_id IS NULL
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND notes IS NULL
    AND deleted_at IS NULL
    AND visibility = 'personal'::platform.visibility
    AND created_at >= statement_timestamp() - interval '2 hours'
    AND created_at <= statement_timestamp() + interval '1 minute'
  )
  WITH CHECK (
    status = 'pending'
    AND step_completed = 2
    AND created_by IS NULL
    AND organization_id IS NULL
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND notes IS NULL
    AND deleted_at IS NULL
    AND visibility = 'personal'::platform.visibility
    AND created_at >= statement_timestamp() - interval '2 hours'
    AND created_at <= statement_timestamp() + interval '1 minute'
  );

DO $$
DECLARE
  v_anon_update_columns text[];
  v_anon_select_columns text[];
BEGIN
  SELECT array_agg(column_name ORDER BY column_name)
    INTO v_anon_update_columns
    FROM information_schema.column_privileges
   WHERE table_schema = 'users'
     AND table_name = 'invitation_requests'
     AND grantee = 'anon'
     AND privilege_type = 'UPDATE';

  IF v_anon_update_columns IS DISTINCT FROM ARRAY[
    'biggest_obstacle',
    'current_ai_systems',
    'phone',
    'recent_project',
    'referral_source',
    'step_completed'
  ]::text[] THEN
    RAISE EXCEPTION
      'invitation follow-up verification failed: unexpected anon UPDATE columns %',
      v_anon_update_columns;
  END IF;

  SELECT array_agg(column_name ORDER BY column_name)
    INTO v_anon_select_columns
    FROM information_schema.column_privileges
   WHERE table_schema = 'users'
     AND table_name = 'invitation_requests'
     AND grantee = 'anon'
     AND privilege_type = 'SELECT';

  IF v_anon_select_columns IS DISTINCT FROM ARRAY['id', 'status']::text[] THEN
    RAISE EXCEPTION
      'invitation follow-up verification failed: unexpected anon SELECT columns %',
      v_anon_select_columns;
  END IF;
END $$;

COMMIT;
