-- scfg_50_audit_history_and_org_rung_locks.sql
-- ============================================================================
-- SCOPED CONFIGURATION — enterprise hardening, per Arman's 2026-08-29 rulings.
--
-- 1. platform.knob_override_audit — a real per-change history for every
--    configuration override. Arman ratified row storage on the promise of an
--    audit trail; last-writer columns (updated_by/updated_at/set_note) are not
--    one. This table is append-only and trigger-fed: every INSERT / UPDATE /
--    DELETE on platform.knob_override lands here with the old value, the new
--    value, the actor, and the note — through EVERY door and every service
--    path, because the trigger sits on the table, not in a function. Rung-lock
--    changes (below) land in the same stream, so one query answers "who
--    changed this setting's posture, when, from what to what."
--    Deliberately NO foreign keys: an audit ledger must survive the deletion
--    of what it describes (a cascade that erased history on org/knob delete
--    would defeat the point). Retention is the data-lifecycle platform's job
--    (a policy row), never a per-feature purge.
--
-- 2. platform.knob_rung_lock — Arman's requested upgrade: "on an individual
--    option basis, the org can choose to disable user-level overrides even if
--    our system allows it." An org owner/admin locks named rungs (usually
--    'user') for one key; the platform's overridable_by still says what CAN
--    be overridden, the org's lock says what THIS org permits below itself.
--      - enforced in platform._knob_override_write (the one shared write
--        body), so every door refuses with reason 'org_locked';
--      - enforced in platform.knob_resolve, so existing rows on a locked rung
--        go INERT (not deleted — clearing the lock restores them, and the
--        audit stream keeps the whole story);
--      - surfaced in platform.knob_index (org_locked_kinds +
--        user_override_locked) so both the org screen and the personal
--        settings tab can render the truth.
--    An org cannot lock its own rung (that is the platform's overridable_by
--    decision), and lock rows for platform-locked knobs are pointless but
--    harmless (nothing to make inert).
--
-- Registry-table posture (same as knob_override, scfg_02): hand DDL, ≤2
-- ddl_guard sentinel columns, no owner semantics, hand-written RLS — read for
-- org members, write only via the doors / triggers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1a. The audit ledger.
-- ----------------------------------------------------------------------------
create table if not exists platform.knob_override_audit (
  id              bigint generated always as identity primary key,
  feature         text not null,
  key             text not null,
  scope_kind      text not null,
  scope_id        uuid not null,
  organization_id uuid not null,
  action          text not null check (action in ('set','update','clear','rung_lock','rung_unlock')),
  old_value       jsonb,
  new_value       jsonb,
  set_note        text,
  actor           uuid,
  at              timestamptz not null default now()
);

create index if not exists knob_override_audit_org_key_idx
  on platform.knob_override_audit (organization_id, feature, key, at desc);

alter table platform.knob_override_audit enable row level security;
drop policy if exists svc_all on platform.knob_override_audit;
create policy svc_all on platform.knob_override_audit
  for all to service_role using (true) with check (true);
drop policy if exists knob_override_audit_read on platform.knob_override_audit;
create policy knob_override_audit_read on platform.knob_override_audit
  for select to authenticated
  using (organization_id in (select iam.my_orgs()));
-- Append-only: no client write policy, no UPDATE/DELETE path for anyone but
-- service_role. The triggers below write as definer.
grant select on platform.knob_override_audit to authenticated;

create or replace function platform._knob_override_audit_tg()
returns trigger
language plpgsql
security definer
set search_path to 'platform', 'public'
as $$
begin
  if tg_op = 'INSERT' then
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor)
    values (new.feature, new.key, new.scope_kind, new.scope_id, new.organization_id,
            'set', null, new.value, new.set_note, coalesce(new.updated_by, auth.uid()));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor)
    values (new.feature, new.key, new.scope_kind, new.scope_id, new.organization_id,
            'update', old.value, new.value, new.set_note, coalesce(new.updated_by, auth.uid()));
    return new;
  else
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor)
    values (old.feature, old.key, old.scope_kind, old.scope_id, old.organization_id,
            'clear', old.value, null, null, auth.uid());
    return old;
  end if;
