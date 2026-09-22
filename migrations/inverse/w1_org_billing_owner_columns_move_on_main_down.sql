-- based-on: billing._resolve_tier_legacy(uuid) f1bd05afe637ceb2408244a6934d3853c50d47467d305b689f86a9e4d4ca6760
-- based-on: billing.resolve_org_tier(uuid) 2a56f477240d2e7a3b53ccb6ebe05251c80a10be5bc1e086efe629b0e7b3cdc4
-- based-on: billing.entitlement_snapshot() dfc5a70a3e2f14bdc1cd94eaf3d4ba903202d0ed7a6e55eb4b3d1ad71c3a6669
--
-- 🚨 THE THREE HASHES ABOVE ARE NOT PRODUCTION'S BODIES — THEY ARE THE UP FILE'S OUTPUT, and that
--   is the point. A `-- based-on:` line declares the body THIS file will overwrite, and an inverse
--   only ever runs over a database where its own up has landed, so what it overwrites is what the
--   up created. The bodies it WRITES are production's own text, whose hashes are the four the up
--   file carries in its own header. Both facts are needed and they are different numbers.
--
--   Found the hard way, lane W1-ORG-APPLY, 2026-09-22: without these three lines this file was
--   REFUSED by `pnpm db:apply` at rule 27 leg 2 on the dev clone (DD-220, "the file never says
--   which body it was written against"). The up had landed and its inverse could not run — which
--   means the documented revert order was not runnable and the night job's inverse gate would have
--   been guarding an inverse nobody had ever executed.
--
-- chair-step: the inverse of w1_org_billing_owner_columns_move_on_main.sql. It renames the three
--   organization_id columns back to user_id, re-points their foreign keys at auth.users, puts
--   billing.subscription.user_id and its user_or_org CHECK back, replaces twelve RLS policies,
--   restores four function bodies to the exact text production carried on 2026-09-22, and DROPS
--   public.creator_connect_status(p_org uuid) together with its door row. Only ever correct as a
--   revert of that one file, and only while the three tables are still empty. It does NOT restore
--   the foreign keys to auth.users — those are step 1's, and
--   w1_org_billing_lets_go_of_auth_users_on_main_down.sql puts them back AFTER this file runs,
--   alone in its own transaction, because they are the only statements that need ACCESS EXCLUSIVE
--   on auth.users. A person reads the body.
--
-- w1_org_billing_owner_columns_move_on_main_down.sql
--
-- THE INVERSE. Everything below was read off production's own catalog on 2026-09-22, not
-- remembered: the four function bodies are `pg_get_functiondef` output whose sha256 are the up
-- file's `-- based-on:` lines, and every constraint, index and policy name is the one that was
-- there before the move:
--
--   customer_user_id_fkey        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   customer_pkey                PRIMARY KEY (user_id)
--   connect_account_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   connect_account_pkey         PRIMARY KEY (user_id)
--   subscription_user_id_fkey    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   subscription_user_or_org     CHECK ((user_id IS NOT NULL) OR (org_id IS NOT NULL))
--   subscription_user_idx        btree (user_id)   ·   subscription_org_idx  btree (org_id)
--   std_select/std_insert/std_update/std_delete on each table, all `user_id = (select auth.uid())`
--
-- The `svc_all` policy on each table was never touched by the up file and is not touched here.
--
-- WHAT IT CANNOT PUT BACK, AND SAYS SO: a `user_id` that held VALUES. The up file refuses to run
-- unless all three tables are empty, so on the night there is nothing to lose — but if rows were
-- written between the up and this down, the rename hands every one of them an organization id in
-- a column named user_id. Check the three counts before running it.

set lock_timeout = '5s';

-- 1. The Connect door goes back to the shape production had. -----------------------------------
CREATE OR REPLACE FUNCTION public.creator_connect_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := (select auth.uid()); r billing.connect_account;
begin
  if v_uid is null then return null; end if;
  select * into r from billing.connect_account where user_id = v_uid;
  if r.user_id is null then return jsonb_build_object('connected', false); end if;
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
end; $function$

;

-- The shape guard (provision_shape_guard) requires an access decision IN DATA for every
-- SECURITY DEFINER function that reaches COMMIT, and DD-223 requires the function to exist
-- first — so the door row for the restored zero-argument form goes here, between the CREATE
-- and the GRANT. Production carried no row for it (the function predates the register); this
-- one states what it always did.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values
  ('public', 'creator_connect_status', '', array[]::oid[],
   'Takes NO arguments. It resolves the caller itself through auth.uid() and answers only about that caller''s own Connect account; a signed-out caller gets NULL. There is no entity id to check and nothing for a caller to substitute, which is why the door is signed-in-only with no gate predicate. This row exists because the inverse re-creates the function and the shape guard requires a declaration; it restores the reachability production had.',
   'w1_org_billing_owner_columns_move_on_main_down.sql', true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function public.creator_connect_status() to authenticated;

drop function if exists public.creator_connect_status(uuid);

delete from platform.client_callable_door
 where schema_name = 'public' and function_name = 'creator_connect_status'
   and identity_argtypes = array['uuid'::regtype]::oid[];

-- 2. billing.subscription ----------------------------------------------------------------------
drop policy std_select on billing.subscription;
drop policy std_insert on billing.subscription;
drop policy std_update on billing.subscription;
drop policy std_delete on billing.subscription;

alter table billing.subscription alter column organization_id drop not null;
alter table billing.subscription drop constraint subscription_organization_id_fkey;
alter index billing.subscription_organization_idx rename to subscription_org_idx;
alter table billing.subscription rename column organization_id to org_id;

alter table billing.subscription add column user_id uuid;
comment on column billing.subscription.org_id is null;

create policy std_select on billing.subscription for select to authenticated
  using (user_id = (select auth.uid()));
create policy std_insert on billing.subscription for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy std_update on billing.subscription for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy std_delete on billing.subscription for delete to authenticated
  using (user_id = (select auth.uid()));

-- 3. billing.connect_account -------------------------------------------------------------------
drop policy std_select on billing.connect_account;
drop policy std_insert on billing.connect_account;
drop policy std_update on billing.connect_account;
drop policy std_delete on billing.connect_account;

alter table billing.connect_account drop constraint connect_account_organization_id_fkey;
alter index billing.connect_account_organization_pkey rename to connect_account_pkey;
alter table billing.connect_account rename column organization_id to user_id;

create policy std_select on billing.connect_account for select to authenticated
  using (user_id = (select auth.uid()));
create policy std_insert on billing.connect_account for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy std_update on billing.connect_account for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy std_delete on billing.connect_account for delete to authenticated
  using (user_id = (select auth.uid()));
comment on column billing.connect_account.user_id is null;

-- 4. billing.customer ---------------------------------------------------------------------------
drop policy std_select on billing.customer;
drop policy std_insert on billing.customer;
drop policy std_update on billing.customer;
drop policy std_delete on billing.customer;

alter table billing.customer drop constraint customer_organization_id_fkey;
alter index billing.customer_organization_pkey rename to customer_pkey;
alter table billing.customer rename column organization_id to user_id;

create policy std_select on billing.customer for select to authenticated
  using (user_id = (select auth.uid()));
create policy std_insert on billing.customer for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy std_update on billing.customer for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy std_delete on billing.customer for delete to authenticated
  using (user_id = (select auth.uid()));
comment on column billing.customer.user_id is null;

-- 5. The three bodies that read those columns go back to production's own text. ------------------
CREATE OR REPLACE FUNCTION billing._resolve_tier_legacy(p_user uuid)
 RETURNS billing.tier
 LANGUAGE sql
 STABLE
 SET search_path TO 'billing', 'public'
AS $function$
  select billing.tier_max(
    coalesce((
      select case when s.status = 'trialing' then 'trial'::billing.tier else 'premium'::billing.tier end
      from billing.subscription s
      where s.user_id = p_user and s.status in ('trialing','active','past_due')
      order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
               s.current_period_end desc nulls last
      limit 1
    ), 'free'::billing.tier),
    coalesce((
      select up.tier from billing.user_plan up
      where up.user_id = p_user
        and up.effective_from <= now()
        and (up.expires_at is null or up.expires_at > now())
    ), 'free'::billing.tier)
  );
$function$

;

CREATE OR REPLACE FUNCTION billing.resolve_org_tier(p_org uuid)
 RETURNS billing.tier
 LANGUAGE sql
 STABLE
 SET search_path TO 'billing', 'public'
AS $function$
  select coalesce(
    billing.tier_max(
      -- (a) an explicit, unexpired org plan
      (select p.tier from billing.org_plan p
        where p.organization_id = p_org
          and p.effective_from <= now()
          and (p.expires_at is null or p.expires_at > now())),
      -- (b) a live Stripe subscription attached to the org (org_id has been on
      --     billing.subscription since the schema shipped; nothing read it)
      (select case when s.status = 'trialing' then 'trial'::billing.tier
                   else 'premium'::billing.tier end
         from billing.subscription s
        where s.org_id = p_org and s.status in ('trialing','active','past_due')
        order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
                 s.current_period_end desc nulls last
        limit 1)
    ),
    'free'::billing.tier)
  where p_org is not null;
$function$

;

CREATE OR REPLACE FUNCTION billing.entitlement_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare
  v_user  uuid := auth.uid();
  v_tier  billing.tier;
  v_trial timestamptz;
  v_usage jsonb := '{}'::jsonb;
  v_res   jsonb;
  r       record;
begin
  if v_user is null then
    return jsonb_build_object('tier','free','is_subscribed',false,'trial_ends_at',null,'usage','{}'::jsonb);
  end if;
  v_tier := billing.resolve_tier(v_user);
  select trial_end into v_trial from billing.subscription
    where user_id = v_user and status = 'trialing' order by trial_end desc nulls last limit 1;

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
    'trial_ends_at', v_trial, 'usage', v_usage);
end;
$function$

;

comment on function billing._resolve_tier_legacy(uuid) is null;
