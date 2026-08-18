-- masterwork_improvement_summary — closes the Hindsight read gap on the
-- Masterwork home ("How it's improving", docs/handoffs/masterwork-distillation.md).
--
-- The hindsight.* schema is deliberately NOT browser-readable (not
-- PostgREST-exposed; enrollments are personal rows owned by platform
-- operators). This SECURITY DEFINER RPC is the ONE deliberate window through
-- that wall: DE-IDENTIFIED aggregate review activity for exactly the
-- masterwork.* mandate agents' Hindsight enrollments.
--
-- What it returns: counts, last-review time, per-lever theme counts.
-- What it NEVER returns: user ids, reviewer transcripts, review summaries,
-- finding titles/reasoning, or any free text a reviewer wrote. Widening the
-- enrollments themselves (or returning text columns here) is forbidden.
--
-- Callable by signed-in users only (EXECUTE revoked from anon/public).

create or replace function public.masterwork_improvement_summary(p_mandate_keys text[])
returns table (
  mandate_key text,
  enrolled boolean,
  review_cadence integer,
  review_count bigint,
  last_review_at timestamptz,
  findings_total bigint,
  findings_applied bigint,
  findings_open bigint,
  lever_counts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.mandate_key,
    (e.id is not null) as enrolled,
    e.review_every_n as review_cadence,
    count(distinct r.id) filter (where r.status = 'completed') as review_count,
    coalesce(max(r.completed_at) filter (where r.status = 'completed'), e.last_review_at) as last_review_at,
    count(distinct f.id) as findings_total,
    count(distinct f.id) filter (where f.status = 'applied') as findings_applied,
    count(distinct f.id) filter (where f.status in ('proposed', 'evidencing', 'ready', 'approved')) as findings_open,
    coalesce(
      (
        select jsonb_object_agg(lv.lever, lv.n)
        from (
          select f2.lever, count(*) as n
          from hindsight.finding f2
          where f2.enrollment_id = e.id
            and f2.deleted_at is null
            and f2.lever is not null
          group by f2.lever
        ) lv
      ),
      '{}'::jsonb
    ) as lever_counts
  from agent.mandate m
  left join hindsight.enrollment e
    on e.subject_id = m.default_agent_id
   and e.subject_kind = 'agent'
   and e.deleted_at is null
  left join hindsight.review r
    on r.enrollment_id = e.id
   and r.deleted_at is null
  left join hindsight.finding f
    on f.enrollment_id = e.id
   and f.deleted_at is null
  where m.deleted_at is null
    and m.mandate_key = any (p_mandate_keys)
    -- The window is scoped to the Masterwork mandates by design — this RPC is
    -- not a general Hindsight reader and must never become one.
    and m.mandate_key like 'masterwork.%'
  group by m.mandate_key, e.id, e.review_every_n, e.last_review_at;
$$;

revoke execute on function public.masterwork_improvement_summary(text[]) from public;
revoke execute on function public.masterwork_improvement_summary(text[]) from anon;
grant execute on function public.masterwork_improvement_summary(text[]) to authenticated;
grant execute on function public.masterwork_improvement_summary(text[]) to service_role;
