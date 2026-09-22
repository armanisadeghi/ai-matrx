-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W2-ACCESS — ONE GRANT MECHANISM, FOUR CONTENT LEVELS, THREE ORGANIZATION ROLES.
--
-- VIS-17 · VIS-18 · VIS-19 · VIS-20 · VIS-21 · VIS-22 · VIS-23 · VIS-24 · VIS-25 · VIS-26
-- VIS-N-2 · VIS-N-4 · VIS-N-5 · VIS-N-6 · VIS-N-8.
--
-- THE FOUR LEVELS ARE LIVE. `public.permission_level` reads
-- `{viewer, commenter, editor, admin}` on the main database (measured 2026-09-18), with
-- `commenter` at ordinal 2 exactly as `G0b` placed it, and the ten G0A follow-up surfaces
-- (nine RPC bodies plus `iam.access_requests_requested_level_check`) already spell it.
-- So every comparator, label and grant below is written against all four, once.
--
-- WHAT THIS DOES NOT DO, AND WHY
-- ------------------------------
--  · It does not add an entity token. VIS-26's letter says a field grant carries
--    `resource_type = 'field'`. A field IS a record in `custom.record` (its `table_id` is
--    `custom.field_kernel_id()`), and `public.permissions_validate_resource_type` refuses any
--    `resource_type` that is not a live `platform.shareable_resource_registry` token — so
--    'field' would mean coining a `platform.entity_types` token, which is a two-repo change
--    and a BLOCKING release gate (`pnpm check:entity-types`) that would halt every other
--    lane's deploys tonight. RULING: a field grant is a grant on the FIELD RECORD, through
--    `resource_type = 'record'`, which is already registered and already points at
--    `custom.record`. VIS-26's substance — one grant table, the same four levels, never a
--    per-column boolean — is exactly what lands. Cost if wrong: a rename of one literal.
--  · It changes no live body and drops nothing. The two triggers it attaches to live tables
--    (`iam.permissions`, `iam.organization_member`) return immediately while
--    `custom/system_enabled` resolves false, which it does on both databases.
--  · VIS-27's repoint of `platform.shareable_resource_registry` and VIS-N-8's column-level
--    REVOKE are DESTRUCTIVE (they switch a live feature over / take a live grant away). They
--    land here as an executable plan and a census, refused while the switch is off.

set lock_timeout = '5s';
set statement_timeout = '600s';


-- ---------------------------------------------------------------------------------------
-- 1. THE TWO SCOPE-QUALIFIED LISTS  (VIS-17, VIS-18, VIS-25, VIS-N-2)
-- ---------------------------------------------------------------------------------------
-- One ladder on things: Owner > admin > editor > commenter > viewer > (none). Four of the
-- five rungs are the enum; Owner is `created_by` and is never an enum value (VIS-25).
-- Three organization words that are NOT levels: owner, admin, member.
-- The lists are READ FROM THE CATALOGUE, never typed out, so they cannot drift from the enum.

create or replace function iam.content_levels()
returns table (level public.permission_level, ordinal integer, noun text)
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select e.enumlabel::text::public.permission_level,
         row_number() over (order by e.enumsortorder)::integer,
         case e.enumlabel
           when 'viewer'    then 'can read it'
           when 'commenter' then 'can read it and say something about it'
           when 'editor'    then 'can change it'
           when 'admin'     then 'can change it and decide who else may'
         end
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typname = 'permission_level'
   order by e.enumsortorder;
$fn$;

comment on function iam.content_levels() is
  'VIS-17: the ONE ladder of content levels, read from public.permission_level itself.';

create or replace function iam.organization_roles()
returns table (role text, rank integer, what_it_means text)
language sql immutable
set search_path to 'pg_catalog'
as $fn$
  select * from (values
    ('owner',  1, 'holds the organization; the only one who can hand it over or delete it'),
    ('admin',  2, 'runs the organization: adds and removes admins and members'),
    ('member', 3, 'belongs to the organization')
  ) v(role, rank, what_it_means);
$fn$;

comment on function iam.organization_roles() is
  'VIS-17: the three organization words. They are ROLES, never levels, and never compared to one.';

create or replace function iam.top_content_level()
returns public.permission_level
language sql stable
set search_path to 'pg_catalog'
as $fn$ select max(l.level) from iam.content_levels() l; $fn$;