end;
$$;

drop trigger if exists knob_override_audit_tg on platform.knob_override;
create trigger knob_override_audit_tg
  after insert or update or delete on platform.knob_override
  for each row execute function platform._knob_override_audit_tg();

-- ----------------------------------------------------------------------------
-- 2a. The org rung lock.
-- ----------------------------------------------------------------------------
create table if not exists platform.knob_rung_lock (
  feature         text not null,
  key             text not null,
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  locked_kinds    text[] not null,
  note            text,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (feature, key, organization_id),
  constraint knob_rung_lock_knob_fkey
    foreign key (feature, key) references platform.feature_knob (feature, key)
    on update cascade on delete cascade,
  constraint knob_rung_lock_not_empty_check
    check (locked_kinds <> '{}'::text[]),
  constraint knob_rung_lock_not_own_rung_check
    check (not ('organization' = any (locked_kinds)))
);

alter table platform.knob_rung_lock enable row level security;
drop policy if exists svc_all on platform.knob_rung_lock;
create policy svc_all on platform.knob_rung_lock
  for all to service_role using (true) with check (true);
drop policy if exists knob_rung_lock_read on platform.knob_rung_lock;
create policy knob_rung_lock_read on platform.knob_rung_lock
  for select to authenticated
  using (organization_id in (select iam.my_orgs()));
-- No client write policy: platform.knob_rung_lock_set is the only door.
-- The read grant matters beyond UI: knob_resolve is SECURITY INVOKER, so
-- client-role resolution must be able to see the org's own lock rows.
grant select on platform.knob_rung_lock to authenticated;

create or replace function platform._knob_rung_lock_audit_tg()
returns trigger
language plpgsql
security definer
set search_path to 'platform', 'public'
as $$
begin
  if tg_op = 'DELETE' then
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor)
    values (old.feature, old.key, 'organization', old.organization_id, old.organization_id,
            'rung_unlock', to_jsonb(old.locked_kinds), null, null, auth.uid());
    return old;
  else
    insert into platform.knob_override_audit
      (feature, key, scope_kind, scope_id, organization_id, action, old_value, new_value, set_note, actor)
    values (new.feature, new.key, 'organization', new.organization_id, new.organization_id,
            'rung_lock',
            case when tg_op = 'UPDATE' then to_jsonb(old.locked_kinds) end,
            to_jsonb(new.locked_kinds), new.note, coalesce(new.updated_by, auth.uid()));
    return new;
  end if;
end;
$$;

drop trigger if exists knob_rung_lock_audit_tg on platform.knob_rung_lock;
create trigger knob_rung_lock_audit_tg
  after insert or update or delete on platform.knob_rung_lock
  for each row execute function platform._knob_rung_lock_audit_tg();

-- ----------------------------------------------------------------------------
-- 2b. The lock's door: org owner/admin (or platform admin). NULL / empty
-- locked_kinds removes the lock — same clearing grammar as every other door.
-- ----------------------------------------------------------------------------
create or replace function platform.knob_rung_lock_set(
  p_feature text,
  p_key text,
  p_organization_id uuid,
  p_locked_kinds text[],
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'platform', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_bad text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if not public.is_admin() and not exists (
      select 1 from iam.organization_member m
       where m.organization_id = p_organization_id
         and m.user_id = v_uid and m.role in ('owner','admin')) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
      'detail', 'Organization configuration is owner/admin only.');
  end if;

  if not exists (select 1 from platform.feature_knob
                  where feature = p_feature and key = p_key) then
    return jsonb_build_object('ok', false, 'reason', 'unregistered_key',
      'feature', p_feature, 'key', p_key,
      'detail', 'That configuration key is not in the register.');
  end if;

  if p_locked_kinds is null or p_locked_kinds = '{}'::text[] then
    delete from platform.knob_rung_lock
     where feature = p_feature and key = p_key
       and organization_id = p_organization_id;
    return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
      'organization_id', p_organization_id, 'lock_removed', true);
  end if;

  if 'organization' = any (p_locked_kinds) then
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'detail', 'An organization cannot lock its own rung; whether the org may override is the platform''s overridable_by decision.');
  end if;
  select k into v_bad from unnest(p_locked_kinds) k
   where not exists (select 1 from platform.knob_scope_kind s where s.kind = k)
   limit 1;
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_scope_kind',
      'scope_kind', v_bad);
  end if;

  insert into platform.knob_rung_lock
    (feature, key, organization_id, locked_kinds, note, updated_by)
  values
    (p_feature, p_key, p_organization_id, p_locked_kinds, p_note, v_uid)
  on conflict (feature, key, organization_id)
  do update set locked_kinds = excluded.locked_kinds,
                note = excluded.note,
                updated_by = excluded.updated_by,
                updated_at = now();

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'organization_id', p_organization_id,
    'locked_kinds', to_jsonb(p_locked_kinds));
