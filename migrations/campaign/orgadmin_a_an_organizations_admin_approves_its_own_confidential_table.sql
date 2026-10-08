-- chair-step: it ADDS one append-only ledger table platform.class_approval_by_org_admin (no client write, no client select), THREE new functions of schema `custom` that GRANT EXECUTE to `authenticated` (custom.set_table_confidential, custom.set_table_organization, custom.table_level_facts) plus one internal helper (custom._table_approver, EXECUTE to nobody), and REPLACES the body of the trigger function custom._table_shape_guard (same signature) so a table may enter Confidential, change its readers, or leave "the maker is only a reader" on EITHER Arman's recorded approval OR an approval recorded in the same transaction by the new door. No table, column, policy, kernel function or data row is touched; no Table is made Confidential by this file.
-- lane: CONFIDENTIAL-BY-ORG-ADMIN (Unified Data program; Arman ruled 2026-10-08, common-docs/policies/access-ladder.md "Who approves Confidential or Private")
-- based-on: custom._table_shape_guard() bdfe878acc619ef1cd9f0c48f1ca099a98860fa0c39bbf6a6805702e5175054e
--
-- AN ORGANIZATION'S ADMINS APPROVE CONFIDENTIAL FOR THAT ORGANIZATION'S OWN CUSTOM TABLES, INSIDE THAT
-- ORGANIZATION ONLY. Arman keeps approval for the platform's tables (standard, platform custom and typed
-- custom). The new door succeeds only when the caller is an owner or admin of the table's organization
-- (public.is_org_admin_for) AND the table is an ordinary custom table: its organization is not a system
-- organization, and its document is not kept by the app, not Foundation, not typed (`kind`), not an `app_table`.
-- Everything else keeps the Arman door. The approval is recorded under the approver's own id, role, reason and
-- date - never under Arman's name. Opening a door: no RLS, access-kernel or other guard changes.
--
-- Guard: scripts/campaign-tests/orgadmin_confidential_red_green.ts
-- Inverse: migrations/inverse/orgadmin_a_an_organizations_admin_approves_its_own_confidential_table_down.sql

-- ── 1. the ledger: who approved, in what seat, why, when ─────────────────────────────────────────
create table platform.class_approval_by_org_admin (
  id                bigint generated always as identity primary key,
  token             text not null check (btrim(token) <> ''),
  organization_id   uuid not null,
  level             text not null check (level in ('confidential', 'organization')),
  readers           jsonb,
  reason            text not null check (length(btrim(reason)) >= 3),
  approver_user_id  uuid not null,
  approver_role     text not null check (approver_role in ('owner', 'admin')),
  approved_on       date not null default current_date,
  application_name  text,
  txid              xid8 not null default pg_current_xact_id(),
  recorded_at       timestamptz not null default now()
);
comment on table platform.class_approval_by_org_admin is
  'Every custom table an organization''s own owner or admin moved into Confidential (or released back to Organization) with custom.set_table_confidential / custom.set_table_organization: who approved, in which seat, why, and when. Sibling of platform.class_approval_by_arman, which stays Arman''s alone. Append-only. Law: common-docs/policies/access-ladder.md (Who approves Confidential or Private).';
create index class_approval_by_org_admin_token_txid on platform.class_approval_by_org_admin (token, txid);
create index class_approval_by_org_admin_org on platform.class_approval_by_org_admin (organization_id, recorded_at desc);
alter table platform.class_approval_by_org_admin enable row level security;
revoke all on platform.class_approval_by_org_admin from public, anon, authenticated, service_role;
grant select on platform.class_approval_by_org_admin to service_role;

insert into platform.entity_types (token, schema_name, table_name, label, audit_class, audit_class_reason, table_ref)
values ('platform_class_approval_by_org_admin', 'platform', 'class_approval_by_org_admin', 'Class approval by an organization admin', 'machinery',
        'machinery: append-only record of the approvals an organization''s own owners and admins give for that organization''s custom tables, written only by custom.set_table_confidential and custom.set_table_organization',
        'platform.class_approval_by_org_admin'::regclass);

create or replace function platform._class_approval_by_org_admin_is_append_only()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'platform.class_approval_by_org_admin is append-only: an approval an administrator gave is history and is never edited or deleted.'
    using errcode = '42501';
end
$function$;
create trigger class_approval_by_org_admin_append_only
  before update or delete on platform.class_approval_by_org_admin
  for each row execute function platform._class_approval_by_org_admin_is_append_only();

