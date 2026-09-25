-- chair-step: lane TRASH-2. Personal Trash lists ONLY what the person owns (the person who archived it — no table carries deleted_by, and only an owner or a named editor can archive) plus what was shared with them BY NAME (iam.permissions.granted_to_user_id), never another member's deletions; one indexed query per kind, no per-row access check. Organization Trash is a separate door for the organization's owners and admins (public.org_trash_list / org_trash_counts / org_trash_restore): members' archived items in THAT organization, paged, filterable by member and kind, restore audited (iam._org_audit, action trash.restore) with an in-app notice to the item's owner (event trash.restored_by_org_admin). No purge anywhere.
-- based-on: public.trash_list(text[], integer, integer) 41c56b1a10dff6ec57d5c468bbdcb50e8ba40a9bef99d3e2560e8facf1fd45c0
-- based-on: public.trash_counts() 1d2fdfd77267514b65ebe9c96d261fceff453880eb4b20a987b5fbb03f074755
--
-- LANE TRASH-2 — ACCESS IS PERSONAL (chair ruling 2026-09-25; Google Drive / Workspace are the champions).
--
-- THE DEFECT. `/trash` read "Nothing in the trash" for admin@admin.com. `trash_list` / `trash_counts`
-- walked `(owner = me OR organization_id IN my_orgs())` and then asked `iam.has_access` PER ROW: for
-- the `file` kind that is 75,653 files other people archived in admin's organizations, >200 s, past
-- the 8 s `authenticated` statement timeout, so `trash_counts` never answered and no kind chip existed.
-- Worse than slow, it was the wrong list: other members' deletions are not yours (Drive's Trash shows
-- what YOU trashed; the Workspace admin restores other people's files from the Admin console).
--
-- THE FIX (one door, two modes):
--   public._trash_kind_rows(uid, org, member, kinds, limit, offset)  — the one listing body.
--     personal (org null):  owner = uid, UNION ALL rows named to uid in iam.permissions (by person,
--                           never by organization grant), each branch ordered by deleted_at.
--     organization (org):   organization_id = org [and owner = member], ordered by deleted_at.
--   public._trash_kind_counts(uid, org, member)                       — the same predicates, counted.
--   Neither calls iam.has_access or iam.my_orgs: the person (or the organization, behind an explicit
--   owner/admin gate) is the filter. Vault credentials stay personal only (Vault's own recovery review
--   restores them; an organization admin never sees another member's credential in Trash).
--
--   public.trash_list / trash_counts  — same signatures, now personal.
--   public.org_trash_list / org_trash_counts / org_trash_restore — owners and admins of p_organization_id.
--
-- INDEXES: files.files (248k archived rows, 75k of them in one organization) gets (created_by, deleted_at)
-- and (organization_id, deleted_at) partial indexes (deleted_at is not null) in the companion file
-- trash2_trash_reads_by_person_and_organization_indexes.sql (CREATE INDEX CONCURRENTLY, outside a
-- transaction). Every other kind answers in well under the 300 ms bar on its existing indexes
-- (measured per kind, PROGRESS-TRASH-COVERAGE.md); this file does not depend on the indexes for correctness.
--
-- INVERSE: migrations/inverse/trash2_personal_trash_is_yours_and_the_organization_has_its_own_down.sql
-- lane: TRASH-2


-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE ONE LISTING BODY
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._trash_kind_rows(
  p_uid uuid, p_org uuid, p_member uuid, p_kinds text[], p_limit integer, p_offset integer)
returns table(artifact_kind text, entity_token text, label text, id uuid, title text,
              deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
-- lane TRASH-2. The person (personal mode) or the organization (organization mode, gated by the
-- caller) is the filter; there is no per-row access check and no organization-wide walk here.
declare
  rec record;
  v_rel regclass;
  v_title text;
  v_org text;
  v_cols text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_window int;
begin
  if p_uid is null then return; end if;
  v_window := v_limit + v_offset;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.title_column, e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null
       and e.is_active
       and (p_kinds is null or e.user_artifact_kind = any(p_kinds))
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        -- Vault credentials: the owner's own, only. Organization mode never lists them.
        if p_org is not null then continue; end if;
        return query execute format(
          'select %L::text, %L::text, %L::text, t.id, t.display_name::text,
                  t.deleted_at, t.organization_id, true, t.user_id
             from users.credential_items t
            where t.user_id = $1 and t.deleted_at is not null
            order by t.deleted_at desc, t.id
            limit %s offset %s',
          rec.kind, rec.token, rec.label, v_limit, v_offset)
          using p_uid;
        continue;
      end if;

      v_title := null;
      select a.attname into v_title
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = coalesce(rec.title_column, '')
       limit 1;
      if v_title is null then
        select a.attname into v_title
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = any (array['name','title','label','display_name','file_name','folder_name'])
         order by array_position(array['name','title','label','display_name','file_name','folder_name'], a.attname::text)
         limit 1;
      end if;
      v_org := null;
      select a.attname into v_org
        from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = 'organization_id'
       limit 1;

      if p_org is not null and v_org is null then continue; end if;

      v_cols := format('%L::text, %L::text, %L::text, t.id, %s, t.deleted_at, %s, (t.%I = $1), t.%I',
        rec.kind, rec.token, rec.label,
        case when v_title is null then 'null::text' else format('t.%I::text', v_title) end,
        case when v_org is null then 'null::uuid' else format('t.%I', v_org) end,
        rec.owner_col, rec.owner_col);

      if p_org is null then
        -- PERSONAL: what I own, plus what was named to me. Each branch is its own indexed read.
        return query execute format(
          'select * from (
             (select %1$s from %2$I.%3$I t
               where t.%4$I = $1 and t.deleted_at is not null
               order by t.deleted_at desc, t.id limit %5$s)
             union all
             (select %1$s from %2$I.%3$I t
               where t.deleted_at is not null
                 and t.%4$I is distinct from $1
                 and t.id in (select g.resource_id from iam.permissions g
                               where g.granted_to_user_id = $1
                                 and g.resource_type = %6$L
                                 and coalesce(g.status, ''active'') <> ''rejected''
                                 and (g.expires_at is null or g.expires_at > now()))
               order by t.deleted_at desc, t.id limit %5$s)
           ) x
           order by x.deleted_at desc, x.id
           limit %7$s offset %8$s',
          v_cols, rec.sch, rec.tbl, rec.owner_col, v_window, rec.token, v_limit, v_offset)
          using p_uid;
      else
        -- ORGANIZATION: this organization's archived rows, optionally one member's. The caller gated it.
        return query execute format(
          'select %1$s from %2$I.%3$I t
            where t.%4$I = $2 and t.deleted_at is not null
              and ($3::uuid is null or t.%5$I = $3)
            order by t.deleted_at desc, t.id
            limit %6$s offset %7$s',
          v_cols, rec.sch, rec.tbl, v_org, rec.owner_col, v_limit, v_offset)
          using p_uid, p_org, p_member;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE SAME PREDICATES, COUNTED
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._trash_kind_counts(p_uid uuid, p_org uuid, p_member uuid)
returns table(artifact_kind text, label text, n bigint)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
-- lane TRASH-2. Mirrors public._trash_kind_rows row for row; no per-row access check.
declare
  rec record;
  v_rel regclass;
  v_org text;
  v_n bigint;
begin
  if p_uid is null then return; end if;

  for rec in
    select e.token, e.user_artifact_kind as kind, e.label,
           e.schema_name as sch, e.table_name as tbl,
           coalesce(e.retention_owner_column, 'created_by') as owner_col,
           e.feature_owned_restore
      from platform.entity_types e
     where e.user_artifact_kind is not null and e.is_active
     order by e.user_artifact_kind
  loop
    begin
      v_rel := to_regclass(format('%I.%I', rec.sch, rec.tbl));
      if v_rel is null then continue; end if;
      v_n := 0;

      if rec.token = 'credential_item' and rec.feature_owned_restore then
        if p_org is not null then continue; end if;
        select count(*) into v_n from users.credential_items t
         where t.user_id = p_uid and t.deleted_at is not null;
      else
        v_org := null;
        select a.attname into v_org
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname = 'organization_id'
         limit 1;
        if p_org is null then
          execute format(
            'select (select count(*) from %1$I.%2$I t where t.%3$I = $1 and t.deleted_at is not null)
                  + (select count(*) from %1$I.%2$I t
                      where t.deleted_at is not null and t.%3$I is distinct from $1
                        and t.id in (select g.resource_id from iam.permissions g
                                      where g.granted_to_user_id = $1
                                        and g.resource_type = %4$L
                                        and coalesce(g.status, ''active'') <> ''rejected''
                                        and (g.expires_at is null or g.expires_at > now())))',
            rec.sch, rec.tbl, rec.owner_col, rec.token)
            into v_n using p_uid;
        else
          if v_org is null then continue; end if;
          execute format(
            'select count(*) from %1$I.%2$I t
              where t.%3$I = $1 and t.deleted_at is not null
                and ($2::uuid is null or t.%4$I = $2)',
            rec.sch, rec.tbl, v_org, rec.owner_col)
            into v_n using p_org, p_member;
        end if;
      end if;

      if v_n > 0 then
        artifact_kind := rec.kind; label := rec.label; n := v_n; return next;
      end if;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;
end;
$function$;

revoke all on function public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) from public, anon, authenticated;
revoke all on function public._trash_kind_counts(uuid, uuid, uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- PERSONAL TRASH — same signatures, now only yours
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.trash_list(p_kinds text[] default null::text[], p_limit integer default 200, p_offset integer default 0)
returns table(artifact_kind text, entity_token text, label text, id uuid, title text,
              deleted_at timestamp with time zone, organization_id uuid, is_mine boolean)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- lane TRASH-2: personal Trash — what you own plus what was named to you. `limit`/`offset` are per kind.
  select r.artifact_kind, r.entity_token, r.label, r.id, r.title, r.deleted_at, r.organization_id, r.is_mine
    from public._trash_kind_rows((select auth.uid()), null, null, p_kinds, p_limit, p_offset) r;
$function$;

create or replace function public.trash_counts()
returns table(artifact_kind text, label text, n bigint)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- lane TRASH-2: personal Trash counts — the same predicates as trash_list.
  select c.artifact_kind, c.label, c.n from public._trash_kind_counts((select auth.uid()), null, null) c;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ORGANIZATION TRASH — owners and admins of the organization
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._org_trash_gate(p_organization_id uuid)
returns uuid
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
-- lane TRASH-2. The caller, when they are an owner or admin of p_organization_id; refuses otherwise.
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or p_organization_id is null
     or not exists (select 1 from iam.organization_member om
                     where om.organization_id = p_organization_id and om.user_id = v_me
                       and om.role in ('owner', 'admin')) then
    raise exception 'Only an owner or admin of this organization can see its Trash.'
      using errcode = '42501';
  end if;
  return v_me;
end;
$function$;
revoke all on function public._org_trash_gate(uuid) from public, anon, authenticated;

create or replace function public.org_trash_list(
  p_organization_id uuid, p_kinds text[] default null, p_member uuid default null,
  p_limit integer default 50, p_offset integer default 0)
returns table(artifact_kind text, entity_token text, label text, id uuid, title text,
              deleted_at timestamp with time zone, organization_id uuid, is_mine boolean,
              owner_id uuid, owner_label text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
-- lane TRASH-2. One merged page (newest first) across the chosen kinds: `limit`/`offset` apply to the
-- merged list, not per kind.
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  return query
  select r.artifact_kind, r.entity_token, r.label, r.id, r.title, r.deleted_at, r.organization_id,
         r.is_mine, r.owner_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  u.email::text)
    from public._trash_kind_rows(v_me, p_organization_id, p_member, p_kinds, v_limit + v_offset, 0) r
    left join auth.users u on u.id = r.owner_id
   order by r.deleted_at desc, r.id
   limit v_limit offset v_offset;
end;
$function$;

create or replace function public.org_trash_counts(p_organization_id uuid, p_member uuid default null)
returns table(artifact_kind text, label text, n bigint)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
-- lane TRASH-2. Per-kind totals of the organization's archived items (optionally one member's).
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
begin
  return query select c.artifact_kind, c.label, c.n from public._trash_kind_counts(v_me, p_organization_id, p_member) c;
