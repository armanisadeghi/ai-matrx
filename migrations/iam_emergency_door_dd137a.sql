-- iam_emergency_door_dd137a — THE EMERGENCY DOOR, LIFTED FROM HR TO THE PLATFORM (DD-137a).
--
-- Design: common-docs /projects/data-doctrine-adoption/discovery/VISIBILITY-BY-CLASS.md §3.5
-- ("the emergency door — one door, two procedures", chair R4) and §3.9 step 1 ("the door first").
-- Ruling it implements: common-docs /systems/platform/access/DECISIONS.md, row 2026-09-12 —
-- *"the private class exists; an org admin has no standing read of a person's private data; the
-- audited emergency door is the only way in"*. Rule 14 (organizations are hard walls) is why
-- there is NO account takeover here: §3.5's `takeover` row is deleted, deliberately.
--
-- 🚨 LAW 5. `public.hr_break_glass` already did every invariant the industry's best doors do, for
-- ONE schema and 27 hard-coded tokens. This migration lifts it to the platform and makes HR a
-- CALLER of it, not a sibling. HR's own function, its vetoes, its `hr.access_audit` rows, its
-- `hr.derived_grant` rows and its alert routing are UNCHANGED and keep working byte for byte —
-- it gains a platform audit row and the subject notification it never had. R4: ONE door.
--
-- What is here:
--   1. `iam.access_audit`          — the platform read-audit. Written on every GRANT and every
--                                    REFUSAL. THE AUDIT IS THE GUARANTEE.
--   2. `iam.emergency_door_request`— the two-person procedure for the `private` class.
--   3. `access_purpose`            — a controlled dimension in `platform.categories`, never prose.
--   4. Two platform knobs          — the 120-minute time box (GitHub's published number) and the
--                                    justification floor. Organizations tighten the box, never widen.
--   5. `iam.emergency_door_class`  — THE ONE SEAM. Today it derives the class from what the
--                                    registry already holds; when DD-137b lands
--                                    `platform.entity_types.data_class` this function reads it and
--                                    nothing else in the door changes.
--   6. The doors themselves        — open / approve / deny / pending / purposes / my_access_log.
--   7. `iam._guard_emergency_door_grant` — a BEFORE INSERT trigger on `iam.permissions`: on a
--                                    `private` or `confidential` token, a grant is written by the
--                                    row's OWNER or by this door, and by nothing else. That is
--                                    §3.4's "the door is the only way in", proven rather than
--                                    asserted.
--
-- 🚨 IDEMPOTENT. `migrations/` is a live drop box and another lane's applier will re-run this
-- file; `platform.create_entity_table` is not re-runnable, so both tables are guarded on absence.
--
-- 🚨 NOTHING SILENT. Every refusal below returns a human sentence AND writes an audit row. A
-- token nobody has classified yet does not get a quiet default — the door refuses it and says so.

-- ═════════════════════════════════════════════════════════════ 1. the platform read-audit
do $$
begin
  if to_regclass('iam.access_audit') is null then
    perform platform.create_entity_table(
      p_schema => 'iam',
      p_table => 'access_audit',
      p_token => 'iam_access_audit',
      p_label => 'Access audit',
      p_fields => ARRAY[
        -- what happened: requested | approved | denied | read | expired
        'action text NOT NULL',
        'target_token text NOT NULL',
        'target_ids uuid[] NOT NULL DEFAULT ''{}''::uuid[]',
        'row_count integer',
        -- WHOSE data was opened. This is the column the subject''s own page reads.
        'subject_user_id uuid REFERENCES auth.users(id)',
        'data_class text NOT NULL',
        -- a slug from the access_purpose dimension, never prose
        'purpose text NOT NULL',
        -- emergency_door | refused | requested | approved
        'basis text NOT NULL',
        'justification text',
        'is_emergency_door boolean NOT NULL DEFAULT true',
        'granted boolean NOT NULL',
        'denial_reason text',
        'request_id uuid',
        'permission_id uuid',
        'grant_expires_at timestamptz',
        'actor_user_id uuid REFERENCES auth.users(id)',
        'occurred_at timestamptz NOT NULL DEFAULT now()',
        'request_context jsonb NOT NULL DEFAULT ''{}''::jsonb'
      ],
      -- Created as `ledger` because platform.create_entity_table only knows the four base
      -- variants; re-applied as `restricted` immediately below. `restricted` is what HR's own
      -- access_audit carries: nobody browses this table through a policy, and every read is a
      -- named definer door (iam.my_access_log for the subject, iam.org_access_log for the
      -- organization''s owners), so "who looked at whom" cannot itself become a browsing surface.
      p_variant => 'ledger',
      p_versioned => false,
      p_soft_delete => true,
      p_visibility => 'personal',
      p_category => false,
      p_listed => false,
      p_org_default => true,
      p_gin_jsonb => false,
      p_parents => NULL
    );
  end if;
end $$;

-- re-apply as `restricted` (idempotent: iam.apply_rls drops and re-emits the std_* policies)
do $$
begin
  if coalesce((select rls_variant from platform.entity_types where token = 'iam_access_audit'), '')
     is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted' where token = 'iam_access_audit';
    perform iam.apply_rls('iam', 'access_audit', 'iam_access_audit', 'restricted');
  end if;
end $$;

create index if not exists iam_access_audit_subject_idx
  on iam.access_audit (subject_user_id, occurred_at desc);
create index if not exists iam_access_audit_actor_idx
  on iam.access_audit (actor_user_id, occurred_at desc);
create index if not exists iam_access_audit_org_idx
  on iam.access_audit (organization_id, occurred_at desc);

comment on table iam.access_audit is
  'THE AUDIT IS THE GUARANTEE (DD-137a, VISIBILITY-BY-CLASS §3.5). One row per emergency-door act — every GRANT and every REFUSAL — for the whole platform. hr.access_audit remains HR''s own domain ledger and keeps every row it has; hr_break_glass now writes BOTH. Read only through iam.my_access_log (the subject) and iam.org_access_log (the organization''s owners).';
comment on column iam.access_audit.subject_user_id is
  'Whose data was opened. The person''s own "who opened my data" page is a read of this column, and it is theirs without asking anyone (DD-137a).';
comment on column iam.access_audit.granted is
  'false rows are the point. A refusal that is not recorded is a door with no audit.';

-- ═════════════════════════════════════════════════════════════ 2. the two-person request
do $$
begin
  if to_regclass('iam.emergency_door_request') is null then
    perform platform.create_entity_table(
      p_schema => 'iam',
      p_table => 'emergency_door_request',
      p_token => 'iam_emergency_door_request',
      p_label => 'Emergency access request',
      p_fields => ARRAY[
        'target_token text NOT NULL',
        'target_id uuid NOT NULL',
        'subject_user_id uuid REFERENCES auth.users(id)',
        'data_class text NOT NULL',
        'purpose text NOT NULL',
        'justification text NOT NULL',
        'requested_by uuid NOT NULL REFERENCES auth.users(id)',
        'status text NOT NULL DEFAULT ''pending''',
        'decided_by uuid REFERENCES auth.users(id)',
        'decided_at timestamptz',
        'decision_note text',
        -- how long the REQUEST stands before it lapses unanswered
        'request_expires_at timestamptz NOT NULL',
        'permission_id uuid',
        'grant_expires_at timestamptz'
      ],
      p_variant => 'ledger',   -- re-applied as `restricted` below (see iam.access_audit)
      p_versioned => false,
      p_soft_delete => true,
      p_visibility => 'personal',
      p_category => false,
      p_listed => false,
      p_org_default => true,
      p_gin_jsonb => false,
      p_parents => NULL
    );
  end if;
end $$;

do $$
begin
  if coalesce((select rls_variant from platform.entity_types where token = 'iam_emergency_door_request'), '')
     is distinct from 'restricted' then
    update platform.entity_types set rls_variant = 'restricted'
     where token = 'iam_emergency_door_request';
    perform iam.apply_rls('iam', 'emergency_door_request', 'iam_emergency_door_request', 'restricted');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'emergency_door_request_status_ck') then
    alter table iam.emergency_door_request
      add constraint emergency_door_request_status_ck
      check (status in ('pending','approved','denied','expired','withdrawn'));
  end if;
  -- TWO PEOPLE, NEVER ONE. The requester may not be the approver, and the constraint says so in
  -- the schema rather than only in the function that writes it.
  if not exists (select 1 from pg_constraint where conname = 'emergency_door_request_two_people_ck') then
    alter table iam.emergency_door_request
      add constraint emergency_door_request_two_people_ck
      check (decided_by is null or decided_by <> requested_by);
  end if;
