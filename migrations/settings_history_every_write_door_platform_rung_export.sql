-- based-on: platform._knob_override_audit_tg() 9eb075ecedfc2979f4815200db0c6adabdf99c52aa05eb54d0825d11174547c3
-- based-on: platform._knob_rung_lock_audit_tg() 25edbee7d9a1b7c02f8092bb57d83277ee373e7b8ff31cc679c4f95c3613443a
--
-- SETTINGS CHANGE HISTORY — ONE LOG, EVERY RUNG, EVERY DOOR (2026-09-26).
--
-- `platform.knob_override_audit` (scfg_50) already logged every organization / scope-row /
-- user override write from a table trigger, so no RPC, service connection or console could
-- write an override without leaving a row. Three holes remained, all closed here:
--
--   1. The PLATFORM rung was not in it. A change to `platform.feature_knob` (the value every
--      organization inherits) was recorded only as a whole-row snapshot in
--      `history.row_versions`, with no old value and nothing a settings screen could read.
--      A trigger on `feature_knob` now writes the same audit row (`scope_kind = 'platform'`),
--      and the snapshots captured since the history window opened are backfilled into it.
--   2. No row said WHICH DOOR the write came through. `door` is now stamped by
--      `platform.knob_write_door_label()`: a declared `app.write_door` session setting
--      (the migration runners, the aidream MCP), otherwise a signed-in PostgREST request
--      from a browser (`ui`) or not (`api`), otherwise a direct database session (`server`).
--   3. An UPDATE that left the value unchanged was logged as a change (6.5k such rows on
--      `custom.system_enabled` alone). A contentless write is no longer a history row.
--
-- Two read doors ship with it:
--   * `platform.knob_history(...)` — one key's changes at one rung, plus the platform rung,
--     with who / when / door. Organization rows need organization access; another person's
--     user-rung rows need an owner/admin of that organization.
--   * `platform.knob_configuration(org, as_of)` — the organization's effective configuration
--     (platform value + organization override + origin) now or replayed at a moment from this
--     log. Membership-gated; secrets export as set/not-set only.

set local lock_timeout = '3s';

-- ── 1. the door column and the platform actions ─────────────────────────────────────────
alter table platform.knob_override_audit add column if not exists door text;

comment on column platform.knob_override_audit.door is
  'Which door the write came through: ui | api | mcp | server | migration (or any declared app.write_door). NULL = written before 2026-09-26, when the door was not recorded. A change to a knob''s registered DEFAULT is filed with scope_kind = ''platform_default''.';


create index if not exists knob_override_audit_key_scope_at_idx
  on platform.knob_override_audit (feature, key, scope_kind, at desc);

-- ── 2. the door label ────────────────────────────────────────────────────────────────────
create or replace function platform.knob_write_door_label()
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_declared text;
  v_claims   text;
  v_headers  jsonb;
begin
  -- A door that knows what it is says so (the migration runners, the aidream MCP tools).
  v_declared := nullif(current_setting('app.write_door', true), '');
  if v_declared is not null then
    return left(v_declared, 40);
  end if;
  -- A PostgREST request carries the caller's JWT claims AND its request headers. A browser
  -- adds Origin/Referer; a server-side client calling with a person's token does not.
  -- Claims WITHOUT headers are a direct connection impersonating a person
  -- (matrx-orm rls_session, the matrx-records movers) — that is the server, not the API.
  v_claims := nullif(current_setting('request.jwt.claims', true), '');
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  if v_claims is not null and v_headers is not null then
    if coalesce(v_headers ->> 'origin', v_headers ->> 'referer') is not null then
      return 'ui';
    end if;
    return 'api';
  end if;
  -- A direct database session with no declaration: a server process, a script, or a console.
  return 'server';
end;
$function$;

comment on function platform.knob_write_door_label() is
  'The door a settings write came through, for platform.knob_override_audit.door. Declared app.write_door wins; else ui/api from the PostgREST request; else server.';

