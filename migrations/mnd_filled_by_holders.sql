-- mnd_filled_by_holders — "which mandates does this agent (or workflow) fill, for me?"
-- (2026-09-27, the agents and workflows lists' Fills mandates column).
--
-- ONE batched read for a page of holders. The answer is the one the mandate side shows as the
-- mandate's holder: the WINNING rung of mandate._rungs for the viewer's seat — the definition's
-- default (system), the viewer's active organization's binding, the viewer's own binding —
-- chosen by exactly mnd_member_list's rule (mandate._member_list_rows § winner: the highest
-- enabled rung that chose a holder and was not set aside; the system floor is skipped only when
-- it fails the output contract). A binding somewhere else that the viewer's seat never reaches
-- does not count, and neither does a mandate whose own switch is off (it fills nothing).
--
-- The ladder runs only over CANDIDATES — mandates whose default or any live binding names one of
-- the asked holders — never the whole corpus. SECURITY INVOKER: candidate discovery is under the
-- caller's RLS, and mandate._rungs (the definer) narrows the seat and refuses any mandate the
-- caller cannot open (iam.has_access('mandate', id, 'viewer')).

set local lock_timeout = '2s';

create or replace function public.mnd_filled_by(
  p_holder_type text,
  p_holder_ids uuid[],
  p_resolve_org_id uuid default null
)
returns table(holder_id uuid, mandate_id uuid, mandate_key text, label text)
language sql
stable
set search_path to 'public'
as $function$
  with asked as (
    select lower(coalesce(p_holder_type, 'agent')) as t,
           coalesce(p_holder_ids, '{}'::uuid[]) as ids
  ),
  candidates as (
    select d.id
      from mandate.definition d, asked a
     where d.deleted_at is null
       and d.default_holder_id = any (a.ids)
       and coalesce(d.default_holder_type, 'agent') = a.t
    union
    select b.mandate_id
      from mandate.binding b, asked a
     where b.deleted_at is null
       and b.holder_id = any (a.ids)
       and coalesce(b.holder_type, 'agent') = a.t
  ),
  rungs as (
    select r.*
      from mandate._rungs(array(select c.id from candidates c),
                          (select auth.uid()), p_resolve_org_id) r
  ),
  winner as (
    select distinct on (r.mandate_id)
           r.mandate_id, coalesce(r.holder_type, 'agent') as w_type, r.holder_id as w_holder,
           r.definition_enabled
      from rungs r
     where r.chose_holder and r.is_enabled
       and (r.dropped_reason is null
            or (r.binding_id is null and r.dropped_code is distinct from 'output_contract_unmet'))
     order by r.mandate_id, r.rung_order desc
  )
  select w.w_holder, d.id, d.mandate_key, coalesce(nullif(btrim(d.label), ''), d.mandate_key)
    from winner w
    join mandate.definition d on d.id = w.mandate_id
    cross join asked a
   where w.w_type = a.t
     and w.w_holder = any (a.ids)
     and w.definition_enabled
     and coalesce(d.metadata->>'migration_status', '') <> 'placeholder'
   order by 1, 4;
$function$;

comment on function public.mnd_filled_by(text, uuid[], uuid) is
  'The mandates each asked holder (agent or workflow) currently fills for the calling person: the '
  'winning rung of mandate._rungs for their seat (system default, active organization, own), '
  'batched for one list page. Source: matrx-frontend migrations/mnd_filled_by_holders.sql.';

grant execute on function public.mnd_filled_by(text, uuid[], uuid) to authenticated;