end $$;

create index if not exists iam_emergency_door_request_pending_idx
  on iam.emergency_door_request (organization_id, status, request_expires_at);
create index if not exists iam_emergency_door_request_subject_idx
  on iam.emergency_door_request (subject_user_id, created_at desc);

comment on table iam.emergency_door_request is
  'The `private`-class procedure (VISIBILITY-BY-CLASS §3.5): an organization admin REQUESTS and the organization owner APPROVES — two named people, never one. `confidential` needs no row here; one organization admin opens it directly and the audit records it.';

-- ═════════════════════════════════════════════════════════════ 3. the controlled purpose list
-- Never prose. Lifted from hr_access_purpose (hr_c3_01), widened to the words a platform-wide
-- door needs, seeded on the system organization exactly as HR's is.
insert into platform.categories (organization_id, dimension, name, slug, is_system, position, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'access_purpose', v.label, v.slug, true, v.pos,
       'internal'::platform.visibility
  from (values
    ('Security or fraud incident',                'security_incident',  10),
    ('Legal, litigation or legal hold',           'legal',              20),
    ('Statutory or regulatory reporting',         'compliance_report',  30),
    ('Audit or access review',                    'audit',              40),
    ('Employee-relations investigation',          'investigation',      50),
    ('The person asked for it',                   'subject_request',    60),
    ('Lost access — recovering the person''s own work', 'access_recovery', 70),
    ('Data loss or corruption recovery',          'data_recovery',      80),
    ('Departure or handover of work in flight',   'offboarding',        90),
    ('Support troubleshooting on behalf of the org', 'support',        100)
  ) as v(label, slug, pos)
 where not exists (select 1 from platform.categories c
                    where c.dimension = 'access_purpose' and c.slug = v.slug
                      and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                      and c.deleted_at is null);

-- ═════════════════════════════════════════════════════════════ 4. the knobs (law 6)
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, overridable_by, override_direction, propagation)
values
  ('platform.access', 'emergency_door_ttl_minutes', '120'::jsonb, '120'::jsonb, 'integer',
   'minutes', 5, 480,
   'Emergency access time box',
   'How long an emergency-door grant lives before iam.permissions.expires_at kills it.',
   'agent',
   'GitHub publishes 120 minutes for its own break-glass and it is the strictest published number among the champions we measured; Google Vault publishes none at all. An organization may tighten it and may not widen it — an organization may promise its people MORE privacy than the platform does, never less (VISIBILITY-BY-CLASS §3.6).',
   ARRAY['organization'], 'lower_only', 'next_load'),
  ('platform.access', 'emergency_door_justification_min_chars', '40'::jsonb, '40'::jsonb, 'integer',
   'characters', 20, 500,
   'Emergency access justification minimum',
   'The shortest justification the emergency door will accept.',
   'agent',
   'HR''s floor is 20, which defeats "asdf". This door opens a person''s private data rather than an employment record, so the floor is doubled: 40 characters is one real sentence. Tightening only, for the same reason as the time box.',
   ARRAY['organization'], 'raise_only', 'next_load')
on conflict (feature, key) do nothing;

