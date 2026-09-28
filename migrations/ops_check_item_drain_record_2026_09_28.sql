-- chair-step: the REVOKE withdraws EXECUTE from public/anon/authenticated on the one function this same file creates (server-only write path, declared in platform.client_callable_door); nothing that existed before is narrowed.
--
-- ops_check_item_drain_record_2026_09_28.sql
--
-- The cleanup drain's APPLY STEP (common-docs/projects/checks-run-in-the-app/CLEANUP-WORKER-BRIEF.md
-- §§ 2, 8, 9; PLAN.md C6). Three things, all additive:
--
--   1. ops.check_item_drain_record(item, record, reject_limit) — the ONE writer of the drain's
--      outcome onto a finding: metadata.drain (the latest outcome the findings page shows — fixed
--      with its commit, marked OK, rejected with why, stuck with the note), metadata.drain_rejects
--      (a reject or a mechanical refusal counts; reaching the limit makes the item STUCK, so the
--      worker never tries it a third time), metadata.drain_history (the last ten outcomes).
--      Server-only, like every ops.check_* writer. The claim itself stays
--      ops.check_items_hand_off / ops.check_items_release.
--   2. The drain's knobs (feature `checks`). The worker and reviewer MODELS are not knobs: the
--      mandate Holders (checks.finding_disposition / checks.finding_disposition_review) are the one
--      authority on which agent and model run, and a second switch would be a second authority.
--   3. fix_kind = 'code' on the two itemized checks the drain may take. A NULL fix_kind is
--      never drained (PLAN-ATTACK-V2 N12: only `code`; migration/data units route to the DB owner).

create or replace function ops.check_item_drain_record(p_item_id uuid, p_record jsonb, p_reject_limit integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_meta jsonb;
  v_outcome text := p_record ->> 'outcome';
  v_rejects integer;
  v_stuck boolean;
  v_drain jsonb;
  v_history jsonb;
begin
  if v_outcome is null or v_outcome not in
     ('committed', 'accepted', 'rejected', 'refused', 'escalated', 'stuck', 'stale', 'error') then
    raise exception 'check_item_drain_record: outcome % is not one of committed|accepted|rejected|refused|escalated|stuck|stale|error', v_outcome
      using errcode = '22023';
  end if;
  if coalesce(btrim(p_record ->> 'note'), '') = '' then
    raise exception 'check_item_drain_record: every outcome says why (record.note)' using errcode = '22023';
  end if;
  if p_reject_limit is null or p_reject_limit < 1 then
    raise exception 'check_item_drain_record: reject limit must be at least 1' using errcode = '22023';
  end if;
  select metadata into v_meta from ops.check_item where id = p_item_id for update;
  if not found then
    raise exception 'check_item_drain_record: no ops.check_item %', p_item_id using errcode = 'P0002';
  end if;
  v_meta := coalesce(v_meta, '{}'::jsonb);
  -- A reviewer's reject and a mechanical refusal (patch did not apply, check still reports it,
  -- a test broke) both mean "the worker's answer was not good enough".
  v_rejects := coalesce((v_meta ->> 'drain_rejects')::integer, 0)
               + case when v_outcome in ('rejected', 'refused') then 1 else 0 end;
  v_stuck := v_outcome in ('escalated', 'stuck') or v_rejects >= p_reject_limit;
  v_drain := p_record || jsonb_build_object('at', now(), 'rejects', v_rejects, 'stuck', v_stuck);
  v_history := coalesce(v_meta -> 'drain_history', '[]'::jsonb);
  if jsonb_typeof(v_history) <> 'array' then
    v_history := '[]'::jsonb;
  end if;
  v_history := jsonb_build_array(jsonb_build_object(
                 'at', now(), 'outcome', v_outcome, 'note', left(p_record ->> 'note', 500),
                 'commit_sha', p_record -> 'commit_sha', 'run', p_record -> 'run'))
               || (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                     from jsonb_array_elements(v_history) with ordinality h(e, o) where o <= 9);
  perform set_config('app.user_id', '87a6e699-3622-4869-8843-d0867456c0dd', true);
  update ops.check_item
     set metadata = v_meta || jsonb_build_object('drain', v_drain, 'drain_rejects', v_rejects,
                                                 'drain_history', v_history)
   where id = p_item_id;
  return v_drain;
end;
$function$;

do $grants$
declare
  f constant text := 'ops.check_item_drain_record(uuid, jsonb, integer)';