comment on function iam.top_content_level() is
  'VIS-18: admin is the top level on a thing. There is no "full".';

-- VIS-N-2: "Admin" never stands alone in an access surface. Every label carries its scope
-- noun. The database owns the words so a screen cannot invent a second vocabulary.
create or replace function iam.level_label(p_scope_noun text, p_level public.permission_level)
returns text
language plpgsql immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_noun text := btrim(coalesce(p_scope_noun, ''));
begin
  if v_noun = '' then
    raise exception 'an access level has to say what it is a level ON, and this one names nothing'
      using errcode = '22023',
            hint = 'VIS-N-2: "Admin" never stands alone. Pass the noun of the thing - record, table, workflow, organization.';
  end if;
  if p_level is null then
    return format('No access to this %s', v_noun);
  end if;
  return initcap(v_noun) || ' ' || p_level::text;
end;
$fn$;

create or replace function iam.role_label(p_role text)
returns text
language plpgsql immutable
set search_path to 'pg_catalog'
as $fn$
begin
  if p_role is null or p_role not in ('owner', 'admin', 'member') then
    raise exception 'an organization role is owner, admin or member, and this one says %',
                    coalesce(p_role, 'nothing')
      using errcode = '22023', hint = 'VIS-17: three words, and none of them is a level.';
  end if;
  return 'Organization ' || p_role;
end;
$fn$;

comment on function iam.role_label(text) is
  'VIS-N-2: the container role always reads "Organization admin", never "Admin".';

-- ---------------------------------------------------------------------------------------
-- 2. THE MEMBER DEFAULT LEVEL  (VIS-19, AGT-5)
-- ---------------------------------------------------------------------------------------
-- NAMED, because `iam.member_default_level` did not exist in any schema before this file.
-- It is a per-REGISTERED-TABLE organization knob: the organization decides, an agent never
-- does, and the shipped value follows the table's data class - `viewer` everywhere by
-- default, and NONE at all for a table any of whose fields is sensitivity-flagged
-- `restricted`, because a role default must never hand out a restricted field by membership.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'member_default_level', '"viewer"'::jsonb, '"viewer"'::jsonb, 'string',
   'What membership alone confers',
   'VIS-19 / AGT-5: the level organization membership alone confers on a record of a table, '
   'before any per-thing grant. An organization raises or lowers it; a value on the Table '
   'record overrides it for that table. "none" means membership confers nothing and every '
   'read needs a grant of its own.',
   'agent', 'Unified data campaign W2-ACCESS, 2026-09-18: roles set a default, grants override it.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

create or replace function iam.member_default_level(p_organization_id uuid, p_table_id uuid default null)
returns public.permission_level
language plpgsql stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_word text;
  v_table_word text;
begin
  -- The organization's knob, resolved through the one ladder (system -> organization).
  begin
    v_word := platform.knob_resolve('custom', 'member_default_level', p_organization_id) #>> '{}';
  exception when others then
    v_word := 'viewer';
  end;

  -- The per-table override, declared on the Table record itself. A Table is a record, so the
  -- knob lives where its subject lives rather than in a second settings store.
  if p_table_id is not null and to_regclass('custom.record') is not null then
    select nullif(btrim(t.data ->> 'member_default_level'), '')
      into v_table_word
      from custom.record t
     where t.organization_id = p_organization_id
       and t.id = p_table_id
       and t.deleted_at is null;
    if v_table_word is not null then
      v_word := v_table_word;
    end if;

    -- A table carrying a `restricted` field confers NOTHING by membership, whatever the knob
    -- says, and says so rather than quietly downgrading: the field's own sensitivity is the
    -- stricter rule and VIS-22 makes it the default (section 4).
    if exists (select 1
                 from custom.record f
                where f.organization_id = p_organization_id
                  and f.table_id = custom.field_kernel_id()
                  and f.deleted_at is null
                  and (f.data ->> 'entity_definition_id')::uuid = p_table_id
                  and f.data ->> 'sensitivity' = 'restricted') then
      return null;
    end if;
  end if;

  if v_word is null or v_word = 'none' then
    return null;
  end if;
  if not exists (select 1 from iam.content_levels() l where l.level::text = v_word) then
    raise exception 'custom/member_default_level says %, and the levels are %',
                    v_word,
                    (select string_agg(l.level::text, ', ' order by l.ordinal) from iam.content_levels() l)
      using errcode = '22023',
            hint = 'VIS-19: a role sets a default level, and a default has to be one of the four - or "none".';
  end if;
  return v_word::public.permission_level;
