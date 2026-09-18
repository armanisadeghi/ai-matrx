-- chair-step: replaces seven of this lane's own function bodies so they ask the platform's ONE access question, iam.has_access_for, instead of custom.has_visibility — which answers only from the derived containment graph and returned FALSE at every level for a record with no association, so every comment, revision, restore, publish and token issue was refused to everyone including the record's own admin; replacements are judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.anon_publish(uuid,uuid,boolean) 3663bd52c85f8d088507c925bb2cca6b4a408f4e8cc0420ab7a2e41dad08fcad
-- based-on: custom.anon_token_issue(uuid,text,jsonb,uuid,uuid,uuid,timestamp with time zone) c8848a5319a3cd94343e2b2e7ccb0966653d73e28466a8d63d85829a19e8632e
-- based-on: custom.io_comment_resolve(uuid,uuid,boolean) 2a5c604bdc9ade62b579fbb715cfd195e8adc236b6d52051ea2c275fb6589553
-- based-on: custom.io_comment_write(uuid,uuid,text,jsonb,uuid) b42d767069865d89a8674d96c4b0d43003c21597d4e281edba090c0c042ee8cb
-- based-on: custom.io_comments(uuid,uuid,boolean) c852644a82dc0662117b6969df570140b9a58ec4bb36dcc996166bf80f38b01b
-- based-on: custom.io_restore(uuid,uuid,integer) 35ad3fbd3d4e832a442d26a6427e732d67bfa937efdb10f4c4be682cd1099b0b
-- based-on: custom.io_revisions(uuid,uuid) 4717ed9450ffe4f140266c0e3a8777b803bfd0933d8c85adeb9ddb6692cc1d8e
--
-- W4-IO / W4-ANON, file 16 — THE DOORS ASK THE PLATFORM'S ONE ACCESS QUESTION.
--
-- WHAT THE GREEN SUITE FOUND. `admin@admin.com`, the account that holds admin on the fixture's
-- own records, was refused its own comment:
--     You may read this record but not comment on it.
-- Measured on the main database, 2026-09-18, for a record that account had just written:
--     custom.has_visibility(admin, 'record', rec, 'viewer')     -> false
--     custom.has_visibility(admin, 'record', rec, 'commenter')  -> false
--     custom.has_visibility(admin, 'record', rec, 'admin')      -> false
--     iam.has_access_for   (admin, 'record', rec, 'commenter')  -> true
--     iam.has_access_for   (admin, 'record', rec, 'editor')     -> true
--
-- WHY, AND IT IS NOT A BUG IN THE VISIBILITY LANE. `custom.has_visibility` answers VIS-1's
-- question: what does the containment and carrying graph convey to this person. A record with
-- no association conveys nothing, so the honest answer is false — the helper is correct and is
-- doing its job. It is simply not the question a door asks. "May this actor touch this row?"
-- has ONE answer on this platform and it is `iam.has_access_for`, which weighs membership,
-- grants, ownership AND the derived graph. Seven doors asked the narrower question and
-- therefore refused everybody.
--
-- THE CENSUS IS `pg_proc.prosrc ~ 'custom\.has_visibility'` over `custom.io_*` and
-- `custom.anon_*`, so it is every one of them: `io_comment_write`, `io_comment_resolve`,
-- `io_comments`, `io_revisions`, `io_restore`, `anon_publish`, `anon_token_issue`. The RUNGS do
-- not move — commenter to comment, editor to restore, admin to publish a form or issue a write
-- token — only which function is asked.
--
-- `custom.anon_capture` already asked `iam.has_access_for`; it was written last, after the
-- provisioner's own guard refused it for having no access decision at all. That guard was
-- right about the instance and this file is the class.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql` and `migrations/inverse/w4_anon_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.anon_publish(p_organization_id uuid, p_form_id uuid, p_published boolean DEFAULT true)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user  uuid := custom.query_principal();
  v_table uuid;
  v_at    timestamptz;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_publish');
  select f.table_id into v_table from custom.anon_form f
   where f.organization_id = p_organization_id and f.id = p_form_id and f.deleted_at is null;
  if v_table is null then
    raise exception 'custom.anon_publish: no form % in this organization', p_form_id
      using errcode = '23503';
  end if;
  -- PUBLISHING A FORM OPENS A WRITE PATH FOR PEOPLE WITH NO ACCOUNT. That is an admin act on
  -- the Table, not an editor act: whoever may publish is deciding that strangers may add rows.
  if not iam.has_access_for(v_user, 'record', v_table, 'admin'::public.permission_level) then
    raise exception 'You may not publish this form.'
      using errcode = '42501',
            hint = 'Publishing opens a write path for people with no account, so it needs the admin level on the Table the form writes into — the same level that decides who may reach the Table at all.';
  end if;

  v_at := case when p_published then now() else null end;
  update custom.anon_form
     set published_at = v_at,
         published_by = case when p_published then v_user else published_by end,
         closed_at    = case when p_published then null else now() end
   where organization_id = p_organization_id and id = p_form_id;
  return v_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.anon_token_issue(p_organization_id uuid, p_mode text, p_allowed_origins jsonb, p_form_id uuid DEFAULT NULL::uuid, p_saved_view_id uuid DEFAULT NULL::uuid, p_record_id uuid DEFAULT NULL::uuid, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(token_id uuid, secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user   uuid := custom.query_principal();
  v_table  uuid;
  v_secret text;
  v_id     uuid;
  v_n      integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_token_issue');
  if coalesce(p_mode, '') not in ('read', 'write') then
    raise exception 'custom.anon_token_issue: mode is read or write, not "%". A token carrying both would be one credential holding two decisions, and the second is always the one nobody meant to grant.', p_mode
      using errcode = '22023';
  end if;

  select count(*) into v_n from jsonb_array_elements_text(coalesce(p_allowed_origins, '[]'::jsonb));
  if v_n = 0 then
    -- An empty origin list is refused at ISSUE rather than silently meaning "everywhere".
    raise exception 'custom.anon_token_issue: name the origins this token works from.'
      using errcode = '22004',
            hint = 'An embed token with no origin list is a token that works from any page on the internet, including an attacker''s. Pass the exact origins, scheme and host and port: ["https://example.com"].';
  end if;

  if p_mode = 'write' then
    if p_form_id is null then
      raise exception 'custom.anon_token_issue: a write token must name the form it writes to'
        using errcode = '22004';
    end if;
    select f.table_id into v_table from custom.anon_form f
     where f.organization_id = p_organization_id and f.id = p_form_id and f.deleted_at is null;
    if v_table is null then
      raise exception 'custom.anon_token_issue: no form % in this organization', p_form_id
        using errcode = '23503';
    end if;
    if not iam.has_access_for(v_user, 'record', v_table, 'admin'::public.permission_level) then
      raise exception 'You may not issue a write token for this form.'
        using errcode = '42501',
              hint = 'Issuing a write token hands a stranger a way in, so it needs the admin level on the Table the form writes into.';
    end if;
  elsif p_record_id is not null then
    if not iam.has_access_for(v_user, 'record', p_record_id, 'admin'::public.permission_level) then
      raise exception 'You may not issue a read token for this record.'
        using errcode = '42501',
              hint = 'A read token lets anyone holding it read the record from an allowed origin, so issuing one needs the admin level on that record.';
    end if;
  end if;

  -- The secret is minted here and returned ONCE. Only its digest is stored, so a database read
  -- — a backup, a support query, a leaked dump — cannot produce a working token.
  v_secret := encode(gen_random_bytes(32), 'hex');
  insert into custom.anon_token (organization_id, form_id, saved_view_id, record_id, mode,
                                 secret_hash, allowed_origins, expires_at, created_by)
  values (p_organization_id, p_form_id, p_saved_view_id, p_record_id, p_mode,
          encode(digest(v_secret, 'sha256'), 'hex'),
          coalesce(p_allowed_origins, '[]'::jsonb), p_expires_at, v_user)
  returning id into v_id;

  token_id := v_id; secret := v_secret; return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.io_comment_resolve(p_organization_id uuid, p_comment_id uuid, p_resolved boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user   uuid := custom.query_principal();
  v_record uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_resolve');
  select c.record_id into v_record from custom.io_comment c
   where c.organization_id = p_organization_id and c.id = p_comment_id and c.deleted_at is null;
  if v_record is null then return false; end if;
  if not iam.has_access_for(v_user, 'record', v_record, 'commenter'::public.permission_level) then
    raise exception 'You may not resolve comments on this record.'
      using errcode = '42501',
            hint = 'Resolving is a commenter-level act on the record the comment is attached to.';
  end if;
  -- A resolved comment is STILL a comment and is still readable. Resolution hides a thread from
  -- the default list; it is not a delete wearing a friendlier word.
  update custom.io_comment
     set resolved_at = case when p_resolved then now() else null end,
         resolved_by = case when p_resolved then v_user else null end
   where organization_id = p_organization_id and id = p_comment_id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.io_comment_write(p_organization_id uuid, p_record_id uuid, p_body text, p_anchor jsonb DEFAULT '{}'::jsonb, p_parent_comment_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user  uuid := custom.query_principal();
  v_doc   jsonb;
  v_table uuid;
  v_id    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_write');
  if coalesce(btrim(coalesce(p_body, '')), '') = '' then
    raise exception 'custom.io_comment_write: a comment with no body is not a comment'
      using errcode = '22004';
  end if;

  -- THE LEVEL, AND IT IS THE ENUM DOING THE WORK. `commenter` is the second rung, so this one
  -- call admits commenters, editors and admins and refuses viewers — without a single string
  -- comparison and without a second access idea beside the platform's.
  if not iam.has_access_for(v_user, 'record', p_record_id, 'commenter'::public.permission_level) then
    raise exception 'You may read this record but not comment on it.'
      using errcode = '42501',
            hint = 'Commenting needs the commenter level on the record (viewer < commenter < editor < admin). Ask whoever shared it with you to raise your level; nothing about the record itself has to change.';
  end if;

  -- THE ONE READ DOOR. This used to select from custom.record directly. It was checked, so it
  -- did not leak — but a second reading path is a second place the door's masking does not
  -- apply, and that argument is exactly the one that failed for seo.keyword_value_map.
  v_doc := custom.read_record(p_organization_id, p_record_id, true);
  if v_doc is null then
    raise exception 'custom.io_comment_write: record % is not in this organization, or is deleted', p_record_id
      using errcode = '23503';
  end if;
  v_table := (v_doc ->> 'table_id')::uuid;

  if p_parent_comment_id is not null
     and not exists (select 1 from custom.io_comment c
                      where c.organization_id = p_organization_id
                        and c.id = p_parent_comment_id
                        and c.record_id = p_record_id
                        and c.deleted_at is null) then
    -- A reply to a comment on ANOTHER record would put one conversation in two places.
    raise exception 'custom.io_comment_write: comment % is not a comment on record %', p_parent_comment_id, p_record_id
      using errcode = '23503';
  end if;

  insert into custom.io_comment (organization_id, record_id, table_id, body, anchor,
                                 parent_comment_id, created_by)
  values (p_organization_id, p_record_id, v_table, btrim(p_body),
          coalesce(p_anchor, '{}'::jsonb), p_parent_comment_id, v_user)
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.io_comments(p_organization_id uuid, p_record_id uuid, p_include_resolved boolean DEFAULT false)
 RETURNS TABLE(id uuid, body text, anchor jsonb, parent_comment_id uuid, created_by uuid, created_at timestamp with time zone, resolved_at timestamp with time zone, resolved_by uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comments');
  -- Reading a comment needs only what reading the record needs. A viewer sees the conversation
  -- and cannot join it — which is exactly what the two rungs mean.
  if not iam.has_access_for(custom.query_principal(), 'record', p_record_id, 'viewer'::public.permission_level) then
    return;
  end if;
  return query
    select c.id, c.body, c.anchor, c.parent_comment_id, c.created_by, c.created_at,
           c.resolved_at, c.resolved_by
      from custom.io_comment c
     where c.organization_id = p_organization_id
       and c.record_id = p_record_id
       and c.deleted_at is null
       and (p_include_resolved or c.resolved_at is null)
     order by c.created_at, c.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.io_restore(p_organization_id uuid, p_record_id uuid, p_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user uuid := custom.query_principal();
  v_doc  jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_restore');
  -- Restoring REWRITES the record, so it needs the level that may rewrite it. A commenter who
  -- could restore would be able to change every value on the record without being allowed to
  -- change one.
  if not iam.has_access_for(v_user, 'record', p_record_id, 'editor'::public.permission_level) then
    raise exception 'You may not restore this record to an earlier version.'
      using errcode = '42501',
            hint = 'Restoring rewrites every value on the record, so it needs the editor level — the same level that lets you change one of them by hand.';
  end if;
  if p_version is null then
    raise exception 'custom.io_restore: name the version to restore. custom.io_revisions(organization, record) lists them with a sentence each.'
      using errcode = '22004';
  end if;

  -- The store's own restore, NOT a second one. It rewrites through the record's normal write
  -- path, so the restore gets its own version, its own history row and its own outbox event —
  -- which is what makes a restore undoable by the same mechanism that made it possible.
  perform history.snapshot_restore(p_organization_id, p_record_id, p_version);

  -- Read back through THE ONE READ DOOR, not out of custom.record.
  v_doc := custom.read_record(p_organization_id, p_record_id, true);
  return (v_doc ->> 'version')::integer;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.io_revisions(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(version integer, changed_at timestamp with time zone, changed_by uuid, summary text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_revisions');
  if not iam.has_access_for(custom.query_principal(), 'record', p_record_id, 'viewer'::public.permission_level) then
    return;
  end if;
  -- `history.record_versions` is the store's own chain. This wraps it so a person is told what
  -- each version IS before they are asked to choose one — "restore to version 7" with no
  -- sentence beside it is a button nobody can press responsibly.
  -- `history.record_versions` answers (version, operation, occurred_at, actor_id, row_data).
  -- The previous document is the PRECEDING version's, read with a window rather than a
  -- self-join, so a record with two hundred versions costs one pass.
  return query
    select v.version, v.occurred_at, v.actor_id,
           format('version %s, %s, %s, %s field(s) changed',
                  v.version, v.operation,
                  to_char(v.occurred_at, 'YYYY-MM-DD HH24:MI'),
                  jsonb_array_length(custom.io_changed_field_ids(
                    p_organization_id, null,
                    coalesce(v.previous_data, '{}'::jsonb),
                    coalesce(v.row_data -> 'data', '{}'::jsonb))))
      from (select rv.version, rv.operation, rv.occurred_at, rv.actor_id, rv.row_data,
                   lag(rv.row_data -> 'data') over (order by rv.version) as previous_data
              from history.record_versions(p_organization_id, p_record_id) rv) v
     order by v.version desc;
end;
$function$
;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
