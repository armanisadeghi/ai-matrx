-- chair-step: lane DRILL-WAVE2-B — A ROSTER ACCOUNT IS COUNTED FROM ONE VIEW. It CREATES one server-only view users._account_facts (one row per ACCOUNT: the people the Users roster lists — each auth user, with the plan their allowance comes from, how they first arrived, when they signed up and what their AI usage has cost) and registers it as System machinery (token account_facts, a projection of users._acquisition_facts) so the declared drill definition account_roster can count it definer with its platform-admin lane rule compiled in. No client grant; no table, policy or row of anybody's data is touched.
-- lane: DRILL-WAVE2-B
-- lock: platform
-- Read from production 2026-10-07 (no function is replaced, so no based-on line): users._acquisition_facts and billing.user_effective_plan(uuid) / billing.plan(plan_key, name) exist as read; platform.entity_types has no account_facts token.
--
-- WHY. The Users roster is paged 50 at a time, so no total on that page can answer "what do the people on
-- each plan cost" or "how many signed up each month and came from where". The drill counts on the database.
--
-- THE RULES, each stated once:
--   * an account = an acquired identity that has a person id (users._acquisition_facts, visitors left out);
--   * plan = billing.user_effective_plan(person) — the same function the roster's plan column calls
--     (users.admin_account_plans), never re-derived; its name from billing.plan;
--   * origin = the identity's first touch (identity state, traffic kind, campaign, referrer), as acquisition counts it;
--   * cost and requests = the person's AI usage, all time (the ledger's hourly rollup, via the acquisition view).
-- INVERSE: migrations/inverse/drillwave2b_a_roster_account_is_counted_from_one_view_down.sql
-- Apply BEFORE migrations/campaign/drillwave2b_drill_declares_cx_requests_and_system_errors_and_account_roster.sql.

create view users._account_facts with (security_invoker = true) as
select a.person_id,
       a.created_at,
       a.identity_state,
       a.traffic_kind,
       a.campaign,
       a.referrer_host,
       a.blocked,
       a.cost,
       a.requests,
       coalesce(e.plan_key, 'none')                            as plan_key,
       coalesce(p.name, e.plan_key, 'No plan')                 as plan_name
  from users._acquisition_facts a
  cross join lateral (select billing.user_effective_plan(a.person_id) as plan_key) e
  left join billing.plan p on p.plan_key = e.plan_key
 where a.person_id is not null;

comment on view users._account_facts is 'DRILL-WAVE2-B: one row per account of the Users roster (identity from users._acquisition_facts, plan from billing.user_effective_plan); what the account_roster drill definition counts.';
comment on column users._account_facts.plan_name is 'The plan the person''s allowance comes from (billing.user_effective_plan), by its name.';

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, projects_token, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'account_facts', 'users', '_account_facts', 'Roster accounts', 1, false, false, true,
  'One row per account of the Users roster with its plan, first touch and AI usage — what the account_roster drill definition counts.',
  false, false, false, 'system', false, 'machinery',
  'Projection: a server-only view over users._acquisition_facts and billing.plan. It owns no rows.',
  'projection', 'guest_executions', 'organization',
  'System machinery with no client lane; read only by the drill door''s definer step (platform admins).',
  'organization', 'standard', 'system',
  'Lane DRILL-WAVE2-B: the account_roster drill definition''s fact (the Users roster counted on the database).',
  false, false, 'users._account_facts'::regclass
)
on conflict (token) do nothing;