-- ═════════════════════════════════════════════════════════════ 5. the notification events
insert into communication.notification_event_type
  (organization_id, event_key, label, description, default_channels, enabled, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.k, v.l, v.d,
       '{"in_app": true, "email": true}'::jsonb, true, 'internal'::platform.visibility
  from (values
    ('platform.access.emergency_door_opened',
     'Someone opened your data',
     'NOT SUPPRESSIBLE. The person whose row was opened is told every time: who opened it, what they opened, the reason they typed, and when the key expires.'),
    ('platform.access.emergency_door_requested',
     'Emergency access to your data was requested',
     'NOT SUPPRESSIBLE. The `private` procedure needs an owner''s approval; the subject hears about it at the moment it is asked, not at the moment it is granted.'),
    ('platform.access.emergency_door_approval_needed',
     'An emergency access request needs your approval',
     'To the organization''s owners. Two people, never one.'),
    ('platform.access.emergency_door_denied',
     'An emergency access request about your data was refused',
     'NOT SUPPRESSIBLE. A refusal is as much the subject''s business as a grant.')
  ) as v(k, l, d)
 where not exists (select 1 from communication.notification_event_type t
                    where t.event_key = v.k and t.deleted_at is null);

-- ═════════════════════════════════════════════════════════════ 6. THE ONE SEAM — the class
create or replace function iam.emergency_door_class(p_token text)
returns text
language plpgsql
stable
security definer
set search_path to 'iam', 'platform', 'hr', 'public'
as $fn$
declare
  v_class text; v_vis text; v_variant text; v_has_col boolean; d record;
begin
  -- (a) DD-137b's registry word, the moment it exists. This function is the ONLY place the door
  --     asks what class a token is, so B-41b lands one column and changes nothing else here.
  select exists (select 1 from information_schema.columns
                  where table_schema = 'platform' and table_name = 'entity_types'
                    and column_name = 'data_class')
    into v_has_col;
  if v_has_col then
    execute 'select data_class::text from platform.entity_types where token = $1'
       into v_class using p_token;
    if v_class is not null then return v_class; end if;
  end if;

  -- (b) HR already declares its class as code, for the 27 tokens the door was lifted from. It is
  --     the reference implementation; it keeps declaring them until DD-137b moves them into the
  --     registry, and until then the two can never disagree because only one of them is asked.
  select * into d from hr._door_spec(p_token);
  if found then
    return case when d.tier = 'restricted' then 'private' else 'confidential' end;
  end if;

  -- (c) derive from what the registry holds today.
  select et.default_visibility::text, et.rls_variant
    into v_vis, v_variant
    from platform.entity_types et
   where et.token = p_token;

  if v_variant is null then
    return null;               -- unregistered token: the caller refuses and says so
  end if;
  if v_variant = 'personal' then
    return 'private';          -- the six rls_variant='personal' tables, by derivation
  end if;
  return case v_vis
           when 'personal' then 'private'
           when 'internal' then 'confidential'
           when 'link'     then 'organization'
           when 'public'   then 'public'
           else null          -- 77 registry rows are NULL. NULL is not 'internal' here.
         end;
end $fn$;

comment on function iam.emergency_door_class(text) is
  'THE ONE SEAM (DD-137a). The single place the emergency door asks what class a token is: platform.entity_types.data_class when DD-137b lands it, else HR''s own declaration for the 27 tokens the door was lifted from, else derived from the registry''s default_visibility and rls_variant. Returns NULL for a token nobody has classified — and a NULL is refused loudly by the door, never quietly defaulted.';

-- ─────────────────────────────────────────────── the row the door is asked about
create or replace function iam._door_target(
  p_token text, p_id uuid,
  out o_schema text, out o_table text, out o_org uuid, out o_subject uuid)
language plpgsql
stable
security definer
set search_path to 'iam', 'platform', 'public'
as $fn$
declare v_owner_col text;
begin
  select e.schema_name, e.table_name into o_schema, o_table
    from platform.entity_types e where e.token = p_token;
  if o_schema is null then return; end if;

  select case
           when exists (select 1 from information_schema.columns
                         where table_schema = o_schema and table_name = o_table
                           and column_name = 'created_by') then 'created_by'
           when exists (select 1 from information_schema.columns
                         where table_schema = o_schema and table_name = o_table
                           and column_name = 'owner_id') then 'owner_id'
         end
    into v_owner_col;

  if v_owner_col is null then
    execute format('select organization_id, null::uuid from %I.%I where id = $1', o_schema, o_table)
       into o_org, o_subject using p_id;
  else
    execute format('select organization_id, %I from %I.%I where id = $1',
                   v_owner_col, o_schema, o_table)
       into o_org, o_subject using p_id;
  end if;
end $fn$;

-- ─────────────────────────────────────────────── the knobs, resolved
create or replace function iam._door_ttl_minutes(p_org uuid)
returns integer language sql stable security definer set search_path to 'platform','public' as $fn$
  select coalesce(
    (platform.knob_resolve('platform.access', 'emergency_door_ttl_minutes', p_org, null, null) #>> '{}')::integer,
    120);
$fn$;

create or replace function iam._door_min_chars(p_org uuid)
returns integer language sql stable security definer set search_path to 'platform','public' as $fn$
  select coalesce(
    (platform.knob_resolve('platform.access', 'emergency_door_justification_min_chars', p_org, null, null) #>> '{}')::integer,
    40);
$fn$;

-- ─────────────────────────────────────────────── the recorder
create or replace function iam._record_access_audit(
  p_organization_id uuid, p_action text, p_target_token text, p_data_class text,
  p_purpose text, p_basis text, p_granted boolean,
  p_target_ids uuid[] default '{}'::uuid[], p_row_count integer default null,
  p_subject_user_id uuid default null, p_justification text default null,
  p_denial_reason text default null, p_request_id uuid default null,
  p_permission_id uuid default null, p_grant_expires_at timestamptz default null,
  p_is_emergency_door boolean default true, p_actor_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'iam', 'public'
as $fn$
declare v_id uuid; v_actor uuid := coalesce(p_actor_user_id, auth.uid());
begin
  insert into iam.access_audit
    (organization_id, action, target_token, target_ids, row_count, subject_user_id, data_class,
     purpose, basis, justification, is_emergency_door, granted, denial_reason, request_id,
     permission_id, grant_expires_at, actor_user_id, created_by, visibility)
  values
    (p_organization_id, p_action, p_target_token, coalesce(p_target_ids, '{}'::uuid[]), p_row_count,
     p_subject_user_id, p_data_class, p_purpose, p_basis, p_justification, p_is_emergency_door,
     p_granted, p_denial_reason, p_request_id, p_permission_id, p_grant_expires_at, v_actor,
     v_actor, 'personal'::platform.visibility)
  returning id into v_id;
  return v_id;
end $fn$;

comment on function iam._record_access_audit is
  'The ONE writer of iam.access_audit. Called on every grant and on every refusal, by iam.emergency_door_* and by public.hr_break_glass (DD-137a made HR a caller).';

-- ─────────────────────────────────────────────── the subject notification (not suppressible)
create or replace function iam._notify_door(
  p_organization_id uuid, p_event_key text, p_recipient uuid, p_payload jsonb,
  p_target_id uuid, p_deep_link text, p_dedupe text)
returns integer
language plpgsql
security definer
set search_path to 'iam', 'communication', 'public'
as $fn$
declare v_raw jsonb; v_channels text[]; ch text; v_n integer := 0;
begin
  if p_recipient is null then return 0; end if;

  select t.default_channels into v_raw
    from communication.notification_event_type t
   where t.event_key = p_event_key and t.deleted_at is null
   order by (t.organization_id = p_organization_id) desc
   limit 1;

  -- 🚨 FAILS TOWARD TELLING THE PERSON. An unregistered event key or a malformed channel object
  -- must never be the reason a subject is not told their data was opened.
  if v_raw is null then
    v_channels := ARRAY['in_app'];
  elsif jsonb_typeof(v_raw) = 'array' then
    v_channels := coalesce((select array_agg(value) from jsonb_array_elements_text(v_raw)), ARRAY['in_app']);
  else
    v_channels := coalesce((select array_agg(key) from jsonb_each(v_raw) where value = 'true'::jsonb),
                           ARRAY['in_app']);
  end if;
  if cardinality(v_channels) = 0 then v_channels := ARRAY['in_app']; end if;

  foreach ch in array v_channels loop
    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (p_organization_id, p_event_key, p_recipient, 'user', ch, p_payload,
            'iam_access_audit', p_target_id, p_deep_link,
            p_dedupe || ':' || ch, 'personal'::platform.visibility)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;

comment on function iam._notify_door is
  'THE EMAIL IS THE COURTESY, THE AUDIT IS THE GUARANTEE (VISIBILITY-BY-CLASS §3.5). The door does not close when notifications are down; this function therefore never raises and always falls back to the in-app channel rather than losing the notice.';

-- ═════════════════════════════════════════════════════════════ 7. THE DOOR
create or replace function iam.emergency_door_open(
  p_token text, p_id uuid, p_purpose text, p_justification text)
returns jsonb
language plpgsql
security definer
set search_path to 'iam', 'platform', 'communication', 'hr', 'public'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_class text; t record; v_min integer; v_ttl integer; v_audit uuid; v_perm uuid;
  v_req uuid; v_is_admin boolean; v_is_owner boolean; v_expires timestamptz; r record;
begin
  if v_uid is null then
    raise exception 'emergency_door_open: no authenticated caller' using errcode = '42501';
  end if;

  -- 🚨 ONE DOOR (chair R4). An HR token keeps HR's own vetoes — subject-exclusion, the medical
  -- note class, the five structurally doorless tokens — so the platform door DELEGATES rather
  -- than building a second, weaker path beside it. hr_break_glass writes the platform audit row
  -- and the subject notification itself (section 8 below).
  if exists (select 1 from hr._door_spec(p_token)) then
    return public.hr_break_glass(p_token, p_id, p_purpose, p_justification);
  end if;

  v_class := iam.emergency_door_class(p_token);
  select * into t from iam._door_target(p_token, p_id);

  if t.o_schema is null then
    raise exception 'emergency_door_open: % is not a registered entity token, so there is no row for this door to open. Register it in platform.entity_types first.', p_token
      using errcode = '22023';
  end if;
  if t.o_org is null then
    raise exception 'emergency_door_open: no % row with id %', p_token, p_id using errcode = 'P0002';
  end if;

  -- ── the caller must be an admin or owner OF THE ROW'S OWN ORGANIZATION.
  select bool_or(om.role in ('owner','admin')), bool_or(om.role = 'owner')
    into v_is_admin, v_is_owner
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = t.o_org;
  v_is_admin := coalesce(v_is_admin, false);
  v_is_owner := coalesce(v_is_owner, false);

  -- ── an unclassified token gets a refusal, not a default (nothing silent)
  if v_class is null then
    v_audit := iam._record_access_audit(
      t.o_org, 'denied', p_token, '(unclassified)', coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, t.o_subject, p_justification,
      format('%s has no data class yet, so this door cannot know how strictly to open it. Classify the token in platform.entity_types before asking for emergency access.', p_token));
    return jsonb_build_object('granted', false, 'reason', 'unclassified_token',
      'message', format('%s has no data class yet. Nobody can open it in an emergency until someone says how private it is.', p_token),
      'audit_id', v_audit);
  end if;

  -- ── a class that has no door. `public` and `organization` data is reached by ordinary access;
  --    an emergency door there would be theatre, and theatre teaches people to ignore alarms.
  if v_class not in ('private', 'confidential') then
    v_audit := iam._record_access_audit(
      t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, t.o_subject, p_justification,
      format('%s is %s-class data, which is reached by ordinary access rather than by an emergency door.', p_token, v_class));
    return jsonb_build_object('granted', false, 'reason', 'no_door_needed',
      'message', format('%s is %s data. Ask for ordinary access to it — this door is for private data only.', p_token, v_class),
      'audit_id', v_audit);
  end if;

  if not v_is_admin then
    v_audit := iam._record_access_audit(
      t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, t.o_subject, p_justification,
      'the caller is not an owner or admin of the organization that owns this row');
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_admin',
      'message', 'Only an owner or admin of the organization that owns this data can open the emergency door on it.',
      'audit_id', v_audit);
  end if;

  -- ── the justification floor, from the knob
  v_min := iam._door_min_chars(t.o_org);
  if p_justification is null or length(btrim(p_justification)) < v_min then
    v_audit := iam._record_access_audit(
      t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, t.o_subject, p_justification,
      format('justification is shorter than the %s-character floor', v_min));
    return jsonb_build_object('granted', false, 'reason', 'justification_too_short',
      'message', format('Say why, in at least %s characters. This sentence goes to the person whose data you are opening.', v_min),
      'audit_id', v_audit);
  end if;

  -- ── the purpose is a slug from the controlled dimension, never prose
  if not exists (select 1 from platform.categories c
                  where c.dimension = 'access_purpose' and c.slug = p_purpose
                    and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and c.deleted_at is null) then
    v_audit := iam._record_access_audit(
      t.o_org, 'denied', p_token, v_class, '(unregistered)', 'refused',
      false, ARRAY[p_id], null, t.o_subject, p_justification,
      format('purpose %s is not in the access_purpose dimension', coalesce(p_purpose,'(null)')));
    return jsonb_build_object('granted', false, 'reason', 'unregistered_purpose',
      'message', 'Pick a reason from the list. A typed reason cannot be reported on, so it is not accepted.',
      'audit_id', v_audit);
  end if;

  -- ── nobody needs a door to their own row
  if t.o_subject = v_uid then
    return jsonb_build_object('granted', false, 'reason', 'self',
      'message', 'This is your own data. You can already read it.');
  end if;

  -- ── the token must be able to carry a grant at all
  if not exists (select 1 from platform.shareable_resource_registry r
                  where r.is_active and r.resource_type = p_token) then
    v_audit := iam._record_access_audit(
      t.o_org, 'denied', p_token, v_class, p_purpose, 'refused', false, ARRAY[p_id], null,
      t.o_subject, p_justification,
      format('%s is not a registered sharing token, so no grant can be written for it', p_token));
    return jsonb_build_object('granted', false, 'reason', 'token_not_grantable',
      'message', format('%s cannot carry a grant, so the emergency door has nothing to open. Register it as a shareable resource first.', p_token),
      'audit_id', v_audit);
  end if;

  v_ttl := iam._door_ttl_minutes(t.o_org);

  -- ══════════ the `private` procedure: TWO PEOPLE, NEVER ONE
  if v_class = 'private' then
    insert into iam.emergency_door_request
      (organization_id, target_token, target_id, subject_user_id, data_class, purpose,
       justification, requested_by, status, request_expires_at, created_by, visibility)
    values (t.o_org, p_token, p_id, t.o_subject, v_class, p_purpose, p_justification, v_uid,
            'pending', now() + interval '24 hours', v_uid, 'personal'::platform.visibility)
    returning id into v_req;

    v_audit := iam._record_access_audit(
      t.o_org, 'requested', p_token, v_class, p_purpose, 'requested', false, ARRAY[p_id], null,
      t.o_subject, p_justification, null, v_req);

    -- the subject hears about it NOW, not when it is granted
    perform iam._notify_door(t.o_org, 'platform.access.emergency_door_requested', t.o_subject,
      jsonb_build_object('token', p_token, 'target_id', p_id, 'requested_by', v_uid,
                         'purpose', p_purpose, 'justification', p_justification,
                         'request_id', v_req, 'data_class', v_class),
      v_req, '/me/access-log', 'edoor:req:' || v_req::text || ':' || t.o_subject::text);

    -- and the organization's owners are asked to decide
    for r in select om.user_id from iam.organization_member om
              where om.organization_id = t.o_org and om.role = 'owner' and om.user_id <> v_uid loop
      perform iam._notify_door(t.o_org, 'platform.access.emergency_door_approval_needed', r.user_id,
        jsonb_build_object('token', p_token, 'target_id', p_id, 'requested_by', v_uid,
                           'purpose', p_purpose, 'justification', p_justification,
                           'request_id', v_req, 'subject_user_id', t.o_subject),
        v_req, '/organizations/emergency-access', 'edoor:appr:' || v_req::text || ':' || r.user_id::text);
    end loop;

    return jsonb_build_object('granted', false, 'reason', 'awaiting_approval', 'request_id', v_req,
      'audit_id', v_audit, 'data_class', v_class,
      'message', 'This is private data, so one person cannot open it. The organization''s owner has been asked to approve, and the person whose data it is has been told you asked.');
  end if;

  -- ══════════ the `confidential` procedure: one organization admin, opened now
  v_expires := now() + make_interval(mins => v_ttl);

  perform set_config('iam.emergency_door', 'on', true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at, created_by)
  values (p_token, p_id, v_uid, 'viewer', 'active', v_expires, v_uid)
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set expires_at = excluded.expires_at, status = 'active'
  returning id into v_perm;

  v_audit := iam._record_access_audit(
    t.o_org, 'read', p_token, v_class, p_purpose, 'emergency_door', true, ARRAY[p_id], 1,
    t.o_subject, p_justification, null, null, v_perm, v_expires);

  perform iam._notify_door(t.o_org, 'platform.access.emergency_door_opened', t.o_subject,
    jsonb_build_object('token', p_token, 'target_id', p_id, 'opened_by', v_uid,
                       'purpose', p_purpose, 'justification', p_justification,
                       'expires_at', v_expires, 'data_class', v_class, 'audit_id', v_audit),
    v_audit, '/me/access-log', 'edoor:open:' || v_audit::text || ':' || coalesce(t.o_subject::text,'-'));

  return jsonb_build_object('granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'permission_level', 'viewer', 'expires_at', v_expires, 'data_class', v_class,
    'alert_event', 'platform.access.emergency_door_opened', 'alert_tier', 'immediate',
    'message', format('Opened, read-only, until %s. %s has been told who you are and why.',
                      to_char(v_expires, 'HH24:MI'), 'The person whose data this is'));
end $fn$;

comment on function iam.emergency_door_open(text, uuid, text, text) is
  'THE emergency door for the whole platform (DD-137a, VISIBILITY-BY-CLASS §3.5). `confidential`: one organization admin opens it now. `private`: an admin requests and the organization OWNER approves — two people, never one. Always read-only (`viewer`), always time-boxed by platform.access.emergency_door_ttl_minutes, always audited on grant AND on refusal, and the subject is always told. An HR token is delegated to public.hr_break_glass so HR''s absolute vetoes still apply — one door, never two.';

-- ─────────────────────────────────────────────── approve / deny
create or replace function iam.emergency_door_approve(p_request_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'iam', 'platform', 'communication', 'public'
as $fn$
declare
  v_uid uuid := auth.uid(); q iam.emergency_door_request%rowtype;
  v_is_owner boolean; v_ttl integer; v_perm uuid; v_audit uuid; v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'emergency_door_approve: no authenticated caller' using errcode = '42501';
  end if;
  select * into q from iam.emergency_door_request where id = p_request_id;
  if not found then
    raise exception 'emergency_door_approve: no request %', p_request_id using errcode = 'P0002';
  end if;

  select bool_or(om.role = 'owner') into v_is_owner
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = q.organization_id;

  if not coalesce(v_is_owner, false) then
    v_audit := iam._record_access_audit(
      q.organization_id, 'denied', q.target_token, q.data_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, q.subject_user_id, q.justification,
      'only an organization OWNER can approve a private-class emergency request', p_request_id);
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_owner',
      'message', 'Only an owner of this organization can approve emergency access to private data.',
      'audit_id', v_audit);
  end if;

  -- TWO PEOPLE, NEVER ONE.
  if q.requested_by = v_uid then
    v_audit := iam._record_access_audit(
      q.organization_id, 'denied', q.target_token, q.data_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, q.subject_user_id, q.justification,
      'the person who asked cannot also be the person who approves', p_request_id);
    return jsonb_build_object('granted', false, 'reason', 'same_person',
      'message', 'You asked for this access, so you cannot also approve it. Another owner has to.',
      'audit_id', v_audit);
  end if;

  if q.status <> 'pending' then
    return jsonb_build_object('granted', false, 'reason', 'not_pending',
      'message', format('This request was already %s.', q.status));
  end if;
  if q.request_expires_at <= now() then
    update iam.emergency_door_request set status = 'expired', updated_at = now() where id = q.id;
    v_audit := iam._record_access_audit(
      q.organization_id, 'expired', q.target_token, q.data_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, q.subject_user_id, q.justification,
      'the request lapsed before anyone answered it', p_request_id);
    return jsonb_build_object('granted', false, 'reason', 'request_expired',
      'message', 'This request has lapsed. If the emergency is still live, ask again.',
      'audit_id', v_audit);
  end if;

  v_ttl := iam._door_ttl_minutes(q.organization_id);
  v_expires := now() + make_interval(mins => v_ttl);

  perform set_config('iam.emergency_door', 'on', true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at, created_by)
  values (q.target_token, q.target_id, q.requested_by, 'viewer', 'active', v_expires, v_uid)
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set expires_at = excluded.expires_at, status = 'active'
  returning id into v_perm;

  update iam.emergency_door_request
     set status = 'approved', decided_by = v_uid, decided_at = now(), decision_note = p_note,
         permission_id = v_perm, grant_expires_at = v_expires, updated_at = now()
   where id = q.id;

  v_audit := iam._record_access_audit(
    q.organization_id, 'approved', q.target_token, q.data_class, q.purpose, 'emergency_door', true,
    ARRAY[q.target_id], 1, q.subject_user_id, q.justification, null, q.id, v_perm, v_expires);

  perform iam._notify_door(q.organization_id, 'platform.access.emergency_door_opened',
    q.subject_user_id,
    jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                       'opened_by', q.requested_by, 'approved_by', v_uid, 'purpose', q.purpose,
                       'justification', q.justification, 'expires_at', v_expires,
                       'data_class', q.data_class, 'audit_id', v_audit),
    v_audit, '/me/access-log',
    'edoor:open:' || v_audit::text || ':' || coalesce(q.subject_user_id::text,'-'));

  return jsonb_build_object('granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'permission_level', 'viewer', 'expires_at', v_expires,
    'message', format('Approved, read-only, until %s. The person whose data it is has been told.',
                      to_char(v_expires, 'HH24:MI')));
end $fn$;

create or replace function iam.emergency_door_deny(p_request_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'iam', 'communication', 'public'
as $fn$
declare v_uid uuid := auth.uid(); q iam.emergency_door_request%rowtype; v_is_owner boolean; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'emergency_door_deny: no authenticated caller' using errcode = '42501';
  end if;
  select * into q from iam.emergency_door_request where id = p_request_id;
  if not found then
    raise exception 'emergency_door_deny: no request %', p_request_id using errcode = 'P0002';
  end if;
  select bool_or(om.role = 'owner') into v_is_owner from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = q.organization_id;
  if not coalesce(v_is_owner, false) then
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_owner',
      'message', 'Only an owner of this organization can answer an emergency access request.');
  end if;

  update iam.emergency_door_request
     set status = 'denied', decided_by = v_uid, decided_at = now(), decision_note = p_note,
         updated_at = now()
   where id = q.id and status = 'pending';

  v_audit := iam._record_access_audit(
    q.organization_id, 'denied', q.target_token, q.data_class, q.purpose, 'refused', false,
    ARRAY[q.target_id], null, q.subject_user_id, q.justification,
    coalesce(p_note, 'the organization owner refused the request'), q.id);

  perform iam._notify_door(q.organization_id, 'platform.access.emergency_door_denied',
    q.subject_user_id,
    jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                       'requested_by', q.requested_by, 'denied_by', v_uid, 'purpose', q.purpose,
                       'note', p_note, 'audit_id', v_audit),
    v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);

  return jsonb_build_object('granted', false, 'reason', 'denied', 'audit_id', v_audit,
    'message', 'Refused, and recorded. The person whose data it is has been told it was asked for and refused.');
end $fn$;

-- ─────────────────────────────────────────────── the screens' read doors
create or replace function iam.emergency_door_purposes()
returns jsonb language sql stable security definer set search_path to 'platform','public' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name) order by c.position), '[]'::jsonb)
    from platform.categories c
   where c.dimension = 'access_purpose'
     and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and c.deleted_at is null;
