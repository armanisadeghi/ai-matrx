-- iam_emergency_door_dd137a3 — THE ACCESS LOG NAMES THE PERSON (DD-137a).
--
-- 🚨 A SCREEN NEVER LIES, AND A UUID IS NOT AN ANSWER. `iam.my_access_log` returned
-- `actor_user_id` and nothing else, so the one page whose entire purpose is telling a person WHO
-- opened their data would have shown them `4cf62e4e-2679-484f-b652-034e697418df`. The surface
-- cannot resolve it either: `auth.users` is not client-readable and `users.profiles` is not
-- readable across people, so a client-side lookup would come back empty and the page would render
-- a blank where the name belongs — the exact "dead, disabled-looking, or wearing a false sentence"
-- failure law 4 forbids.
--
-- The resolution belongs INSIDE the definer door, which already reads the audit: it is one join,
-- no new client-callable function, and no widening of anything — the door already decided this
-- caller may see this row, and the actor's identity is the substance of the row.

create or replace function iam.my_access_log(p_limit integer default 200, p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path to 'iam', 'public'
as $fn$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc), '[]'::jsonb)
    from (
      select a.id, a.occurred_at, a.action, a.target_token, a.target_ids, a.data_class,
             a.purpose, a.justification, a.granted, a.denial_reason, a.actor_user_id,
             au.email as actor_label,
             a.grant_expires_at, a.organization_id, a.basis, a.is_emergency_door,
             o.name as organization_label
        from iam.access_audit a
        left join auth.users au on au.id = a.actor_user_id
        left join iam.organizations o on o.id = a.organization_id
       where a.subject_user_id = (select auth.uid())
       order by a.occurred_at desc
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
      offset greatest(0, coalesce(p_offset, 0))
    ) x;
$fn$;

comment on function iam.my_access_log(integer, integer) is
  'THE SUBJECT''S OWN PAGE (DD-137a): every time anyone opened this person''s data, and every time someone was refused, with the actor NAMED rather than left as a uuid. No competitor ships this. It is theirs to read without asking anyone, and it is the fastest way an over-loose grant gets noticed — by the person it is about.';

create or replace function iam.org_access_log(p_organization_id uuid, p_limit integer default 200)
returns jsonb
language sql
stable
security definer
set search_path to 'iam', 'public'
as $fn$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc), '[]'::jsonb)
    from (
      select a.id, a.occurred_at, a.action, a.target_token, a.target_ids, a.data_class, a.purpose,
             a.justification, a.granted, a.denial_reason, a.actor_user_id, a.subject_user_id,
             au.email as actor_label, su.email as subject_label,
             a.grant_expires_at, a.organization_id, a.basis, a.is_emergency_door
        from iam.access_audit a
        left join auth.users au on au.id = a.actor_user_id
        left join auth.users su on su.id = a.subject_user_id
       where a.organization_id = p_organization_id
         and exists (select 1 from iam.organization_member om
                      where om.user_id = (select auth.uid())
                        and om.organization_id = p_organization_id
                        and om.role in ('owner','admin'))
       order by a.occurred_at desc
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) x;
$fn$;

-- The approver's queue has the same defect: it named the requester and the subject by uuid.
create or replace function iam.emergency_door_pending()
returns jsonb
language sql
stable
security definer
set search_path to 'iam', 'public'
as $fn$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    from (
      select q.id, q.target_token, q.target_id, q.subject_user_id, q.data_class, q.purpose,
             q.justification, q.requested_by, q.status, q.request_expires_at, q.created_at,
             q.organization_id,
             ru.email as requested_by_label, su.email as subject_label,
             o.name as organization_label
        from iam.emergency_door_request q
        left join auth.users ru on ru.id = q.requested_by
        left join auth.users su on su.id = q.subject_user_id
        left join iam.organizations o on o.id = q.organization_id
       where q.status = 'pending'
         and q.organization_id in (select om.organization_id from iam.organization_member om
                                    where om.user_id = (select auth.uid()) and om.role = 'owner')
    ) x;
$fn$;

grant execute on function iam.my_access_log(integer, integer) to authenticated;
grant execute on function iam.org_access_log(uuid, integer) to authenticated;
grant execute on function iam.emergency_door_pending() to authenticated;

do $$
declare v_src text;
begin
  for v_src in
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'iam' and p.proname in ('my_access_log','org_access_log','emergency_door_pending')
  loop
    if v_src !~ 'auth\.users' then
      raise exception 'dd137a3: one of the three read doors still answers with bare uuids';
    end if;
  end loop;
  raise notice 'dd137a3: assertions passed';
end $$;