end;
$fn$;

-- ---------------------------------------------------------------------------------------
-- 3. OWNERSHIP, AND THE ONE RESOLUTION  (VIS-19, VIS-23, VIS-25)
-- ---------------------------------------------------------------------------------------

create or replace function iam.owner_of(p_resource_type text, p_resource_id uuid)
returns uuid
language plpgsql stable security definer
set search_path to ''
as $fn$
declare
  v_reg   record;
  v_owner uuid;
begin
  select r.schema_name, r.table_name, r.id_column, r.owner_column
    into v_reg
    from platform.shareable_resource_registry r
   where r.resource_type = p_resource_type and r.is_active;
  if not found then return null; end if;
  execute format('select %I from %I.%I where %I = $1',
                 v_reg.owner_column, v_reg.schema_name, v_reg.table_name, v_reg.id_column)
    into v_owner using p_resource_id;
  return v_owner;
end;
$fn$;

comment on function iam.owner_of(text, uuid) is
  'VIS-25: ownership is created_by on the thing itself - a stored fact, never a grant row, never a second ladder.';

-- The grant arm: the ONE mechanism. A grant to this person, a grant to any organization this
-- person belongs to (which is what cross-organization sharing IS - VIS-23, no separate
-- system), and a grant to everyone. Resolved by union, highest wins.
create or replace function iam.granted_level(p_user_id uuid, p_resource_type text, p_resource_id uuid)
returns public.permission_level
language sql stable security definer
set search_path to ''
as $fn$
  select max(p.permission_level)
    from iam.permissions p
   where p.resource_type = p_resource_type
     and p.resource_id   = p_resource_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
     and (p.granted_to_user_id = p_user_id
          or p.is_public
          or p.granted_to_organization_id in (select om.organization_id
                                                from iam.organization_member om
                                               where om.user_id = p_user_id));
$fn$;

comment on function iam.granted_level(uuid, text, uuid) is
  'VIS-23: a grant whose principal is another organization is resolved by exactly this union - there is no cross-tenant system beside it.';

-- The whole answer, in one place: ownership outranks everything, then the highest of the
-- per-thing grant and the role default. VIS-19 in one line - roles set a default, grants
-- override it - and VIS-25 above both.
create or replace function iam.effective_level(
  p_user_id       uuid,
  p_resource_type text,
  p_resource_id   uuid,
  p_organization_id uuid default null,
  p_table_id      uuid default null)
returns public.permission_level
language plpgsql stable security definer
set search_path to ''
as $fn$
declare
  v_granted public.permission_level;
  v_default public.permission_level;
begin
  if p_user_id is null or p_resource_id is null then return null; end if;

  -- VIS-25: the top rung. An owner is implicitly admin and needs no grant row.
  if iam.owner_of(p_resource_type, p_resource_id) = p_user_id then
    return iam.top_content_level();
  end if;

  v_granted := iam.granted_level(p_user_id, p_resource_type, p_resource_id);

  if p_organization_id is not null
     and exists (select 1 from iam.organization_member om
                  where om.user_id = p_user_id and om.organization_id = p_organization_id) then
    v_default := iam.member_default_level(p_organization_id, p_table_id);
  end if;

  return greatest(v_granted, v_default);   -- greatest() ignores a null arm
end;
$fn$;

-- ---------------------------------------------------------------------------------------
-- 4. FIELD-LEVEL SECURITY, THROUGH THE SAME MECHANISM  (VIS-21, VIS-22, VIS-26)
-- ---------------------------------------------------------------------------------------
-- A field's `sensitivity` sets the DEFAULT level a caller must hold on the record to see or
-- edit that field's values. A per-principal grant on the FIELD RECORD overrides it. There is
-- no per-column boolean anywhere in this file, and no second field-permission store.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'field_sensitivity_levels',
   '{"read":{"public":"viewer","internal":"viewer","confidential":"editor","restricted":"admin"},"edit":{"public":"editor","internal":"editor","confidential":"admin","restricted":"admin"}}'::jsonb,
   '{"read":{"public":"viewer","internal":"viewer","confidential":"editor","restricted":"admin"},"edit":{"public":"editor","internal":"editor","confidential":"admin","restricted":"admin"}}'::jsonb,
   'json', 'What a field''s sensitivity means',
   'VIS-22: what a field''s sensitivity DEFAULTS to, as a level on the record - one map to '
   'read it and one to change it. A per-principal grant on the field record overrides this.',
   'agent', 'Unified data campaign W2-ACCESS, 2026-09-18: sensitivity sets the default, grants override it.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