$fn$;

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
             q.organization_id
        from iam.emergency_door_request q
       where q.status = 'pending'
         and q.organization_id in (select om.organization_id from iam.organization_member om
                                    where om.user_id = (select auth.uid()) and om.role = 'owner')
    ) x;
$fn$;

-- 🚨 THE PERSON'S OWN RECORD. Readable by them without asking anyone, for their whole history,
-- across every organization they belong to — including ones they have since left.
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
             a.grant_expires_at, a.organization_id, a.basis, a.is_emergency_door
        from iam.access_audit a
       where a.subject_user_id = (select auth.uid())
       order by a.occurred_at desc
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
      offset greatest(0, coalesce(p_offset, 0))
    ) x;
$fn$;

comment on function iam.my_access_log(integer, integer) is
  'THE SUBJECT''S OWN PAGE (DD-137a): every time anyone opened this person''s data, and every time someone was refused. No competitor ships this. It is theirs to read without asking anyone, and it is the fastest way an over-loose grant gets noticed — by the person it is about.';

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
             a.grant_expires_at, a.organization_id
        from iam.access_audit a
       where a.organization_id = p_organization_id
         and exists (select 1 from iam.organization_member om
                      where om.user_id = (select auth.uid())
                        and om.organization_id = p_organization_id
                        and om.role in ('owner','admin'))
       order by a.occurred_at desc
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) x;
$fn$;

