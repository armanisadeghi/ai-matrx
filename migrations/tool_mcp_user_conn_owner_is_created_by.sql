-- chair-step: live two-phase owner move on tool.mcp_user_conn (33 rows). The one non-additive statement is DROP TRIGGER of the legacy updated_at trigger, replaced in the same transaction by platform._touch_row; no row, column or policy is removed. Rehearsed rolled back 2026-09-25 (lane B-TOOL).
--
-- tool.mcp_user_conn — the owner is created_by (lane B-TOOL, pilot of the `tool` schema certification).
-- Register: common-docs/projects/access-by-person-not-selection/REGISTER.md (priority 2, the 24
-- user_id-only tokens) and its "Certification pattern" section.
--
-- WHY. user_id was retired in favour of created_by (Arman, 2026-09-23). The kernel
-- (platform.entity_row_access_attrs) and the set lane (iam.accessible_entity_ids) read the owner from
-- created_by; this table had only user_id, so iam.has_access answered NO for the owner on every row
-- (admin@admin.com on its own 19 rows) while the RLS policy said yes. Here user_id IS the creator
-- and owner (the person who connected the server), so it is a straight move, not a re-derivation.
--
-- THIS FILE IS PHASE 1 OF A LIVE TWO-PHASE MOVE (database-changeover-doctrine §8a-2): the running
-- server and browser bundles still write user_id and no organization_id, so the old column keeps
-- working until the new code is DEPLOYED.
--   * created_by added, backfilled from user_id, NOT NULL; the bridge trigger keeps the two equal on
--     every write and REFUSES a write where they disagree (it never guesses).
--   * organization_id added and backfilled ONCE from the owner's personal organization (the home of a
--     personal connection; each of the 4 owners has exactly one). It stays NULLABLE here: the deployed
--     writers do not send it yet, and no trigger or default may choose an organization
--     (no-db-assigned-org). New code sends it explicitly.
--   * version, updated_by, deleted_at added; _touch_row + _stamp_actor replace the legacy trigger.
--   * unique keys/indexes mirrored onto created_by (the new ON CONFLICT arbiter).
-- NOT HERE — they wait for the 1–4 AM Pacific window because they lock auth.users /
-- iam.organizations (FK) or every auth/storage table (CREATE POLICY, via the event-trigger set):
-- the three FKs, the personal policies regenerated on created_by, and phase 2 (drop user_id + the
-- bridge, organization_id NOT NULL). File: common-docs/projects/access-by-person-not-selection/
-- window/tool-schema-window.sql.

-- 1. The new columns (metadata-only: no rewrite; 33 rows).
alter table tool.mcp_user_conn add column if not exists created_by uuid;
alter table tool.mcp_user_conn add column if not exists updated_by uuid;
alter table tool.mcp_user_conn add column if not exists organization_id uuid;
alter table tool.mcp_user_conn add column if not exists version integer not null default 1;
alter table tool.mcp_user_conn add column if not exists deleted_at timestamptz;

-- 2. The legacy stamp goes BEFORE the backfill, so moving the owner does not look like an edit.
drop trigger if exists tool_mcp_user_conn_touch_updated_at on tool.mcp_user_conn;

-- 3. Backfill. Owner = the person who connected (user_id). Organization = that person's personal
--    organization — a one-time historical disposition, never a runtime default.
update tool.mcp_user_conn set created_by = user_id where created_by is null;
update tool.mcp_user_conn c
   set organization_id = o.id
  from iam.organizations o
 where c.organization_id is null
   and o.is_personal
   and o.created_by = c.user_id;

do $$
begin
  if exists (select 1 from tool.mcp_user_conn where created_by is distinct from user_id) then
    raise exception 'mcp_user_conn: created_by does not equal user_id on every row after the backfill';
  end if;
  if exists (select 1 from tool.mcp_user_conn where organization_id is null) then
    raise exception 'mcp_user_conn: a row has no personal organization to be filed in — nothing applied';
  end if;
end $$;

alter table tool.mcp_user_conn alter column created_by set not null;

-- 4. The keys, mirrored onto the owner column. The user_id twins go with the column in phase 2.
create unique index if not exists mcp_user_conn_created_by_server_key
  on tool.mcp_user_conn (created_by, server_id);
create unique index if not exists mcp_user_conn_created_by_credential_key
  on tool.mcp_user_conn (created_by, provider, server_id, display_name) nulls not distinct;
create unique index if not exists mcp_user_conn_created_by_default_per_provider
  on tool.mcp_user_conn (created_by, provider) where is_default;
create index if not exists mcp_user_conn_created_by_status
  on tool.mcp_user_conn (created_by, status);
create index if not exists mcp_user_conn_created_by_provider
  on tool.mcp_user_conn (created_by, provider, is_default desc, created_at desc);
create index if not exists mcp_user_conn_organization_id
  on tool.mcp_user_conn (organization_id);

-- 5. THE TRANSITION BRIDGE — deleted in phase 2 together with user_id. Old code writes user_id, new
--    code writes created_by; whichever arrives, the other is made equal. A write naming two DIFFERENT
--    people is refused, loudly: that is a bug in whichever writer sent it, never something to settle.
--    Named `_bridge_…` so it fires before `_stamp_actor` (triggers fire in name order).
create or replace function tool._mcp_user_conn_owner_bridge()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id and new.created_by is not distinct from old.created_by then
      new.created_by := new.user_id;
    elsif new.created_by is distinct from old.created_by and new.user_id is not distinct from old.user_id then
      new.user_id := new.created_by;
    end if;
  end if;
  new.created_by := coalesce(new.created_by, new.user_id);
  new.user_id := coalesce(new.user_id, new.created_by);
  if new.created_by is distinct from new.user_id then
    raise exception using errcode = '23514',
      message = format('tool.mcp_user_conn: this write names two different owners (created_by %s, user_id %s). created_by is the owner; user_id is retired and is dropped once every writer sends created_by.', new.created_by, new.user_id);
  end if;
  return new;
end
$function$;
comment on function tool._mcp_user_conn_owner_bridge() is
  'TRANSITION BRIDGE (lane B-TOOL, 2026-09-25): keeps retired user_id equal to created_by while deployed code still writes user_id. Drop with the column (phase 2, tool-schema-window.sql).';

drop trigger if exists _bridge_owner on tool.mcp_user_conn;
create trigger _bridge_owner before insert or update on tool.mcp_user_conn
  for each row execute function tool._mcp_user_conn_owner_bridge();
drop trigger if exists _stamp_actor on tool.mcp_user_conn;
create trigger _stamp_actor before insert or update on tool.mcp_user_conn
  for each row execute function platform._stamp_actor();
drop trigger if exists _touch_row on tool.mcp_user_conn;
create trigger _touch_row before insert or update on tool.mcp_user_conn
  for each row execute function platform._touch_row();

-- 6. The registry says what the table now is.
update platform.entity_types set has_soft_delete = true where token = 'mcp_user_conn';

-- 7. Readable by the client the way every other column is (credential_item_id stays excluded).
grant select (created_by, updated_by, organization_id, version, deleted_at) on tool.mcp_user_conn to authenticated;

do $$
begin
  if (select count(*) from tool.mcp_user_conn) <> (select count(*) from tool.mcp_user_conn where created_by = user_id) then
    raise exception 'mcp_user_conn: owner move incomplete';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'tool.mcp_user_conn'::regclass and tgname = '_touch_row') then
    raise exception '_touch_row not attached';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'tool.mcp_user_conn'::regclass and tgname = '_stamp_actor') then
    raise exception '_stamp_actor not attached';
  end if;
end $$;