-- ── 3. overrides: skip contentless updates, stamp the door ───────────────────────────────
create or replace function platform._knob_override_audit_tg()
returns trigger
language plpgsql
security definer
set search_path to 'platform', 'public'
as $function$
declare
  v_actor uuid := coalesce(nullif(current_setting('app.user_id', true), '')::uuid, auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, door)
    values (new.feature, new.key, new.scope_kind, new.scope_id, new.organization_id,
            'set', null, new.value, new.set_note, coalesce(new.updated_by, v_actor),
            platform.knob_write_door_label());
    return new;
  elsif tg_op = 'UPDATE' then
    -- A write that leaves the value where it was is not a change to anything.
    if new.value is not distinct from old.value then
      return new;
    end if;
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, door)
    values (new.feature, new.key, new.scope_kind, new.scope_id, new.organization_id,
            'update', old.value, new.value, new.set_note, coalesce(new.updated_by, v_actor),
            platform.knob_write_door_label());
    return new;
  else
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, door)
    values (old.feature, old.key, old.scope_kind, old.scope_id, old.organization_id,
            'clear', old.value, null, null, v_actor, platform.knob_write_door_label());
    return old;
  end if;
end;
$function$;

create or replace function platform._knob_rung_lock_audit_tg()
returns trigger
language plpgsql
security definer
set search_path to 'platform', 'public'
as $function$
declare
  v_actor uuid := coalesce(nullif(current_setting('app.user_id', true), '')::uuid, auth.uid());
begin
  if tg_op = 'DELETE' then
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, door)
    values (old.feature, old.key, 'organization', old.organization_id, old.organization_id,
            'rung_unlock', to_jsonb(old.locked_kinds), null, null, v_actor,
            platform.knob_write_door_label());
    return old;
  else
    if tg_op = 'UPDATE' and new.locked_kinds is not distinct from old.locked_kinds then
      return new;
    end if;
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, door)
    values (new.feature, new.key, 'organization', new.organization_id, new.organization_id,
            'rung_lock',
            case when tg_op = 'UPDATE' then to_jsonb(old.locked_kinds) end,
            to_jsonb(new.locked_kinds), new.note, coalesce(new.updated_by, v_actor),
            platform.knob_write_door_label());
    return new;
  end if;
end;
$function$;

-- ── 4. the platform rung ─────────────────────────────────────────────────────────────────
create or replace function platform._feature_knob_audit_tg()
returns trigger
language plpgsql
security definer
set search_path to 'platform', 'public'
as $function$
declare
  v_actor uuid := coalesce(nullif(current_setting('app.user_id', true), '')::uuid, auth.uid());
  v_old   jsonb;
  v_new   jsonb;
  -- The platform rung belongs to the platform's own organization (iam.system_orgs 'system'):
  -- the log's organization_id and scope_id are NOT NULL, and every row carries a real owner.
  v_sys   uuid := public.system_org_id('system');
begin
  if v_sys is null then
    raise warning 'platform._feature_knob_audit_tg: iam.system_orgs has no ''system'' organization, so this platform settings change (%.%) is NOT in the settings history. Register it in iam.system_orgs.',
      coalesce(new.feature, old.feature), coalesce(new.key, old.key);
    return coalesce(new, old);
  end if;
  -- The platform value every organization inherits is coalesce(value, default_value).
  if tg_op = 'DELETE' then
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, door)
    values (old.feature, old.key, 'platform', v_sys, v_sys, 'clear',
            coalesce(old.value, old.default_value), null, 'registry row removed', v_actor,
            platform.knob_write_door_label());
    return old;
  end if;

  v_new := coalesce(new.value, new.default_value);
  if tg_op = 'INSERT' then
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, door)
    values (new.feature, new.key, 'platform', v_sys, v_sys, 'set', null, v_new, null,
            coalesce(new.updated_by, v_actor), platform.knob_write_door_label());
    return new;
  end if;

  v_old := coalesce(old.value, old.default_value);
  if v_new is distinct from v_old then
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, door)
    values (new.feature, new.key, 'platform', v_sys, v_sys, 'update', v_old, v_new, null,
            coalesce(new.updated_by, v_actor), platform.knob_write_door_label());
  end if;
  if new.default_value is distinct from old.default_value then
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, door)
    values (new.feature, new.key, 'platform_default', v_sys, v_sys, 'update',
            old.default_value, new.default_value, null,
            coalesce(new.updated_by, v_actor), platform.knob_write_door_label());
  end if;
  return new;