-- ═════════════════════════════════════════════════════════════ 8. HR BECOMES A CALLER
-- The HR door keeps every byte of its own behaviour. It gains two lines: the platform audit row
-- and the subject notification it never had (§3.5: "NEW and not suppressible"). HR notified
-- compliance; it did not notify the person.
do $$
declare v_src text; v_new text; v_marker text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_break_glass';
  if v_src is null then
    raise exception 'iam_emergency_door_dd137a: public.hr_break_glass is gone — the door this migration lifts does not exist';
  end if;

  if position('iam._record_access_audit' in v_src) > 0 then
    raise notice 'iam_emergency_door_dd137a: hr_break_glass already calls the platform recorder';
    return;
  end if;

  -- The insertion point is the line that builds HR's own audit row for the GRANT path.
  v_marker := '  return jsonb_build_object(' || E'\n' || '    ''granted'', true, ''audit_id'', v_audit,';
  if position(v_marker in v_src) = 0 then
    raise exception 'iam_emergency_door_dd137a: hr_break_glass no longer has the grant-return shape this migration patches. Re-read the function and re-cut the patch rather than guessing.';
  end if;

  v_new := replace(v_src, v_marker,
'  -- DD-137a — HR IS A CALLER OF THE PLATFORM DOOR, NOT A SIBLING OF IT. hr.access_audit stays'
|| E'\n' ||
'  -- HR''s own domain ledger and keeps every row it has; the platform ledger gets the same act so'
|| E'\n' ||
'  -- that "who opened my data" is ONE list for a person, not one per module. And the SUBJECT is'
|| E'\n' ||
'  -- told — HR notified compliance and never told the person (VISIBILITY-BY-CLASS §3.5).'
|| E'\n' ||
'  declare v_plat_audit uuid; v_subject_user uuid; begin'
|| E'\n' ||
'    select e.login_user_id into v_subject_user from hr.employment em'
|| E'\n' ||
'      join hr.employee e on e.id = em.employee_id where em.id = v_subject;'
|| E'\n' ||
'    v_plat_audit := iam._record_access_audit('
|| E'\n' ||
'      p_organization_id => v_org, p_action => ''read'', p_target_token => p_token,'
|| E'\n' ||
'      p_data_class => case when d.tier = ''restricted'' then ''private'' else ''confidential'' end,'
|| E'\n' ||
'      p_purpose => p_purpose, p_basis => ''emergency_door'', p_granted => true,'
|| E'\n' ||
'      p_target_ids => ARRAY[p_id], p_row_count => 1, p_subject_user_id => v_subject_user,'
|| E'\n' ||
'      p_justification => p_justification, p_permission_id => v_perm,'
|| E'\n' ||
'      p_grant_expires_at => now() + make_interval(mins => v_ttl));'
|| E'\n' ||
'    perform iam._notify_door(v_org, ''platform.access.emergency_door_opened'', v_subject_user,'
|| E'\n' ||
'      jsonb_build_object(''token'', p_token, ''target_id'', p_id, ''opened_by'', v_uid,'
|| E'\n' ||
'                         ''purpose'', p_purpose, ''justification'', p_justification,'
|| E'\n' ||
'                         ''expires_at'', now() + make_interval(mins => v_ttl),'
|| E'\n' ||
'                         ''audit_id'', v_plat_audit),'
|| E'\n' ||
'      v_plat_audit, ''/me/access-log'', ''edoor:open:'' || v_plat_audit::text);'
|| E'\n' ||
'  end;'
|| E'\n' || v_marker);

  execute format(
    'create or replace function public.hr_break_glass(p_token text, p_id uuid, p_purpose text, p_justification text) returns jsonb language plpgsql security definer set search_path to %L, %L as %s',
    'hr', 'public', quote_literal(v_new));
