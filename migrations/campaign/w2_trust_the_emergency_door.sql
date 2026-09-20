-- target: branch,production
-- additive: yes
-- guard: custom/emergency_door_guard
--
-- W2-TRUST — VIS-N-3, the audited emergency door.
-- Unified data campaign v5, 2026-09-18.
--
-- CENSUS FIRST (rule 19). VIS-N-3 was measured on the MAIN database before a line was written.
-- Eight live bodies predate this campaign and already carry most of its law, so this lane does
-- NOT rebuild them. Clause by clause:
--
--   (1) "staff and org admins hold no standing read"
--         SATISFIED — iam._guard_emergency_door_grant (BEFORE INSERT, and BEFORE UPDATE OF
--         expires_at/permission_level/granted_to_user_id/resource_*) refuses any grant on a
--         private- or confidential-class row belonging to somebody else, written outside the
--         door. Only the door sets iam.emergency_door = on, and it sets it transaction-locally.
--   (2) "opens on a named request"
--         SATISFIED — the purpose must be a registered platform.categories access_purpose slug
--         (a typed reason is refused because it cannot be reported on), the justification must
--         clear the organization's character floor, and a PRIVATE-class row needs a second
--         person: an organization owner who is not the requester.
--   (3) "writes an audit row: who, why, how long, what was read"
--         SATISFIED — iam._record_access_audit fires on the grant AND on every single refusal.
--         who = actor_user_id; why = purpose + justification; how long = grant_expires_at;
--         what was read = target_ids with row_count, and the door grants viewer on exactly the
--         one row that was asked for, so the named row IS what was opened.
--   (4) "visible to the person afterwards"
--         SATISFIED — iam.my_access_log() selects by subject_user_id and is granted to
--         authenticated; iam._notify_door tells the subject on request, on open and on denial.
--   (5) "time-boxed; expires on its own clock"
--         SATISFIED at the read path — public.has_permission_for requires
--         (expires_at is null or expires_at > now()), so the grant stops working by itself.
--   (6) "cannot be re-opened without a new request"
--         SATISFIED — the same guard fires on UPDATE OF expires_at, so a lapsed grant cannot be
--         wound forward by anything except a fresh, freshly-justified, freshly-audited open.
--
-- NOT SATISFIED. The two this file builds:
--   (7) A lapsed REQUEST is never closed. iam.emergency_door_pending() filtered on status alone,
--       so an owner's approval queue listed requests whose 24-hour window had run out as live
--       work — and approving one only then discovered it had lapsed. Nothing swept them.
--   (8) Nothing could NAME a grant that is past its clock but still reads status = 'active'.
--       The read path already refuses it, but a permissions screen would show it as live access,
--       which is law 4 (a screen never lies) with no way to comply.
--
-- Today's count on the main database is zero requests and zero emergency grants, so neither
-- defect is currently mis-showing anything. They are closed now, before the door has traffic.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis)
values
  ('custom', 'emergency_door_sweep_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'The emergency door sweep runs on a schedule',
   'While false, iam.emergency_door_sweep() is callable by hand but nothing calls it on a timer. '
   'Scheduling it is switch-checklist work, never a lane''s (VIS-N-3).',
   'agent', 'Unified data campaign, W2-TRUST, 2026-09-18.')
on conflict (feature, key) do nothing;

-- gap (7). The OFF answer is byte-for-byte the answer this function gave before today: while
-- custom/emergency_door_guard resolves false the lapsed rows are still listed, exactly as they
-- were. Flipping that knob to true is what makes the queue say only what is actionable.
-- based-on: iam.emergency_door_pending() bb45bdd9497690d8b17296de45e0e827e64b631bbd8c26d397e36cd4516eb50e
create or replace function iam.emergency_door_pending()
returns jsonb
language sql
stable
security definer
set search_path to 'iam', 'public'
as $function$
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
         -- W2-TRUST, VIS-N-3: an ask whose window ran out is not work anybody can do.
         and (q.request_expires_at > now()
              or not coalesce((platform.knob_resolve('custom', 'emergency_door_guard',
                                                     q.organization_id) #>> '{}')::boolean,
                              false))
         and q.organization_id in (select om.organization_id from iam.organization_member om
                                    where om.user_id = (select auth.uid()) and om.role = 'owner')
    ) x;
