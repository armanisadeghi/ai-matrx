-- lane: ARGS-RULED
--
-- chair-step: it REPLACES the live body of custom.io_comment_write. Nothing else changes.
--   Inverse: migrations/inverse/argsruled_the_comment_refusal_comes_first_down.sql.
--
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) ac975fb938814dd98b15bd88e377b32693bf4a961989ca733289a007c0affd13
--
-- ARGS-RULED — THE NAMED REFUSAL HAS TO COME BEFORE THE CONVENIENCE READ.
--
-- argsruled_a_comment_is_filed_where_its_record_lives.sql put the organization derivation AFTER
-- the `custom.read_record` call this door makes for the convenience copy of `table_id`. That read
-- is wrapped in a handler that catches 42501 only — and since
-- argsruled_four_arguments_in_the_store.sql `custom.read_record` decides the ORGANIZATION WALL
-- first, so the mismatch case now dies inside that read with whatever sentence the wall or the
-- 02000 gives, instead of the one this door wrote for it. Measured by the seat suite:
-- "There is no record c105031d-… in this organization." — true, unhelpful, and not the refusal
-- that names which organization the record actually belongs to.
--
-- The derivation moves ABOVE the read. It is the same bytes, in the right order: decide, then
-- fetch a convenience. Nothing else in the body changes.

set lock_timeout = '4s';

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
  v_org_of_record uuid;
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
    -- 🚨 AND THE SENTENCE MATCHES THE FACT (lane LEAK-T10, 2026-09-20). This refusal used to
    -- tell EVERYBODY "You may read this record but not comment on it" — including somebody who
    -- may not read it at all, who was thereby told she holds a level she does not hold AND told
    -- that the record exists. A refusal that asserts something about the caller has to have
    -- established it, so the lower rung is asked before the sentence is chosen. `viewer` is one
    -- more ladder call, on the refusal path only, which nothing hot runs.
    if custom.has_visibility(v_user, 'record', p_record_id, 'viewer'::public.permission_level) then
      raise exception 'You may read this record but not comment on it.'
        using errcode = '42501',
              hint = 'Commenting needs the commenter level on the record (viewer < commenter < editor < admin). Ask whoever shared it with you to raise your level; nothing about the record itself has to change.';
    end if;
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'REC-29 / VIS-1: this is the same answer every other door gives about a record you do not hold, and it is deliberately the same whether the record exists or not. Ask whoever owns it to share it with you at the commenter level.';
  end if;

  -- ARGS-RULED (2026-09-21). THE ORGANIZATION IS THE RECORD'S, AND IT IS NEVER THE CALLER'S TO
  -- CHOOSE. `p_organization_id` was written straight onto the comment row while the access
  -- decision above is asked about the RECORD and knows nothing about organizations — so a
  -- comment could be filed under one organization while the record it hangs off lives in
  -- another, and every org-scoped reader of custom.io_comment (io_comments, io_comment_resolve,
  -- the counts on a record's screen) would then disagree about whether that conversation exists.
  -- Census on the day of this fix: 36 comments, 0 mis-filed. This is the door that could have
  -- made one, closed before it did.
  v_org_of_record := custom._organization_of_record(p_record_id);
  if v_org_of_record is null then
    -- The dead branch this replaces. `if false then …` had been unreachable since the read door
    -- was allowed to decline, so a comment on a record that no longer exists was simply written.
    raise exception 'custom.io_comment_write: record % is not in this organization, or is deleted', p_record_id
      using errcode = '23503';
  end if;
  if v_org_of_record <> p_organization_id then
    raise exception 'That record belongs to a different organization, so the comment was not written.'
      using errcode = '23514',
            hint = format('A comment is filed where its record lives. This record belongs to organization %s; you named %s. Switch to that organization and comment there — being shared a record does not move it.',
                          v_org_of_record, p_organization_id);
  end if;

  -- THE ONE READ DOOR. This used to select from custom.record directly. It was checked, so it
  -- did not leak — but a second reading path is a second place the door's masking does not
  -- apply, and that argument is exactly the one that failed for seo.keyword_value_map.
  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    -- THE READ DOOR SAID NO WHERE THE ACCESS QUESTION SAID YES, and that disagreement is not
    -- this door's to resolve. `custom.read_record` decides from the derived containment graph,
    -- which conveys nothing for a record with no association; `custom.has_visibility`, checked
    -- above, is the platform's ONE answer and has already admitted this caller at `commenter`.
    -- So the comment lands and the convenience copy of `table_id` is simply absent — the one
    -- thing that never happens is a second reading path into `custom.record`.
    v_doc := null;
  end;
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
$function$
;