end $$;

-- ═════════════════════════════════════════════════════════════ 9. THE DOOR IS THE ONLY WAY IN
-- §3.4's chokepoint, as a trigger rather than a promise. On a `private` or `confidential` token,
-- an iam.permissions row may be written by the row's OWNER (ordinary sharing — §3.6: the class is
-- a FLOOR, and an owner opening their own data above it is Rule 9's union, never an incident) or
-- by this door. By nobody else. HR's own tokens are already guarded by
-- hr._guard_audited_tier_grant and are left to it — one guard per token, never two.
create or replace function iam._guard_emergency_door_grant()
returns trigger
language plpgsql
security definer
set search_path to 'iam', 'platform', 'hr', 'public'
as $fn$
declare v_class text; t record; v_uid uuid := auth.uid();
begin
  if coalesce(current_setting('iam.emergency_door', true), '') = 'on' then
    return new;                                     -- this door wrote it
  end if;
  if exists (select 1 from hr._door_spec(new.resource_type)) then
    return new;                                     -- HR's own guard owns these
  end if;

  v_class := iam.emergency_door_class(new.resource_type);
  if v_class is null or v_class not in ('private', 'confidential') then
    return new;
  end if;

  select * into t from iam._door_target(new.resource_type, new.resource_id);
  if t.o_subject is null or v_uid is null or t.o_subject = v_uid then
    return new;                                     -- the owner sharing their own data
  end if;

  raise exception
    'emergency_door_only: % is %-class data. A grant on somebody else''s row is written by the audited emergency door and by nothing else.',
    new.resource_type, v_class
    using errcode = '42501',
          hint = 'Call iam.emergency_door_open(token, id, purpose, justification). It is time-boxed, read-only, recorded on grant AND on refusal, and the person whose data it is gets told. A share that did none of those things would be a quiet second door, which is exactly what this guard exists to prevent (VISIBILITY-BY-CLASS §3.4).';
