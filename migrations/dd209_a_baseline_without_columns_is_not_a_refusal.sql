-- DD-209 (V-102 F4) — a baseline taken before the column axis is not a refusal.
--
-- THE DEFECT IN MY OWN CHANGE. `iam.access_delta_probe.readable_columns` was added at
-- 08:39Z on 2026-09-14 and every one of the **22,514 rows already in that table** has it
-- NULL. The comparison then read "one side has no column set" as UNMEASURED and
-- `iam.access_delta_assert_no_widening` REFUSES on any UNMEASURED pair — so every lane
-- holding a baseline snapshot taken before 08:39Z suddenly could not pass its own gate,
-- and nothing told them why. A rule that silently invalidates work in flight is a worse
-- failure than the hole it closed.
--
-- WHY NOT BACKFILL. `readable_columns` is a fact about the GRANTS AT THE SNAPSHOT
-- INSTANT. Today's `has_column_privilege` is today's answer, and writing it into a row
-- captured hours or weeks ago would be manufacturing evidence — the exact thing this
-- harness exists to refuse. A column nobody measured stays unmeasured.
--
-- THE RULE, and it is the one DD-217 already established on the row axis: measure what
-- you can, and NAME what you cannot.
--
--   * both sides carry a column set  -> the column axis is judged; a gained column is
--                                       WIDER even when every row id is identical.
--   * either side does not           -> `columns_measured` is FALSE, the column axis is
--                                       NOT judged, and the ROW axis is judged exactly
--                                       as it was before this column existed. The pair
--                                       is not UNMEASURED and does not refuse.
--
-- Nothing is claimed that was not measured: the gate's GREEN sentence now says how many
-- pairs had no column baseline, on every run, so "0 wider" can never be read as "0 wider
-- on both axes" when it was only ever one.
--
-- based-on: iam.access_delta_compare(uuid, uuid) 8fd4c51ecfb1f4afe721ce692db3b3ce711053880e77842cc04a9d5493386525
-- based-on: iam.access_delta_assert_no_widening(uuid, uuid) d5279317ead76ee8a7a954edb48f08f81fe64ef4cff4da2a88f4e60c5a8b99ff
drop function if exists iam.access_delta_assert_no_widening(uuid, uuid);
drop function if exists iam.access_delta_compare(uuid, uuid);

create function iam.access_delta_compare(p_before uuid, p_after uuid)
returns table(
  token text, principal_id uuid, principal_label text,
  count_before bigint, count_after bigint,
  rows_lost integer, rows_gained integer,
  gained_sample uuid[], lost_sample uuid[],
  columns_gained text[], columns_lost text[], columns_measured boolean,
  verdict text)
language sql
stable
as $function$
  with before_run as (select * from iam.access_delta_probe where run_id = p_before),
       after_run  as (select * from iam.access_delta_probe where run_id = p_after),
       pair as (
         select
           coalesce(b.token, a.token) as token,
           coalesce(b.principal_id, a.principal_id) as principal_id,
           coalesce(b.principal_label, a.principal_label) as principal_label,
           b.run_id as b_run, a.run_id as a_run,
           b.readable_count as b_count, a.readable_count as a_count,
           b.error_text as b_err, a.error_text as a_err,
           b.ids as b_ids, a.ids as a_ids,
           b.id_hash as b_hash, a.id_hash as a_hash,
           b.readable_columns as b_cols, a.readable_columns as a_cols
         from before_run b
         full join after_run a on a.token = b.token and a.principal_id = b.principal_id
       ),
       axes as (
         select p.*,
           (p.b_cols is not null and p.a_cols is not null) as cols_measured,
           case when p.b_cols is not null and p.a_cols is not null
                then array(select unnest(p.a_cols) except select unnest(p.b_cols)) end as cols_gained,
           case when p.b_cols is not null and p.a_cols is not null
                then array(select unnest(p.b_cols) except select unnest(p.a_cols)) end as cols_lost
         from pair p
       )
  select
    token, principal_id, principal_label,
    b_count, a_count,
    case when b_ids is not null and a_ids is not null
         then cardinality(array(select unnest(b_ids) except select unnest(a_ids))) end,
    case when b_ids is not null and a_ids is not null
         then cardinality(array(select unnest(a_ids) except select unnest(b_ids))) end,
    case when b_ids is not null and a_ids is not null
         then (array(select unnest(a_ids) except select unnest(b_ids)))[1:20] end,
    case when b_ids is not null and a_ids is not null
         then (array(select unnest(b_ids) except select unnest(a_ids)))[1:20] end,
    cols_gained, cols_lost, cols_measured,
    case
      when b_run is null or a_run is null then 'UNMEASURED'
      when coalesce(b_err,'') not like 'note: %' and b_err is not null then 'UNMEASURED'
      when coalesce(a_err,'') not like 'note: %' and a_err is not null then 'UNMEASURED'
      when b_count is null or a_count is null then 'UNMEASURED'
      -- DD-209, THE COLUMN AXIS. Judged FIRST when it CAN be judged: a column gained is
      -- a widening even when every row id is identical (V-82 §9.2). A pair whose column
      -- set was never recorded on one side — every snapshot taken before 2026-09-14
      -- 08:39Z — is not judged on this axis and is NOT refused for it; `columns_measured`
      -- says so, and the row axis below decides the verdict exactly as it always did.
      when cols_measured and cardinality(cols_gained) > 0 then 'WIDER'
      when b_ids is null or a_ids is null then
        case when a_count > b_count then 'WIDER'
             when a_count < b_count then 'NARROWER'
             when a_hash is distinct from b_hash then 'UNPROVEN'
             when cols_measured and cardinality(cols_lost) > 0 then 'NARROWER'
             else 'SAME' end
      when exists (select unnest(a_ids) except select unnest(b_ids)) then 'WIDER'
      when exists (select unnest(b_ids) except select unnest(a_ids)) then 'NARROWER'
      when cols_measured and cardinality(cols_lost) > 0 then 'NARROWER'
      else 'SAME'
    end
  from axes
  order by 1, 3;
