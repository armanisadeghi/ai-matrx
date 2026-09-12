-- platform_registered_tables_generated_dd159b_baseline — THE BEFORE SNAPSHOT (DD-159 batch 2).
--
-- B-48 registered 121 client-readable tables that had no registry row at all, and REGISTERED IS NOT
-- REGENERATED: every one of them still carries the hand-written policy set it had before, which is
-- why `pnpm check:staff-door` went RED at 93. This round generates the ones that CAN be generated
-- and proves, identity by identity, that no door opened.
--
-- 🚨 WHAT THIS ROUND IS NOT. Of the 121, **36 are `audit_class='machinery'`** and `iam.apply_rls`
-- refuses them by construction, and **58 more refuse because they lack the base contract** the
-- variant requires (`created_by`, `organization_id`, or a typed visibility column). Measured token
-- by token in a rolled-back rehearsal on this database, 2026-09-12: 27 of 121 generate. Two of
-- those 27 — `platform_share_link` (the anon share-link resolution door, 355 live links) and
-- `user_secret_audit` (the vault's own trail, DD-137b11) — carry B-48's own written instruction NOT
-- to run `iam.apply_rls` on them, and `row_version` is a partitioned table whose 28 partitions each
-- carry their own bespoke restrictive policy, so regenerating the parent alone would leave a mixed
-- regime. **24 tokens are in this batch.** The other 97 are named in the report, with the exact
-- refusal each one gives; the 58 need a base retrofit, which is a schema change and a different
-- lane's decision, not something to smuggle into an RLS batch.
--
-- THE CAST IS EIGHT and it is chosen for this batch, not inherited: three platform admins, a
-- NON-admin who actually owns rows on these tables (developer111@pixelium.uk), a plain member, an
-- organization admin who is not a platform admin, a non-member and anon. The owner is in the cast
-- because these tables are mostly `personal`, and the widenings this round DOES produce are owners
-- reading their own rows for the first time — a widening that must be seen, named and reasoned
-- about rather than averaged away.
do $$
declare
  v_before uuid; v_as timestamptz := now();
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin AND the biggest row owner here (admin@admin.com)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin OWNER (220 retrieval_audit rows). The widening witness.
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT a platform admin
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array[
    'udt_document_snapshot', 'udt_workbook_snapshot', 'assignment_session', 'dict_entry',
    'org_member_control', 'udt_dataset_template', 'billing_usage_ledger', 'knob_override_audit',
    'org_admin_audit', 'retrieval_audit', 'billing_connect_account', 'billing_customer',
    'billing_subscription', 'billing_user_plan', 'chat_user_usage_summary', 'extension_auth_code',
    'files_user_account', 'html_extraction', 'mcp_user_conn', 'study_streak',
    'task_user_state', 'user_active_context', 'user_entity_state', 'user_storage_usage'];
begin
  if (select count(*) from iam.access_delta_run where label = 'DD-159b BEFORE') > 0 then
    raise notice 'dd159b: the baseline is already on record';
    return;
  end if;
  v_before := iam.access_delta_snapshot('DD-159b BEFORE', v_principals, v_tokens, 400000,
    'DD-159 batch 2: the 24 tokens of B-48''s 121 that iam.apply_rls can generate', v_as);
  raise notice 'dd159b: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;
end $$;