end $fn$;

drop trigger if exists _iam_emergency_door_grant_guard_ins on iam.permissions;
create trigger _iam_emergency_door_grant_guard_ins
  before insert on iam.permissions
  for each row execute function iam._guard_emergency_door_grant();

drop trigger if exists _iam_emergency_door_grant_guard_upd on iam.permissions;
create trigger _iam_emergency_door_grant_guard_upd
  before update of resource_type, resource_id, granted_to_user_id, permission_level, expires_at
  on iam.permissions
  for each row execute function iam._guard_emergency_door_grant();

-- ═════════════════════════════════════════════════════════════ 10. the client doors
-- db-rules §6d-4: the declaration goes in BEFORE the GRANT, or the DB-wide guard revokes it from
-- inside the GRANT itself.
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
select v.s, v.f, v.a, 'iam_emergency_door_dd137a', v.r
  from (values
    ('iam','emergency_door_open','p_token text, p_id uuid, p_purpose text, p_justification text',
     'THE emergency door (DD-137a). Scoping is inside: the caller must be an owner or admin of the organization that owns the row, the purpose must be a registered slug, the justification must clear the knob floor, the grant is viewer-only and time-boxed, and every grant and refusal writes iam.access_audit and tells the subject. There is no unscoped lane.'),
    ('iam','emergency_door_approve','p_request_id uuid, p_note text',
     'The second person. Only an organization OWNER who is not the requester can approve a private-class request (DD-137a). Audited on approval and on every refused approval attempt.'),
    ('iam','emergency_door_deny','p_request_id uuid, p_note text',
     'The owner refusing an emergency request. A refusal is recorded and the subject is told it was asked for and refused (DD-137a).'),
    ('iam','emergency_door_pending','',
     'The approver''s queue: pending requests in organizations where the caller is an owner. Scoped inside the query.'),
    ('iam','emergency_door_purposes','',
     'The controlled purpose list for the request form. System dimension, read-only, no personal data.'),
    ('iam','my_access_log','p_limit integer, p_offset integer',
     'THE SUBJECT''S OWN PAGE (DD-137a): every time anyone opened this person''s data. Keyed on auth.uid() inside; there is no argument that can point it at anybody else.'),
    ('iam','org_access_log','p_organization_id uuid, p_limit integer',
     'The organization''s own emergency-access record, for its owners and admins. Membership is checked inside the query.')
  ) as v(s, f, a, r)
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = v.s and d.function_name = v.f);

