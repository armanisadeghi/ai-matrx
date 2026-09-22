-- based-on: billing._resolve_tier_legacy(uuid) 76c38ced11ae0d9ce8322a508defb6767bc9c808f926a04ead592a337548a57c
-- based-on: billing.resolve_org_tier(uuid) 21794d3f89402248d2fa1855f26a3b7806239d1f493077e32fc7b1dbcc0ef81d
-- based-on: billing.entitlement_snapshot() 6c9a38f01ef831d8683448008a030573adc47a8f7e626d10c205da78bd93c231
-- based-on: public.creator_connect_status() 52deee25bcbf05c6cd4eeeff2ba0bdf9d8240a3d642deab273d097f15b5c49d7
-- chair-step: STEP 2 OF 2 — run `w1_org_billing_lets_go_of_auth_users_on_main.sql` first. This
--   RENAMES live columns, DROPS billing.subscription.user_id, re-points live foreign keys and
--   primary keys, replaces twelve RLS policies, and DROPS the zero-argument
--   public.creator_connect_status(). It never names `auth.users`: every statement that needed
--   ACCESS EXCLUSIVE on that table is in step 1, alone. It is safe TODAY for exactly one measured
--   reason — all three Stripe-facing tables hold ZERO rows on production (re-measured
--   2026-09-22) — and statement 0 refuses the whole file the moment that stops being true.
--   TEN SERVED CALL SITES IN
--   matrx-frontend STILL NAME THE OLD COLUMNS and must land BEFORE this file; they are listed in
--   common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/W1-ORG-CHAIR-STEP.md and
--   must be re-checked against origin/main on the night. A person reads the whole body.
--
-- w1_org_billing_owner_columns_move_on_main.sql
--
-- W1-ORG — REC-62 (the column half) and REC-63 for these three tables, STEP 2 OF 2:
-- BILLING'S OWNER COLUMNS MOVE TO THE ORGANIZATION.
--
-- STEP 1 IS `w1_org_billing_lets_go_of_auth_users_on_main.sql` AND IT RUNS FIRST. It carries the
-- five statements that need ACCESS EXCLUSIVE on `auth.users` (three foreign-key drops, the
-- user_or_org CHECK and the user_id index) and nothing else, so that lock — the one that stops
-- every sign-in on the platform — is held for milliseconds instead of for this file's whole
-- transaction. Measured on the clone: the combined file could not acquire it inside five seconds,
-- twice, on a database with no user traffic. This file names `auth.users` nowhere.
--
-- THE LAW
-- -------
-- REC-62: "`billing.customer.user_id`, `billing.subscription.user_id` and
-- `billing.connect_account.user_id` become `organization_id`." REC-63 reaches the same three
-- tables from the other side: "`org_id` converge on … `organization_id`" — `billing.subscription.org_id`
-- is exactly that legacy name, so the subscription table is converged ONCE here rather than twice.
--
-- 🚨 WHAT CHANGED SINCE THE REHEARSAL, AND WHY THIS IS NOT THE REHEARSED FILE (W1-ORG-PREP, 2026-09-22)
-- -----------------------------------------------------------------------------------------------------
-- `migrations/campaign/w1_org_billing_owner_columns_move_to_the_organization.sql` was written on
-- 2026-09-18 and rehearsed on the branch. It is headed `-- target: branch` — at production the
-- judge answers `header-flag-disagree` — and it is ledgered on the rehearsal branch, so its bytes
-- may not be edited. But the header is the SMALLER problem.
--
-- ON 2026-09-19 ARMAN RULED (F2, the default-organization annihilation): *"A 'default
-- organization' is at most a per-client DISPLAY preference… No data read, write, API route, boot
-- ladder, trigger or BILLING QUERY may pick or substitute one."* `w1_org_billing_is_organization_keyed.sql`
-- landed that ruling on production on 2026-09-20 03:32:42Z: it dropped the three-argument
-- `billing.entitlement_consume` outright and removed the default-organization branch from
-- `billing.resolve_tier`, which now answers `free` explicitly and says why.
--
-- THE REHEARSED FILE RE-POINTS FOUR BODIES THROUGH `iam.default_organization_id(person)`:
--     billing._resolve_tier_legacy  -> subscription where organization_id = iam.default_organization_id(p_user)
--     billing.entitlement_snapshot  -> trial_end  where organization_id = iam.default_organization_id(v_user)
--     public.creator_connect_status -> connect_account where organization_id = iam.default_organization_id(v_uid)
-- Applying it as written would put the exact substitution F2 removed back into billing, in three
-- places, the day after it was taken out. So this file does the SAME column move and writes those
-- three bodies WITHOUT a substitution. `billing.resolve_org_tier` is the fourth and is purely
-- mechanical (`s.org_id` -> `s.organization_id`); it already takes the organization as an argument.
--
-- WHY REMOVING THOSE THREE READS CHANGES NOTHING FOR ANYONE, MEASURED RATHER THAN ARGUED
-- ---------------------------------------------------------------------------------------
--   select count(*) from billing.subscription;     -> 0  (production and the nightly clone, 2026-09-22)
--   select count(*) from billing.customer;         -> 0
--   select count(*) from billing.connect_account;  -> 0
-- A read of an empty table contributes nothing. `_resolve_tier_legacy` keeps its OTHER arm,
-- `billing.user_plan` (805 live rows), which is genuinely person-keyed and which F2's own comment
-- on `billing.resolve_tier` names as "the person's own billing relationship — not an organization
-- substitution". `billing.tier_no_downgrade()` is the proof as a query and must return ZERO rows
-- after this file, which is the chair step's seat probe.
--
-- WHAT REPLACES WHAT WAS REMOVED, SO NOTHING IS LEFT WITHOUT AN ANSWER
--   * a tier for a person acting inside an organization -> billing.resolve_effective_tier(user, org)
--     (already live; aidream's entitlements service is its only caller)
--   * an organization's own tier                        -> billing.resolve_org_tier(org)
--   * an organization's capability picture              -> billing.org_capability_status(org)
--   * a Connect account                                 -> public.creator_connect_status(p_org uuid),
--     created here. The zero-argument form is DROPPED rather than left beside it: a no-argument
--     function cannot name an organization, so its only way to answer is to pick one, and a safe
--     path beside an unsafe path is what F2 forbids. It has NO caller in either repo (censused
--     2026-09-22: matrx-frontend and aidream application code, and the 21 @ai-matrx package
--     sources — the only hits are two sentences in features/entitlements/FEATURE.md) and no
--     `platform.client_callable_door` row, so nothing in the product loses a door it was using.
--
-- A RENAME CARRIES ITS INDEXES AND ITS POLICIES; IT DOES NOT CARRY THEIR MEANING
-- ------------------------------------------------------------------------------
-- PostgreSQL rewrites `pg_policy` and `pg_index` expressions to follow a renamed column, so after
-- a bare rename `customer.organization_id = auth.uid()` would still be a POLICY and
-- `customer_user_id_fkey` would still point `organization_id` at `auth.users`. Both would be
-- silently, confidently wrong. Every one of them is re-pointed below, by name.
--
-- MEASURED ON PRODUCTION, 2026-09-22 (SELECT-only) — every name this file uses exists exactly:
--   constraints  customer_user_id_fkey · customer_pkey (PRIMARY KEY (user_id)) ·
--                connect_account_user_id_fkey · connect_account_pkey (PRIMARY KEY (user_id)) ·
--                subscription_user_id_fkey · subscription_user_or_org
--   indexes      customer_pkey · connect_account_pkey · subscription_user_idx · subscription_org_idx
--   policies     std_select / std_insert / std_update / std_delete on each of the three tables,
--                every one of them `user_id = (select auth.uid())`; a fifth, `svc_all`, is
--                `true/true` for the service role on each table and is deliberately untouched
--   all four `-- based-on:` hashes above are production's live bodies, byte-for-byte, and are the
--   same on the nightly clone
--
-- THE LOCK, SAID PLAINLY — AND IT IS NOT A TABLE REWRITE
-- ------------------------------------------------------
-- Nothing here rewrites a table: every table it touches holds zero rows, a column rename is a
-- catalog change, and `set not null` on an empty table is instant. Two locks matter. ACCESS
-- EXCLUSIVE on the three billing tables — all empty, all cold, nothing queues behind them. And
-- each `add constraint … foreign key … references iam.organizations(id)` takes SHARE ROW
-- EXCLUSIVE on `iam.organizations` and HOLDS IT UNTIL COMMIT, which blocks every
-- INSERT/UPDATE/DELETE on organizations — every signup — for the length of this transaction.
-- That is why this file is short and why the four bodies are `create or replace` (catalog writes)
-- rather than anything that scans. Measured on the nightly dev clone: see the chair step's table.
-- `lock_timeout = '5s'` means it gives up rather than queues.
--
-- WHY THE DDL AND THE BODIES CANNOT BE TWO FILES. `billing._resolve_tier_legacy` and
-- `billing.entitlement_snapshot` read `billing.subscription.user_id` today; a string-bodied SQL or
-- plpgsql function is not a catalog dependency, so dropping that column does not drop them — it
-- leaves them to fail at RUNTIME. They must be replaced in the SAME transaction as the drop, and
-- they cannot be replaced first because the new bodies name a column that does not exist yet.
--
-- WHAT MAKES IT FAIL (the guard that owns this class):
--   scripts/campaign-tests/w1_org_c7_billing_columns.sql — declares the three `organization_id`
--   columns to the shared preamble and SKIPS BY NAME until this file lands.
--
-- REVERT: migrations/inverse/w1_org_billing_owner_columns_move_on_main_down.sql

set lock_timeout = '5s';

-- 0. THE ONLY THING THAT MAKES A RENAME CORRECT INSTEAD OF A RE-LABELLING OF PEOPLE. -----------
do $$
begin
  if (select count(*) from billing.customer) > 0
     or (select count(*) from billing.subscription) > 0
     or (select count(*) from billing.connect_account) > 0 then
    raise exception 'REC-62: billing.customer / subscription / connect_account are no longer empty, so a rename would silently re-label a person as an organization'
      using errcode = 'check_violation',
            hint = 'This file is only correct while the three Stripe-facing tables hold zero rows, which is what was measured on 2026-09-18 and again on 2026-09-22. With rows present the move is add organization_id + backfill from the row''s person through the organization THEY name + swap + drop, in four short files. Write those instead of forcing this one.';
  end if;
end $$;

-- 1. billing.customer -------------------------------------------------------------------------
alter table billing.customer rename column user_id to organization_id;
alter table billing.customer
  add constraint customer_organization_id_fkey
  foreign key (organization_id) references iam.organizations(id) on delete cascade;
alter index billing.customer_pkey rename to customer_organization_pkey;

drop policy std_select on billing.customer;
drop policy std_insert on billing.customer;
drop policy std_update on billing.customer;
drop policy std_delete on billing.customer;
create policy std_select on billing.customer for select to authenticated
  using (organization_id in (select iam.my_orgs()));
create policy std_insert on billing.customer for insert to authenticated
  with check (organization_id in (select iam.my_orgs()));
create policy std_update on billing.customer for update to authenticated
  using (organization_id in (select iam.my_orgs()))
  with check (organization_id in (select iam.my_orgs()));
create policy std_delete on billing.customer for delete to authenticated
  using (organization_id in (select iam.my_orgs()));

comment on column billing.customer.organization_id is
  'REC-47/REC-62: the Stripe customer belongs to the ORGANIZATION, never to a person. Renamed from user_id (0 rows at the time of the move) and re-pointed from auth.users to iam.organizations.';

-- 2. billing.connect_account ------------------------------------------------------------------
alter table billing.connect_account rename column user_id to organization_id;
alter table billing.connect_account
  add constraint connect_account_organization_id_fkey
  foreign key (organization_id) references iam.organizations(id) on delete cascade;
alter index billing.connect_account_pkey rename to connect_account_organization_pkey;

drop policy std_select on billing.connect_account;
drop policy std_insert on billing.connect_account;
drop policy std_update on billing.connect_account;
drop policy std_delete on billing.connect_account;
create policy std_select on billing.connect_account for select to authenticated
  using (organization_id in (select iam.my_orgs()));
create policy std_insert on billing.connect_account for insert to authenticated
  with check (organization_id in (select iam.my_orgs()));
create policy std_update on billing.connect_account for update to authenticated
  using (organization_id in (select iam.my_orgs()))
  with check (organization_id in (select iam.my_orgs()));
create policy std_delete on billing.connect_account for delete to authenticated
  using (organization_id in (select iam.my_orgs()));

comment on column billing.connect_account.organization_id is
  'REC-47/REC-62: a Connect payout account belongs to the ORGANIZATION. Renamed from user_id and re-pointed from auth.users to iam.organizations.';

-- 3. billing.subscription ---------------------------------------------------------------------
drop policy std_select on billing.subscription;
drop policy std_insert on billing.subscription;
drop policy std_update on billing.subscription;
drop policy std_delete on billing.subscription;

alter table billing.subscription drop column user_id;

alter table billing.subscription rename column org_id to organization_id;
alter index billing.subscription_org_idx rename to subscription_organization_idx;
alter table billing.subscription
  add constraint subscription_organization_id_fkey
  foreign key (organization_id) references iam.organizations(id) on delete cascade;
alter table billing.subscription alter column organization_id set not null;

create policy std_select on billing.subscription for select to authenticated
  using (organization_id in (select iam.my_orgs()));
create policy std_insert on billing.subscription for insert to authenticated
  with check (organization_id in (select iam.my_orgs()));
create policy std_update on billing.subscription for update to authenticated
  using (organization_id in (select iam.my_orgs()))
  with check (organization_id in (select iam.my_orgs()));
create policy std_delete on billing.subscription for delete to authenticated
  using (organization_id in (select iam.my_orgs()));

comment on column billing.subscription.organization_id is
  'REC-47/REC-62/REC-63: the subscription belongs to the ORGANIZATION. Renamed from the legacy name org_id; the per-person user_id column and the user_or_org CHECK that let a subscription belong to a human being are gone.';

-- 4. THE FOUR BODIES FOLLOW THE COLUMNS — AND NONE OF THEM PICKS AN ORGANIZATION. --------------

-- 4a. The USER-keyed legacy lane. Its subscription arm is REMOVED, not re-pointed: subscriptions
--     are organization-keyed now and this function has no organization in scope. It keeps the
--     billing.user_plan arm, which F2's own comment on billing.resolve_tier names as the person's
--     own billing relationship. billing.subscription held 0 rows, so nothing any person is
--     entitled to today comes from the arm that goes — billing.tier_no_downgrade() proves it.
create or replace function billing._resolve_tier_legacy(p_user uuid)
returns billing.tier
language sql
stable
set search_path to 'billing', 'public'
as $function$
  select coalesce((
    select up.tier from billing.user_plan up
    where up.user_id = p_user
      and up.effective_from <= now()
      and (up.expires_at is null or up.expires_at > now())
  ), 'free'::billing.tier);
$function$;

comment on function billing._resolve_tier_legacy(uuid) is
  'The USER-keyed tier: the person''s own billing.user_plan row and nothing else. It used to also read billing.subscription by user_id; subscriptions belong to organizations since REC-62, and this function has no organization in scope, so that arm was removed rather than resolved through a default organization (Arman, 2026-09-19 — a default organization is a display preference, never an entitlement source). For the tier a person has INSIDE an organization, call billing.resolve_effective_tier(p_user, p_org).';

-- 4b. The ORGANIZATION-keyed resolver. Purely mechanical: it already takes the organization as an
--     argument, and only the column name moves.
create or replace function billing.resolve_org_tier(p_org uuid)
returns billing.tier
language sql
stable
set search_path to 'billing', 'public'
as $function$
  select coalesce(
    billing.tier_max(
      (select p.tier from billing.org_plan p
        where p.organization_id = p_org
          and p.effective_from <= now()
          and (p.expires_at is null or p.expires_at > now())),
      (select case when s.status = 'trialing' then 'trial'::billing.tier
                   else 'premium'::billing.tier end
         from billing.subscription s
        where s.organization_id = p_org and s.status in ('trialing','active','past_due')
        order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
                 s.current_period_end desc nulls last
        limit 1)
    ),
    'free'::billing.tier)
  where p_org is not null;
$function$;

-- 4c. The signed-in caller's own snapshot. It resolves the caller through auth.uid() and has no
--     organization in scope, so its trial lookup — which read billing.subscription by the person —
--     is REMOVED rather than resolved through a default organization. Everything else it answers
--     is genuinely user-keyed and unchanged.
create or replace function billing.entitlement_snapshot()
returns jsonb
language plpgsql
stable security definer
set search_path to 'billing', 'public'
as $function$
declare
  v_user  uuid := auth.uid();
  v_tier  billing.tier;
  v_usage jsonb := '{}'::jsonb;
  v_res   jsonb;
  r       record;
begin
  if v_user is null then
    return jsonb_build_object('tier','free','is_subscribed',false,'trial_ends_at',null,'usage','{}'::jsonb);
  end if;
  v_tier := billing.resolve_tier(v_user);
  -- trial_ends_at is null BY DESIGN here, not by omission: a trial lives on an organization's
  -- subscription (REC-62) and this function was never given one. The organization-keyed answer is
  -- billing.org_capability_status(p_org); the tier for a person inside an organization is
  -- billing.resolve_effective_tier(p_user, p_org).
  for r in select capability, enforced from billing.capability loop
    v_res := billing.resolve_capability(v_user, r.capability);
    if v_res->'windows' <> '[]'::jsonb then
      v_usage := v_usage || jsonb_build_object(r.capability, jsonb_build_object(
        'used', v_res->'used', 'limit', v_res->'limit', 'period', v_res->'period',
        'resetsAt', v_res->'windows'->0->'resetsAt', 'windows', v_res->'windows',
        'enforced', to_jsonb(r.enforced)));
    end if;
  end loop;
  return jsonb_build_object('tier', v_tier,
    'is_subscribed', v_tier = 'premium' or v_tier = 'trial',
    'trial_ends_at', null, 'usage', v_usage);
end;
$function$;

-- 4d. The Connect status door. The zero-argument form cannot name an organization, so it is
--     replaced by one that takes it. ORDER: the function is CREATED first, then its
--     platform.client_callable_door row (DD-223 refuses a door row that names a function the
--     catalog does not hold), then the GRANT (§6d-4 requires the row before the grant, or the
--     guard takes the client EXECUTE straight back) — then the old one is dropped rather than
--     left beside it.
create or replace function public.creator_connect_status(p_org uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := (select auth.uid());
  r billing.connect_account;
begin
  if v_uid is null then return null; end if;
  if p_org is null then
    raise exception 'creator_connect_status needs the organization you are asking about'
      using errcode = 'invalid_parameter_value',
            hint = 'Pass the organization the person is acting in. This function never picks one: a default organization is a display preference, not a billing identity (2026-09-19 ruling).';
  end if;
  if not exists (select 1 from iam.my_orgs() o(id) where o.id = p_org) then
    raise exception 'You are not a member of that organization, so creator_connect_status has nothing to tell you about it'
      using errcode = 'insufficient_privilege';
  end if;

  select * into r from billing.connect_account where organization_id = p_org;
  if r.organization_id is null then return jsonb_build_object('connected', false); end if;
  return jsonb_build_object(
    'connected', true,
    'stripe_account_id', r.stripe_account_id,
    'charges_enabled', r.charges_enabled,
    'payouts_enabled', r.payouts_enabled,
    'details_submitted', r.details_submitted,
    'onboarded_at', r.onboarded_at,
    'country', r.country,
    'default_currency', r.default_currency
  );
end; $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, gate_predicate)
values
  ('public', 'creator_connect_status', 'p_org uuid', array['uuid'::regtype]::oid[],
   'Answers whether ONE organization has a Stripe Connect payout account and what state it is in. The caller NAMES the organization — nothing is substituted from a preference or a personal workspace (Arman, 2026-09-19) — and the function refuses an organization the caller is not a member of, so the argument is checked rather than trusted. Signed-in only: a signed-out caller has no membership to check.',
   'w1_org_billing_owner_columns_move_on_main.sql', true, false,
   'p_org must be in iam.my_orgs()')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function public.creator_connect_status(uuid) to authenticated;

drop function public.creator_connect_status();

-- A door row is a stand-down for the §6d-4 guard, so it may never outlive the function it names
-- (the shape guard refuses a transaction that leaves one behind). Production carries no row for
-- the zero-argument form today, so on the night this deletes nothing; it is here so that up and
-- inverse are exact opposites and the file can be run after its own inverse.
delete from platform.client_callable_door
 where schema_name = 'public' and function_name = 'creator_connect_status'
   and identity_argtypes = array[]::oid[];