end;
$function$;

create or replace trigger feature_knob_audit_tg
  after insert or update or delete on platform.feature_knob
  for each row execute function platform._feature_knob_audit_tg();

-- ── 5. backfill the platform rung from the snapshots history already holds ──────────────
insert into platform.knob_override_audit
  (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor, at, door)
select s.feature, s.key, 'platform', public.system_org_id('system'), public.system_org_id('system'),
       case when s.operation = 'INSERT' then 'set'
            when s.operation = 'DELETE' then 'clear'
            else 'update' end,
       s.prev_value,
       case when s.operation = 'DELETE' then null else s.resolved end,
       'recorded from settings history (row snapshot); the door was not recorded then',
       s.actor_id, s.occurred_at, null
  from (
    select h.row_data ->> 'feature' as feature,
           h.row_data ->> 'key'     as key,
           h.operation,
           h.actor_id,
           h.occurred_at,
           coalesce(h.row_data -> 'value', h.row_data -> 'default_value') as resolved,
           lag(coalesce(h.row_data -> 'value', h.row_data -> 'default_value'))
             over (partition by h.row_id order by h.occurred_at, h.id) as prev_value,
           row_number() over (partition by h.row_id order by h.occurred_at, h.id) as rn
      from history.row_versions h
     where h.entity_type = 'platform.feature_knob'
  ) s
 where (s.rn = 1 or s.resolved is distinct from s.prev_value or s.operation = 'DELETE')
   and not exists (select 1 from platform.knob_override_audit a
                    where a.scope_kind = 'platform' and a.feature = s.feature and a.key = s.key
                      and a.at = s.occurred_at);