grant execute on function iam.emergency_door_open(text, uuid, text, text) to authenticated;
grant execute on function iam.emergency_door_approve(uuid, text) to authenticated;
grant execute on function iam.emergency_door_deny(uuid, text) to authenticated;
grant execute on function iam.emergency_door_pending() to authenticated;
grant execute on function iam.emergency_door_purposes() to authenticated;
grant execute on function iam.my_access_log(integer, integer) to authenticated;
grant execute on function iam.org_access_log(uuid, integer) to authenticated;

revoke execute on function iam._record_access_audit(uuid, text, text, text, text, text, boolean, uuid[], integer, uuid, text, text, uuid, uuid, timestamptz, boolean, uuid) from public, anon, authenticated;
revoke execute on function iam._notify_door(uuid, text, uuid, jsonb, uuid, text, text) from public, anon, authenticated;
revoke execute on function iam._door_target(text, uuid) from public, anon, authenticated;
revoke execute on function iam._door_ttl_minutes(uuid) from public, anon, authenticated;
revoke execute on function iam._door_min_chars(uuid) from public, anon, authenticated;
revoke execute on function iam._guard_emergency_door_grant() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════ 11. the assertions
do $$
declare v_n integer; v_oid oid;
begin
  if to_regclass('iam.access_audit') is null then
    raise exception 'dd137a: iam.access_audit was not created';
  end if;
  if to_regclass('iam.emergency_door_request') is null then
    raise exception 'dd137a: iam.emergency_door_request was not created';
  end if;

  select count(*) into v_n from platform.entity_types
   where token in ('iam_access_audit','iam_emergency_door_request') and rls_variant = 'restricted';
  if v_n <> 2 then
    raise exception 'dd137a: % of the 2 door tables carry the restricted variant', v_n;
  end if;

  select count(*) into v_n from platform.categories
   where dimension = 'access_purpose' and deleted_at is null;
  if v_n < 10 then
    raise exception 'dd137a: the access_purpose dimension has % slugs, expected at least 10', v_n;
  end if;

  select count(*) into v_n from platform.feature_knob
   where feature = 'platform.access'
     and key in ('emergency_door_ttl_minutes','emergency_door_justification_min_chars');
  if v_n <> 2 then
    raise exception 'dd137a: % of the 2 platform door knobs exist', v_n;
  end if;

  -- the class seam answers for the tables the design names
  if iam.emergency_door_class('conversation') <> 'private' then
    raise exception 'dd137a: chat.conversation did not classify as private (got %)',
      iam.emergency_door_class('conversation');
  end if;
  -- HR's own two-tier ladder maps straight through: hr._door_spec tier `confidential` ->
  -- confidential, `restricted` -> private. hr_employee_private is HR's `confidential`.
  if iam.emergency_door_class('hr_employee_private') <> 'confidential' then
    raise exception 'dd137a: hr_employee_private did not classify as confidential (got %)',
      iam.emergency_door_class('hr_employee_private');
  end if;
  if iam.emergency_door_class('__no_such_token__') is not null then
    raise exception 'dd137a: an unregistered token got a class instead of a NULL';
  end if;

  -- the doors are callable by a signed-in person and the private helpers are not
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'emergency_door_open';
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'dd137a: the door is not callable by authenticated';
  end if;
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = '_record_access_audit';
  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'dd137a: the audit writer is callable by a client — the audit could be forged';
  end if;

  -- HR is a caller now
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_break_glass'
     and p.prosrc like '%iam._record_access_audit%';
  if v_n <> 1 then
    raise exception 'dd137a: public.hr_break_glass does not call the platform recorder';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_break_glass'
     and p.prosrc like '%hr._record_access_audit%';
  if v_n <> 1 then
    raise exception 'dd137a: HR lost its OWN audit row — the cutover was supposed to be additive';
  end if;

  -- the guard is armed
  if not exists (select 1 from pg_trigger where tgname = '_iam_emergency_door_grant_guard_ins'
                   and tgrelid = 'iam.permissions'::regclass) then
    raise exception 'dd137a: the emergency-door grant guard is not on iam.permissions';
  end if;

  raise notice 'dd137a: all assertions passed';
end $$;
