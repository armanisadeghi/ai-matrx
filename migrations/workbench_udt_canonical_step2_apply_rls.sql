-- workbench_udt_canonical_step2_apply_rls.sql
-- ---------------------------------------------------------------------------
-- STEP 2 of 4 — regenerate RLS for the four UDT entities through the CANONICAL
-- generator. No policy is hand-written here; iam.apply_rls(...,'entity') emits
-- the whole set, plus the table grants and the governance-column guard.
--
-- WHAT THIS FIXES (measured live 2026-08-15, before this migration):
--   Every authenticated SELECT on workbench.udt_workbooks and
--   workbench.udt_documents RAISED:
--       "Unknown entity token: udt_workbooks. Bare table names are not
--        permission keys."
--   Their legacy policies called has_permission() with the PHYSICAL TABLE NAME
--   instead of the entity token, and has_permission_for RAISES on an unknown
--   token rather than returning false. Because the raise happens inside the
--   row predicate, it takes down the WHOLE query — so this was not "a share
--   that silently fails", it was a hard outage: /workbooks and /documents
--   returned zero rows to EVERY user including each row's own author. Probed
--   across all 18 identities that own data here: 0 of 17 workbooks and 0 of 24
--   documents were readable by anyone.
--   apply_rls reads the token from platform.entity_types, so the correct
--   tokens ('workbook', 'udt_document') are what land in the new policies.
--
-- WHAT THIS CHANGES ON PURPOSE:
--   The canonical SELECT lane is `created_by = auth.uid() OR iam.has_access(...)`,
--   and iam.has_access_for_base grants org members viewer+editor on any row whose
--   visibility >= 'internal'. That is the whole point of the change: these four
--   entities can finally be shared with an organization.
--
-- WHAT MUST NOT CHANGE:
--   - every row stays reachable by whoever reaches it today (created_by ==
--     user_id on all 209 rows, so the owner lane is identical);
--   - the 9 public rows stay readable by authenticated users (has_access_for_base
--     public lane) AND by anon (the generated `pub_read` policy);
--   - no existing iam.permissions grant is invalidated — there are ZERO grants
--     recorded for any of these four resource types, so switching from the
--     bare-table-name key to the canonical token cannot revoke anything.
-- ---------------------------------------------------------------------------

SELECT iam.apply_rls('workbench', 'udt_workbooks',        'workbook',        'entity');
SELECT iam.apply_rls('workbench', 'udt_documents',        'udt_document',    'entity');
SELECT iam.apply_rls('workbench', 'udt_datasets',         'dataset',         'entity');
SELECT iam.apply_rls('workbench', 'udt_structured_lists', 'structured_list', 'entity');

-- anon carried INSERT/UPDATE/DELETE grants on all four (a leftover from the
-- pre-reorg public schema). They grant nothing today — anon satisfies no write
-- policy either before or after this migration — but a grant with no policy
-- behind it is a hole waiting for the next permissive policy someone adds.
-- iam.apply_table_grants only governs `authenticated` and `service_role`, so the
-- anon posture is set here: public READ only, which is what `pub_read` needs.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['udt_workbooks','udt_documents','udt_datasets','udt_structured_lists'] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON workbench.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON workbench.%I TO anon', t);
  END LOOP;
END $$;
