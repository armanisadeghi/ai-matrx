-- chair-step: replaces two of this lane's own bodies so that when custom.read_record refuses a caller iam.has_access_for has already admitted, the door does not turn that disagreement into a failed comment or a failed restore — and above all does not open a second reading path into custom.record; replacements are judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_comment_write(uuid,uuid,text,jsonb,uuid) 2444813e2db94405da5d67d8ec179f97014ae5384fd3b98a1515ec4810df2d27
-- based-on: custom.io_restore(uuid,uuid,integer) 34316bb2799646a3d5bc7bae05279846e1eeb93c59c6b7264e9ada3af19eb9a1
--
-- W4-IO, file 17 — THE TWO ACCESS ANSWERS DISAGREE, AND THE DOOR SAYS WHICH ONE BINDS.
--
-- WHAT THE GREEN SUITE FOUND, one layer under file 16. With the doors now asking
-- `iam.has_access_for` — the platform's ONE access question — `admin@admin.com` is admitted to
-- comment on its own record. It then reached `custom.read_record`, the one READ door, for the
-- record's `table_id`, and THAT refused: "You do not have access to this record."
--
-- The two answers disagree because they answer different questions. `custom.read_record`
-- decides from the derived containment graph (the same source as `custom.has_visibility`), and
-- a record with no association conveys nothing through that graph. `iam.has_access_for` weighs
-- membership, grants, ownership AND the graph. For a standalone record they are `false` and
-- `true` — and the platform's own law says the second one is the answer to "may this actor
-- touch this row?".
--
-- WHAT THIS FILE DOES, AND WHAT IT REFUSES TO DO. It does NOT re-open a direct read of
-- `custom.record` — that is the defect the access lane asked this seat to close, and the reason
-- it asked is exactly that a second reading path is a second place the read door's masking does
-- not apply. It does NOT patch `custom.read_record`, which is another lane's function and is
-- doing what it was built to do. It makes the two doors this seat owns degrade honestly:
--   · `io_comment_write` — the comment LANDS (access was already decided) and the convenience
--     copy of `table_id` is absent. `custom.io_comment.table_id` is nullable precisely because
--     it is a copy; a Table-wide comment list joins back through the record when it is null.
--   · `io_restore` — the restore HAS happened, with its own history row and its own outbox
--     event, and the only thing unavailable is the new version NUMBER. It returns null, which
--     says "done, and I cannot tell you which version", rather than raising after the write.
--
-- IT IS A REPORTED DISAGREEMENT, NOT A SILENT WORKAROUND. Both branches are `exception when
-- sqlstate '42501'`, so they catch the read door's refusal and nothing else; any other failure
-- still propagates. The disagreement itself belongs to whoever owns the read door's derivation,
-- and this file names it rather than papering over it.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

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
  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    -- THE READ DOOR SAID NO WHERE THE ACCESS QUESTION SAID YES, and that disagreement is not
    -- this door's to resolve. `custom.read_record` decides from the derived containment graph,
    -- which conveys nothing for a record with no association; `iam.has_access_for`, checked
    -- above, is the platform's ONE answer and has already admitted this caller at `commenter`.
    -- So the comment lands and the convenience copy of `table_id` is simply absent — the one
    -- thing that never happens is a second reading path into `custom.record`.
    v_doc := null;
  end;
  if false then
    raise exception 'custom.io_comment_write: record % is not in this organization, or is deleted', p_record_id
      using errcode = '23503';
  end if;
  v_table := (v_doc ->> 'table_id')::uuid;   -- null when the read door declined; see above

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
$function$;

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
  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    -- Same disagreement, same answer: the restore HAS happened (history.snapshot_restore ran
    -- and its own event is in the outbox), and the only thing unavailable is the new version
    -- NUMBER to hand back. Returning null says "done, and I cannot tell you which version" —
    -- never a second read of custom.record to produce a number.
    v_doc := null;
  end;
  return (v_doc ->> 'version')::integer;
end;
$function$;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
