-- DD-137b13 source-record repair — DO NOT APPLY THIS FILE AS A MIGRATION.
--
-- `migrations/iam_component_regeneration_dd137b13_gate.sql` was already ledgered and applied
-- before this defect was found. Its bytes are historical evidence: changing them would turn an
-- applied migration into ledger drift and would still not change the database. This is the
-- corrected proof shape for a future, separately authorized regeneration.
--
-- The old gate did two unsafe things for an unpinnable BEFORE probe:
--   1. it substituted an end-state `platform_admin_all` policy-name check for a per-principal
--      readable-set delta; and
--   2. it deleted those probes before calling `iam.access_delta_assert_no_widening` and before
--      its organization/public SAME control.
--
-- Neither can prove that no principal gained access through another permissive policy, a grant,
-- or a policy expression change. A missing temporal anchor is not evidence. The only sound
-- action is to refuse before any access-changing regeneration, then take a fresh BEFORE snapshot
-- after `iam.access_delta_snapshot` can pin EVERY token (`created_at`, or a ledger's
-- `occurred_at`). The normal per-principal gate and every control remain intact.
--
-- This is intentionally a source record, not executable rollout work. When a future authorized
-- migration uses this shape, it must use the sanctioned `pnpm db:apply` path and regenerate DB
-- types after live verification; never copy this block into an admin-query payload.
do $$
declare
  v_before uuid;
  v_after uuid;
  v_unpinned text[];
  v_msg text;
begin
  select id into v_before
    from iam.access_delta_run
   where label = 'DD-137b12a BEFORE'
   order by started_at desc
   limit 1;
  select id into v_after
    from iam.access_delta_run
   where label = 'DD-137b13 AFTER'
   order by started_at desc
   limit 1;
  if v_before is null or v_after is null then
    raise exception 'dd137b13 source repair: both named snapshots are required before comparison';
  end if;

  -- Inspect the BEFORE run only. An AFTER probe cannot retroactively pin an unpinned baseline.
  select coalesce(array_agg(distinct pr.token order by pr.token), '{}')
    into v_unpinned
    from iam.access_delta_probe pr
   where pr.run_id = v_before
     and pr.error_text like 'note: no created_at%';

  if cardinality(v_unpinned) > 0 then
    raise exception
      'dd137b13 source repair: the BEFORE snapshot is unpinnable for token(s): %. Refuse the '
      'access-changing run; upgrade the harness/pin column and take a fresh BEFORE snapshot before '
      'regeneration. Do not delete probes or substitute a policy-name check for the per-principal delta.',
      array_to_string(v_unpinned, ', ');
  end if;

  -- Do not filter or delete any (token, principal) pair. This includes the organization/public
  -- controls: the regular delta gate must see every probe it was asked to prove.
  v_msg := iam.access_delta_assert_no_widening(v_before, v_after);
  raise notice 'dd137b13 source repair: %', v_msg;
end $$;