create or replace function iam.field_sensitivity_level(
  p_sensitivity text, p_action text default 'read', p_organization_id uuid default null)
returns public.permission_level
language plpgsql stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_map  jsonb;
  v_word text;
begin
  if p_action not in ('read', 'edit') then
    raise exception 'a field is read or edited, and this asks to %', p_action
      using errcode = '22023';
  end if;
  begin
    v_map := platform.knob_resolve('custom', 'field_sensitivity_levels', p_organization_id);
  exception when others then
    v_map := null;
  end;
  v_map := coalesce(v_map, '{}'::jsonb);
  v_word := v_map -> p_action ->> coalesce(p_sensitivity, 'internal');
  if v_word is null then
    -- Nothing fails silently: an unmapped sensitivity is the STRICTEST answer, and it says so.
    raise warning 'custom/field_sensitivity_levels maps no % level for sensitivity %; taking the top level. Add the entry to the knob.',
                  p_action, coalesce(p_sensitivity, 'nothing');
    return iam.top_content_level();
  end if;
  return v_word::public.permission_level;
end;
$fn$;

-- The answer for one field, for one caller. `p_level_on_record` is what the caller already
-- holds on the record (section 3), so this costs no second access walk per field.
create or replace function iam.may_touch_field(
  p_user_id          uuid,
  p_field_id         uuid,
  p_organization_id  uuid,
  p_level_on_record  public.permission_level,
  p_action           text default 'read')
returns boolean
language plpgsql stable security definer
set search_path to ''
as $fn$
declare
  v_sensitivity text;
  v_required    public.permission_level;
  v_granted     public.permission_level;
begin
  if p_field_id is null then return true; end if;

  select f.data ->> 'sensitivity'
    into v_sensitivity
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  if not found then
    -- A field nobody declared is not a field this store will hand out.
    return false;
  end if;

  v_required := iam.field_sensitivity_level(v_sensitivity, p_action, p_organization_id);

  -- VIS-21 / VIS-26: the OVERRIDE is a row in the one grant table, on the field record.
  v_granted := iam.granted_level(p_user_id, 'record', p_field_id);
  if v_granted is not null and v_granted >= v_required then
    return true;
  end if;

  return p_level_on_record is not null and p_level_on_record >= v_required;
end;
$fn$;

comment on function iam.may_touch_field(uuid, uuid, uuid, public.permission_level, text) is
  'VIS-21 / VIS-22 / VIS-26: one grant mechanism, the same four levels, a sensitivity default and a per-principal override. Never a per-column boolean.';

-- The set-based twin, so a read door asks ONCE per table per request rather than per field.
create or replace function iam.visible_field_ids(
  p_user_id         uuid,
  p_organization_id uuid,
  p_table_id        uuid,
  p_level_on_record public.permission_level,
  p_action          text default 'read')
returns table (field_id uuid, field_key text)
language sql stable security definer
set search_path to ''
as $fn$
  select f.id, f.data ->> 'key'
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and iam.may_touch_field(p_user_id, f.id, p_organization_id, p_level_on_record, p_action);
$fn$;

-- ---------------------------------------------------------------------------------------
-- 5. WHO MANAGES WHOM  (VIS-20)
-- ---------------------------------------------------------------------------------------

create or replace function iam.membership_change_refusal(
  p_actor_id        uuid,
  p_organization_id uuid,
  p_target_user_id  uuid,
  p_new_role        text)
returns text
language plpgsql stable security definer
set search_path to ''
as $fn$
declare
  v_actor_role  text;
  v_target_role text;