end;
$$;

grant execute on function platform.knob_rung_lock_set(text, text, uuid, text[], text)
  to authenticated;

insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
select v.schema_name, v.function_name, v.identity_args, v.declared_by, v.reason
from (values
  ('platform', 'knob_rung_lock_set',
   'p_feature text, p_key text, p_organization_id uuid, p_locked_kinds text[], p_note text',
   'scfg_40',
   'Org owner/admin door for per-key rung locks: an organization disabling user-level (or sub-org) overrides of one setting. NULL/empty clears the lock.')
) as v(schema_name, function_name, identity_args, declared_by, reason)
where not exists (
  select 1 from platform.client_callable_door d
   where d.schema_name = v.schema_name
     and d.function_name = v.function_name
     and d.identity_args = v.identity_args);

-- ----------------------------------------------------------------------------
-- 2c. Enforcement point 1 — the ONE shared write body. Full body reproduced
-- from scfg_12 with a single addition: the org_locked refusal, placed right
-- after the platform-level overridable_by check (platform says it CAN be
-- overridden; the org says whether it MAY be, below itself).
-- ----------------------------------------------------------------------------
create or replace function platform._knob_override_write(
  p_feature text,
  p_key text,
  p_scope_kind text,
  p_scope_id uuid,
  p_organization_id uuid,
  p_value jsonb,
  p_note text,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'platform', 'public'
as $$
declare
  k platform.feature_knob%rowtype;
  s platform.knob_scope_kind%rowtype;
  v_owner uuid;
  v_num numeric;
  v_platform jsonb;
begin
  select * into k from platform.feature_knob
   where feature = p_feature and key = p_key;
  if k.feature is null then
    return jsonb_build_object('ok', false, 'reason', 'unregistered_key',
      'feature', p_feature, 'key', p_key,
      'detail', 'That configuration key is not in the register.');
  end if;

  select * into s from platform.knob_scope_kind where kind = p_scope_kind;
  if s.kind is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_scope_kind',
      'scope_kind', p_scope_kind);
  end if;

  if not (p_scope_kind = any (k.overridable_by)) then
    return jsonb_build_object('ok', false, 'reason', 'not_overridable',
      'feature', p_feature, 'key', p_key, 'scope_kind', p_scope_kind,
      'detail', case when k.overridable_by = '{}'::text[]
                     then 'This is a platform-controlled setting.'
                     else 'This setting may be overridden by: '
                          || array_to_string(k.overridable_by, ', ') end);
  end if;

  -- The org's own per-key rung lock (scfg_50). Clearing (NULL value) is
  -- always allowed through: a lock stops NEW values on the rung, it never
  -- traps a stale one.
  if p_scope_kind <> 'organization'
     and (p_value is not null and jsonb_typeof(p_value) <> 'null')
     and exists (select 1 from platform.knob_rung_lock l
                  where l.feature = p_feature and l.key = p_key
                    and l.organization_id = p_organization_id
                    and p_scope_kind = any (l.locked_kinds)) then
    return jsonb_build_object('ok', false, 'reason', 'org_locked',
      'feature', p_feature, 'key', p_key, 'scope_kind', p_scope_kind,
      'detail', 'This organization has turned off ' || p_scope_kind
                || '-level control of this setting.');
  end if;

  if p_scope_kind = 'organization' then
    if p_scope_id is distinct from p_organization_id then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'field', 'scope_id',
        'detail', 'An organization-scope override uses the organization id as its scope id.');
    end if;
  elsif s.scope_table is not null then
    if p_scope_id is null then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'field', 'scope_id',
        'detail', format('A %s-scoped override needs the row it applies to.', p_scope_kind));
    end if;
    execute format('select organization_id from %I.%I where id = $1 and deleted_at is null',
                   s.scope_schema, s.scope_table)
      into v_owner using p_scope_id;
    if v_owner is distinct from p_organization_id then
      return jsonb_build_object('ok', false, 'reason', 'scope_not_in_organization',
        'detail', 'That scope row belongs to a different organization.');
    end if;
  end if;

  if p_value is null or jsonb_typeof(p_value) = 'null' then
    delete from platform.knob_override
     where feature = p_feature and key = p_key and scope_kind = p_scope_kind
       and scope_id = p_scope_id and organization_id = p_organization_id;
    return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
      'scope_kind', p_scope_kind, 'scope_id', p_scope_id, 'key_removed', true,
      'effective_value', platform.knob_resolve(p_feature, p_key, p_organization_id),
      'origin', 'cleared');
  end if;

  if k.value_type in ('number','integer') then
    if jsonb_typeof(p_value) <> 'number' then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s expects a number, got %s', p_feature, p_key, jsonb_typeof(p_value)));
    end if;
    v_num := (p_value #>> '{}')::numeric;
    if k.value_type = 'integer' and v_num <> trunc(v_num) then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s expects a whole number', p_feature, p_key));
    end if;
    if k.min_value is not null and v_num < k.min_value then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s must be >= %s', p_feature, p_key, k.min_value));
    end if;
    if k.max_value is not null and v_num > k.max_value then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s must be <= %s', p_feature, p_key, k.max_value));
    end if;
    v_platform := coalesce(k.value, k.default_value);
    if k.override_direction = 'lower_only' and v_num > (v_platform #>> '{}')::numeric then
      return jsonb_build_object('ok', false, 'reason', 'raise_not_permitted',
        'feature', p_feature, 'key', p_key, 'ceiling', v_platform);
    end if;
    if k.override_direction = 'raise_only' and v_num < (v_platform #>> '{}')::numeric then
      return jsonb_build_object('ok', false, 'reason', 'lower_not_permitted',
        'feature', p_feature, 'key', p_key,
        'floor', coalesce(k.bound_value, v_platform));
    end if;
    if k.bound_value is not null and v_num < (k.bound_value #>> '{}')::numeric then
      return jsonb_build_object('ok', false, 'reason', 'below_statutory_floor',
        'feature', p_feature, 'key', p_key, 'floor', k.bound_value);
    end if;
  elsif k.value_type = 'boolean' then
    if jsonb_typeof(p_value) <> 'boolean' then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s expects a boolean', p_feature, p_key));
    end if;
  elsif k.value_type in ('string','enum') then
    if jsonb_typeof(p_value) <> 'string' then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s expects a string', p_feature, p_key));
    end if;
    if k.allowed_values is not null
       and not (k.allowed_values @> jsonb_build_array(p_value)) then
      return jsonb_build_object('ok', false, 'reason', 'validation',
        'detail', format('%s.%s must be one of %s', p_feature, p_key, k.allowed_values::text));
    end if;
  end if;

  insert into platform.knob_override
    (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values
    (p_feature, p_key, p_scope_kind, p_scope_id, p_organization_id, p_value, p_note, p_actor)
  on conflict (feature, key, scope_kind, scope_id, organization_id)
  do update set value = excluded.value,
                set_note = excluded.set_note,
                updated_by = excluded.updated_by,
                updated_at = now();

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'scope_kind', p_scope_kind, 'scope_id', p_scope_id,
    'effective_value', platform.knob_resolve(p_feature, p_key, p_organization_id,
      case when p_scope_kind = 'user' then p_scope_id else null end,
      case when p_scope_kind not in ('organization','user')
           then jsonb_build_array(jsonb_build_object('kind', p_scope_kind, 'id', p_scope_id))
           else null end),
    'origin', case p_scope_kind when 'organization' then 'org_override'
                                when 'user' then 'user_override'
                                else p_scope_kind || '_override' end);
end;
$$;

-- ----------------------------------------------------------------------------
-- 2d. Enforcement point 2 — the resolver. One added predicate: an override on
-- a rung the org has locked does not participate (inert, not deleted).
-- ----------------------------------------------------------------------------
create or replace function platform.knob_resolve(
  p_feature text,
  p_key text,
  p_organization_id uuid,
  p_user_id uuid default null,
  p_scopes jsonb default null
) returns jsonb
language plpgsql stable
set search_path to 'platform', 'public'
as $$
declare
  k record;
  v jsonb;
  v_num numeric;
begin
  select value_type, coalesce(value, default_value) as base,
         min_value, max_value, allowed_values, overridable_by
    into k
    from platform.feature_knob
   where feature = p_feature and key = p_key;
  if not found then
    raise exception 'platform.knob_resolve: knob %.% is not seeded', p_feature, p_key
      using errcode = 'P0001',
            hint = 'A missing knob raises rather than falling back to a hard-coded value. Seed it in the knob register.';
  end if;

  if p_organization_id is not null and k.overridable_by <> '{}'::text[] then
    select o.value into v
      from platform.knob_override o
      join platform.knob_scope_kind s on s.kind = o.scope_kind
     where o.feature = p_feature and o.key = p_key
       and o.organization_id = p_organization_id
       and o.scope_kind = any (k.overridable_by)
       and not exists (select 1 from platform.knob_rung_lock l
                        where l.feature = o.feature and l.key = o.key
                          and l.organization_id = o.organization_id
                          and o.scope_kind = any (l.locked_kinds))
       and (   (o.scope_kind = 'organization')
            or (o.scope_kind = 'user' and p_user_id is not null and o.scope_id = p_user_id)
            or (p_scopes is not null and exists (
                  select 1 from jsonb_array_elements(p_scopes) e
                   where e ->> 'kind' = o.scope_kind
                     and (e ->> 'id')::uuid = o.scope_id)))
     order by s.precedence desc
     limit 1;
  end if;

  if v is null then
    return k.base;
  end if;

  if k.value_type in ('number','integer') and jsonb_typeof(v) = 'number' then
    v_num := (v #>> '{}')::numeric;
    if k.min_value is not null and v_num < k.min_value then
      raise warning 'knob_resolve: %.% override % below current min % — clamped',
        p_feature, p_key, v_num, k.min_value;
      return to_jsonb(k.min_value);
    end if;
    if k.max_value is not null and v_num > k.max_value then
      raise warning 'knob_resolve: %.% override % above current max % — clamped',
        p_feature, p_key, v_num, k.max_value;
      return to_jsonb(k.max_value);
    end if;
  elsif k.value_type in ('enum','string') and k.allowed_values is not null
        and not (k.allowed_values @> jsonb_build_array(v)) then
    raise warning 'knob_resolve: %.% override % no longer in allowed_values — using platform value',
      p_feature, p_key, v;
    return k.base;
  end if;

  return v;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2e. Enforcement point 3 — the index. The lock row joins in once; the user
-- override join excludes a locked user rung so effective_value/origin match
-- knob_resolve exactly, and two new fields let surfaces render the posture:
--   org_locked_kinds      — the org's locked rungs for this key ([] if none)
--   user_override_locked  — convenience boolean for the two user-facing tabs
-- ----------------------------------------------------------------------------
create or replace function platform.knob_index(
  p_organization_id uuid,
  p_feature_prefix text default null,
  p_user_id uuid default null,
  p_overridden_only boolean default false
) returns jsonb
language plpgsql stable
security definer
set search_path to 'platform', 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'platform.knob_index: no authenticated caller' using errcode = '42501';
  end if;
  if not public.is_admin() and not exists (
      select 1 from iam.organization_member m
       where m.organization_id = p_organization_id and m.user_id = v_uid) then
    raise exception 'platform.knob_index: not a member of that organization' using errcode = '42501';
  end if;
  if p_user_id is not null and p_user_id is distinct from v_uid and not public.is_admin() then
    raise exception 'platform.knob_index: user rung is self-only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'keys', coalesce((
      select jsonb_agg(x order by x ->> 'feature', x ->> 'key')
      from (
        select jsonb_build_object(
          'feature', k.feature,
          'key', k.key,
          'full_key', k.feature || '.' || k.key,
          'label', k.label,
          'description', k.description,
          'value_type', k.value_type,
          'unit', k.unit,
          'allowed_values', k.allowed_values,
          'min_value', k.min_value,
          'max_value', k.max_value,
          'basis', k.basis,
          'set_by', k.set_by,
          'review_due', k.review_due,
          'overridable_by', to_jsonb(k.overridable_by),
          'override_direction', k.override_direction,
          'bound_value', k.bound_value,
          'platform_locked', (k.overridable_by = '{}'::text[]),
          'org_locked_kinds', coalesce(to_jsonb(l.locked_kinds), '[]'::jsonb),
          'user_override_locked', ('user' = any (coalesce(l.locked_kinds, '{}'::text[]))),
          'platform_default', coalesce(k.value, k.default_value),
          'shipped_default', k.default_value,
          'org_override', oo.value,
          'user_override', uo.value,
          'effective_value', coalesce(uo.value, oo.value, k.value, k.default_value),
          'origin', case
             when uo.value is not null then 'user_override'
             when oo.value is not null then 'org_override'
             when coalesce(k.value, k.default_value) is not null then 'platform_default'
             else 'missing' end,
          'is_overridden', (oo.value is not null or uo.value is not null),
          'out_of_range', (
            k.value_type in ('number','integer')
            and coalesce(uo.value, oo.value) is not null
            and jsonb_typeof(coalesce(uo.value, oo.value)) = 'number'
            and (   (k.min_value is not null and (coalesce(uo.value, oo.value) #>> '{}')::numeric < k.min_value)
                 or (k.max_value is not null and (coalesce(uo.value, oo.value) #>> '{}')::numeric > k.max_value)))
        ) as x
        from platform.feature_knob k
        left join platform.knob_rung_lock l
          on l.feature = k.feature and l.key = k.key
         and l.organization_id = p_organization_id
        left join platform.knob_override oo
          on oo.feature = k.feature and oo.key = k.key
         and oo.organization_id = p_organization_id
         and oo.scope_kind = 'organization'
         and 'organization' = any (k.overridable_by)
        left join platform.knob_override uo
          on p_user_id is not null
         and uo.feature = k.feature and uo.key = k.key
         and uo.organization_id = p_organization_id
         and uo.scope_kind = 'user' and uo.scope_id = p_user_id
         and 'user' = any (k.overridable_by)
         and not ('user' = any (coalesce(l.locked_kinds, '{}'::text[])))
        where (p_feature_prefix is null
               or k.feature = p_feature_prefix
               or k.feature like p_feature_prefix || '.%')
          and (p_feature_prefix is not null or k.overridable_by <> '{}'::text[])
      ) rows
      where not p_overridden_only or (x ->> 'is_overridden')::boolean
    ), '[]'::jsonb));
end;
$$;

-- ----------------------------------------------------------------------------
-- In-migration verification: plant a probe knob in a real org, walk the whole
-- story — set / update / user override / lock / refusal / inert row / unlock /
-- restore / clear — asserting the audit stream and resolution at every step.
-- Raises (aborting the migration) on any mismatch; cleans up after itself.
-- ----------------------------------------------------------------------------
do $verify$
declare
  v_org uuid;
  v_user uuid;
  r jsonb;
  v jsonb;
  n int;
begin
  select organization_id, user_id into v_org, v_user
    from iam.organization_member limit 1;
  if v_org is null then
    raise exception 'scfg_40 verify: no organization_member row to probe with';
  end if;

  insert into platform.feature_knob
    (feature, key, value, value_type, default_value, label, description, basis, set_by, overridable_by)
  values ('scfg40_probe', 'probe_key', to_jsonb(10), 'integer', to_jsonb(10),
          'scfg_40 probe', 'Temporary in-migration probe row.', 'migration probe',
          'agent', '{organization,user}')
  on conflict (feature, key) do update set overridable_by = '{organization,user}';

  -- set + update on the org rung → audit 'set' then 'update' with values.
  r := platform._knob_override_write('scfg40_probe','probe_key','organization',v_org,v_org,to_jsonb(20),'probe',null);
  if not (r->>'ok')::boolean then raise exception 'scfg_40 verify: org set refused: %', r; end if;
  r := platform._knob_override_write('scfg40_probe','probe_key','organization',v_org,v_org,to_jsonb(30),'probe2',null);
  select count(*) into n from platform.knob_override_audit
   where feature='scfg40_probe' and action='set' and new_value=to_jsonb(20);
  if n <> 1 then raise exception 'scfg_40 verify: expected 1 audit set row, got %', n; end if;
  select count(*) into n from platform.knob_override_audit
   where feature='scfg40_probe' and action='update' and old_value=to_jsonb(20) and new_value=to_jsonb(30);
  if n <> 1 then raise exception 'scfg_40 verify: expected 1 audit update row, got %', n; end if;

  -- user override wins…
  r := platform._knob_override_write('scfg40_probe','probe_key','user',v_user,v_org,to_jsonb(40),null,v_user);
  if not (r->>'ok')::boolean then raise exception 'scfg_40 verify: user set refused: %', r; end if;
  v := platform.knob_resolve('scfg40_probe','probe_key',v_org,v_user);
  if v <> to_jsonb(40) then raise exception 'scfg_40 verify: expected user value 40, got %', v; end if;

  -- …until the org locks the user rung: new writes refuse, the standing row
  -- goes inert, clearing it stays allowed.
  insert into platform.knob_rung_lock (feature, key, organization_id, locked_kinds, note)
  values ('scfg40_probe','probe_key',v_org,'{user}','probe lock');
  r := platform._knob_override_write('scfg40_probe','probe_key','user',v_user,v_org,to_jsonb(50),null,v_user);
  if (r->>'ok')::boolean or r->>'reason' <> 'org_locked' then
    raise exception 'scfg_40 verify: expected org_locked refusal, got %', r;
  end if;
  v := platform.knob_resolve('scfg40_probe','probe_key',v_org,v_user);
  if v <> to_jsonb(30) then raise exception 'scfg_40 verify: locked user rung should yield org value 30, got %', v; end if;
  select count(*) into n from platform.knob_override_audit
   where feature='scfg40_probe' and action='rung_lock' and new_value=to_jsonb('{user}'::text[]);
  if n <> 1 then raise exception 'scfg_40 verify: expected 1 rung_lock audit row, got %', n; end if;

  -- unlock restores the standing user row.
  delete from platform.knob_rung_lock where feature='scfg40_probe';
  v := platform.knob_resolve('scfg40_probe','probe_key',v_org,v_user);
  if v <> to_jsonb(40) then raise exception 'scfg_40 verify: unlock should restore user value 40, got %', v; end if;
  select count(*) into n from platform.knob_override_audit
   where feature='scfg40_probe' and action='rung_unlock';
  if n <> 1 then raise exception 'scfg_40 verify: expected 1 rung_unlock audit row, got %', n; end if;

  -- clears audit as 'clear' with the old value.
  r := platform._knob_override_write('scfg40_probe','probe_key','user',v_user,v_org,null,null,v_user);
  select count(*) into n from platform.knob_override_audit
   where feature='scfg40_probe' and action='clear' and old_value=to_jsonb(40);
  if n <> 1 then raise exception 'scfg_40 verify: expected 1 audit clear row, got %', n; end if;

  -- clean up: knob delete cascades override + lock; audit has no FK, delete explicitly.
  delete from platform.feature_knob where feature='scfg40_probe';
  delete from platform.knob_override_audit where feature='scfg40_probe';
  raise notice 'scfg_40 verify: all probes passed';
end;
$verify$;
