-- chair-step: lane TRASH-TABLES. An archived data Table (and a Record archived on its own while its Table is live) is in its owner's personal Trash and in its organization's Trash, and comes back through the record store's own restore door (custom.record_restore), never a raw update. Saved views are a Trash kind. The two kinds both labelled "Document" get their real names: Cloud document (workbench.udt_documents, the /documents editor) and Markdown document (content.document, Markdown Studio).
--
-- LANE TRASH-TABLES (VERIFIER-25 item 11, 2026-09-25).
--
-- THE DEFECT. /trash says "Everything you've deleted, in one place", yet a Table archived from its own
-- page (/data-v2/<table> -> Settings -> This table -> Archive this table, custom.table_archive) was in
-- neither the personal Trash nor the organization's Trash; the only way back was "Show archived tables"
-- on the tables list. Cause: public._trash_kind_rows / _trash_kind_counts iterate platform.entity_types
-- rows that carry a user_artifact_kind, one physical table per kind. The record store keeps every Table,
-- Field, Rule, saved layout and Record in ONE table (custom.record, told apart by data_class and
-- table_id), so no registry row can describe "an archived Table", and none did.
--
-- THE FIX (the store is its own branch of the one listing body, like Vault credentials are):
--   kind `table`  (label Table)  — custom.record rows with data_class 'table' and deleted_at set. The
--                                  whole unit: its records, fields, saved layouts and rules come back
--                                  with it (STORE-TAILS-3's archive event).
--   kind `record` (label Record) — a Record (data_class 'record') archived while its Table is live.
--                                  A Record inside an archived Table is not listed: it comes back with
--                                  its Table. Title = custom.record_words (the store's own words for a
--                                  record), plus the Table it sits in.
--   Both carry entity_token `record` (the registry's token for custom.record), so the page, icons and
--   restore call need no change: public.entity_undelete('record', id) and public.org_trash_restore(...,
--   'record', id) now route to custom.record_restore(organization, id) — the store's door, which asks
--   its own ladder (custom.assert_client_may_change) and brings back exactly what the archive took. The
--   raw `UPDATE custom.record SET deleted_at = NULL` entity_undelete used to run for this token (no
--   organization key, no cascade, no ladder) is gone: closing the class means removing the door.
--   Personal = what I created, plus what was named to me in iam.permissions (resource_type 'record',
--   granted_to_user_id); organization = that organization's, behind public._org_trash_gate. No per-row
--   access check in either listing (pnpm check:trash-doors).
--
--   platform_saved_view gets user_artifact_kind `saved_view` (a view removed with saved_view_archive is
--   restorable from Trash through the generic entity_undelete, has_access editor).
--   Labels: udt_document -> "Cloud document" (its own nav description "Cloud documents — realtime
--   co-editing"; document-service.ts "Cloud document editor"); document -> "Markdown document" (the
--   canonical content store whose body "is plain markdown text", created in Markdown Studio).
--
-- NOT IN TRASH, ON PURPOSE (and named by the coverage guard, pnpm check:trash-doors):
--   a Field removed on its own (custom.field_retire) — the store has no door that puts a retired
--   column back, so a Trash row would be a dead control; Rules, Relations, comments (custom.io_comment),
--   work approvals — archived only as part of a Table/Record archive or a table move, and back with it.
--
-- INVERSE: migrations/inverse/trashtables_archived_tables_and_records_are_in_trash_down.sql
-- lane: TRASH-TABLES
-- based-on: public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) 05dc3b05ae81a364266e76024dcb699133a7685a3c47f780d3720535c57c5dde
-- based-on: public._trash_kind_counts(uuid, uuid, uuid) ae22f4ba8fa1c71a7fe4bc60a1cb0760274a0a4eb5b55a8159ab553b73c1b2f3
-- based-on: public.org_trash_restore(uuid, text, uuid) e48b83d8c68bd434cb8e03d8061997aff04decb24a7bca20195f582ac26f5274
-- based-on: public.entity_undelete(text, uuid) ff42ea4b8bfebc474327ec9afe46130e698ae2ef0b31c5681242a95ff2242ef2


-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE ONE LISTING BODY — the registry kinds, then the record store
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
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
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

  -- ── THE RECORD STORE (lane TRASH-TABLES) ────────────────────────────────────────────────────
  -- One physical table (custom.record) holds every Table and Record, so the registry loop above
  -- cannot describe them. Same two modes, same person/organization filter, restored by
  -- custom.record_restore through entity_undelete / org_trash_restore (token `record`).
  if to_regclass('custom.record') is null then return; end if;

  if p_kinds is null or 'table' = any (p_kinds) then
    if p_org is null then
      return query
      select 'table'::text, 'record'::text, 'Table'::text, x.id,
             coalesce(nullif(btrim(x.data ->> 'name'), ''), 'Untitled table'),
             x.deleted_at, x.organization_id, (x.created_by = p_uid), x.created_by
        from (
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null
            order by t.deleted_at desc, t.id limit v_window)
          union all
          (select t.id, t.data, t.deleted_at, t.organization_id, t.created_by
             from custom.record t
            where t.data_class = 'table' and t.deleted_at is not null
              and t.created_by is distinct from p_uid
              and t.id in (select g.resource_id from iam.permissions g
                            where g.granted_to_user_id = p_uid
                              and g.resource_type = 'record'
                              and coalesce(g.status, 'active') <> 'rejected'
                              and (g.expires_at is null or g.expires_at > now()))
            order by t.deleted_at desc, t.id limit v_window)
        ) x
       order by x.deleted_at desc, x.id
       limit v_limit offset v_offset;
    else
      return query
      select 'table'::text, 'record'::text, 'Table'::text, t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             t.deleted_at, t.organization_id, (t.created_by = p_uid), t.created_by
        from custom.record t
       where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
         and (p_member is null or t.created_by = p_member)
       order by t.deleted_at desc, t.id
       limit v_limit offset v_offset;
    end if;
  end if;

  if p_kinds is null or 'record' = any (p_kinds) then
    -- A Record archived on its own, while its Table is live. One inside an archived Table comes
    -- back with the Table, so it is not a second Trash row.
    return query
    select 'record'::text, 'record'::text, 'Record'::text, y.id,
           format('%s (in %s)',
                  coalesce(nullif(btrim(custom.record_words(y.organization_id, y.id)), ''), 'Untitled record'),
                  coalesce(nullif(btrim(y.table_name), ''), 'a table')),
           y.deleted_at, y.organization_id, (y.created_by = p_uid), y.created_by
      from (
        select x.id, x.deleted_at, x.organization_id, x.created_by, x.table_name
          from (
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name' as table_name
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is null
                and r.data_class = 'record' and r.deleted_at is not null
                and r.created_by is distinct from p_uid
                and r.id in (select g.resource_id from iam.permissions g
                              where g.granted_to_user_id = p_uid
                                and g.resource_type = 'record'
                                and coalesce(g.status, 'active') <> 'rejected'
                                and (g.expires_at is null or g.expires_at > now()))
              order by r.deleted_at desc, r.id limit v_window)
            union all
            (select r.id, r.deleted_at, r.organization_id, r.created_by, t.data ->> 'name'
               from custom.record r
               join custom.record t
                 on t.organization_id = r.organization_id and t.id = r.table_id
                and t.data_class = 'table' and t.deleted_at is null
              where p_org is not null
                and r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
                and (p_member is null or r.created_by = p_member)
              order by r.deleted_at desc, r.id limit v_window)
          ) x
         order by x.deleted_at desc, x.id
         limit v_limit offset v_offset
      ) y
     order by y.deleted_at desc, y.id;
  end if;
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
-- lane TRASH-TABLES: the record store's Tables and Records, after the registry kinds.
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

  -- ── THE RECORD STORE (lane TRASH-TABLES) — the same predicates as _trash_kind_rows ──────────
  if to_regclass('custom.record') is null then return; end if;

  if p_org is null then
    select (select count(*) from custom.record t
             where t.created_by = p_uid and t.data_class = 'table' and t.deleted_at is not null)
         + (select count(*) from custom.record t
             where t.data_class = 'table' and t.deleted_at is not null
               and t.created_by is distinct from p_uid
               and t.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record t
     where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is not null
       and (p_member is null or t.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'table'; label := 'Table'; n := v_n; return next;
  end if;

  if p_org is null then
    select (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.created_by = p_uid and r.data_class = 'record' and r.deleted_at is not null)
         + (select count(*) from custom.record r
              join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                                  and t.data_class = 'table' and t.deleted_at is null
             where r.data_class = 'record' and r.deleted_at is not null
               and r.created_by is distinct from p_uid
               and r.id in (select g.resource_id from iam.permissions g
                             where g.granted_to_user_id = p_uid and g.resource_type = 'record'
                               and coalesce(g.status, 'active') <> 'rejected'
                               and (g.expires_at is null or g.expires_at > now())))
      into v_n;
  else
    select count(*) into v_n from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.data_class = 'table' and t.deleted_at is null
     where r.organization_id = p_org and r.data_class = 'record' and r.deleted_at is not null
       and (p_member is null or r.created_by = p_member);
  end if;
  if v_n > 0 then
    artifact_kind := 'record'; label := 'Record'; n := v_n; return next;
  end if;
end;
$function$;

revoke all on function public._trash_kind_rows(uuid, uuid, uuid, text[], integer, integer) from public, anon, authenticated;
revoke all on function public._trash_kind_counts(uuid, uuid, uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ORGANIZATION TRASH RESTORE — a store row goes back through the store's own door
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.org_trash_restore(p_organization_id uuid, p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
-- lane TRASH-2. An owner or admin of the organization restores one member's archived item that sits
-- in THIS organization. One audit row (iam.org_admin_audit, action trash.restore) and, when the item
-- is somebody else's, an in-app notice to its owner. Never a purge.
-- lane TRASH-TABLES: a record-store Table or Record (token `record`) is restored by
-- custom.record_restore, which asks the store's own ladder for the caller and brings back exactly what
-- its archive took; a refusal is returned as restored=false with the store's sentence.
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  e record;
  v_rel regclass;
  v_title_col text;
  v_owner uuid;
  v_title text;
  v_label text;
  v_me_name text;
  v_org_name text;
  v_subject text;
  v_body text;
  v_class text;
begin
  if p_token = 'record' then
    select r.created_by, r.data_class,
           case when r.data_class = 'table'
                then coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled table')
                else coalesce(nullif(btrim(custom.record_words(r.organization_id, r.id)), ''), 'Untitled record') end
      into v_owner, v_class, v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id
       and r.deleted_at is not null and r.data_class in ('table', 'record');
    if not found then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;
    begin
      perform custom.record_restore(p_organization_id, p_id);
    exception when insufficient_privilege then
      return jsonb_build_object('restored', false,
        'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                          coalesce(nullif(btrim(v_title), ''), 'it')));
    end;
    v_label := case when v_class = 'table' then 'Table' else 'Record' end;
    select 'record'::text as token, v_label as label into e;
  else
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
    v_label := e.label;
  end if;

  perform iam._org_audit(p_organization_id, v_owner, 'trash.restore',
    jsonb_build_object('entity_token', e.token, 'id', p_id, 'label', v_label, 'title', v_title));

  if v_owner is not null and v_owner is distinct from v_me then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(u.email), ''), 'An organization admin')
      into v_me_name from auth.users u where u.id = v_me;
    select coalesce(nullif(btrim(o.name), ''), 'your organization') into v_org_name
      from iam.organizations o where o.id = p_organization_id;
    v_subject := format('%s restored your %s', coalesce(v_me_name, 'An organization admin'), lower(v_label));
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
    'message', format('%s restored.', coalesce(nullif(btrim(v_title), ''), v_label)));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE GENERIC RESTORE — the record store's token goes to the store's door, never a raw update
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.entity_undelete(p_token text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
-- lane TRASH-TABLES: token `record` (custom.record — every Table and Record of the record store) is
-- restored by custom.record_restore(organization, id): the store's ladder decides (42501 when the
-- caller may not change it) and the archive event brings back exactly what it took. The organization
-- is read FROM THE ROW, never from the caller.
declare
  v_s text;
  v_t text;
  v_feature_owned_restore boolean;
  v_n int;
  v_org uuid;
begin
  if p_token = 'record' then
    select r.organization_id into v_org
      from custom.record r
     where r.id = p_id and r.deleted_at is not null;
    if v_org is null then
      return false;
    end if;
    perform custom.record_restore(v_org, p_id);
    return true;
  end if;

  select schema_name, table_name, feature_owned_restore
    into v_s, v_t, v_feature_owned_restore
    from platform.entity_types
   where token = p_token;

  if v_s is null then
    raise exception 'unknown token %', p_token using errcode = '22023';
  end if;
  if coalesce(v_feature_owned_restore, false) then
    raise exception 'entity % requires feature-owned restoration', p_token using errcode = '42501';
  end if;
  if not iam.has_access(p_token, p_id, 'editor') then
    raise exception 'access denied' using errcode = '42501';
  end if;

  execute format('UPDATE %I.%I SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL', v_s, v_t)
    using p_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE REGISTRY: saved views are a Trash kind; the two "Document" kinds get their real names
-- ─────────────────────────────────────────────────────────────────────────────────────────────
update platform.entity_types
   set user_artifact_kind = 'saved_view'
 where token = 'platform_saved_view' and user_artifact_kind is null;

update platform.entity_types set label = 'Cloud document'
 where token = 'udt_document' and label = 'Document';

update platform.entity_types set label = 'Markdown document'
 where token = 'document' and label = 'Document';
