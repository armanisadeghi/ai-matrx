-- admin_user_usage_rollup
--
-- Per-USER AI usage & cost rollup for the admin Users > Usage & Cost tab. The
-- cx-dashboard usage view aggregates chat.request by ai_model_id (per-model,
-- nothing per-user); this groups chat.user_request by user_id — where token
-- totals and cost are pre-summed and STORED at write time (no tokens×price
-- compute), and user_id is NOT NULL / 100% attributed.
--
-- SECURITY DEFINER so the join to auth.users (email) stays server-side; revoked
-- from public, granted to service_role — the super-admin-gated admin API route
-- (/api/admin/users/usage) is the only caller. Idempotent (CREATE OR REPLACE).
create or replace function chat.admin_user_usage_rollup(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  user_id uuid,
  email text,
  total_requests bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  total_cost numeric,
  distinct_models bigint,
  last_activity timestamptz
)
language sql
security definer
set search_path = chat, public
as $$
  with agg as (
    select
      ur.user_id,
      count(*)                                  as total_requests,
      coalesce(sum(ur.total_input_tokens), 0)::bigint  as input_tokens,
      coalesce(sum(ur.total_output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(ur.total_tokens), 0)::bigint        as total_tokens,
      coalesce(sum(ur.total_cost), 0)           as total_cost,
      max(ur.created_at)                        as last_activity
    from chat.user_request ur
    where ur.deleted_at is null
      and (p_from is null or ur.created_at >= p_from)
      and (p_to is null or ur.created_at <= p_to)
    group by ur.user_id
  ),
  models as (
    select ur.user_id, count(distinct r.ai_model_id) as distinct_models
    from chat.user_request ur
    join chat.request r
      on r.user_request_id = ur.id and r.deleted_at is null
    where ur.deleted_at is null
      and (p_from is null or ur.created_at >= p_from)
      and (p_to is null or ur.created_at <= p_to)
    group by ur.user_id
  )
  select
    a.user_id,
    u.email::text,
    a.total_requests,
    a.input_tokens,
    a.output_tokens,
    a.total_tokens,
    a.total_cost,
    coalesce(m.distinct_models, 0)::bigint,
    a.last_activity
  from agg a
  left join auth.users u on u.id = a.user_id
  left join models m on m.user_id = a.user_id
  order by a.total_cost desc nulls last;
$$;

revoke all on function chat.admin_user_usage_rollup(timestamptz, timestamptz) from public;
grant execute on function chat.admin_user_usage_rollup(timestamptz, timestamptz) to service_role;

comment on function chat.admin_user_usage_rollup(timestamptz, timestamptz) is
  'Per-user AI usage & cost rollup (requests, tokens, stored cost, distinct '
  'models, last activity) for the admin Users > Usage & Cost tab. SECURITY '
  'DEFINER, service-role only.';
