-- iam_access_delta_harness_dd137b2a_compare_scope — the comparison must compare TWO RUNS, not two tables.
--
-- Defect found by this lane in its own work, RED on the live database before it was fixed:
-- `iam.access_delta_compare` FULL JOINed `iam.access_delta_probe b` to `iam.access_delta_probe a`
-- with `a.run_id = p_after` in the ON clause and `b.run_id = p_before` only in the WHERE. A FULL
-- JOIN evaluates its ON clause before the WHERE, so `b` was every probe row of EVERY run ever
-- taken, and a comparison over one (token, principal) pair reported "2 pairs" the moment a second
-- run existed. It failed in the SAFE direction — extra pairs can only add refusals, never hide one —
-- and it was still a defect, because a gate whose own arithmetic is wrong is a gate nobody will
-- believe the day it refuses something.
--
-- The repair is the ordinary one: scope each side in its own subquery, so the FULL JOIN sees
-- exactly the before-set and exactly the after-set.
create or replace function iam.access_delta_compare(p_before uuid, p_after uuid)
returns table(
  token text, principal_id uuid, principal_label text,
  count_before bigint, count_after bigint,
  rows_lost integer, rows_gained integer,
  gained_sample uuid[], lost_sample uuid[],
  verdict text)
language sql
stable
as $function$
  with before_run as (select * from iam.access_delta_probe where run_id = p_before),
       after_run  as (select * from iam.access_delta_probe where run_id = p_after)
  select
    coalesce(b.token, a.token),
    coalesce(b.principal_id, a.principal_id),
    coalesce(b.principal_label, a.principal_label),
    b.readable_count, a.readable_count,
    case when b.ids is not null and a.ids is not null
         then cardinality(array(select unnest(b.ids) except select unnest(a.ids))) end,
    case when b.ids is not null and a.ids is not null
         then cardinality(array(select unnest(a.ids) except select unnest(b.ids))) end,
    case when b.ids is not null and a.ids is not null
         then (array(select unnest(a.ids) except select unnest(b.ids)))[1:20] end,
    case when b.ids is not null and a.ids is not null
         then (array(select unnest(b.ids) except select unnest(a.ids)))[1:20] end,
    case
      -- A pair present on one side only is UNMEASURED, never SAME: a table that dropped out of the
      -- after-snapshot is exactly the shape of an unnoticed omission.
      when b.run_id is null or a.run_id is null then 'UNMEASURED'
      when b.error_text is not null or a.error_text is not null then 'UNMEASURED'
      when b.readable_count is null or a.readable_count is null then 'UNMEASURED'
      when b.ids is null or a.ids is null then
        case when a.readable_count > b.readable_count then 'WIDER'
             when a.readable_count < b.readable_count then 'NARROWER'
             when a.id_hash is distinct from b.id_hash then 'UNPROVEN'
             else 'SAME' end
      when exists (select unnest(a.ids) except select unnest(b.ids)) then 'WIDER'
      when exists (select unnest(b.ids) except select unnest(a.ids)) then 'NARROWER'
      else 'SAME'
    end
  from before_run b
  full join after_run a on a.token = b.token and a.principal_id = b.principal_id
  order by 1, 3;
$function$;

revoke all on function iam.access_delta_compare(uuid, uuid) from public, anon, authenticated;

-- The repair proves itself: two runs over ONE pair must compare as ONE pair, with other runs
-- sitting in the table beside them.
do $$
declare v_a uuid; v_b uuid; v_c uuid; v_n integer; v_p uuid;
begin
  select m.user_id into v_p from iam.organization_member m
   where not public.is_super_admin_for(m.user_id) limit 1;
  v_a := iam.access_delta_snapshot('dd137b2a scope proof A', array[v_p], array['user_feedback']);
  v_b := iam.access_delta_snapshot('dd137b2a scope proof B', array[v_p], array['user_feedback']);
  v_c := iam.access_delta_snapshot('dd137b2a scope proof C (noise)', array[v_p], array['user_feedback']);
  select count(*) into v_n from iam.access_delta_compare(v_a, v_b);
  if v_n <> 1 then
    raise exception 'dd137b2a: a one-pair comparison reported % pairs — the run scoping is still wrong', v_n;
  end if;
  delete from iam.access_delta_run where id in (v_a, v_b, v_c);
  raise notice 'dd137b2a: one pair compares as one pair, with a third run sitting beside it';
end $$;
