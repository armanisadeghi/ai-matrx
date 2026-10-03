-- chair-step: INSERTS two knob rows into platform.feature_knob — workflows/texts_per_hour_per_organization (integer, default 200, overridable by an organization) and platform.external_api_prices/workflow_email_usd (number, default 0.0004, platform-only like its sibling prices). No function, grant, policy, index, column or constraint is touched; no existing row changes.
-- lane: CHAIR-DOORS-3B (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, need 1c)
--
-- WORKFLOW MESSAGES HAVE A TEXT RATE KNOB AND AN EMAIL PRICE. aidream/services/notifications/
-- workflow_messages.py reads scoped_knob("workflows", "texts_per_hour_per_organization") for the
-- per-organization text rate and the ONE external-price register (runtime/external_api_cost.py,
-- platform.external_api_prices/<key>) for what one workflow email costs us; until these rows existed
-- every send used the code defaults (200 and 0.0004) and filed a "missing knob" error.
-- Taxonomy nodes: the two the siblings sit on (workflows/* → d885dcd8…; platform.external_api_prices/* → d317850a…).

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due, overridable_by, override_direction, ui, taxonomy_node_id, public_read)
values
  ('workflows', 'texts_per_hour_per_organization', '200'::jsonb, '200'::jsonb, 'integer', 'texts', 1, 100000,
   'Texts a workflow may send each hour',
   'The most text messages all of an organization''s workflows may send in one hour. Past it a text step waits for the next hour and says so in the run.',
   'agent', 'Agent-set limit, v6 lane 11 AUTOMATIONS-AND-PAGES (2026-10-02): the rate aidream workflow_messages.py enforces per sending organization; 200 an hour covers a clinic''s reminder day (a visit list of a few hundred) while a runaway loop that texts every record is stopped inside its first hour. Twilio''s own 10DLC throughput for a low-volume brand is in the same range.',
   date '2026-12-01', '{organization}'::text[], 'any', '{}'::jsonb, 'd885dcd8-288e-4be6-9991-2ebe71c72759', false),
  ('platform.external_api_prices', 'workflow_email_usd', '0.0004'::jsonb, '0.0004'::jsonb, 'number', 'USD per email', 0, 1,
   'What one workflow email costs us',
   'The price of one email a workflow sends from an organization''s own mailbox, used to put every workflow email on the spend dashboard. When the provider later reports a real figure for a message, that figure is used instead.',
   'agent', 'Resend public pricing (resend.com/pricing, read 2026-10-02 by lane 11): Pro $20/month for 50,000 emails = $0.0004 per email; the Free plan carries no invoice today, and recording $0 would make the ledger claim paid emails are free, the silence this register exists to end. Raise to a blended figure once a month of real invoices is in hand.',
   date '2026-12-01', '{}'::text[], 'any', '{}'::jsonb, 'd317850a-4a6e-4c75-b2ab-b8e1a037042a', false)
on conflict (feature, key) do nothing;
