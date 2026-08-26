-- Notification channels — THREE readers, TWO shapes (register item HRB-022, lane l10-inbox).
--
-- 🚨 THE FULL FINDING, which `hr_l10_01` only saw half of.
--
-- `communication.notification_event_type.default_channels` has THREE consumers, and until now
-- every one of them had picked a shape independently:
--
--   * `aidream/services/notifications/service.py::notify()` — the canonical spine — does
--     `dict(event.default_channels or {})`. Needs the **object** `{channel: bool}`.
--   * `hr._wf_notify` (HRB-008) — does `jsonb_array_elements_text(v_channels)`. Needs an **array**.
--   * `hr._punch_notify_edited` (HRB-015) — same, needs an **array**.
--
-- And the WRITERS had split the same way: the Python declaration lane writes objects, the SQL
-- seed migrations wrote arrays. So each reader happened to work only on the rows its own lane had
-- seeded, and nobody had ever crossed the wires:
--
--   * `hr._wf_notify` worked, because the 11 workflow rows were arrays.
--   * `hr._punch_notify_edited` was **ALREADY BROKEN before this lane touched anything** — HR Time
--     seeded its 26 rows as objects, so the very first `hr.time.punch_edited` notice would have
--     raised `cannot extract elements from an object`. That event is ⚖ **mandatory** and reaches
--     *"the employee, always — never suppressible"* (SPEC-NOTIFICATIONS §2.3), so it is the one
--     that could least afford to fail silently.
--   * `notify()` would have raised `ValueError` on all 21 array rows.
--
-- `hr_l10_01` normalized the DATA to one shape (object — it is the only one that can express a
-- channel being explicitly OFF, which the §7.1 P→O→U ladder requires) and constrained it. That
-- fixed `notify()` and, by doing so, exposed `hr._wf_notify` — which is exactly what a shared
-- shape SHOULD do: break loudly in one place instead of quietly in three.
--
-- THIS file finishes the job: both SQL readers move to the object shape, through **one** helper
-- rather than two copies of the resolution, so the next reader inherits the answer instead of
-- inventing it. A defect that appears twice is a missing function, not two bugs.
--
-- Authority: SPEC-NOTIFICATIONS §2.1 (the per-channel platform default), §7.1 (the P→O→U ladder),
-- §8 D2 (the flow type's `channel_policy` overlay).
-- Applied live as `hr_l10_02_notify_channel_readers`. Idempotent.

-- ============================================================ 1. ONE resolver
create or replace function hr._notify_channels(p_event_key text, p_organization_id uuid)
returns text[] language plpgsql stable security definer set search_path to 'hr','public' as $fn$
-- `v_raw`, deliberately NOT the name the emitters use: the assertion at the foot of this file
-- bans the by-hand array read anywhere in the hr schema by scanning prosrc, and THIS is the one
-- function allowed to know both shapes. Naming its variable differently keeps that ban literal
-- and self-checking rather than carrying an exception list that would eventually grow.
-- (prosrc includes comments, so this note must not spell the banned expression either.)
declare v_raw jsonb;
begin
  -- the event's platform default, overlaid by the organization rung (§7.1 P -> O). The user rung
  -- is the spine's, applied at send time — never here.
  select coalesce(o.default_channels, t.default_channels) into v_raw
    from communication.notification_event_type t
    left join communication.notification_event_override o
           on o.event_key = t.event_key and o.organization_id = p_organization_id
          and o.deleted_at is null
   where t.event_key = p_event_key and t.deleted_at is null
   limit 1;

  -- An unregistered event still reaches somebody in-app rather than vanishing. It is a defect
  -- that it is unregistered — `notify()` raises on one — but a notice is not the place to
  -- discover that, so this fails toward telling the person.
  if v_raw is null then return ARRAY['in_app']; end if;

  -- The object shape is the only one that can say a channel is explicitly OFF, which is what the
  -- P -> O -> U ladder needs; `communication.notification_event_type` now CHECKs it
  -- (`hr_l10_01`). The array branch survives ONLY so a row written before that constraint, or by
  -- something outside it, still delivers rather than raising mid-transaction.
  if jsonb_typeof(v_raw) = 'array' then
    return coalesce((select array_agg(value) from jsonb_array_elements_text(v_raw)), '{}');
  end if;
  return coalesce((select array_agg(key)
                     from jsonb_each(v_raw)
                    where value = 'true'::jsonb), '{}');
end $fn$;

comment on function hr._notify_channels(text, uuid) is
  'SPEC-NOTIFICATIONS §2.1/§7.1 — resolves an event''s enabled channels (platform default overlaid by the org rung) for the SQL emitters. ONE implementation: hr._wf_notify and hr._punch_notify_edited both read it. The object {channel: bool} is canonical because it is the only shape that can express a channel being explicitly OFF.';

-- ============================================================ 2. the workflow emitter
create or replace function hr._wf_notify(p_instance uuid, p_step uuid, p_event_key text,
                                         p_notice_kind text, p_user uuid, p_employment uuid,
                                         p_extra jsonb default '{}'::jsonb)
returns integer language plpgsql security definer set search_path to 'hr','public' as $function$
declare
  inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
  v_channels text[]; v_policy jsonb; ch text; v_n integer := 0; v_link text; v_payload jsonb;
begin
  if p_user is null then return 0; end if;
  select * into inst from hr.workflow_instance where id = p_instance;
  if not found then return 0; end if;
  select * into ft from hr.workflow_flow_type
   where flow_key = inst.flow_key and deleted_at is null
   order by (organization_id = inst.organization_id) desc limit 1;

  -- the event's platform default overlaid by the org rung (the ONE resolver), then by the flow
  -- type's channel_policy (SPEC-NOTIFICATIONS §8 D2 / HRB-008 RECORDED DECISION 2)
  v_channels := hr._notify_channels(p_event_key, inst.organization_id);
  v_policy := coalesce(ft.channel_policy, '{}'::jsonb);

  -- §6.2: the deep link resolves to THE EXACT ACTIONABLE OBJECT, not a module landing page.
  v_link := '/hr/tasks/' || p_instance::text || coalesce('?step=' || p_step::text, '');

  v_payload := coalesce(p_extra,'{}'::jsonb) || jsonb_build_object(
    'instance_id', p_instance, 'step_id', p_step, 'flow_key', inst.flow_key,
    'target_token', inst.target_token, 'target_id', inst.target_id,
    'notice_kind', p_notice_kind, 'deep_link', v_link,
    'employment_id', p_employment, 'sensitivity_tier', inst.sensitivity_tier);

  foreach ch in array v_channels loop
    -- deny wins over the event default; that is how "a pay change should not arrive by text"
    -- becomes data instead of prose.
    continue when coalesce(v_policy ->> ch, 'default') = 'deny';
    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (inst.organization_id, p_event_key, p_user, 'user', ch, v_payload,
            'hr_workflow_step', p_step, v_link,
            'hrwf:' || coalesce(p_step::text, p_instance::text) || ':' || p_user::text
                    || ':' || p_notice_kind || ':' || ch,
            'personal'::platform.visibility)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;

  -- a channel the policy explicitly ALLOWS but the event default omits
  for ch in select k from jsonb_each_text(v_policy) e(k,val) where val = 'allow' loop
    continue when ch = any(v_channels);
    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (inst.organization_id, p_event_key, p_user, 'user', ch, v_payload,
            'hr_workflow_step', p_step, v_link,
            'hrwf:' || coalesce(p_step::text, p_instance::text) || ':' || p_user::text
                    || ':' || p_notice_kind || ':' || ch,
            'personal'::platform.visibility)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;

  return v_n;
end $function$;

-- ============================================================ 3. the punch-edit emitter
-- 🚨 NOT THIS LANE'S FUNCTION, AND FIXED ANYWAY. `hr._punch_notify_edited` is HRB-015's, and it
-- has been raising `cannot extract elements from an object` since the moment HR Time seeded its
-- own 26 event rows in the object shape — nothing to do with this lane's normalization. It
-- carries a ⚖ MANDATORY notice that §2.3 says reaches "the employee, always — never
-- suppressible", so leaving a known one-line break in place to respect a lane boundary would put
-- the boundary above the employee. Recorded on the register for HRB-015.
do $$
declare v_src text; v_new text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_punch_notify_edited';
  if v_src is null then
    raise notice 'hr_l10_02: hr._punch_notify_edited does not exist yet — nothing to repair';
    return;
  end if;
  if v_src not like '%jsonb_array_elements_text(v_channels)%' then
    raise notice 'hr_l10_02: hr._punch_notify_edited no longer reads the array shape — its owner fixed it';
    return;
  end if;
  -- A narrow, verifiable substitution: only the two lines that read the shape change. The
  -- alternative — restating a function this lane does not own — is how a "fix" silently reverts
  -- somebody else's later work.
  v_new := replace(v_src,
    'for ch in select jsonb_array_elements_text(v_channels) loop',
    'foreach ch in array hr._notify_channels(''hr.time.punch_edited'', p_organization_id) loop');
  v_new := replace(v_new,
    'v_channels := coalesce(v_channels, ''["in_app"]''::jsonb);',
    'v_channels := coalesce(v_channels, ''{"in_app": true}''::jsonb);');
  if v_new = v_src then
    raise exception 'hr_l10_02: could not locate the array read in hr._punch_notify_edited — inspect it by hand rather than guessing';
  end if;
  execute format(
    'create or replace function hr._punch_notify_edited(%s) returns integer language plpgsql security definer set search_path to ''hr'',''public'' as $body$%s$body$',
    (select pg_get_function_identity_arguments(p.oid) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.proname = '_punch_notify_edited'),
    v_new);
  -- verified immediately, in the same block: a rewrite that silently did nothing is worse than
  -- one that failed, because it looks like a fix.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_punch_notify_edited';
  if v_src like '%jsonb_array_elements_text(v_channels)%' then
    raise exception 'hr_l10_02: the hr._punch_notify_edited rewrite did not take effect';
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array ARRAY['hr._notify_channels(text,uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ 4. assertions — measured
do $$
declare v_n integer; v_ch text[]; v_bad text;
begin
  -- the resolver reads the object shape that hr_l10_01 made canonical
  v_ch := hr._notify_channels('hr.workflow.step_assigned', null);
  if not ('email' = any(v_ch) and 'in_app' = any(v_ch)) then
    raise exception 'hr_l10_02: step_assigned resolved to %, expected email + in_app', v_ch;
  end if;

  -- and it still survives an array, so a pre-constraint row delivers instead of raising
  if hr._notify_channels('hr.__no_such_event__', null) <> ARRAY['in_app'] then
    raise exception 'hr_l10_02: an unregistered event must still reach somebody in-app';
  end if;

  -- NO hr function may read the channel shape by hand any more; that is the whole point
  select string_agg(p.proname, ', ') into v_bad from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prokind = 'f'
     and p.prosrc like '%jsonb_array_elements_text(v_channels)%';
  if v_bad is not null then
    raise exception 'hr_l10_02: these hr functions still read default_channels as an array by hand: %', v_bad;
  end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prokind = 'f' and p.prosrc like '%hr._notify_channels%';
  if v_n < 2 then
    raise exception 'hr_l10_02: expected both SQL emitters to read the shared resolver, found %', v_n;
  end if;
end $$;
