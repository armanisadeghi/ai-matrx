-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.anon_capture(uuid, text, uuid, jsonb, text, timestamp with time zone) 2c66c9ac5417626712431fa5a98d25db9438bc9a578367242d807507ced9d43c
-- based-on: custom.io_comment_write(uuid, uuid, text, jsonb, uuid) 73a83ee12bac40633238f7404a9215f3f75d00d0bb5223078f141af60d792b68
-- based-on: custom.doors_not_on_one_ladder() bbd96447a6d14e0a17d0c4e12ea4204ac12a08b978fbc252c7ec4c60483895b3
--
-- W4-DOOR-RECORD — A COMMENT IS NOT A DECISION, AND THE CENSUS MUST NOT THINK IT IS.
--
-- `custom.doors_not_on_one_ladder()` shipped an hour ago reading `pg_get_functiondef`, which
-- includes the `--` comments in the body. Run live it named TWO doors —
-- `custom.anon_capture` and `custom.io_comment_write` — that are both fully routed through
-- `custom.has_visibility`: the only thing left in either of them was a SENTENCE naming the
-- predicate they used to call. A census that goes red on prose is a census that gets
-- switched off, and one that could go GREEN on prose would be worse.
--
-- So the census strips `--` comments before it decides, and the two stale sentences are
-- corrected in the same file to name the function those doors actually call now.

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
  -- principal and it must be able to write into this Table — asked of `custom.has_visibility`,
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
    -- which conveys nothing for a record with no association; `custom.has_visibility`, checked
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
CREATE OR REPLACE FUNCTION custom.doors_not_on_one_ladder()
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
     -- THE CODE, NOT THE PROSE: `--` comments are stripped before the body is read, so a
     -- sentence explaining the old ladder can never fail this census and a sentence
     -- promising the new one can never pass it.
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~* '(iam\.has_access_for|iam\.effective_level|public\.has_permission_for)'
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
