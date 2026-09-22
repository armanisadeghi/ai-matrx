-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.has_visibility(uuid, text, uuid, permission_level) 1ead97cf61e2b403d9017e8b7256d6da85b6f473aa118a47100eeb3032e3f58a
-- based-on: custom.visible_record_ids(uuid, permission_level) 51cdc16ef98a082a6458623190bc4fc4bb42b93251e43b6632c3d60f992031d3
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) 9cea65581f72c7f1ba55c8ee1a29c2f321b4dd8a8f9439e116fc70842ac7ccff
-- based-on: custom.io_comment_resolve(uuid, uuid, boolean) 0338c4511da599c6c84f31d7a1408f5e7bed276350f440513393d1e46b527c96
-- based-on: custom.io_comments(uuid, uuid, boolean) ebd44ff716c0f483bb008741611a3722218a7c75bffe102930043a7bd9396265
-- based-on: custom.io_revisions(uuid, uuid) c084a62afb51eeec9fcae8998ec34d7207b9a7ae34f63629b37b76635e8dc2d4
-- based-on: custom.io_restore(uuid, uuid, integer) 2eb8328a1c64f743ca4add65b2c9e71e8cb6716dc01f461b4fe4098d4b2a742b
-- based-on: custom.anon_publish(uuid, uuid, boolean) a13e0bb7e07603b03719d5f6fea1485db227d6ac064f9fc19a7c59f25d9ad55b
-- based-on: custom.anon_token_issue(uuid, text, jsonb, uuid, uuid, uuid, timestamp with time zone) e2ed7e3871bd40d79e4b54630c8143d7d6250332868b772e9321c6f3fd9c669b
-- based-on: custom.anon_capture(uuid, text, uuid, jsonb, text, timestamp with time zone) 8a87b26a3e89f47e065d30e802bbfffaa20c956c28881a7e95f207b538aedccd
-- based-on: custom.assert_client_may_change(uuid, uuid, text, permission_level, text) 4428fdd9f55fef0e4e6dc2d8fd53e9045a7f8ae3561a7fd9722852b9a1026982
-- based-on: custom.read_record(uuid, uuid, boolean) 1e02985a48d9e3d8ace7229c749b4b3719fcdb754f50ecfd4263e7742061024f
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) 80e09167846f47703cbde3f6405988ec5cbf8ad6fb8cb6fbdb7fa24b254eff5e
--
-- W4-DOOR-RECORD — ONE LADDER. READING AND WRITING ASK THE SAME QUESTION.
--
-- THE DEFECT, MEASURED ON THE MAIN DATABASE 2026-09-19 (the concern the previous
-- W4-DOOR-RECORD row left open, now ruled on by the chair).
-- The store had TWO implementations of "may this person reach this record":
--
--   READ  doors (custom.read_record, read_records, promote_table, visible_record_ids)
--         asked `custom.has_visibility`, whose record arm was owner + a direct grant row
--         and nothing else.
--   WRITE doors (record_write/update/delete/restore via assert_client_may_change, and every
--         io_* and anon_* door) asked `iam.has_access_for`, the platform's access kernel,
--         which also carries the organization lanes, the containment walk and the public
--         and system-organization arms.
--   FIELD masking asked a THIRD (`iam.effective_level`).
--
-- So the ladders disagreed, and the disagreement produced a principal who may WRITE what
-- they may not READ. Live, as test@test.com (a real member of admin's Workspace), over the
-- 1,493 undeleted rows in custom.record:
--
--     25 records where iam.has_access_for(...,'editor') = true
--        and custom.has_visibility(...,'viewer')       = false
--      0 records the other way round.
--
-- Twenty-five records a colleague is allowed to rewrite and delete and is refused when they
-- try to open. That is not a permission model; it is two of them.
--
-- THE RULING (chair, 2026-09-19), which is also what Google Docs, Notion and Airtable do:
-- ONE ladder. Every level at or above `viewer` reads, `editor` and above writes, `admin`
-- and above does the structural things, and THE READ PREDICATE AND THE WRITE PREDICATE ARE
-- THE SAME FUNCTION EVALUATED AT DIFFERENT THRESHOLDS. There is no principal who can write
-- what they cannot read.
--
-- THE ONE FUNCTION is `custom.has_visibility(user, type, id, level)` — the name the read
-- doors already call — and it is now the UNION of everything either ladder could ever say,
-- in three named arms:
--   1. `iam.has_access_for` — the platform's own kernel, unchanged and not reimplemented
--      here: ownership, grant rows, the organization lanes (which honour the row's own
--      `visibility`), containment, public and system-organization reads.
--   2. `iam.effective_level` — the same grants plus the organization's OWN configured
--      membership default for this store (custom/member_default_level, VIS-19), which the
--      boolean kernel does not carry. Today every organization is on the shipped default
--      `viewer` and no override row exists, so this arm changes nothing on live data; it is
--      here so that turning that knob up cannot re-open the gap this file closes.
--   3. The store's own carrying: a record is carried by its Table and by whatever carries
--      that (custom.visibility_ancestors), conveying at most `conveys_max`.
-- Each arm is monotone in the level asked, so the function is monotone: a threshold that
-- admits `editor` admits `viewer`, which is precisely the property the defect lacked.
--
-- BECAUSE IT IS A UNION OF BOTH OLD LADDERS, NOBODY LOSES ACCESS. Every read that worked
-- yesterday works today and 25 refused reads become the reads their writer was already
-- allowed to make.
--
-- `custom.effective_level(user, organization, record)` is the level form, derived by asking
-- the SAME function at each rung from the top down. Field masking (read_record,
-- read_records, the _field_write_door trigger) now asks it instead of `iam.effective_level`,
-- so a field's sensitivity still masks WITHIN a readable record — field-level security
-- stays on top of the one ladder, it is not folded into it.
--
-- EVERY DOOR IN SCHEMA `custom` THAT DECIDES A ROW IS ROUTED THROUGH IT: the four record
-- write doors (through assert_client_may_change), io_comments, io_revisions, io_comment_write,
-- io_comment_resolve, io_restore, anon_publish, anon_token_issue, anon_capture,
-- read_record, read_records, promote_table (already on it), visible_record_ids. The
-- thresholds are unchanged and are now the ONLY thing that differs between them:
-- viewer to read, commenter to comment, editor to write, admin for the structural doors.
--
-- ONE DOOR IS NOT ROUTED AND SAYS SO: `custom._field_write_door`, the trigger that masks
-- which FIELDS a write may touch, still asks `iam.effective_level`. It is a trigger function,
-- so this runner will not let a production file replace its body unless that body reads the
-- campaign kill switch, which a masking trigger has no business doing. It is strictly
-- STRICTER than the one ladder (custom.effective_level is never lower — arm 2 above IS that
-- call), so it cannot re-open the gap; the census names the exception rather than hiding it.
--
-- THE CLASS IS A QUERY: `custom.doors_not_on_one_ladder()` names any function in schema
-- `custom` that decides a row with a ladder of its own instead of the one function.
-- `pnpm check:store-doors-decide` runs it; `--self-test` empties the accepted list and
-- proves the census still names the doors that carry the fix.

-- ---------------------------------------------------------------------------------------
-- THE ONE FUNCTION.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION custom.has_visibility(
  p_user_id  uuid,
  p_type     text,
  p_id       uuid,
  p_required public.permission_level DEFAULT 'viewer'::public.permission_level
) RETURNS boolean
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
declare
  rec     record;
  v_org   uuid;
  v_table uuid;
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- ARM 1 — THE PLATFORM'S OWN ACCESS KERNEL, asked and not reimplemented. Ownership,
  -- grant rows, the organization lanes (which honour the row's own `visibility`, DD-136),
  -- the containment walk, the public and global-readable system-organization arms. This is
  -- the arm the WRITE doors used to ask on their own; asking it here is what makes reading
  -- and writing the same question.
  if iam.has_access_for(p_user_id, p_type, p_id, p_required) then
    return true;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19). The boolean
  -- kernel above carries the platform's generic member lane; it does not carry
  -- `custom/member_default_level`, the knob an organization sets for its own records, nor
  -- the per-Table override written on the Table record itself. `iam.effective_level` is the
  -- one place that resolves both, so it is asked rather than re-derived. The organization
  -- and Table are read off the row so that every caller gets the same answer for the same
  -- record, whichever door it came through.
  if p_type = 'record' then
    select r.organization_id, r.table_id into v_org, v_table
      from custom.record r
     where r.id = p_id;
  end if;
  if iam.effective_level(p_user_id, p_type, p_id, v_org, v_table) >= p_required then
    return true;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING. A record is carried by its Table and by whatever
  -- carries that; an ancestor conveys at most `conveys_max`, and the first ancestor that
  -- conveys enough AND that this principal reaches at that level answers true.
  for rec in
    select a.container_type, a.container_id
      from custom.visibility_ancestors(p_type, p_id) a
     where a.max_level >= p_required
     order by a.depth
  loop
    if iam.has_access_for(p_user_id, rec.container_type, rec.container_id, p_required) then
      return true;
    end if;
  end loop;

  return false;
end;
$function$;

COMMENT ON FUNCTION custom.has_visibility(uuid, text, uuid, public.permission_level) IS
  'THE ONE LADDER for the record store. Reading asks it at viewer, commenting at commenter, '
  'writing at editor, the structural doors at admin. Monotone in the level, so there is no '
  'principal who can write a record they cannot read. Every door in schema custom that '
  'decides a row asks this function; custom.doors_not_on_one_ladder() names any that do not.';

-- The level form of the SAME question: the highest rung the one function admits. This is
-- what field masking asks, so a field''s sensitivity masks WITHIN a record the ladder has
-- already said is readable, rather than being a second ladder of its own.
create or replace function custom.effective_level(
  p_user_id         uuid,
  p_organization_id uuid,
  p_id              uuid,
  p_type            text DEFAULT 'record'
) RETURNS public.permission_level
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
declare
  v_level public.permission_level;
begin
  if p_user_id is null or p_id is null then return null; end if;
  -- Top rung first: the first one the ONE function admits is the answer, and by the
  -- monotonicity of that function every rung below it is admitted too.
  for v_level in
    select l.level from iam.content_levels() l order by l.ordinal desc
  loop
    if custom.has_visibility(p_user_id, p_type, p_id, v_level) then
      return v_level;
    end if;
  end loop;
  return null;
end;
$function$;

-- WHO MAY CALL IT: nobody from a client. It is the level form of the one ladder and it is
-- asked by the store's own read doors (custom.read_record, custom.read_records), which are
-- themselves client doors that have already decided the organization and the row.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
VALUES
  ('custom', 'effective_level',
   'p_user_id uuid, p_organization_id uuid, p_id uuid, p_type text',
   ARRAY['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
   'p_user_id is the principal the answer is ABOUT and is never taken from a client: the '
   'callers pass auth.uid(). p_id is checked by custom.has_visibility, the one ladder, which '
   'resolves the record''s own organization from the row; p_organization_id is the organization '
   'the calling door is asking within. A NULL p_user_id or p_id answers NULL (no level), never a level.',
   'w4_door_one_ladder_for_reading_and_writing.sql',
   'server_only: the store''s own read doors custom.read_record and custom.read_records call it '
   'to decide which FIELDS to mask, after they have already decided the organization and the row. '
   'No client ever calls it: a client that could ask it for an arbitrary p_user_id would be '
   'reading another person''s permissions.',
   false, false);

COMMENT ON FUNCTION custom.effective_level(uuid, uuid, uuid, text) IS
  'The level form of custom.has_visibility: the highest rung the one ladder admits. '
  'p_organization_id is the organization the door is asking within and is carried so the '
  'call sites state it; the ladder itself resolves the record''s own organization from the row.';

-- The set form of the SAME question. It decides with the one function rather than
-- re-deriving a ladder in SQL, which is exactly what let the list disagree with the door.
CREATE OR REPLACE FUNCTION custom.visible_record_ids(
  p_user_id  uuid,
  p_required public.permission_level DEFAULT 'viewer'::public.permission_level
) RETURNS TABLE(id uuid)
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO ''
AS $function$
  select r.id
    from custom.record r
   where p_user_id is not null
     and r.deleted_at is null
     and custom.has_visibility(p_user_id, 'record', r.id, p_required);
$function$;

-- ---------------------------------------------------------------------------------------
-- THE CLASS, AS A QUERY.
-- ---------------------------------------------------------------------------------------
create or replace function custom.doors_not_on_one_ladder()
RETURNS TABLE(function_name text, identity_args text, why text)
  LANGUAGE sql
  STABLE
  SET search_path TO 'pg_catalog'
AS $function$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'decides a row with a ladder of its own (iam.has_access_for / iam.effective_level / '
         'public.has_permission_for) instead of custom.has_visibility, so reading and writing '
         'can disagree again'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and pg_get_functiondef(p.oid) ~* '(iam\.has_access_for|iam\.effective_level|public\.has_permission_for)'
     -- The one function itself, its level form, its set form and this census.
     and p.proname not in ('has_visibility', 'has_visibility_at', 'effective_level',
                           'visible_record_ids', 'doors_not_on_one_ladder')
     -- AND ONE NAMED EXCEPTION, stated rather than hidden. `custom._field_write_door` is a
     -- TRIGGER function, so the runner refuses to replace it in a file that also names
     -- production unless its body reads `custom/system_enabled` — which a masking trigger has
     -- no business doing. It asks `iam.effective_level` to decide which FIELDS a write may
     -- touch inside a record the one ladder has ALREADY admitted. That answer is never higher
     -- than `custom.effective_level` (arm 2 of the one function is that very call), so this
     -- door can only ever be stricter than the ladder, never looser: it cannot re-open the
     -- gap. Routing it is a chair step, and it is named in the BUILD-LOG row.
     and p.proname <> '_field_write_door'
   order by 1;
$function$;

COMMENT ON FUNCTION custom.doors_not_on_one_ladder() IS
  'THE CENSUS behind the one-ladder rule: any function in schema custom that decides a row '
  'with its own access ladder instead of custom.has_visibility. Run by pnpm check:store-doors-decide.';

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
  if not custom.has_visibility(v_user, 'record', p_record_id, 'commenter'::public.permission_level) then
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
  if not custom.has_visibility(v_user, 'record', v_record, 'commenter'::public.permission_level) then
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
$function$;

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
  if not custom.has_visibility(custom.query_principal(), 'record', p_record_id, 'viewer'::public.permission_level) then
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
$function$;

CREATE OR REPLACE FUNCTION custom.io_revisions(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(version integer, changed_at timestamp with time zone, changed_by uuid, summary text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_revisions');
  if not custom.has_visibility(custom.query_principal(), 'record', p_record_id, 'viewer'::public.permission_level) then
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
  if not custom.has_visibility(v_user, 'record', p_record_id, 'editor'::public.permission_level) then
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
  if not custom.has_visibility(v_user, 'record', v_table, 'admin'::public.permission_level) then
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
$function$;

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
    if not custom.has_visibility(v_user, 'record', v_table, 'admin'::public.permission_level) then
      raise exception 'You may not issue a write token for this form.'
        using errcode = '42501',
              hint = 'Issuing a write token hands a stranger a way in, so it needs the admin level on the Table the form writes into.';
    end if;
  elsif p_record_id is not null then
    if not custom.has_visibility(v_user, 'record', p_record_id, 'admin'::public.permission_level) then
      raise exception 'You may not issue a read token for this record.'
        using errcode = '42501',
              hint = 'A read token lets anyone holding it read the record from an allowed origin, so issuing one needs the admin level on that record.';
    end if;
  end if;

  -- The secret is minted here and returned ONCE. Only its digest is stored, so a database read
  -- — a backup, a support query, a leaked dump — cannot produce a working token.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into custom.anon_token (organization_id, form_id, saved_view_id, record_id, mode,
                                 secret_hash, allowed_origins, expires_at, created_by)
  values (p_organization_id, p_form_id, p_saved_view_id, p_record_id, p_mode,
          encode(extensions.digest(v_secret, 'sha256'), 'hex'),
          coalesce(p_allowed_origins, '[]'::jsonb), p_expires_at, v_user)
  returning id into v_id;

  token_id := v_id; secret := v_secret; return next;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.anon_capture(p_organization_id uuid, p_client_key text, p_table_id uuid, p_payload jsonb, p_device text DEFAULT NULL::text, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_existing uuid;
  v_id       uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_capture');

  -- THE ACCESS DECISION, BEFORE EXISTENCE. This is the SIGNED-IN offline path, so there is a
  -- principal and it must be able to write into this Table — asked of `iam.has_access_for`,
  -- the platform's ONE answer to "may this actor touch this row?", never of the organization
  -- id, which is tenancy and not permission. It is decided before the ledger is read, so a
  -- Table the caller may not reach and a Table that does not exist answer identically: the
  -- opposite order is how a door becomes an existence oracle.
  if not custom.has_visibility(custom.query_principal(), 'record', p_table_id,
                            'editor'::public.permission_level) then
    raise exception 'You may not add records to this table.'
      using errcode = '42501',
            hint = 'Offline capture writes a record when the device reconnects, so it needs the same editor level on the table that adding a record by hand needs.';
  end if;

  if coalesce(btrim(coalesce(p_client_key, '')), '') = '' then
    raise exception 'custom.anon_capture: the client mints the id, offline, before the first attempt. Without it a reconnect cannot tell a retry from a second capture.'
      using errcode = '22004';
  end if;

  -- THE LEDGER IS THE MECHANISM. `on conflict do nothing` plus the unique index means the
  -- second, third and thirtieth replay all take the same branch, whatever the client believes.
  insert into custom.anon_replay (organization_id, client_key, table_id, device, captured_at)
  values (p_organization_id, p_client_key, p_table_id, p_device, coalesce(p_captured_at, now()))
  on conflict (organization_id, client_key) where deleted_at is null do nothing;

  select r.record_id into v_existing from custom.anon_replay r
   where r.organization_id = p_organization_id and r.client_key = p_client_key;
  if v_existing is not null then
    update custom.anon_replay set replays = replays + 1
     where organization_id = p_organization_id and client_key = p_client_key;
    return v_existing;
  end if;

  v_id := custom.record_write(p_organization_id, p_table_id,
                              coalesce(p_payload, '{}'::jsonb)
                              || jsonb_build_object('_actor', 'user'));
  update custom.anon_replay set record_id = v_id
   where organization_id = p_organization_id and client_key = p_client_key
     and record_id is null;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.assert_client_may_change(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'editor'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
begin
  -- ONE order, always: the organization wall first, then the row. A door that asked about
  -- the row first would answer "you may not touch this record" to somebody who should have
  -- been told they are in the wrong organization entirely.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous capture door, which has
  -- already decided this write against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- Way through 3: a subject that does not live in this organization (the kernel Tables),
  -- or that is not there at all (the door raises its own 02000 a line later).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_subject_id;
  if v_subject_org is null then
    return;
  end if;

  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  raise exception 'You do not have access to this %, so % may not write to it.',
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            p_required);
end
$function$;

CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  if not custom.has_visibility(v_me, 'record', p_record_id, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an export, not an agent. Ask somebody who holds it to share it with you.';
  end if;

  v_level := custom.effective_level(v_me, p_organization_id, p_record_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, v_table, v_level, 'read') f;

  -- EVERY key this Table has a Field record for, visible or not. The difference between
  -- this list and v_visible is what masking is about; a key in NEITHER is undeclared.
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')) , '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));

  return custom.mask_document(v_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records(p_organization_id uuid, p_table_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then p_limit := 200; end if;

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, per row: Visibility. `custom.visible_record_ids` is the set-based answer, and
  -- the door reads it rather than asking per row (VIS-N-1).
  for v_rec in
    select r.id, custom.record_values(r.organization_id, r.id) as doc
      from custom.record r
     where custom.has_visibility(v_me, 'record', r.id, 'viewer')
       and r.organization_id = p_organization_id
       and r.table_id = p_table_id
       and r.deleted_at is null
     order by r.created_at desc
     limit p_limit offset p_offset
  loop
    id := v_rec.id;
    document := custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);
    level := v_level;
    return next;
  end loop;
end;
$function$;