end;
$function$;

create or replace function public.org_trash_restore(p_organization_id uuid, p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
-- lane TRASH-2. An owner or admin of the organization restores one member's archived item that sits
-- in THIS organization. One audit row (iam.org_admin_audit, action trash.restore) and, when the item
-- is somebody else's, an in-app notice to its owner. Never a purge.
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  e record;
  v_rel regclass;
  v_title_col text;
  v_owner uuid;
  v_title text;
  v_me_name text;
  v_org_name text;
  v_subject text;
  v_body text;
begin
  select t.token, t.user_artifact_kind, t.label, t.schema_name, t.table_name,
         coalesce(t.retention_owner_column, 'created_by') as owner_col, t.title_column, t.feature_owned_restore
    into e
    from platform.entity_types t
   where t.token = p_token and t.is_active and t.user_artifact_kind is not null;
  if not found then
    raise exception 'That kind of item is not in Trash.' using errcode = '22023';
  end if;
  if coalesce(e.feature_owned_restore, false) or e.token in ('credential_item', 'user_secret', 'credential_attachment') then
    raise exception 'Vault items are restored by their owner from their own Trash.' using errcode = '42501';
  end if;
  v_rel := to_regclass(format('%I.%I', e.schema_name, e.table_name));
  if v_rel is null then
    raise exception 'That kind of item is not in Trash.' using errcode = '22023';
  end if;

  select a.attname into v_title_col from pg_attribute a
   where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
     and a.attname = coalesce(e.title_column, '') limit 1;
  if v_title_col is null then
    select a.attname into v_title_col from pg_attribute a
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
       and a.attname = any (array['name','title','label','display_name','file_name','folder_name'])
     order by array_position(array['name','title','label','display_name','file_name','folder_name'], a.attname::text)
     limit 1;
  end if;

  execute format(
    'update %I.%I t set deleted_at = null
      where t.id = $1 and t.organization_id = $2 and t.deleted_at is not null
      returning t.%I, %s',
    e.schema_name, e.table_name, e.owner_col,
    case when v_title_col is null then 'null::text' else format('t.%I::text', v_title_col) end)
    into v_owner, v_title
    using p_id, p_organization_id;

  if not found then
    return jsonb_build_object('restored', false,
      'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
  end if;

  perform iam._org_audit(p_organization_id, v_owner, 'trash.restore',
    jsonb_build_object('entity_token', e.token, 'id', p_id, 'label', e.label, 'title', v_title));

  if v_owner is not null and v_owner is distinct from v_me then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(u.email), ''), 'An organization admin')
      into v_me_name from auth.users u where u.id = v_me;
    select coalesce(nullif(btrim(o.name), ''), 'your organization') into v_org_name
      from iam.organizations o where o.id = p_organization_id;
    v_subject := format('%s restored your %s', coalesce(v_me_name, 'An organization admin'), lower(e.label));
    v_body := format('%s restored "%s" from %s''s Trash. It is back where it was.',
                     coalesce(v_me_name, 'An organization admin'),
                     coalesce(nullif(btrim(v_title), ''), 'Untitled'), coalesce(v_org_name, 'your organization'));
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (p_organization_id, 'trash.restored_by_org_admin', 'in_app', v_owner, 'user',
       format('trash.restore:%s:%s:%s', e.token, p_id, extract(epoch from clock_timestamp())::bigint),
       v_subject, left(v_body, 600),
       jsonb_build_object('entity_token', e.token, 'id', p_id, 'by', v_me, 'source', 'org_trash_restore',
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       e.token, p_id, null, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
    'message', format('%s restored.', coalesce(nullif(btrim(v_title), ''), e.label)));
end;
$function$;

-- THE NOTICE the restore writes (aidream declares the same row in services/notifications/declarations.py;
-- this insert makes the door whole before that server deploys and never overwrites it).
insert into communication.notification_event_type
  (organization_id, event_key, label, description, default_channels, enabled, config)
values (
  public.system_org_id('system'),
  'trash.restored_by_org_admin',
  'Something of yours was restored',
  'An owner or admin of your organization restored an item you had archived, from the organization''s Trash. '
  'The notice says who and what.',
  '{"in_app": true}'::jsonb,
  true,
  jsonb_build_object(
    'sms_locked', true,
    'sensitivity_ceiling', 'internal',
    'templates', jsonb_build_object('in_app', jsonb_build_object('body', '{{notice.body}}', 'subject', '{{notice.subject}}'))))
on conflict (event_key) do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select d.schema_name, d.function_name, iam.door_identity_args(d.fn), d.argtypes, d.reason,
       'migrations/campaign/trash2_personal_trash_is_yours_and_the_organization_has_its_own.sql (lane TRASH-2)',
       d.non_client_lane, d.non_client_lane is null, false
  from (values
    ('public', 'org_trash_list', 'public.org_trash_list(uuid, text[], uuid, integer, integer)'::regprocedure,
     array['uuid'::regtype::oid, 'text[]'::regtype::oid, 'uuid'::regtype::oid, 'integer'::regtype::oid, 'integer'::regtype::oid],
     'p_organization_id: the caller must be an owner or admin of it (iam.organization_member, 42501 otherwise; NULL refuses). Lists that organization''s archived rows of the Trash kinds (never Vault credentials); p_member and p_kinds only filter (NULL = all).',
     null::text),
    ('public', 'org_trash_counts', 'public.org_trash_counts(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'p_organization_id: the caller must be an owner or admin of it (42501 otherwise; NULL refuses). p_member only filters (NULL = everyone). Per-kind counts only.',
     null::text),
    ('public', 'org_trash_restore', 'public.org_trash_restore(uuid, text, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
     'p_organization_id: the caller must be an owner or admin of it (42501 otherwise; NULL refuses); p_id must be an archived row of kind p_token sitting in THAT organization (else restored=false). Clears deleted_at only, writes one iam.org_admin_audit row and an in-app notice to the owner. Vault kinds refused.',
     null::text),
    ('public', '_trash_kind_rows', 'public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'text[]'::regtype::oid, 'integer'::regtype::oid, 'integer'::regtype::oid],
     'p_uid is the person the list is for; p_org, when set, must already have been gated by the caller (org owner/admin).',
     'server_only: the shared body behind public.trash_list (p_uid = auth.uid()) and public.org_trash_list (after public._org_trash_gate); no client calls it directly.'),
    ('public', '_trash_kind_counts', 'public._trash_kind_counts(uuid, uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid],
     'p_uid is the person the counts are for; p_org, when set, must already have been gated by the caller (org owner/admin).',
     'server_only: the shared body behind public.trash_counts (p_uid = auth.uid()) and public.org_trash_counts (after public._org_trash_gate); no client calls it directly.'),
    ('public', '_org_trash_gate', 'public._org_trash_gate(uuid)'::regprocedure,
     array['uuid'::regtype::oid],
     'p_organization_id: refuses (42501) unless auth.uid() is an owner or admin of it.',
     'server_only: called only inside public.org_trash_list, org_trash_counts and org_trash_restore to gate the caller; no client calls it.')
  ) as d(schema_name, function_name, fn, argtypes, reason, non_client_lane)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function public.org_trash_list(uuid, text[], uuid, integer, integer) to authenticated;
grant execute on function public.org_trash_counts(uuid, uuid) to authenticated;
grant execute on function public.org_trash_restore(uuid, text, uuid) to authenticated;
