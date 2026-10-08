-- chair-step: lane DRILL-SERVER-2 — A NEW IDENTITY IS COUNTED FROM ONE VIEW. It CREATES two immutable helper functions (users.acquisition_host_is_local, users.acquisition_traffic_kind: the acquisition page's own rules, lib/product-analytics/user-acquisition.ts) and one server-only view users._acquisition_facts (one row per acquired identity: every account, guest sign-in and converted account, plus every first-touch visitor no account claims — the rows /api/admin/users/acquisition builds), and registers the view as System machinery (token user_acquisition_facts, a projection of guest_executions) so the declared drill definition user_acquisition can count it definer with its platform-admin lane rule compiled in. No client grant; no table, policy or row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- lock: platform
--
-- WHY. The acquisition page read every guest row into the browser through the API, 50 pages of
-- 1,000 at most, and stopped there in silence: 30 days hold ~88,000 guests, so its tiles undercounted
-- with no word. The drill door counts on the database instead, so nothing is capped.
--
-- THE RULES, each the API's own (app/api/admin/users/acquisition/route.ts), stated once here:
--   * an ACCOUNT row per auth user; its guest = the OLDEST guest row whose auth_user_id or
--     converted_to_user_id is the user (the API keeps the last one it reads, newest first);
--   * its first touch = that guest when it captured one, else the oldest guest whose
--     metadata.acquisition_user_id is the user, else the oldest guest whose metadata.guest_fingerprint
--     is the guest's fingerprint;
--   * identity state: guest (an anonymous sign-in), converted (its guest converted), account, visitor;
--   * a VISITOR row per guest no account claims (no auth_user_id, converted_to_user_id or
--     metadata.acquisition_user_id) and that is not a browser-side enrichment of another guest (its
--     metadata.guest_fingerprint names a different guest that exists); when = created_at, else its
--     first execution;
--   * traffic kind: local_test (the referrer's or the landing host is localhost, *.localhost,
--     127.0.0.1 or ::1), unknown (no user agent), bot (the page's BOT_USER_AGENT pattern), browser;
--   * campaign = utm source / medium / campaign, the ones present joined by " / " (the page's column);
--   * referrer = the referrer's host (direct or withheld = none);
--   * cost and requests = the person's AI usage, all time, from the usage ledger's hourly rollup
--     (runtime._ai_usage_hourly, the one rules source /administration/usage counts); a visitor has none.
-- DIFFERENCE FROM THE API, on purpose: the API also listed an account first seen before the window
-- when its guest converted inside it; here "when" is the identity's own first moment, once.
-- INVERSE: migrations/inverse/drillserver2_a_new_identity_is_counted_from_one_view_down.sql
-- Apply AFTER migrations/campaign/drillserver2_the_first_touch_lookups_are_indexed.sql (autocommit).

-- Both helpers carry no SET search_path (every name inside is schema-qualified or pg_catalog) so the
-- planner INLINES them: a SQL function with a SET clause is called once per row (measured on the clone:
-- 15.9 s over the 30-day window called, ~1 s inlined).
create function users.acquisition_host_is_local(p_host text)
returns boolean
language sql
immutable
parallel safe
as $$
  -- isLocalAcquisitionHost: the host without its port, lower case
  select case when p_host is null or p_host = '' then false
              else (case when lower(p_host) like '[%' then substring(lower(p_host) from '^(\[[^]]*\])')
                         else split_part(lower(p_host), ':', 1) end)
                   in ('localhost', '127.0.0.1', '[::1]', '::1')
                or (case when lower(p_host) like '[%' then substring(lower(p_host) from '^(\[[^]]*\])')
                         else split_part(lower(p_host), ':', 1) end) like '%.localhost'
         end;
$$;

comment on function users.acquisition_host_is_local(text) is
  'DRILL-SERVER-2: the acquisition page''s isLocalAcquisitionHost (lib/product-analytics/user-acquisition.ts) on the database: localhost, any *.localhost (agent previews), 127.0.0.1 or ::1, port ignored.';

create function users.acquisition_traffic_kind(p_user_agent text, p_referrer text, p_landing_host text)
returns text
language sql
immutable
parallel safe
as $$
  -- classifyAcquisitionTraffic: local test first, then no user agent, then the bot pattern
  -- (JavaScript \b is \y here; the pattern is otherwise the page's BOT_USER_AGENT, case-insensitive)
  select case
           when users.acquisition_host_is_local(
                  regexp_replace(substring(p_referrer from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)'), '^.*@', ''))
             or users.acquisition_host_is_local(p_landing_host) then 'local_test'
           when p_user_agent is null or p_user_agent = '' then 'unknown'
           when p_user_agent ~* '\y([a-z0-9_-]*bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headlesschrome|lighthouse|semrush|ahrefs|bytespider)\y|\y(curl|wget|python-requests|python-httpx|aiohttp|httpie|okhttp|axios|go-http-client|libwww-perl|java|apache-httpclient|node-fetch|got|undici)\y|^node$'
             then 'bot'
           else 'browser'
         end;
$$;

comment on function users.acquisition_traffic_kind(text, text, text) is
  'DRILL-SERVER-2: the acquisition page''s classifyAcquisitionTraffic on the database: local_test, unknown, bot or browser.';

create view users._acquisition_facts with (security_invoker = true) as
with usage as (
  select h.person_id, sum(h.cost) as cost, sum(h.requests)::bigint as requests
    from runtime._ai_usage_hourly h
   where h.person_id is not null
   group by h.person_id
),
accounts as (
  select u.id                                   as person_id,
         u.created_at,
         coalesce(u.is_anonymous, false)        as is_anonymous,
         lg.id                                  as guest_id,
         lg.converted_at,
         lg.converted_to_user_id,
         lg.user_agent                          as guest_user_agent,
         lg.is_blocked, lg.blocked_until,
         coalesce(case when lg.metadata -> 'acquisition' ? 'captured_at' then lg.id end, au.id, gf.id) as touch_id
    from auth.users u
    left join lateral (
      select g.* from users.guest_executions g
       where g.auth_user_id = u.id or g.converted_to_user_id = u.id
       order by g.created_at asc nulls first, g.id
       limit 1) lg on true
    left join lateral (
      select g.id from users.guest_executions g
       where g.metadata ->> 'acquisition_user_id' = u.id::text
       order by g.created_at asc nulls first, g.id
       limit 1) au on not coalesce(lg.metadata -> 'acquisition' ? 'captured_at', false)
    left join lateral (
      select g.id from users.guest_executions g
       where lg.id is not null and g.metadata ->> 'guest_fingerprint' = lg.fingerprint
       order by g.created_at asc nulls first, g.id
       limit 1) gf on not coalesce(lg.metadata -> 'acquisition' ? 'captured_at', false) and au.id is null
),
visitors as (
  select v.id                                   as guest_id,
         coalesce(v.created_at, v.first_execution_at) as created_at,
         v.converted_at,
         v.user_agent,
         v.is_blocked, v.blocked_until,
         coalesce(case when v.metadata -> 'acquisition' ? 'captured_at' then v.id end, gf.id) as touch_id
    from users.guest_executions v
    left join lateral (
      select g.id from users.guest_executions g
       where g.metadata ->> 'guest_fingerprint' = v.fingerprint
       order by g.created_at asc nulls first, g.id
       limit 1) gf on not (v.metadata -> 'acquisition' ? 'captured_at')
   where v.auth_user_id is null
     and v.converted_to_user_id is null
     and v.metadata ->> 'acquisition_user_id' is null
     and coalesce(v.created_at, v.first_execution_at) is not null
     and not exists (select 1 from users.guest_executions o
                      where o.fingerprint = v.metadata ->> 'guest_fingerprint'
                        and o.fingerprint <> v.fingerprint)
),
identities as (
  select a.person_id::text                      as identity_id,
         a.person_id,
         a.guest_id,
         case when a.is_anonymous then 'guest'
              when a.guest_id is not null and (a.converted_at is not null or a.converted_to_user_id is not null) then 'converted'
              else 'account' end                as identity_state,
         a.created_at,
         a.converted_at,
         a.guest_user_agent,
         a.is_blocked, a.blocked_until,
         a.touch_id
    from accounts a
  union all
  select 'visitor:' || v.guest_id::text, null::uuid, v.guest_id, 'visitor', v.created_at, v.converted_at,
         v.user_agent, v.is_blocked, v.blocked_until, v.touch_id
    from visitors v
)
select i.identity_id,
       i.person_id,
       i.guest_id,
       i.identity_state,
       i.created_at,
       i.converted_at,
       users.acquisition_traffic_kind(coalesce(t.user_agent, i.guest_user_agent),
                                      t.metadata -> 'acquisition' ->> 'referrer',
                                      t.metadata -> 'acquisition' ->> 'landing_host') as traffic_kind,
       nullif(concat_ws(' / ', nullif(t.metadata -> 'acquisition' ->> 'utm_source', ''),
                               nullif(t.metadata -> 'acquisition' ->> 'utm_medium', ''),
                               nullif(t.metadata -> 'acquisition' ->> 'utm_campaign', '')), '') as campaign,
       nullif(lower(regexp_replace(substring(t.metadata -> 'acquisition' ->> 'referrer' from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)'), '^.*@', '')), '') as referrer_host,
       t.metadata -> 'acquisition' ->> 'referrer'                   as referrer,
       t.metadata -> 'acquisition' ->> 'referrer_state'             as referrer_state,
       t.metadata -> 'acquisition' ->> 'landing_host'               as landing_host,
       t.metadata -> 'acquisition' ->> 'landing_path'               as landing_path,
       t.metadata -> 'acquisition' ->> 'utm_source'                 as utm_source,
       t.metadata -> 'acquisition' ->> 'utm_medium'                 as utm_medium,
       t.metadata -> 'acquisition' ->> 'utm_campaign'               as utm_campaign,
       coalesce(i.is_blocked and (i.blocked_until is null or i.blocked_until > now()), false) as blocked,
       coalesce(u.cost, 0)                                          as cost,
       coalesce(u.requests, 0)::bigint                              as requests
  from identities i
  left join users.guest_executions t on t.id = i.touch_id
  left join usage u on u.person_id = i.person_id;

revoke all on users._acquisition_facts from public, anon, authenticated;
revoke all on function users.acquisition_host_is_local(text) from public, anon;
revoke all on function users.acquisition_traffic_kind(text, text, text) from public, anon;
comment on view users._acquisition_facts is
  'DRILL-SERVER-2: one row per acquired identity (account, guest sign-in, converted account, or a first-touch visitor no account claims) with its first touch, traffic kind and AI usage — what the drill definition user_acquisition counts. Server-only (System machinery, token user_acquisition_facts); read only by the drill door''s definer step with its lane rule compiled in.';
comment on column users._acquisition_facts.identity_id is 'The account''s id, or visitor:<guest id> for a visitor (the acquisition page''s row id).';
comment on column users._acquisition_facts.traffic_kind is 'local_test, unknown, bot or browser (users.acquisition_traffic_kind; the page''s classifyAcquisitionTraffic).';
comment on column users._acquisition_facts.cost is 'The person''s AI cost, all time, from runtime._ai_usage_hourly (dollars); 0 for a visitor.';

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, projects_token, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'user_acquisition_facts', 'users', '_acquisition_facts', 'Acquired identities', 1, false, false, true,
  'One row per acquired identity (account, guest sign-in, converted account, first-touch visitor) with its first touch, traffic kind and AI usage — what the user_acquisition drill definition counts.',
  false, false, false, 'system', false, 'machinery',
  'Projection: a server-only view over auth.users, users.guest_executions and runtime._ai_usage_hourly. It owns no rows.',
  'projection', 'guest_executions', 'organization',
  'System machinery with no client lane; read only by the drill door''s definer step (platform admins).',
  'organization', 'standard', 'system',
  'Lane DRILL-SERVER-2: the user_acquisition drill definition''s fact (the acquisition page counted on the database, never capped).',
  false, false, 'users._acquisition_facts'::regclass
)
on conflict (token) do nothing;