$function$;

create function iam.emergency_door_sweep()
returns jsonb
language plpgsql
security definer
set search_path to 'iam', 'public'
as $function$
declare v_closed integer;
begin
  -- The door's own clock, applied without anybody having to look. A request that ran out of
  -- time transitions once, writes no grant, and keeps every audit row it already had.
  with lapsed as (
    update iam.emergency_door_request q
       set status = 'expired', updated_at = now()
     where q.status = 'pending' and q.request_expires_at <= now()
    returning 1)
  select count(*) into v_closed from lapsed;

  return jsonb_build_object(
    'expired_requests', v_closed,
    'lapsed_grants_still_marked_active',
      (select count(*) from iam.emergency_door_lapsed_grants()),
    'message', format('Closed %s emergency request(s) that ran out of time.', v_closed));
end $function$;

comment on function iam.emergency_door_sweep() is
  'W2-TRUST (VIS-N-3): moves emergency requests whose window lapsed from pending to expired. '
  'Safe to call at any time and by hand; nothing calls it on a timer while '
  'custom/emergency_door_sweep_enabled resolves false.';

-- gap (8).
create function iam.emergency_door_lapsed_grants()
returns table (permission_id uuid, resource_type text, resource_id uuid,
               granted_to_user_id uuid, subject_user_id uuid, expires_at timestamptz,
               audit_id uuid)
language sql
stable
security definer
set search_path to 'iam', 'public'
as $function$
  select p.id, p.resource_type, p.resource_id, p.granted_to_user_id,
         a.subject_user_id, p.expires_at, a.id
    from iam.access_audit a
    join iam.permissions p on p.id = a.permission_id
   where a.is_emergency_door
     and p.expires_at is not null
     and p.expires_at <= now()
     and coalesce(p.status, 'active') = 'active';
$function$;

comment on function iam.emergency_door_lapsed_grants() is
  'W2-TRUST (VIS-N-3): emergency grants past their own clock that still read status = active. '
  'The read path already refuses them (public.has_permission_for requires expires_at > now()), '
  'so this is what a SCREEN must not show as live access. iam.permissions.status cannot be set '
  'to ''expired'': its check constraint allows only active/pending/rejected, and widening a live '
  'constraint that sits under every access policy on the platform is not this lane''s to do.';

-- ── The door register. Both of these are SECURITY DEFINER, so somebody has to say IN DATA who
-- may call them. Neither is client-callable: they are the door's own housekeeping.
-- identity_args is rendered by iam.door_identity_args, which renders it exactly the way the
-- shape guard renders it (at search_path = pg_catalog) — a string built any other way spells
-- `permission_level` where the guard spells `public.permission_level` and never matches.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'iam', 'emergency_door_sweep',
       iam.door_identity_args('iam.emergency_door_sweep()'::regprocedure),
       array[]::oid[],
       'Takes no arguments and makes no access decision: it moves emergency requests whose own '
       'window has lapsed from pending to expired, which is the clock the request was written '
       'with. It can neither create a grant nor read anybody''s data.',
       'w2_trust_the_emergency_door.sql',
       'server_only: housekeeping for the emergency door, run by a scheduled server lane once '
       'custom/emergency_door_sweep_enabled is turned on. No client has a reason to call it, and '
       'a client calling it would change other organizations''  rows.',
       false, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'emergency_door_sweep');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'iam', 'emergency_door_lapsed_grants',
       iam.door_identity_args('iam.emergency_door_lapsed_grants()'::regprocedure),
       array[]::oid[],
       'Takes no arguments. It names emergency grants past their clock that still read '
       'status = active, across every organization, so it is an operator census and not a '
       'per-caller answer.',
       'w2_trust_the_emergency_door.sql',
       'server_only: a platform-wide census with no organization filter, read by the emergency '
       'door sweep and by operator tooling. A client must never see other organizations'' grants.',
       false, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'emergency_door_lapsed_grants');