$function$;

comment on function iam.access_delta_compare(uuid, uuid) is
  'DD-209. Compares two access_delta snapshots on BOTH axes: which rows a principal can read, and which COLUMNS of them. A column gained is WIDER even when the row set is identical (V-82 §9.2 measured the opposite: anon gained a `secret` column and this function printed SAME). `columns_measured` is FALSE when either snapshot predates iam.access_delta_probe.readable_columns (2026-09-14 08:39Z) — that pair is judged on rows only and is NOT refused for it, because readable_columns is a fact about the grants at the snapshot instant and backfilling today''s answer into an old row would manufacture evidence.';

create function iam.access_delta_assert_no_widening(p_before uuid, p_after uuid)
returns text
language plpgsql
stable
as $function$
declare
  v_wider text; v_unmeasured text; v_n integer; v_pairs integer; v_narrower integer;
  v_no_cols integer;
begin
  select count(*) into v_pairs from iam.access_delta_compare(p_before, p_after);
  if v_pairs = 0 then
    raise exception 'access_delta gate: the comparison is EMPTY. A gate over nothing is not a gate.';
  end if;

  select string_agg(format('  %s / %s: %s -> %s (+%s rows, e.g. %s)%s',
           token, principal_label, count_before, count_after, rows_gained, gained_sample,
           case when cardinality(coalesce(columns_gained, '{}')) > 0
                then format(' AND GAINED COLUMN(S): %s', array_to_string(columns_gained, ', '))
                else '' end), E'\n'),
         count(*)
    into v_wider, v_n
  from iam.access_delta_compare(p_before, p_after) where verdict = 'WIDER';
  if coalesce(v_n,0) > 0 then
    raise exception using
      errcode = '42501',
      message = format(E'access_delta gate REFUSES: %s (table, principal) pair(s) would WIDEN — '
                       'somebody can now read rows, or columns of rows, they could not read before:\n%s', v_n, v_wider),
      hint = 'A table whose readable set widens for ANY principal — on the ROW axis or the COLUMN '
             'axis (DD-209) — is excluded from the regeneration until its bespoke design is declared '
             'in the registry or deliberately retired in its own migration (§3.9 step 4, db-rules '
             '§6d-2: an exclusion is INTENT, and intent cannot be recovered from the artifact it '
             'produced).';
  end if;

  select string_agg(format('  %s / %s (%s)', token, principal_label, verdict), E'\n'), count(*)
    into v_unmeasured, v_n
  from iam.access_delta_compare(p_before, p_after) where verdict in ('UNMEASURED','UNPROVEN');
  if coalesce(v_n,0) > 0 then
    raise exception using
      errcode = '42501',
      message = format(E'access_delta gate REFUSES: %s pair(s) could not be MEASURED, so nothing '
                       'here proves they did not widen:\n%s', v_n, v_unmeasured),
      hint = '"I could not measure it" and "it did not widen" are the two sentences this harness '
             'exists to keep apart. Raise p_id_cap, fix the probe error, or take the table out of '
             'the batch and say why.';
  end if;

  select count(*) into v_narrower from iam.access_delta_compare(p_before, p_after) where verdict='NARROWER';
  select count(*) into v_no_cols from iam.access_delta_compare(p_before, p_after) where not columns_measured;

  -- The GREEN sentence says which axes it actually covered. "0 wider" must never be
  -- read as "0 wider on both axes" when one of them was never recorded.
  return format('access_delta gate GREEN: %s pairs, 0 wider, %s narrower, %s unchanged.%s',
                v_pairs, v_narrower, v_pairs - v_narrower,
                case when v_no_cols > 0
                     then format(' ROWS ONLY for %s pair(s): a snapshot on one side predates '
                              || 'iam.access_delta_probe.readable_columns (2026-09-14 08:39Z), so the '
                              || 'COLUMN axis is unmeasured for them — re-take both snapshots to cover it.',
                              v_no_cols)
                     else ' Both axes measured (rows AND columns) on every pair.' end);
end
$function$;
