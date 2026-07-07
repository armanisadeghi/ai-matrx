-- billing_consume_hardening.sql
-- Fixes three overspend paths in billing.entitlement_consume found in adversarial
-- review (latent while enforced=false, but the enforce flip is data-only — so fix
-- before any flip):
--   1. Unvalidated quantity: pre-check tested only `used < limit`, never
--      `used + quantity <= limit`. card_enrichment passes quantity = card count,
--      so one call could sail past a nearly-full cap.
--   2. Concurrency TOCTOU: no serialization — N concurrent consumes all read the
--      same `used` and all insert, defeating the burst windows. Now serialized
--      per (user, capability) via pg_advisory_xact_lock.
--   3. check_id idempotency was documented but not enforced — a retried consume
--      double-counted. Now a partial unique index + an explicit dup check.
-- Idempotent.

create unique index if not exists usage_ledger_check_id_uq
  on billing.usage_ledger(check_id) where check_id is not null;

create or replace function billing.entitlement_consume(
  p_capability text,
  p_quantity   integer default 1,
  p_check_id   uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = billing, public as $$
declare
  v_user    uuid := auth.uid();
  v_cap     billing.capability%rowtype;
  v_tier    billing.tier;
  v_qty     integer := coalesce(p_quantity, 1);
  v_pre     jsonb;
  v_exceeds boolean;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_qty < 1 then raise exception 'quantity must be >= 1'; end if;

  -- Idempotency: a retried consume with the same check_id must not double-count.
  if p_check_id is not null
     and exists (select 1 from billing.usage_ledger where check_id = p_check_id) then
    return billing.resolve_capability(v_user, p_capability)
           || jsonb_build_object('consumed', false, 'duplicate', true);
  end if;

  select * into v_cap from billing.capability where capability = p_capability;

  -- Unknown/unenforced -> record for analytics, no cap math (permissive).
  if v_cap.capability is null or v_cap.enforced = false then
    insert into billing.usage_ledger(user_id, capability, quantity, check_id)
    values (v_user, p_capability, v_qty, p_check_id);
    return billing.resolve_capability(v_user, p_capability)
           || jsonb_build_object('consumed', true);
  end if;

  -- Serialize concurrent consumes for this (user, capability) so the check +
  -- insert are atomic against the burst windows.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_capability, 0));

  -- Tier gate + already-at-cap (reason tier_locked / cap_reached).
  v_pre := billing.resolve_capability(v_user, p_capability);
  if (v_pre->>'allowed')::boolean = false then
    return v_pre || jsonb_build_object('consumed', false);
  end if;

  v_tier := billing.resolve_tier(v_user);

  -- Would adding v_qty push ANY configured window over its cap?
  select bool_or((u.used + v_qty) > cl.limit_value) into v_exceeds
  from billing.capability_limit cl
  cross join lateral (
    select coalesce(sum(quantity), 0)::int as used
    from billing.usage_ledger
    where user_id = v_user and capability = p_capability
      and created_at >= billing.period_start(cl.period)
  ) u
  where cl.capability = p_capability and cl.tier = v_tier and cl.limit_value is not null;

  if coalesce(v_exceeds, false) then
    return billing.resolve_capability(v_user, p_capability)
           || jsonb_build_object('consumed', false, 'reason', 'cap_reached');
  end if;

  insert into billing.usage_ledger(user_id, capability, quantity, check_id)
  values (v_user, p_capability, v_qty, p_check_id);

  return billing.resolve_capability(v_user, p_capability)
         || jsonb_build_object('consumed', true);
end;
$$;

grant execute on function billing.entitlement_consume(text, integer, uuid) to authenticated;
