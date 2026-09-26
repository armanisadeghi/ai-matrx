-- Access ladder T-9c (2026-09-26): billing.customer, billing.subscription and billing.connect_account
-- belong to the ORGANIZATION (common-docs/projects/access-ladder/table-review.md), and the registry
-- now says so.
--
-- Before this file the registry said `rls_variant = personal`, `data_class = private` while the
-- live policies (never regenerated since DD-159 registered them) said
-- `organization_id in iam.my_orgs()` for select, insert, update and delete. The two disagreed.
-- The tables carry `organization_id` and no `created_by`: the organization is the only owner the
-- rows name, so the registry moves to the rule the rows already follow, not the other way round.
--
-- Variant: `ledger`. It emits exactly the organization-member read lane the class grants
-- (organization -> member read + the global-readable system-org arm) and NO client write lane.
-- Every writer of these three tables is the server (Stripe webhooks / checkout / Connect
-- onboarding through the service-role client — features/entitlements/stripe/{sync,connect}.ts,
-- app/api/stripe/**), so dropping the member insert/update/delete lanes the hand-kept policies
-- carried removes a door nobody legitimately used: any member could previously rewrite the
-- organization's Stripe customer id from the browser.
-- Moving a table toward Organization is free under T-4; nothing here moves INTO Private/Confidential.

update platform.entity_types
   set rls_variant = 'ledger',
       data_class = 'organization',
       default_list_scope = null,
       type_reason = 'An organization-owned record (not an append-only log) whose rows name no creator and are written only by the server, so its policies are generated with the ledger variant: organization-member read, no client write. Access ladder T-9 (2026-09-26).',
       data_class_reason = 'The organization''s billing relationship with the payment processor (customer record, subscription, payout account). organization_id is the only owner the rows name; every member of that organization reads them and only the server writes them. Access ladder T-9 (2026-09-26), per the independent table review.'
 where token in ('billing_customer', 'billing_subscription', 'billing_connect_account');

select iam.apply_rls('billing', 'customer', 'billing_customer', 'ledger');
select iam.apply_rls('billing', 'subscription', 'billing_subscription', 'ledger');
select iam.apply_rls('billing', 'connect_account', 'billing_connect_account', 'ledger');
