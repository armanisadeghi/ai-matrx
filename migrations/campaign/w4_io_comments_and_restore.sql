-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- W4-IO, file 4 — RECORD COMMENTS AT THE `commenter` LEVEL, AND REVISION RESTORE.
--
-- DOOR-15 (record comments) · DOOR-16 (revision history with restore).
--
-- `commenter` IS A REAL LEVEL AND THIS FILE USES IT AS ONE. `public.permission_level` on this
-- database reads `viewer, commenter, editor, admin` in that order, so "may comment" is not a
-- new idea needing a new mechanism: it is the second rung, and the enum's ORDER is the whole
-- implementation. A person who may comment may not edit; a person who may edit may comment,
-- because `editor >= commenter` is true of the enum itself. Nothing here compares strings.
--
-- WHY A COMMENT IS NOT A VALUE. Notion's page-, block- and text-level comments are ONE
-- mechanism at three anchors, which is why `anchor` is a column and not three tables. But a
-- comment is not a Value in this store, and the four reasons are checkable rather than
-- stylistic: it is not typed by a Field, it takes no part in validation, it never rolls up,
-- and it is written at a level BELOW the one that may change the record. Putting it in the
-- document would make all four sentences false and would mean a commenter could write into
-- `custom.record`.
--
-- DOOR-16, AND WHAT WAS ACTUALLY BROKEN. The contract's measurement is that `version_restore`
-- raised "nothing to restore (no content columns)" for every document-shaped record, because
-- it looked for CONTENT COLUMNS and a record of this store keeps everything in one `data`
-- document. `history.snapshot_restore(organization_id, record_id, version)` is the store's own
-- restore and it does work on documents. So restore here is not a second restore: it is the
-- door in front of that one — it decides WHO may restore, it names the version in a sentence a
-- person can check before they press it, and it goes through `custom.record_update` so the
-- restore is itself a versioned change with its own history row and its own outbox event.
-- A restore that rewrote the row silently would be the one edit in the system with no undo.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── DOOR-15: writing a comment ───────────────────────────────────────────────
create or replace function custom.io_comment_write(p_organization_id uuid,
                                        p_record_id uuid,
                                        p_body text,
                                        p_anchor jsonb default '{}'::jsonb,
                                        p_parent_comment_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user  uuid := custom.query_principal();
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
  if not custom.has_visibility(v_user, 'record', p_record_id, 'commenter'::permission_level) then
    raise exception 'You may read this record but not comment on it.'
      using errcode = '42501',
            hint = 'Commenting needs the commenter level on the record (viewer < commenter < editor < admin). Ask whoever shared it with you to raise your level; nothing about the record itself has to change.';
  end if;

  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_table is null then
    raise exception 'custom.io_comment_write: record % is not in this organization, or is deleted', p_record_id
      using errcode = '23503';
  end if;

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
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_comment_write',
        'p_organization_id uuid, p_record_id uuid, p_body text, p_anchor jsonb, p_parent_comment_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_record_id is checked by custom.has_visibility(principal, ''record'', p_record_id, ''commenter'') — the record''s own access decision, for the calling principal, at the second rung; a record the caller cannot reach at commenter level is refused by name. p_parent_comment_id must already be a comment on THAT record (organization, id and record_id all matched) or it is refused. A NULL record id fails the visibility check and is refused.',
        'w4_io_comments_and_restore.sql',
        null, true, false)
on conflict do nothing;

-- ── resolving, which does not delete ─────────────────────────────────────────
create or replace function custom.io_comment_resolve(p_organization_id uuid,
                                          p_comment_id uuid,
                                          p_resolved boolean default true)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user   uuid := custom.query_principal();
  v_record uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comment_resolve');
  select c.record_id into v_record from custom.io_comment c
   where c.organization_id = p_organization_id and c.id = p_comment_id and c.deleted_at is null;
  if v_record is null then return false; end if;
  if not custom.has_visibility(v_user, 'record', v_record, 'commenter'::permission_level) then
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
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_comment_resolve',
        'p_organization_id uuid, p_comment_id uuid, p_resolved boolean',
        array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_comment_id is resolved to its record inside this organization only, and the caller is then checked by custom.has_visibility(principal, ''record'', that record, ''commenter''); a comment id from another tenant reads as absent and returns false rather than raising, because "not yours" and "not there" must look the same from outside.',
        'w4_io_comments_and_restore.sql',
        null, true, false)
on conflict do nothing;

-- ── reading a record's comments, through the record's own visibility ─────────
create or replace function custom.io_comments(p_organization_id uuid,
                                   p_record_id uuid,
                                   p_include_resolved boolean default false)
returns table(id uuid, body text, anchor jsonb, parent_comment_id uuid,
              created_by uuid, created_at timestamptz,
              resolved_at timestamptz, resolved_by uuid)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_comments');
  -- Reading a comment needs only what reading the record needs. A viewer sees the conversation
  -- and cannot join it — which is exactly what the two rungs mean.
  if not custom.has_visibility(custom.query_principal(), 'record', p_record_id, 'viewer'::permission_level) then
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
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_comments',
        'p_organization_id uuid, p_record_id uuid, p_include_resolved boolean',
        array['uuid'::regtype, 'uuid'::regtype, 'boolean'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_record_id is checked by custom.has_visibility(principal, ''record'', p_record_id, ''viewer''): a caller who cannot read the record gets an EMPTY set, never an error, so the function never confirms a record exists to someone who may not see it. A NULL record id fails that check and returns nothing.',
        'w4_io_comments_and_restore.sql',
        null, true, false)
on conflict do nothing;

-- ── DOOR-16: what there is to restore, said before anything is pressed ───────
create or replace function custom.io_revisions(p_organization_id uuid, p_record_id uuid)
returns table(version integer, changed_at timestamptz, changed_by uuid, summary text)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_revisions');
  if not custom.has_visibility(custom.query_principal(), 'record', p_record_id, 'viewer'::permission_level) then
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
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_revisions',
        'p_organization_id uuid, p_record_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_record_id is checked by custom.has_visibility(principal, ''record'', p_record_id, ''viewer'') and an unreachable record returns an EMPTY set rather than an error, so history never confirms a record exists to someone who may not see it. NULL fails that check and returns nothing.',
        'w4_io_comments_and_restore.sql',
        null, true, false)
on conflict do nothing;

-- ── DOOR-16: the restore itself, and it is a versioned change like any other ──
create or replace function custom.io_restore(p_organization_id uuid,
                                  p_record_id uuid,
                                  p_version integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_user uuid := custom.query_principal();
  v_new  integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_restore');
  -- Restoring REWRITES the record, so it needs the level that may rewrite it. A commenter who
  -- could restore would be able to change every value on the record without being allowed to
  -- change one.
  if not custom.has_visibility(v_user, 'record', p_record_id, 'editor'::permission_level) then
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
  select r.version into v_new from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  return v_new;
end;
$fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_restore',
        'p_organization_id uuid, p_record_id uuid, p_version integer',
        array['uuid'::regtype, 'uuid'::regtype, 'integer'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door on entry; NULL is refused there. p_record_id is checked by custom.has_visibility(principal, ''record'', p_record_id, ''editor'') — the EDITOR rung, not viewer and not commenter, because a restore rewrites every value; an unreachable record is refused by name. p_version NULL is refused by name rather than defaulting to anything, because "restore" with no version named is the one call that must never guess.',
        'w4_io_comments_and_restore.sql',
        null, true, false)
on conflict do nothing;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