-- ── 2. who approves a table: its organization's admins, or Arman ─────────────────────────────────
create or replace function custom._table_approver(p_organization_id uuid, p_data jsonb)
 returns text
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- 'org_admin' for an ordinary custom table of an ordinary organization; 'platform' for everything else.
  select case
    when p_organization_id is null or p_data is null then 'platform'
    when exists (select 1 from iam.system_orgs so where so.organization_id = p_organization_id) then 'platform'
    when p_data ->> 'kept_by_the_app' = 'true' then 'platform'
    when p_data ->> 'foundation' = 'true' then 'platform'
    when p_data ? 'kind' or p_data ? 'app_table' or p_data ? 'kept_for' then 'platform'
    else 'org_admin' end
$function$;
revoke all on function custom._table_approver(uuid, jsonb) from public, anon, authenticated, service_role;

-- the shared check both doors run: returns the table's organization and document, or refuses
create or replace function custom._org_admin_table_gate(p_table_id uuid, p_door text, out o_org uuid, out o_data jsonb, out o_role text)
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '% needs a signed-in person.', p_door using errcode = '42501';
  end if;
  if p_table_id is null then
    raise exception 'Name the table (p_table_id).' using errcode = '22004';
  end if;
  select t.organization_id, t.data into o_org, o_data
    from custom.record t
   where t.id = p_table_id and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null;
  if not found then
    raise exception 'There is no live table %.', p_table_id using errcode = '02000';
  end if;
  select om.role into o_role
    from iam.organization_member om
   where om.organization_id = o_org and om.user_id = v_uid and om.role in ('owner', 'admin')
   limit 1;
  if o_role is null or not public.is_org_admin_for(v_uid, o_org) then
    raise exception 'Only an owner or administrator of this table''s organization can set how open it is.'
      using errcode = '42501',
            hint = 'Ask an administrator of the organization to make it Confidential. Moving a table to Confidential is approved by the organization''s administrators for its own tables.';
  end if;
  if custom._table_approver(o_org, o_data) is distinct from 'org_admin' then
    raise exception 'The platform sets how open this table is.'
      using errcode = '42501',
            hint = 'Standard, platform and typed tables take Confidential only with Arman''s approval (custom.set_table_confidential_arman_explicitly_approved).';
  end if;
end
$function$;
revoke all on function custom._org_admin_table_gate(uuid, text) from public, anon, authenticated, service_role;

