-- chair-step: replaces iam.kernel_memo_sweep (memosweep_a, b, h); nothing is dropped and no privilege changes
-- lane: MEMO-SWEEP
-- based-on: iam.kernel_memo_sweep(integer, integer) b90fcf50afde2084ac0ff51381c4461ff770ddb6b2cd9b953f8e36872ce8af6d
--
-- MEMO-SWEEP i (2026-10-08): proving the disagreement path on a planted fault found that iam.access_shadow_log's row-shape check
-- wants a disagreement row (a target) to carry no  count, and a summary row (no target) to carry one.
-- Inverse: migrations/inverse/memosweep_i_a_disagreement_row_has_no_count_down.sql

set local statement_timeout = '60s';

create or replace function iam.kernel_memo_sweep(p_ids integer default 20, p_pages integer default 2)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
-- MEMO-SWEEP: the scheduled half. iam.kernel_memo_compare must run BEFORE this transaction writes (a transaction id turns
-- the statement memo off), so it is called first and the log is written from what it returned.
declare
  v   jsonb := iam.kernel_memo_compare(p_ids, p_pages);
  d   jsonb;
  n   integer := jsonb_array_length(v -> 'diffs');
  e   text;
begin
  for d in select * from jsonb_array_elements(v -> 'diffs') loop
    insert into iam.access_shadow_log (person, target, level, caller, compared, disagreed)
    values ((d ->> 'person')::uuid,
            case when (d ->> 'target') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (d ->> 'target')::uuid
                 else '00000000-0000-0000-0000-000000000000'::uuid end,
            coalesce(d ->> 'level', 'levels'),
            left(format('iam.kernel_memo_sweep|%s|%s|%s', d ->> 'fn', d ->> 'stratum', d -> 'detail' ->> 'diff'), 500), null, 1);
  end loop;
  e := nullif(coalesce(array_to_string(array(select jsonb_array_elements_text(v -> 'errors')), '; '), ''), '');
  insert into iam.access_shadow_log (person, target, level, caller, compared, disagreed, error)
  values ('87a6e699-3622-4869-8843-d0867456c0dd'::uuid, null, 'memo', format('iam.kernel_memo_sweep|summary|%s seats|%s strata', v ->> 'seats', jsonb_array_length(coalesce(v -> 'strata', '[]'::jsonb))),
          coalesce((v ->> 'compared')::int, 0), n, left(e, 1000));
  if n > 0 or e is not null then
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'access_kernel_disagreement', 'source_app', 'database', 'source_feature', 'access',
      'route', 'iam.kernel_memo_sweep',
      'error_type', case when n > 0 then 'memo_disagreement' else 'memo_check_failed' end,
      'error_text', format('The statement memo of the access kernel (knob access/kernel_batch) %s: %s disagreement(s) of %s comparisons%s. Revert: update platform.feature_knob set value = ''{"on": false, "off_for": []}'' where feature = ''access'' and key = ''kernel_batch''. Detail: iam.access_shadow_log, caller like ''iam.kernel_memo_sweep|%%''.',
                           case when n > 0 then 'disagreed with asking one question at a time' else 'could not be checked' end,
                           n, coalesce(v ->> 'compared', '0'), coalesce(' (' || e || ')', '')),
      'context', jsonb_build_object('diffs', (select jsonb_agg(x - 'detail') from jsonb_array_elements(v -> 'diffs') x), 'errors', v -> 'errors')));
  end if;
  return v - 'diffs' || jsonb_build_object('disagreements', n);
end;
$function$;
