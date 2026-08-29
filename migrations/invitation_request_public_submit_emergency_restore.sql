-- Restore the public invitation-request submission lane that canonical RLS
-- regeneration removed. This is deliberately INSERT-only: anonymous callers
-- cannot read, update, review, approve, reject, or generate invitation codes.
--
-- The currently deployed landing action predates explicit system-org writes,
-- so this emergency policy accepts only the exact legacy Step 1 shape. The
-- application repair writes through the validated server boundary instead;
-- once that release is live, a follow-up migration removes this temporary
-- direct table lane entirely.

BEGIN;

DROP POLICY IF EXISTS invitation_request_public_submit
  ON users.invitation_requests;

DROP POLICY IF EXISTS invitation_request_public_return_id
  ON users.invitation_requests;

CREATE POLICY invitation_request_public_submit
  ON users.invitation_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND step_completed = 1
    AND created_by IS NULL
    AND organization_id IS NULL
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND notes IS NULL
    AND deleted_at IS NULL
    AND visibility = 'personal'::platform.visibility
    AND created_at BETWEEN statement_timestamp() - interval '1 minute'
                       AND statement_timestamp() + interval '1 minute'
  );

-- The deployed Supabase call ends the INSERT with `.select('id').single()`.
-- PostgreSQL evaluates that RETURNING path against SELECT privileges/policies.
-- Expose only the UUID column, and only during the minute in which the row was
-- created; every applicant detail remains unreadable to anonymous callers.
REVOKE SELECT ON users.invitation_requests FROM anon;
GRANT SELECT (id) ON users.invitation_requests TO anon;

CREATE POLICY invitation_request_public_return_id
  ON users.invitation_requests
  FOR SELECT
  TO anon, authenticated
  USING (
    created_at BETWEEN statement_timestamp() - interval '1 minute'
                   AND statement_timestamp() + interval '1 minute'
  );

DO $$
DECLARE
  v_policy_count integer;
BEGIN
  SELECT count(*)
    INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'users'
     AND tablename = 'invitation_requests'
     AND policyname = 'invitation_request_public_submit'
     AND cmd = 'INSERT'
     AND roles @> ARRAY['anon'::name, 'authenticated'::name];

  IF v_policy_count <> 1 THEN
    RAISE EXCEPTION
      'invitation request public submit policy verification failed: %',
      v_policy_count;
  END IF;

  SELECT count(*)
    INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'users'
     AND tablename = 'invitation_requests'
     AND policyname = 'invitation_request_public_return_id'
     AND cmd = 'SELECT'
     AND roles @> ARRAY['anon'::name, 'authenticated'::name];

  IF v_policy_count <> 1 THEN
    RAISE EXCEPTION
      'invitation request id-return policy verification failed: %',
      v_policy_count;
  END IF;
END $$;

COMMIT;
