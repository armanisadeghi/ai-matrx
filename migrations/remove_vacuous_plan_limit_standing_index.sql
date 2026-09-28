-- chair-step: remove the impossible NULL-period plan-limit uniqueness index
--
-- billing.plan_limit.period is NOT NULL and is part of the primary key
-- (plan_id, capability, period).  Therefore this partial index's predicate is
-- impossible and its census is zero rows: it can never arbitrate a standing
-- quota or any other write.  Remove only this dead index; do not change the
-- table, primary key, period contract, or the useful metered-row revival writer.

set local lock_timeout = '2s';

-- Fail closed before the DROP. This index is removable only while the table's
-- exact primary-key contract makes `period is null` impossible; do not turn a
-- future schema change into an unguarded uniqueness removal.
do $$
declare
  v_period_not_null boolean;
  v_exact_primary_key boolean;
  v_null_period_rows bigint;
begin
  select a.attnotnull
    into v_period_not_null
    from pg_catalog.pg_attribute a
   where a.attrelid = 'billing.plan_limit'::regclass
     and a.attname = 'period'
     and a.attnum > 0
     and not a.attisdropped;

  select exists (
    select 1
      from pg_catalog.pg_constraint c
     where c.conrelid = 'billing.plan_limit'::regclass
       and c.contype = 'p'
       and (
         select array_agg(a.attname::text order by k.ord)
           from unnest(c.conkey) with ordinality as k(attnum, ord)
           join pg_catalog.pg_attribute a
             on a.attrelid = c.conrelid and a.attnum = k.attnum
       ) = array['plan_id', 'capability', 'period']::text[]
  ) into v_exact_primary_key;

  select count(*) into v_null_period_rows
    from billing.plan_limit
   where period is null;

  if v_period_not_null is not true
     or v_exact_primary_key is not true
     or v_null_period_rows <> 0 then
    raise exception using
      errcode = '55000',
      message = format(
        'refusing to drop billing.plan_limit_standing_idx: period_not_null=%s exact_primary_key=%s null_period_rows=%s',
        coalesce(v_period_not_null::text, 'missing'),
        v_exact_primary_key,
        v_null_period_rows
      ),
      hint = 'Keep the standing index until period is NOT NULL, the primary key is exactly (plan_id, capability, period), and no NULL-period rows exist.';
  end if;
end $$;

drop index if exists billing.plan_limit_standing_idx;
