-- billing_usage_read_rpcs.sql
-- Usage read surfaces (DoD #6): admin + P5 (study-intelligence) can query usage
-- per user/capability/period. RLS keeps the raw ledger self-only; these RPCs are
-- the cross-user (admin) and own-rollup (P5) read paths. Idempotent.

-- Admin cross-user usage rollup, gated by super-admin. Window defaults to the
-- last 30 days. Returns per (capability) totals + distinct active users.
create or replace function billing.usage_admin_summary(
  p_from timestamptz default now() - interval '30 days',
  p_to   timestamptz default now()
)
returns table (
  capability     text,
  total_quantity bigint,
  event_count    bigint,
  active_users   bigint
)
language plpgsql stable security definer set search_path = billing, public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;
  return query
    select ul.capability,
           coalesce(sum(ul.quantity), 0)::bigint,
           count(*)::bigint,
           count(distinct ul.user_id)::bigint
    from billing.usage_ledger ul
    where ul.created_at >= p_from and ul.created_at < p_to
    group by ul.capability
    order by 2 desc;
end;
$$;

-- Admin per-user drilldown for one capability (or all), gated by super-admin.
create or replace function billing.usage_admin_by_user(
  p_capability text default null,
  p_from timestamptz default now() - interval '30 days',
  p_to   timestamptz default now(),
  p_limit integer default 100
)
returns table (
  user_id        uuid,
  capability     text,
  total_quantity bigint,
  event_count    bigint
)
language plpgsql stable security definer set search_path = billing, public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden: Super Admin required' using errcode = '42501';
  end if;
  return query
    select ul.user_id, ul.capability,
           coalesce(sum(ul.quantity), 0)::bigint, count(*)::bigint
    from billing.usage_ledger ul
    where ul.created_at >= p_from and ul.created_at < p_to
      and (p_capability is null or ul.capability = p_capability)
    group by ul.user_id, ul.capability
    order by 3 desc
    limit greatest(p_limit, 1);
end;
$$;

-- The caller's own usage rollup (P5 / study intelligence). auth.uid()-scoped.
create or replace function billing.usage_my_summary(
  p_from timestamptz default now() - interval '30 days',
  p_to   timestamptz default now()
)
returns table (
  capability     text,
  total_quantity bigint,
  event_count    bigint
)
language sql stable security definer set search_path = billing, public as $$
  select ul.capability, coalesce(sum(ul.quantity),0)::bigint, count(*)::bigint
  from billing.usage_ledger ul
  where ul.user_id = auth.uid()
    and ul.created_at >= p_from and ul.created_at < p_to
  group by ul.capability
  order by 2 desc;
$$;

grant execute on function billing.usage_admin_summary(timestamptz, timestamptz) to authenticated;
grant execute on function billing.usage_admin_by_user(text, timestamptz, timestamptz, integer) to authenticated;
grant execute on function billing.usage_my_summary(timestamptz, timestamptz) to authenticated;