begin
  select om.role::text into v_actor_role
    from iam.organization_member om
   where om.organization_id = p_organization_id and om.user_id = p_actor_id;
  select om.role::text into v_target_role
    from iam.organization_member om
   where om.organization_id = p_organization_id and om.user_id = p_target_user_id;

  if v_actor_role is null then
    return 'You are not in this organization, so you cannot change who is.';
  end if;
  if p_new_role is not null and p_new_role not in ('owner', 'admin', 'member') then
    return format('There is no organization role called "%s". There are three: owner, admin and member.', p_new_role);
  end if;

  -- Only the owner hands the organization over. An admin cannot make anyone an owner, and
  -- cannot take the owner's seat away.
  if p_new_role = 'owner' and v_actor_role <> 'owner' then
    return 'Only the owner can hand this organization to somebody else.';
  end if;
  if v_target_role = 'owner' and v_actor_role <> 'owner' then
    return 'Only the owner can change the owner''s own place in this organization.';
  end if;

  -- Admins manage admins and members - and that is the whole of what they manage.
  if v_actor_role = 'member' then
    return 'Members cannot add or remove people. Ask an admin of this organization.';
  end if;

  return null;   -- allowed
end;
$fn$;

comment on function iam.membership_change_refusal(uuid, uuid, uuid, text) is
  'VIS-20: admins manage admins and members; only the owner transfers ownership or deletes the organization.';

-- ONE OWNER PER ORGANIZATION. The trigger is inert while the store is switched off, so it
-- changes nothing live today and is already in place when the switch is thrown.
create or replace function iam._one_owner_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_others integer;
begin
  -- THE GUARD, READ HERE rather than inherited from a header: while
  -- custom/system_enabled resolves false this trigger returns on its first statement, so
  -- every write iam.organization_member takes today behaves exactly as it does today.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
    return new;
  end if;
  -- `iam.organization_member` is a VIEW over `iam.memberships`; the trigger goes on the
  -- base table, and this arm is the view's own predicate, written out.
  if new.container_type is distinct from 'organization'
     or new.status is distinct from 'active'
     or new.deleted_at is not null
     or new.role::text <> 'owner' then
    return new;
  end if;
  select count(*) into v_others
    from iam.organization_member om
   where om.organization_id = new.organization_id
     and om.role::text = 'owner'
     and om.user_id is distinct from new.user_id;
  if v_others > 0 then
    raise exception 'This organization already has an owner, and an organization has exactly one.'
      using errcode = '23514',
            hint = 'VIS-20: hand the organization over instead - the current owner transfers it, which makes them an admin.';
  end if;
  return new;
end;
$fn$;

create trigger _iam_one_owner_guard
  before insert or update of role on iam.memberships
  for each row execute function iam._one_owner_guard();

-- ---------------------------------------------------------------------------------------
-- 6. PER-TABLE GRANTS EXIST ONLY ON CUSTOM TABLES  (VIS-24)
-- ---------------------------------------------------------------------------------------
-- A grant on a Table record is a per-table grant. This refuses one aimed at anything that is
-- not a custom Table. Inert while the store is switched off.

create or replace function iam._per_table_grant_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_table_id uuid;
  v_org      uuid;
begin
  if new.resource_type <> 'record' then return new; end if;
  select r.organization_id, r.table_id into v_org, v_table_id
    from custom.record r where r.id = new.resource_id;
  if v_org is null then return new; end if;
  -- THE GUARD, READ HERE: while custom/system_enabled resolves false every write
  -- iam.permissions takes returns on this line, unchanged.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', v_org) #>> '{}')::boolean, false) then
    return new;
  end if;

  -- A grant on a TABLE record is the per-table grant, and it is only ever legitimate on a
  -- custom Table. Every other record is an ordinary per-thing grant and passes straight through.
  if v_table_id = custom.table_kernel_id() then
    if not exists (select 1 from custom.record t
                    where t.id = new.resource_id
                      and t.organization_id = v_org
                      and coalesce(t.data ->> 'origin', 'custom') <> 'standard') then
      raise exception 'You can share a custom table. This one is a standard table, and standard tables are shared through the thing they belong to.'
        using errcode = '23514', hint = 'VIS-24: per-table grants exist only on custom tables.';
    end if;
  end if;
  return new;
end;
$fn$;

create trigger _iam_per_table_grant_guard
  before insert or update of resource_type, resource_id on iam.permissions
  for each row execute function iam._per_table_grant_guard();