-- ── 3. the doors ────────────────────────────────────────────────────────────────────────────────
create or replace function custom.set_table_confidential(p_table_id uuid, p_readers jsonb, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
-- AN ORGANIZATION'S ADMIN MAKES ITS OWN CUSTOM TABLE CONFIDENTIAL, OR CHANGES WHOM IT NAMES. Records the
-- approval (who, which seat, why, when) in platform.class_approval_by_org_admin; custom._table_shape_guard
-- accepts that row in this transaction and judges the readers' shape. p_readers: a list of
-- {field, level} where field is a person field of the table.
declare
  v_org    uuid;
  v_data   jsonb;
  v_role   text;
  v_id     bigint;
  v_why    text := btrim(coalesce(p_reason, ''));
  v_before text;
  v_out    jsonb;
begin
  select g.o_org, g.o_data, g.o_role into v_org, v_data, v_role
    from custom._org_admin_table_gate(p_table_id, 'custom.set_table_confidential') g;
  if length(v_why) < 3 then
    raise exception 'Say why this table is Confidential (a short reason is required).' using errcode = '22023';
  end if;
  if length(v_why) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
  end if;
  if p_readers is null or jsonb_typeof(p_readers) <> 'array' then
    raise exception 'Name who reads this table as a list of {field, level} (an empty list names nobody but the people it is shared with).' using errcode = '22023';
  end if;
  v_before := v_data ->> 'level';
  insert into platform.class_approval_by_org_admin
    (token, organization_id, level, readers, reason, approver_user_id, approver_role, application_name)
  values ('custom.table:' || p_table_id::text, v_org, 'confidential', p_readers, v_why, auth.uid(), v_role,
          nullif(current_setting('application_name', true), ''))
  returning id into v_id;
  update custom.record t
     set data = t.data || jsonb_build_object('level', 'confidential', 'readers', p_readers)
   where t.organization_id = v_org and t.id = p_table_id;
  select t.data into v_data from custom.record t where t.organization_id = v_org and t.id = p_table_id;
  v_out := jsonb_build_object('token', 'custom.table:' || p_table_id::text, 'table_id', p_table_id,
                              'level', 'confidential', 'approval_id', v_id, 'approver_role', v_role,
                              'from', coalesce(v_before, 'organization'),
                              'readers', coalesce(v_data -> 'readers', '[]'::jsonb));
  return v_out;
end
$function$;

create or replace function custom.set_table_organization(p_table_id uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
-- THE WAY BACK: an organization's admin moves its own custom table back to Organization. Also clears
-- "the maker is only a reader". Recorded in the same ledger.
declare
  v_org    uuid;
  v_data   jsonb;
  v_role   text;
  v_id     bigint;
  v_why    text := btrim(coalesce(p_reason, ''));
begin
  select g.o_org, g.o_data, g.o_role into v_org, v_data, v_role
    from custom._org_admin_table_gate(p_table_id, 'custom.set_table_organization') g;
  if length(v_why) < 3 then
    raise exception 'Say why this table is Organization again (a short reason is required).' using errcode = '22023';
  end if;
  insert into platform.class_approval_by_org_admin
    (token, organization_id, level, readers, reason, approver_user_id, approver_role, application_name)
  values ('custom.table:' || p_table_id::text, v_org, 'organization', null, left(v_why, 500), auth.uid(), v_role,
          nullif(current_setting('application_name', true), ''))
  returning id into v_id;
  update custom.record t
     set data = t.data - 'level' - 'readers' - 'maker_is_reader'
   where t.organization_id = v_org and t.id = p_table_id;
  return jsonb_build_object('token', 'custom.table:' || p_table_id::text, 'table_id', p_table_id,
                            'level', 'organization', 'approval_id', v_id, 'approver_role', v_role,
                            'from', coalesce(v_data ->> 'level', 'organization'));
end
$function$;

create or replace function custom.table_level_facts(p_table_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
-- What a table's settings screen shows: its level, its readers, who may change the level, whether THIS
-- caller may, and the last approval an organization's admin gave. Anybody who may know the table may ask.
declare
  v_org   uuid;
  v_data  jsonb;
  v_who   text;
  v_admin boolean := false;
  v_last  jsonb;
begin
  select t.organization_id, t.data into v_org, v_data
    from custom.record t
   where t.id = p_table_id and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null;
  if v_org is null then
    raise exception 'You do not have access to this table, so % has nothing to show you.', 'custom.table_level_facts'
      using errcode = '42501';
  end if;
  begin
    perform custom.assert_client_may_reach(v_org, 'custom.table_level_facts');
    perform custom.assert_may_know_table(v_org, p_table_id, 'custom.table_level_facts');
  exception when insufficient_privilege then
    raise exception 'You do not have access to this table, so % has nothing to show you.', 'custom.table_level_facts'
      using errcode = '42501';
  end;
  v_who := custom._table_approver(v_org, v_data);
  if auth.uid() is not null then
    v_admin := public.is_org_admin_for(auth.uid(), v_org);
  end if;
  select jsonb_build_object('level', a.level, 'reason', a.reason, 'approver_role', a.approver_role,
                            'approver_user_id', a.approver_user_id, 'approved_on', a.approved_on)
    into v_last
    from platform.class_approval_by_org_admin a
   where a.token = 'custom.table:' || p_table_id::text and a.organization_id = v_org
   order by a.id desc limit 1;
  return jsonb_build_object(
    'table_id', p_table_id,
    'organization_id', v_org,
    'level', coalesce(v_data ->> 'level', 'organization'),
    'readers', coalesce(v_data -> 'readers', '[]'::jsonb),
    'maker_is_reader', coalesce(v_data -> 'maker_is_reader' = 'true'::jsonb, false),
    'set_by', v_who,
    'can_set', (v_who = 'org_admin' and v_admin),
    'last_approval', v_last);
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select 'custom', '_org_admin_table_gate', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'p_table_id must be a live store Table whose organization the caller owns or administers (public.is_org_admin_for) and that custom._table_approver says an organization admin approves; p_door only names the caller in the refusal. NULL p_table_id is refused.',
       'migrations/campaign/orgadmin_a_an_organizations_admin_approves_its_own_confidential_table.sql (lane CONFIDENTIAL-BY-ORG-ADMIN)',
       'server_only: called only inside custom.set_table_confidential and custom.set_table_organization, both of which run it before any write; a client reaches it through those two doors and never directly.', false, false
  from pg_proc p where p.proname = '_org_admin_table_gate' and p.pronamespace = 'custom'::regnamespace;

-- Declare, then grant (platform.enforce_definer_client_grants takes back a grant with no door row).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false, 'migrations/campaign/orgadmin_a_an_organizations_admin_approves_its_own_confidential_table.sql (lane CONFIDENTIAL-BY-ORG-ADMIN)',
       v.why
  from (values
    ('set_table_confidential',
     'Moves ONE custom table into Confidential, or changes whom it names. Succeeds only for an owner or administrator of the table''s own organization and only for an ordinary custom table; a member, a person from another organization, and a platform, standard or typed table are all refused. Records the approver, seat, reason and date.'),
    ('set_table_organization',
     'The way back: moves ONE custom table back to Organization. Same caller rule as set_table_confidential.'),
    ('table_level_facts',
     'Reads one table''s level, readers, who may change the level and whether the caller may. Refused unless the caller may know the table.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.set_table_confidential(uuid, jsonb, text) to authenticated;
grant execute on function custom.set_table_organization(uuid, text) to authenticated;
grant execute on function custom.table_level_facts(uuid) to authenticated;

-- ── 4. the guard accepts either approval ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom._table_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d            jsonb := new.data;
  -- ── LIMITS-FIX 2026-09-21: EVERY PROBLEM WITH THIS TABLE, IN ONE ANSWER. ───────────────
  -- This guard used to stop at the FIRST thing wrong, so declaring one table meant a
  -- round trip per missing key against the live database. Real-data crew D hit four in a
  -- row (retention_days, default_sort, agent_writable, and a name on each field) declaring
  -- a podcast episode pipeline on 2026-09-21; reproducing it for this fix cost five more
  -- (type, slug, label, display, weight) before the row was even written. A person filling
  -- in a form is told everything that is wrong with it at once, and so is a caller here.
  --
  -- ONE problem still raises the EXACT sentence and hint it always did, byte for byte, so
  -- nothing that asserts on those messages changes. Only TWO OR MORE are combined.
  v_bad        text[] := '{}';
  v_bad_hints  text[] := '{}';
  v_i          integer;
  v_all        text;
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
  v_reader     jsonb;   -- CHAIR-CONFIDENTIAL-STORE
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- Only Tables, and only Tables an organization DECLARED. REC-27: the kernel's nine are
  -- "defined in code, not data" — W1-STORE wrote eight of them before this guard existed
  -- and W1-FIELD adds the ninth, so a `kernel` row is exempt and the view supplies its
  -- defaults. THE BOUND OF THAT EXEMPTION, named rather than left implied: the only writer
  -- that can set data_class at all is the schema owner, because schema `custom` is revoked
  -- from PUBLIC, anon, authenticated and service_role and the one client door
  -- (custom.record_write) cannot set data_class. A tenant cannot reach this branch.
  if new.table_id is distinct from custom.table_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  -- LANE 10 FD: A COPY IS NOT DAY-ONE DATA. A table made as a copy (custom.table_duplicate's
  -- in-progress word, kept_for "copying") never carries the Foundation mark of what it copied.
  if tg_op = 'INSERT' and d ->> 'kept_for' = 'copying' and d ? 'foundation' then
    new.data := new.data - 'foundation';
    d := new.data;
  end if;

  v_type := d ->> 'type';
  if v_type is null or v_type not in ('entity', 'detail') then
    v_bad := array_append(v_bad, format('a table is an entity or a detail, and this one says %s', custom.said(v_type, 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: type ∈ {entity, detail}.')::text);
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    v_bad := array_append(v_bad, format('a detail table has to say what it is a detail of'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token is required when type is detail.')::text);
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    v_bad := array_append(v_bad, format('only a detail table has a parent table'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token belongs to type detail and to nothing else.')::text);
  end if;

  if coalesce(d ->> 'name', '') = '' then
    v_bad := array_append(v_bad, format('a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1.')::text);
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    v_bad := array_append(v_bad, format('a table needs a slug made of lower-case letters, digits and underscores'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: slug.')::text);
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    v_bad := array_append(v_bad, format('a table needs both of its labels - one thing and many things'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: label_singular and label_plural.')::text);
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    v_bad := array_append(v_bad, format('a table shows its records as a list or as a page, and this one says %s',
                    custom.said(d ->> 'display', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: display. T4 turns a list into a page and migrates nothing.')::text);
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether its records are ordered'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: ordered.')::text);
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    v_bad := array_append(v_bad, format('a table is heavy or light, and this one says %s', custom.said(d ->> 'weight', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: heavy|light.')::text);
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    v_bad := array_append(v_bad, format('a table has to say how long it keeps its history'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: retention.')::text);
  end if;
  -- W3-HIST (HIS-3): the floor is READ, never a literal (rule 15). Thirty days is the
  -- PLATFORM floor, and an organization that raised its own is entitled to have that
  -- honoured here too — the knob is `extensibility / user_tables.history_retention_floor_days`,
  -- raise-only, min 30. With a literal here an organization at sixty days could still declare
  -- a thirty-day table and lose thirty days of history it had already decided to keep.
  -- This body's own switch is `custom/system_enabled`, read through custom.assert_store_door
  -- above; the history writer's is `custom/row_versions_guard`.
  declare
    v_floor integer;
  begin
    -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false this
    -- comparison is byte-for-byte the behaviour it has always had — the literal thirty — so
    -- the OFF path answers identically and §6.6's requirement for touching a live body is
    -- something a verifier can execute rather than something this lane asserts. Switched ON,
    -- the organization's own floor is honoured here too.
    if custom.store_is_open(new.organization_id) then
      v_floor := history.retention_floor_days(new.organization_id);
    else
      v_floor := 30;
    end if;
    -- Only ask the floor question when a NUMBER was actually given: collecting the
    -- type problem above instead of raising means this line is now reached with a
    -- non-number, and `::numeric` would abort with a cast error nobody asked for.
    if jsonb_typeof(d -> 'retention_days') = 'number'
       and (d ->> 'retention_days')::numeric < v_floor then
      v_bad := array_append(v_bad, format('History here is kept for at least %s days, so this table cannot keep only %s.',
                      v_floor, d ->> 'retention_days'));
      v_bad_hints := array_append(v_bad_hints, (format('REC-1 / T14 / HIS-3: %s days is the retention floor — thirty is the platform minimum and an organization may only ever raise it. Give this table %s or more.', v_floor, v_floor))::text);
    end if;
  end;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    v_bad := array_append(v_bad, format('a table has to say how its records are sorted by default'));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: default_sort is an array of {field, direction}.')::text);
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    v_bad := array_append(v_bad, format('a table orders its rows by hand or by its sort, and this one says %s',
                    custom.said(d ->> 'row_order', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: manual row order.')::text);
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether an agent may write to it'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: agent_writable, default true, is declared rather than guessed.')::text);
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    v_bad := array_append(v_bad, format('a table has to declare its fields'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  -- Same reason: `jsonb_array_elements` on a non-array aborts, so the questions that
  -- read the list are asked only when there is a list to read. The missing-fields problem
  -- is already collected above, and the caller is told about it in the same answer.
  if jsonb_typeof(v_fields) = 'array' then
    select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  end if;
  if v_names is not null and array_position(v_names, null) is not null then
    v_bad := array_append(v_bad, format('every field of a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    v_bad := array_append(v_bad, format('a table needs a title field, or its records cannot be shown as chips'));
      v_bad_hints := array_append(v_bad_hints, ('REC-2.')::text);
  end if;
  if v_title is not null and v_names is not null and not (v_title = any (v_names)) then
    v_bad := array_append(v_bad, format('the title field %s is not one of this table''s fields', v_title));
      v_bad_hints := array_append(v_bad_hints, ('REC-2: the title field names one of the table''s own fields.')::text);
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    v_bad := array_append(v_bad, format('a table has to live somewhere - give it a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).')::text);
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    v_bad := array_append(v_bad, format('a detail record cannot be a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.')::text);
  end if;

  -- ── SC-1 PLACEMENT (2026-09-23): WHO KEEPS THIS TABLE, AND WHETHER THE PICKER OFFERS IT. ──
  -- `kept_by_the_app` is the store's one flag for a Table the app or one of its features keeps
  -- (custom._options_table_for has always stamped it). Beside it, optionally, `kept_for` names
  -- WHICH feature in one lower-case word (context, education, dictionary, …) — only on a Table
  -- that is kept — and `offered_as_context` says whether the context picker offers the Table.
  -- Each is judged only when present; absent is the default (custom.table_placement).
  -- Judged only while the organization's store is switched on (custom/system_enabled), exactly
  -- like the rest of the store's own shape rules; switched off, the document is stored as written.
  -- CHAIR-ALWAYS-ON 2026-10-03: the store switch is retired; custom.store_is_open answers true for every organization.
  if custom.store_is_open(new.organization_id) then
    if d ? 'kept_by_the_app' and jsonb_typeof(d -> 'kept_by_the_app') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being kept by the app'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_by_the_app is true or false.')::text);
    end if;
    if d ? 'kept_for' and (jsonb_typeof(d -> 'kept_for') is distinct from 'string'
                           or coalesce(d ->> 'kept_for', '') !~ '^[a-z][a-z_]*$') then
      v_bad := array_append(v_bad, format('the feature that keeps a table is named in one lower-case word, and this one says %s',
                      custom.said(d ->> 'kept_for', 'nothing')));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_for is a word such as context, education or dictionary.')::text);
    end if;
    if d ? 'kept_for' and d ->> 'kept_by_the_app' is distinct from 'true' then
      v_bad := array_append(v_bad, format('only a table the app keeps says which feature keeps it'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: say kept_by_the_app = true beside kept_for, or take kept_for off.')::text);
    end if;
    if d ? 'offered_as_context' and jsonb_typeof(d -> 'offered_as_context') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being offered in the context picker'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: offered_as_context is true or false.')::text);
    end if;
    -- LANE 10 FD (2026-10-02): `foundation` marks a Table as part of the business's day-one data
    -- (Patients, Therapists, Services). A mark, not storage: true, false, or absent (= false).
    -- Never a kept_for word: a foundation table stays the organization's own (or `context`).
    if d ? 'foundation' and jsonb_typeof(d -> 'foundation') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being foundation data'));
        v_bad_hints := array_append(v_bad_hints, ('Foundation: foundation is true or false.')::text);
    end if;
  end if;

  -- ── CHAIR-CONFIDENTIAL-STORE (2026-10-02): THE TABLE'S LEVEL AND THE PEOPLE ITS RULES NAME. ──
  -- `level` is absent (Organization, the default) or "confidential". `readers` is the record's own
  -- rules: a list of {field, level} where `field` is one of this Table's fields whose value names a
  -- person (a Person record, a person's id) or a team, and `level` is viewer (the default),
  -- commenter or editor. Only a Confidential Table names readers. Who may SET either is decided
  -- after the shape below: only the Arman-approved door.
  if d ? 'level' and (jsonb_typeof(d -> 'level') is distinct from 'string' or d ->> 'level' <> 'confidential') then
    v_bad := array_append(v_bad, format('a table is Confidential or it leaves its level out, and this one says %s', custom.said(d ->> 'level', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: level is "confidential", or absent for Organization.')::text);
  end if;
  if d ? 'readers' and d ->> 'level' is distinct from 'confidential' then
    v_bad := array_append(v_bad, format('only a Confidential table names the people who may read its records'));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: readers belong to a Confidential table; take them off, or make the table Confidential.')::text);
  elsif d ? 'readers' and jsonb_typeof(d -> 'readers') is distinct from 'array' then
    v_bad := array_append(v_bad, format('a table names its readers as a list'));
      v_bad_hints := array_append(v_bad_hints, ('readers is a list of {field, level}.')::text);
  elsif d ? 'readers' then
    for v_reader in select x from jsonb_array_elements(d -> 'readers') x loop
      if jsonb_typeof(v_reader) is distinct from 'object'
         or coalesce(v_reader ->> 'field', '') = ''
         or v_names is null or not ((v_reader ->> 'field') = any (v_names)) then
        v_bad := array_append(v_bad, format('a reader is one of this table''s own fields, and %s is not', custom.said(coalesce(v_reader ->> 'field', v_reader #>> '{}'), 'nothing')));
          v_bad_hints := array_append(v_bad_hints, ('readers: {field: <a field of this table naming a person or a team>, level: viewer|commenter|editor}.')::text);
      elsif v_reader ? 'level' and coalesce(v_reader ->> 'level', '') not in ('viewer', 'commenter', 'editor') then
        v_bad := array_append(v_bad, format('a reader reads, comments or edits, and %s says %s', v_reader ->> 'field', custom.said(v_reader ->> 'level', 'nothing')));
          v_bad_hints := array_append(v_bad_hints, ('readers[].level is viewer, commenter or editor; owner and admin are not given by a field.')::text);
      -- CHAIR-ACCESS c: `when` is a condition in the saved-view where grammar - a flat {column: value}
      -- map over this table's own columns, or a Rule expression ({"op": ...}). Anything else, or a flat
      -- key that is not a column of this table, is refused here so a reveal rule never silently fails.
      elsif v_reader ? 'when' and jsonb_typeof(v_reader -> 'when') is distinct from 'object' then
        v_bad := array_append(v_bad, format('a reader''s when is a condition on the row, and %s''s is a %s', v_reader ->> 'field', jsonb_typeof(v_reader -> 'when')));
          v_bad_hints := array_append(v_bad_hints, ('readers[].when is {column: value, ...} over this table''s columns, or a Rule expression {"op": ..., "args": [...]} - the same grammar a saved view''s where uses.')::text);
      elsif v_reader ? 'when' and not custom.filter_is_rule(v_reader -> 'when')
            and exists (select 1 from jsonb_object_keys(v_reader -> 'when') k where v_names is null or not (k = any (v_names))) then
        v_bad := array_append(v_bad, format('a reader''s when names a column this table does not have: %s',
                   (select string_agg(k, ', ') from jsonb_object_keys(v_reader -> 'when') k where v_names is null or not (k = any (v_names)))));
          v_bad_hints := array_append(v_bad_hints, ('readers[].when: every key is one of this table''s column keys.')::text);
      end if;
    end loop;
  end if;

  -- CHAIR-DOORS-3A (2026-10-03): `maker_is_reader` says the Table belongs to the organization and the
  -- person who made it reads only what any reader reads (custom.confidential_answer). It is a state of
  -- a Confidential Table and nothing else: true, or left out.
  if d ? 'maker_is_reader' and (d -> 'maker_is_reader' is distinct from 'true'::jsonb
                                or d ->> 'level' is distinct from 'confidential') then
    v_bad := array_append(v_bad, format('only a Confidential table keeps its maker as a reader, and it says so with true or leaves it out'));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: maker_is_reader is true on a Confidential table, or absent.')::text);
  end if;

  -- ── THE ONE ANSWER. ───────────────────────────────────────────────────────────────────
  -- Exactly one problem raises the sentence and the hint this guard has always raised, so
  -- every suite and every screen that reads those words is unchanged. Two or more are
  -- numbered into a single refusal, each with its own meaning, so a caller fixes the whole
  -- table in one more attempt instead of one attempt per key.
  if array_length(v_bad, 1) = 1 then
    raise exception '%', v_bad[1] using errcode = '23514', hint = v_bad_hints[1];
  elsif array_length(v_bad, 1) > 1 then
    v_all := '';
    for v_i in 1 .. array_length(v_bad, 1) loop
      v_all := v_all || format('%s. %s (%s)', v_i, v_bad[v_i], v_bad_hints[v_i]);
      if v_i < array_length(v_bad, 1) then v_all := v_all || '  '; end if;
    end loop;
    raise exception 'This table cannot be declared yet - % things need fixing: %',
                    array_length(v_bad, 1), v_all
      using errcode = '23514',
            hint = 'Every problem with the table is listed above, so one more attempt can fix all of them. Nothing was created.';
  end if;

  -- ── CHAIR-CONFIDENTIAL-STORE: ONLY ARMAN MAKES A TABLE CONFIDENTIAL, AND ONLY HE CHANGES WHOM ──
  -- ── IT NAMES. The same rule as a standard table (platform.strict_class_refusal): the change is ──
  -- ── refused unless an approval in his own words was recorded for this Table in THIS transaction ──
  -- ── (platform.class_approval_by_arman, token custom.table:<id>). Leaving Confidential for ──
  -- ── Organization needs no approval. ──
  if d ->> 'level' = 'confidential'
     and (tg_op = 'INSERT'
          or old.data ->> 'level' is distinct from 'confidential'
          or (old.data -> 'readers') is distinct from (d -> 'readers'))
     and not exists (select 1 from platform.class_approval_by_arman a
                      where a.token = 'custom.table:' || new.id::text
                        and a.txid = pg_current_xact_id()
                        and a.level = 'confidential'::platform.data_class)
     -- CONFIDENTIAL-BY-ORG-ADMIN (Arman, 2026-10-08): the second approval an organization's own administrator
     -- gives for that organization's own custom table, recorded by custom.set_table_confidential in this transaction.
     and not exists (select 1 from platform.class_approval_by_org_admin b
                      where b.token = 'custom.table:' || new.id::text
                        and b.txid = pg_current_xact_id()
                        and b.organization_id = new.organization_id
                        and b.level = 'confidential') then
    raise exception 'Refused: % would become Confidential%. Every table is Organization by default, and Confidential locks people out of their own organization''s work, so only Arman approves it. The law: common-docs/policies/access-ladder.md. If Arman approved this table in his own words, record them and make the change with custom.set_table_confidential_arman_explicitly_approved(p_table_id => %L, p_readers => ''[{"field": "<a person field>", "level": "viewer"}]'', p_arman_words => ''<his exact words>'', p_approved_on => ''<the date he said them>''). For an organization''s own custom table an administrator of that organization approves instead: custom.set_table_confidential(p_table_id => %L, p_readers => ''[{"field": "<a person field>", "level": "viewer"}]'', p_reason => ''<why>''). Moving a table back to Organization never needs approval.',
                    coalesce(nullif(d ->> 'name', ''), new.id::text),
                    case when tg_op = 'UPDATE' and old.data ->> 'level' = 'confidential' then ' with different readers' else '' end,
                    new.id, new.id
      using errcode = '42501';
  end if;

  -- ── CHAIR-DOORS-3A: ONLY ARMAN TURNS "THE MAKER IS ONLY A READER" ON OR OFF, AND ONLY HE MOVES SUCH ──
  -- ── A TABLE BACK TO ORGANIZATION. The maker still holds the Table's own row; without this she ──
  -- ── could take the state off, or drop the level, and read every row again. The same approval, ──
  -- ── recorded in this transaction by the same door. ──
  if ((tg_op = 'INSERT' and d ? 'maker_is_reader')
      or (tg_op = 'UPDATE'
          and ((old.data -> 'maker_is_reader') is distinct from (d -> 'maker_is_reader')
               or (old.data -> 'maker_is_reader' = 'true'::jsonb
                   and d ->> 'level' is distinct from 'confidential'))))
     and not exists (select 1 from platform.class_approval_by_arman a
                      where a.token = 'custom.table:' || new.id::text
                        and a.txid = pg_current_xact_id()
                        and a.level = 'confidential'::platform.data_class)
     and not exists (select 1 from platform.class_approval_by_org_admin b
                      where b.token = 'custom.table:' || new.id::text
                        and b.txid = pg_current_xact_id()
                        and b.organization_id = new.organization_id) then
    raise exception 'Refused: % keeps the person who made it as only a reader, and only Arman turns that on or off or moves such a table back to Organization. The law: common-docs/policies/access-ladder.md. If Arman approved it in his own words, record them and make the change with custom.set_table_confidential_arman_explicitly_approved(p_table_id => %L, p_readers => null, p_arman_words => ''<his exact words>'', p_approved_on => ''<the date he said them>'', p_maker_is_reader => true or false).',
                    coalesce(nullif(d ->> 'name', ''), new.id::text), new.id
      using errcode = '42501';
  end if;

  -- ── LANE 10 FD (2026-10-02): ONLY THE TABLE'S OWNER OR AN ADMIN CHANGES ITS FOUNDATION MARK. ──
  -- The mark is the business's own say about its day-one data, so it is the admin rung on the
  -- Table (an owner holds admin), the rung that changes who sees a table — not the editor rung
  -- that renames it. Absent and false are the same mark, so only a real change is judged. A new
  -- Table may be made marked (its maker owns it; a template install marks its tables this way or
  -- right after). A write with no person behind it (the server lane, a migration) is judged by
  -- the door it came through, as every other key here.
  if tg_op = 'UPDATE'
     and custom.table_is_foundation(old.data) is distinct from custom.table_is_foundation(d) then
    declare
      v_who uuid := custom.query_principal();
    begin
      if v_who is not null
         and custom.effective_level(v_who, new.organization_id, new.id, 'record')
             is distinct from 'admin'::public.permission_level then
        raise exception 'Only the owner of % or an admin can change whether it is Foundation.',
                        coalesce(nullif(d ->> 'name', ''), 'this table')
          using errcode = '42501',
                hint = 'Nothing was changed. Ask the table''s owner.';
      end if;
    end;
  end if;

  return new;
end;
$function$;