-- ── 6. read door: one key's history ──────────────────────────────────────────────────────
create or replace function platform.knob_history(
  p_feature text,
  p_key text,
  p_organization_id uuid default null,
  p_scope_kind text default null,
  p_scope_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'platform', 'iam', 'public'
as $function$
declare
  v_uid       uuid := auth.uid();
  v_backend   boolean := iam.is_trusted_backend();
  v_padmin    boolean := coalesce(public.is_platform_admin(), false);
  v_org_admin boolean := false;
  v_kind      text := coalesce(p_scope_kind, case when p_organization_id is null then 'platform' else 'organization' end);
  v_limit     integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_rows      jsonb;
begin
  if v_uid is null and not v_backend then
    raise exception 'platform.knob_history: no authenticated caller' using errcode = '42501';
  end if;

  if p_organization_id is not null then
    if not v_backend and not v_padmin and not iam.has_org_access(p_organization_id) then
      raise exception 'platform.knob_history: not a member of that organization' using errcode = '42501';
    end if;
    v_org_admin := v_backend or v_padmin or exists (
      select 1 from iam.organization_member m
       where m.organization_id = p_organization_id and m.user_id = v_uid
         and m.role in ('owner', 'admin'));
    if v_kind = 'user' and p_scope_id is distinct from v_uid and not v_org_admin then
      raise exception 'platform.knob_history: another person''s own settings are theirs' using errcode = '42501';
    end if;
  end if;

  select coalesce(jsonb_agg(r order by (r ->> 'at') desc, (r ->> 'id')::bigint desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
               'id', a.id,
               'at', a.at,
               'action', a.action,
               'scope_kind', a.scope_kind,
               'scope_id', a.scope_id,
               'organization_id', a.organization_id,
               'old_value', a.old_value,
               'new_value', a.new_value,
               'set_note', a.set_note,
               'door', a.door,
               'actor_id', case when a.scope_kind = 'platform' and not (v_padmin or v_backend) then null else a.actor end,
               'actor_name', case
                   when a.actor is null then null
                   when a.scope_kind = 'platform' and not (v_padmin or v_backend) then 'AI Matrx'
                   else coalesce((select nullif(p.display_name, '') from users.profiles p where p.id = a.actor),
                                 case when v_padmin or v_backend then (select u.email from auth.users u where u.id = a.actor) end,
                                 'A member')
                 end,
               'is_this_rung', (a.scope_kind = v_kind)
             ) as r
        from platform.knob_override_audit a
       where a.feature = p_feature and a.key = p_key
         and not (a.action = 'update' and a.old_value is not distinct from a.new_value)
         and (
           a.scope_kind = 'platform'
           or (p_organization_id is not null
               and a.organization_id = p_organization_id
               and a.scope_kind = v_kind
               and (p_scope_id is null or a.scope_id = p_scope_id)
               and (a.scope_kind <> 'user' or v_org_admin or a.scope_id = v_uid))
           or (p_organization_id is not null and v_kind <> 'organization'
               and a.organization_id = p_organization_id and a.scope_kind = 'organization'
               and a.action in ('rung_lock', 'rung_unlock'))
         )
       order by a.at desc, a.id desc
       limit v_limit
    ) t;

  return jsonb_build_object(
    'feature', p_feature,
    'key', p_key,
    'organization_id', p_organization_id,
    'scope_kind', v_kind,
    'scope_id', p_scope_id,
    'entries', v_rows
  );
end;
$function$;

comment on function platform.knob_history(text, text, uuid, text, uuid, integer) is
  'One settings key''s change history: the platform rung plus one rung of one organization, newest first, with who, when, old/new value and the door used.';

-- ── 7. read door: an organization's effective configuration, now or at a moment ─────────
create or replace function platform.knob_configuration(
  p_organization_id uuid default null,
  p_as_of timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'platform', 'iam', 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_backend boolean := iam.is_trusted_backend();
  v_padmin  boolean := coalesce(public.is_platform_admin(), false);
  v_knobs   jsonb;
  v_since   timestamptz;
begin
  if v_uid is null and not v_backend then
    raise exception 'platform.knob_configuration: no authenticated caller' using errcode = '42501';
  end if;
  if p_organization_id is not null and not v_backend and not v_padmin
     and not iam.has_org_access(p_organization_id) then
    raise exception 'platform.knob_configuration: not a member of that organization' using errcode = '42501';
  end if;

  select min(a.at) into v_since from platform.knob_override_audit a where a.scope_kind = 'platform';

  with k as (
    select f.feature, f.key, f.value_type, f.label,
           coalesce(f.value, f.default_value) as platform_now,
           f.default_value,
           'organization' = any (f.overridable_by) as org_overridable
      from platform.feature_knob f
     where f.archived_at is null
  ),
  resolved as (
    select k.*,
      case when p_as_of is null then k.platform_now
           else coalesce(
             (select a.new_value from platform.knob_override_audit a
               where a.scope_kind = 'platform' and a.feature = k.feature and a.key = k.key
                 and a.action in ('set', 'update') and a.at <= p_as_of
               order by a.at desc, a.id desc limit 1),
             (select a.old_value from platform.knob_override_audit a
               where a.scope_kind = 'platform' and a.feature = k.feature and a.key = k.key
                 and a.action in ('update', 'clear') and a.at > p_as_of
               order by a.at asc, a.id asc limit 1),
             k.platform_now)
      end as platform_value,
      case when p_organization_id is null or not k.org_overridable then null
           when p_as_of is null then
             (select o.value from platform.knob_override o
               where o.feature = k.feature and o.key = k.key and o.scope_kind = 'organization'
                 and o.organization_id = p_organization_id and o.scope_id = p_organization_id)
           else coalesce(
             (select jsonb_build_object('v', a.new_value) from platform.knob_override_audit a
               where a.scope_kind = 'organization' and a.organization_id = p_organization_id
                 and a.scope_id = p_organization_id
                 and a.feature = k.feature and a.key = k.key
                 and a.action in ('set', 'update', 'clear') and a.at <= p_as_of
               order by a.at desc, a.id desc limit 1),
             (select jsonb_build_object('v', a.old_value) from platform.knob_override_audit a
               where a.scope_kind = 'organization' and a.organization_id = p_organization_id
                 and a.scope_id = p_organization_id
                 and a.feature = k.feature and a.key = k.key
                 and a.action in ('set', 'update', 'clear') and a.at > p_as_of
               order by a.at asc, a.id asc limit 1),
             (select jsonb_build_object('v', o.value) from platform.knob_override o
               where o.feature = k.feature and o.key = k.key and o.scope_kind = 'organization'
                 and o.organization_id = p_organization_id and o.scope_id = p_organization_id)
           ) -> 'v'
      end as org_value
    from k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', r.feature || '.' || r.key,
           'feature', r.feature,
           'name', r.key,
           'label', r.label,
           'value_type', r.value_type,
           'platform_value', case when r.value_type = 'secret' then to_jsonb(r.platform_value is not null) else r.platform_value end,
           'organization_value', case when r.value_type = 'secret' then case when r.org_value is null then null else to_jsonb(true) end
                                      else r.org_value end,
           'effective_value', case when r.value_type = 'secret' then to_jsonb(coalesce(r.org_value, r.platform_value) is not null)
                                   else coalesce(nullif(r.org_value, 'null'::jsonb), r.platform_value) end,
           'origin', case when r.org_value is not null and r.org_value <> 'null'::jsonb then 'organization' else 'platform' end
         ) order by r.feature, r.key), '[]'::jsonb)
    into v_knobs
    from resolved r;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'as_of', p_as_of,
    'generated_at', now(),
    'history_covers_platform_since', v_since,
    'replayed', p_as_of is not null,
    'knobs', v_knobs
  );