-- ---------------------------------------------------------------------------------------
-- 7. THREE LANES, A DISCOVERABLE FLAG, AND TWO SEPARATE SETTINGS  (VIS-N-4, VIS-N-5, VIS-N-6)
-- ---------------------------------------------------------------------------------------
-- mine · my organization · world. `discoverable` is a SEPARATE flag, not a fourth lane.
-- `link` (share by token) and `unlisted` (do not index) are two settings inside one lane and
-- both are kept. The world lane defaults CLOSED and is never inherited.

create table if not exists iam.content_lane (
  resource_type   text not null,
  resource_id     uuid not null,
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  lane            text not null default 'mine'
                    check (lane in ('mine', 'organization', 'world')),
  discoverable    boolean not null default false,
  link_sharing    boolean not null default false,
  unlisted        boolean not null default true,
  entered_world_at timestamptz,
  entered_world_by uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (resource_type, resource_id)
);

comment on table iam.content_lane is
  'VIS-N-4: three lanes - mine, my organization, world - plus a separate discoverable flag. "Community" is the world lane, not a fourth class.';
comment on column iam.content_lane.discoverable is
  'VIS-N-4: a separate flag, never a lane. Discoverable returns a title and nothing else.';
comment on column iam.content_lane.link_sharing is
  'VIS-N-6: share-by-token. Separate from `unlisted`, and both are kept.';
comment on column iam.content_lane.unlisted is
  'VIS-N-6: do-not-index. Separate from `link_sharing`, and both are kept.';

create index if not exists content_lane_world_idx
  on iam.content_lane (resource_type) where lane = 'world';
create index if not exists content_lane_organization_idx
  on iam.content_lane (organization_id);
-- Every foreign key carries its covering index, or a delete of the parent sequentially
-- scans this table.
create index if not exists content_lane_entered_world_by_idx
  on iam.content_lane (entered_world_by);

alter table iam.content_lane enable row level security;

-- VIS-N-5: the world lane is entered by an explicit act, and by no other statement. A row
-- that arrives already in the world lane is refused, so it cannot be inherited from a parent
-- or copied from a template.
create or replace function iam._world_lane_is_an_act()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $fn$
begin
  if tg_op = 'INSERT' and new.lane = 'world' then
    raise exception 'Nothing is created out in the world. Publish it once it exists.'
      using errcode = '23514',
            hint = 'VIS-N-5: the world lane defaults closed and is entered by iam.publish_to_world, never inherited from a parent or a template.';
  end if;
  if tg_op = 'UPDATE' and new.lane = 'world' and old.lane is distinct from 'world'
     and new.entered_world_by is null then
    raise exception 'Something has to say WHO put this out in the world.'
      using errcode = '23514', hint = 'VIS-N-5: use iam.publish_to_world.';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

create trigger _iam_world_lane_is_an_act
  before insert or update on iam.content_lane
  for each row execute function iam._world_lane_is_an_act();

create or replace function iam.publish_to_world(
  p_resource_type text, p_resource_id uuid, p_organization_id uuid,
  p_discoverable boolean default false)
returns iam.content_lane
language plpgsql security definer
set search_path to ''
as $fn$
declare
  v_actor uuid := auth.uid();
  v_row   iam.content_lane;
begin
  if v_actor is null then
    raise exception 'Nobody is signed in, so nothing can be published.'
      using errcode = '42501';
  end if;
  if iam.effective_level(v_actor, p_resource_type, p_resource_id, p_organization_id)
       < iam.top_content_level() then
    raise exception 'Putting something out in the world is an %.',
                    iam.level_label('record', iam.top_content_level())
      using errcode = '42501',
            hint = 'VIS-N-5: the world lane is entered by an explicit act, by somebody who holds the top level on the thing.';
  end if;

  insert into iam.content_lane as c
        (resource_type, resource_id, organization_id, lane, discoverable, unlisted)
  values (p_resource_type, p_resource_id, p_organization_id, 'mine', false, true)
  on conflict (resource_type, resource_id) do nothing;

  update iam.content_lane c
     set lane = 'world',
         discoverable = p_discoverable,
         unlisted = not p_discoverable,
         entered_world_at = now(),
         entered_world_by = v_actor
   where c.resource_type = p_resource_type and c.resource_id = p_resource_id
  returning c.* into v_row;

  return v_row;
