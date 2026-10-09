-- chair-step: replaces iam.kernel_memo_sweep (memosweep_a, b); nothing is dropped and no privilege changes
-- lane: MEMO-SWEEP
-- based-on: iam.kernel_memo_sweep(integer, integer) 1fd3eeb854d0033ecc0f7887debb2dec5b2311264b9aec58ea2a8f7cd34cf40f
--
-- MEMO-SWEEP h (2026-10-08): the first live run of the sweep failed on its own log: iam.access_shadow_log.person is NOT NULL and
-- the summary row named nobody. The summary row names admin@admin.com (the seat the sweep always asks as); a row with no
-- level says 'levels'.
-- Inverse: migrations/inverse/memosweep_h_the_log_row_names_a_person_down.sql

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
            left(format('iam.kernel_memo_sweep|%s|%s|%s', d ->> 'fn', d ->> 'stratum', d -> 'detail' ->> 'diff'), 500), 1, 1);
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