begin
  insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                             reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
         (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
         'Cleanup drain outcome writer (CLEANUP-WORKER-BRIEF § 8). The item id is checked against ops.check_item by the function itself; no caller identity is involved because no client may call it.',
         'matrx-frontend/migrations/ops_check_item_drain_record_2026_09_28.sql',
         'server_only: aidream/services/platform_checks/drain.py (the cleanup drain, as the service connection) is the only caller; findings are platform-admin-only internal records.',
         false, false
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.oid = f::regprocedure
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = n.nspname and d.function_name = p.proname
                        and d.identity_args = pg_get_function_identity_arguments(p.oid));
  execute format('revoke all on function %s from public, anon, authenticated', f);
  execute format('grant execute on function %s to service_role', f);
end
$grants$;

-- ── The drain's knobs (feature `checks`). Idempotent: never overwrites an admin's value. ─────────
insert into platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value,
                                   label, description, set_by, basis, review_due, overridable_by)
values
  ('checks', 'drain_enabled', to_jsonb(false), to_jsonb(false), 'boolean', null, null, null,
   'Cleanup drain: on',
   'When on, the scheduled cleanup drain takes one open code finding at a time, has the worker propose a fix or a mark-OK, proves it in a sandbox, has the reviewer gate it, and commits only what passes. Off: the scheduled task records "drain off" and does nothing. A supervised hand run is not affected.',
   'agent', 'CLEANUP-WORKER-BRIEF § 9: nothing runs until Arman reads the first real batch.',
   date '2026-10-27', '{}'),
  ('checks', 'drain_concurrency', to_jsonb(1), to_jsonb(1), 'integer', 'items', 1, 5,
   'Cleanup drain: findings in flight at once',
   'How many findings the cleanup drain may hold claimed at the same time.',
   'agent', 'Arman, 2026-09-26: one problem at a time.',
   date '2026-10-27', '{}'),
  ('checks', 'drain_daily_items', to_jsonb(20), to_jsonb(20), 'integer', 'items', 0, 500,
   'Cleanup drain: findings per day',
   'The most findings the cleanup drain works in one UTC day, counting every outcome (fixed, marked OK, rejected, stuck).',
   'agent', 'Arman, 2026-09-26: at most 20 a day. About $1.05 a day for worker plus reviewer at round-3 prices.',
   date '2026-10-27', '{}'),
  ('checks', 'drain_item_window_minutes', to_jsonb(25), to_jsonb(25), 'integer', 'minutes', 5, 120,
   'Cleanup drain: time per finding',
   'Wall-clock window for one finding: sandbox, worker, proof, review and commit. Past it the sandbox is torn down, the claim is released and the finding says it ran out of time.',
   'agent', 'CLEANUP-WORKER-BRIEF § 9: a single-file fix plus one check re-run; the slowest converted check took 93 s, the longest CI check 302 s; the sandbox dependency install is the long pole.',
   date '2026-10-27', '{}'),
  ('checks', 'drain_max_files_per_fix', to_jsonb(3), to_jsonb(3), 'integer', 'files', 1, 20,
   'Cleanup drain: files one fix may touch',
   'A proposed fix touching more files than this is not a one-finding fix; it is refused and counted like a reject.',
   'agent', 'CLEANUP-WORKER-BRIEF § 9.',
   date '2026-10-27', '{}'),
  ('checks', 'drain_reject_limit', to_jsonb(2), to_jsonb(2), 'integer', 'rejects', 1, 10,
   'Cleanup drain: rejects before a finding is stuck',
   'After this many rejected or refused proposals on one finding, the drain stops trying it and marks it stuck for a person.',
   'agent', 'CLEANUP-WORKER-BRIEF § 8: two rejects on the same item take it out of the drain.',
   date '2026-10-27', '{}')
on conflict (feature, key) do nothing;

-- ── fix_kind routing: only `code` checks are drained ─────────────────────────────────────────────
update ops.proof_check set fix_kind = 'code'
 where (repo, stable_id) in (('aidream', 'file-access-gate'), ('matrx-frontend', 'visibility-vocabulary'))
   and fix_kind is null;

do $assert$
begin
  if (select count(*) from ops.proof_check
       where (repo, stable_id) in (('aidream', 'file-access-gate'), ('matrx-frontend', 'visibility-vocabulary'))
         and fix_kind = 'code') <> 2 then
    raise exception 'drain routing: both itemized checks must carry fix_kind = code';
  end if;
  if has_function_privilege('authenticated', 'ops.check_item_drain_record(uuid, jsonb, integer)', 'execute') then
    raise exception 'ops.check_item_drain_record must not be client-callable';
  end if;
  if (select count(*) from platform.feature_knob where feature = 'checks' and key like 'drain\_%') < 6 then
    raise exception 'drain knobs missing';
  end if;
end
$assert$;