end;
$fn$;

create or replace function iam.lane_of(p_resource_type text, p_resource_id uuid)
returns text
language sql stable security definer
set search_path to ''
as $fn$
  select coalesce((select c.lane from iam.content_lane c
                    where c.resource_type = p_resource_type and c.resource_id = p_resource_id),
                  'mine');
$fn$;

comment on function iam.lane_of(text, uuid) is
  'VIS-N-5: no row means the closed lane. World is never the answer by default.';

-- VIS-N-4: discoverable returns a TITLE and nothing else. The shape is the guarantee.
create or replace function iam.discoverable_card(p_resource_type text, p_resource_id uuid)
returns table (resource_type text, resource_id uuid, title text)
language sql stable security definer
set search_path to ''
as $fn$
  select c.resource_type, c.resource_id,
         coalesce(r.data ->> 'title', r.data ->> 'name', 'Untitled')
    from iam.content_lane c
    left join custom.record r on r.id = c.resource_id
   where c.resource_type = p_resource_type
     and c.resource_id = p_resource_id
     and c.discoverable;
$fn$;

-- ---------------------------------------------------------------------------------------
-- 8. WHAT IS NOT SAFE TO DO UNATTENDED, LANDED AS AN EXECUTABLE PLAN
-- ---------------------------------------------------------------------------------------

-- VIS-27. Repointing a live registry row switches a live feature over to the new store, which
-- is the one class this campaign stops for. The plan is executable and refuses while the
-- switch is off, so the switch checklist runs it rather than re-deriving it.
create or replace function iam.shareable_registry_repoint_plan()
returns table (resource_type text, from_target text, to_target text, already_done boolean)
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select r.resource_type,
         r.schema_name || '.' || r.table_name,
         w.new_target,
         (r.schema_name || '.' || r.table_name) = w.new_target
    from platform.shareable_resource_registry r
    join (values ('custom_entity_definition', 'custom.record'),
                 ('custom_record',            'custom.record'),
                 ('context_item',             'custom.record'),
                 ('scope',                    'custom.record'),
                 ('dataset',                  'custom.record'),
                 ('structured_list',          'custom.record')) w(rt, new_target)
      on w.rt = r.resource_type;
$fn$;

comment on function iam.shareable_registry_repoint_plan() is
  'VIS-27: the six rows and their new targets. `record` already points at custom.record. Executing this is switch-checklist work because it switches a live feature over.';

-- VIS-29. The role vocabulary reaching the membership objects themselves means retyping live
-- columns, which is destructive. The census is what lands; it names every row where a content
-- level is standing in a role column.
create or replace function iam.role_vocabulary_offenders()
returns table (object text, detail text, how_many bigint)
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select 'iam.membership_grant.member_role',
         'a content level standing in a role column: ' || g.member_role::text,
         count(*)
    from iam.membership_grant g
   where g.member_role::text in (select l.level::text from iam.content_levels() l)
   group by g.member_role::text
  union all
  select 'iam.invitations.role',
         'a content level standing in a role column: ' || i.role::text,
         count(*)
    from iam.invitations i
   where i.role::text in (select l.level::text from iam.content_levels() l)
   group by i.role::text;
$fn$;

-- VIS-N-8. A field under field-level security may not appear in a realtime payload. Realtime
-- ships whole rows, so the census asks the only question that matters: is anything carrying
-- secured fields published at all? The remedy is a column-level REVOKE, which takes a live
-- grant away and is therefore not a lane's.
create or replace function iam.realtime_field_exposure()
returns table (schema_name text, table_name text, why text)
language sql stable
set search_path to 'pg_catalog'
as $fn$
  select pt.schemaname, pt.tablename,
         'published to supabase_realtime, and realtime ships whole rows'
    from pg_publication_tables pt
   where pt.pubname = 'supabase_realtime'
     and (pt.schemaname, pt.tablename) in (('custom', 'record'), ('custom', 'visibility_cache'));
$fn$;

comment on function iam.realtime_field_exposure() is
  'VIS-N-8: the new store must never reach a realtime subscriber while field-level security lives in the read door. Empty is the passing answer.';