end;
$function$;

comment on function platform.knob_configuration(uuid, timestamptz) is
  'An organization''s effective configuration (platform value + organization override + origin), now or replayed at p_as_of from platform.knob_override_audit. Membership-gated; secrets are set/not-set only.';

-- ── 8. client doors ──────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, gate_predicate, signed_in_callers, argument_rules)
values
  ('platform', 'knob_history',
   'p_feature text, p_key text, p_organization_id uuid, p_scope_kind text, p_scope_id uuid, p_limit integer',
   array['text'::regtype, 'text'::regtype, 'uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'integer'::regtype]::oid[],
   'migrations/settings_history_every_write_door_platform_rung_export.sql',
   'One settings key''s change history for the History affordance on every settings row. Platform-rung rows are visible to every signed-in person (platform values are public-read) with the actor withheld from non-admins; organization rows require organization access; another person''s user-rung rows require owner/admin of that organization. Writes nothing.',
   'auth.uid()', true,
   '{"version": 1, "arguments": {
      "p_organization_id": {"type": "uuid", "position": 3, "optional": true,
        "check": "iam.has_org_access(p_organization_id) or platform admin, decided before the first read",
        "null_rule": {"means": "platform rung only"},
        "foreign": {"bounded": true, "note": "A foreign organization raises 42501 before any row is read; only that organization''s rows are returned."}},
      "p_scope_id": {"type": "uuid", "position": 5, "optional": true,
        "check": "filters rows already bounded to p_organization_id; a user-rung id other than the caller needs owner/admin of that organization",
        "null_rule": {"means": "every row of that rung in that organization"},
        "foreign": {"bounded": true, "note": "Only narrows rows already limited to an organization the caller may read; another person''s user rung is refused unless the caller administers that organization."}}}}'::jsonb),
  ('platform', 'knob_configuration',
   'p_organization_id uuid, p_as_of timestamp with time zone',
   array['uuid'::regtype, 'timestamptz'::regtype]::oid[],
   'migrations/settings_history_every_write_door_platform_rung_export.sql',
   'Copy configuration / compare: an organization''s effective settings (platform value, its override, origin), now or replayed at a moment. Requires organization access (iam.has_org_access) or platform admin; a null organization returns platform values only. Secrets export as set/not-set. Writes nothing.',
   'auth.uid()', true, null)
on conflict do nothing;

grant execute on function platform.knob_history(text, text, uuid, text, uuid, integer) to authenticated, service_role;
grant execute on function platform.knob_configuration(uuid, timestamptz) to authenticated, service_role;
grant execute on function platform.knob_write_door_label() to authenticated, service_role;