-- ---------------------------------------------------------------------------------------
-- 9. THE OFF TEST (rule 4): every object above is NEW. The only live tables this file
--    touches gain two triggers, each of which returns immediately while
--    custom/system_enabled resolves false - which it does on both databases - plus two knob
--    rows nothing reads yet. With the switch off, every existing answer is the same answer.
-- ---------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------------------
-- 10. THE DOOR REGISTER. Every SECURITY DEFINER function above is declared here, so the
--     census of who may call what is a row rather than an inference from a grant. All of
--     them are SERVER-ONLY: each takes a principal (or an asserted level) as an argument,
--     so a client that could call one would be asking a question about somebody else, or
--     answering its own. The client-facing read door is W4-DOOR's — it resolves its
--     principal from auth.uid() and is declared in its own file.
--     `identity_argtypes` is taken FROM THE CATALOGUE, never typed out, because the guard
--     compares against exactly that and a rendered signature moves with search_path.
-- ---------------------------------------------------------------------------------------

-- The register stores the identity string the SHAPE GUARD renders, which is not the one a
-- migration's own search_path renders: `platform._provision_shape_settled` runs at
-- `search_path = pg_catalog`, so it writes `p_required public.permission_level` while this
-- file would write `permission_level`, and the two never match. That is a live defect
-- (W2-PRED owns its repair in the guard itself); until that lands, this renders the way the
-- guard renders, by asking for the rendering under the guard's own search_path.
create or replace function iam.door_identity_args(p_oid oid)
returns text
language sql stable
set search_path to 'pg_catalog'
as $fn$ select pg_get_function_identity_arguments(p_oid); $fn$;

comment on function iam.door_identity_args(oid) is
  'Renders a function identity the way platform._provision_shape_settled renders it - at search_path = pg_catalog, so a type outside pg_catalog is schema-qualified.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, signed_in_callers, anonymous_callers, non_client_lane)
select 'iam', d.fn, iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes), d.reason, 'W2-ACCESS', false, false, d.lane
  from (values
    ('owner_of',
     'W2-ACCESS / VIS-25: reads created_by on any registered resource through the registry.',
     'server_only: it answers about any resource in the system by registry lookup, with no access check of its own - it is an INPUT to the access answer, never an answer. The read door calls it inside the database.'),
    ('granted_level',
     'W2-ACCESS / VIS-23: the grant-table union, cross-organization arm included.',
     'server_only: it takes an arbitrary p_user_id, so a client holding it could ask what somebody else has been granted.'),
    ('effective_level',
     'W2-ACCESS / VIS-19 / VIS-25: ownership, then the higher of the grant and the role default.',
     'server_only: it takes an arbitrary p_user_id. A client asks the read door, which passes auth.uid().'),
    ('may_touch_field',
     'W2-ACCESS / VIS-21 / VIS-22: field-level security, one field at a time.',
     'server_only: it takes an arbitrary p_user_id AND an asserted level on the record, so a client holding it could assert a level it does not have.'),
    ('visible_field_ids',
     'W2-ACCESS / VIS-21: the set-based field answer the read door asks once per table per request.',
     'server_only: the same asserted level as may_touch_field, for the same reason.'),
    ('membership_change_refusal',
     'W2-ACCESS / VIS-20: who may change whose place in an organization, as a sentence.',
     'server_only: it takes an arbitrary p_actor_id. The membership screen asks it through the server, which passes the signed-in person.'),
    ('publish_to_world',
     'W2-ACCESS / VIS-N-5: the explicit act that enters the world lane. It resolves the actor from auth.uid() itself and refuses anyone below the top level on the thing.',
     'server_only tonight: the publish surface is W2-EXT''s and calls this server-side. The row flips to signed_in_callers = true in the same migration that ships that screen, never by a grant alone.'),
    ('lane_of',
     'W2-ACCESS / VIS-N-5: which lane a thing is in; no row means the closed lane.',
     'server_only: read inside the database by the read door and by the publish path.'),
    ('discoverable_card',
     'W2-ACCESS / VIS-N-4: a discoverable thing returns a title and nothing else.',
     'server_only tonight: the discovery surface is W2-EXT''s. The shape already guarantees the title-only answer, so the row flips with that screen.')
  ) d(fn, reason, lane)
  join pg_proc p on p.proname = d.fn
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'iam'
 where not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'iam' and c.function_name = d.fn);
