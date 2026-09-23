-- additive: yes
--
-- chair-step: it CREATES two functions, `custom.relation_kernel_record(uuid, uuid, uuid)` and
--   the trigger function `custom._relation_kernel_targets()`, and ONE BEFORE-ROW trigger on
--   `custom.record` that calls the second. Nothing is replaced, dropped, granted or revoked; no
--   existing function body is touched; no existing row of anybody's data is written. The
--   `create trigger` takes SHARE ROW EXCLUSIVE on `custom.record` and its 16 partitions for the
--   length of this transaction (writers wait, readers and sign-in do not), which the runner
--   rules window-class on a partitioned parent. The inverse is
--   `migrations/inverse/reltargets_a_person_or_a_file_field_takes_the_id_you_hold_down.sql`.
-- window-class: create trigger on the partitioned parent custom.record — SHARE ROW EXCLUSIVE on the
--   parent and its 16 partitions, every WRITER to the store waits to COMMIT (measured ~100 ms on
--   the dev clone, 2026-09-23); readers and sign-in untouched. At production: 01:00–04:00 Pacific.
-- lock: custom
-- lane: RELATION-TARGETS
--
-- RELATION-TARGETS — A PERSON FIELD TAKES THE PERSON, A FILE FIELD TAKES THE FILE.
--
-- WHAT WAS WRONG, REPRODUCED FROM test@test.com's SEAT ON THE DEV CLONE, 2026-09-23.
-- Harborline Heating & Air keeps a Service Calls table whose "Assigned technician" column is a
-- Person field (parity type `member`: a relation whose target is the kernel Person Table). The
-- dispatcher assigns the call to a technician who IS a member of the organization, by the id
-- every other part of the platform knows her by — her user id. The store answered:
--
--     23514  Assigned technician points at something that is not there
--
-- It was there. She is a member. What the store wanted was the id of her PERSON RECORD — the
-- kernel record that carries her `user_id` — which only `@ai-matrx/records-ui`'s PersonPicker
-- knew how to find or make (and it did so from the browser, over a 500-row list, writing a
-- second Person record whenever the one it needed was row 501). Every other writer — an agent
-- filling the column, the import, a server path, a script — holds the user id and is refused.
-- One record on the main database already had been: Signal & Scale Podcast's `producer`, which
-- STORE-TXN-4 had to withdraw because no door could save it. The same is true of a File field
-- (parity type `attachment`): a work order's signed authorization form is uploaded to
-- `files.files` and the writer holds THAT id; the store wanted the kernel File record's id, and
-- only `custom.capture_submit` knew how to make one.
--
-- THE RULING (RELATION-TARGETS, 2026-09-23). A Person or File field is a relation, full stop:
-- `custom.parity_field_types()` defines `member` and `attachment` as relations to the kernel
-- Person and File Tables (REC-31: "a File record reached through a relation"), and 22 of 22
-- values held by the 34 such fields on the main database name exactly those kernel records with
-- both halves agreeing. So the field editor was right to offer them, the value stays the kernel
-- record's id, and the association is written record → record like every other relation
-- (REL-10, REL-11 as corrected under DD-023). What was missing is the one step between the id a
-- writer holds and the id the cell stores — the same step `custom._resolve_choice_words` already
-- takes for a choice's word. It is the store's step, taken where every write arrives.
--
-- WHAT THIS FILE ADDS.
--   1. `custom.relation_kernel_record(organization, kernel_table, id)` — THE ONE ANSWER to
--      "which Person / File record is this?". A live record of that kernel Table in this
--      organization answers itself. For Person, the user id of a MEMBER of this organization
--      answers with that member's Person record (the one carrying `user_id`), written on first
--      use exactly as `custom.work_person` writes it. For File, the id of a `files.files` row
--      that belongs to this organization (or that the caller uploaded, with no organization)
--      answers with the File record carrying `file_id`, written on first use from the file's
--      own name, type and size. Anything else answers NULL — never a guess.
--   2. `custom._relation_kernel_targets()`, fired BEFORE every insert and update of
--      `custom.record` as `_w_relation_kernel_targets` — after `_value_envelope` (so the door
--      is judged before anything is written on the caller's behalf) and before every
--      `custom_record_*` validation (so `custom.validate_values` judges the resolved id). It
--      rewrites each id in a Person or File cell to its kernel record through (1), and refuses
--      one that answers NULL in the person's own words: "Assigned technician names someone who
--      is not a member of Harborline Heating & Air" rather than "points at something that is
--      not there". Then `zz_w2a_relation_association*` write the edge from the stored id, and
--      `custom._relation_halves_agree` finds both halves at COMMIT, as for any relation.
--
-- WHY A TRIGGER AND NOT A DOOR ARGUMENT. `record_write`, `record_write_many`, `record_update`,
-- `record_write_graph`, the import, the portal and the capture paths all end in an INSERT or an
-- UPDATE of `custom.record`; writing the step into each body is seven places to forget it. The
-- class lives where the choice-word step lives, and every door — including the ones nobody has
-- written yet — inherits it. It costs one indexed field lookup per write, the same one
-- `custom.record_relation_edges` already makes, and nothing at all for a Table with no Person
-- or File column.
--
-- THE 34 EXISTING FIELDS. None needs a byte changed: the rule is keyed on the field's declared
-- target, so all 29 Person and 5 File fields are covered the moment it exists. The closing
-- block below MEASURES that no cell of any of them holds a value the store would refuse, and
-- refuses the file (nothing lands) if one does — rules first, and no value is ever rewritten
-- by a migration.

create or replace function custom.relation_kernel_record(
  p_organization_id uuid,
  p_kernel_table_id uuid,
  p_id              uuid
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_id    uuid;
  v_name  text;
  v_file  record;
  v_uid   uuid;
begin
  if p_organization_id is null or p_kernel_table_id is null or p_id is null then
    return null;
  end if;

  -- The record itself. The ordinary case — what PersonPicker and capture already write.
  select r.id into v_id
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_id
     and r.table_id = p_kernel_table_id
     and r.deleted_at is null;
  if v_id is not null then
    return v_id;
  end if;

  if p_kernel_table_id = custom.person_kernel_id() then
    -- A MEMBER'S user id. Somebody with no membership here is the external-principal lane
    -- (VIS-31), which is not open, so the answer is NULL and the caller refuses in words.
    if not exists (select 1 from iam.organization_member m
                    where m.organization_id = p_organization_id and m.user_id = p_id) then
      return null;
    end if;

    select r.id into v_id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.person_kernel_id()
       and r.deleted_at is null
       and nullif(r.data ->> 'user_id', '')::uuid = p_id
     order by r.created_at
     limit 1;
    if v_id is not null then
      return v_id;
    end if;

    -- Written on first use, in the same shape custom.work_person writes.
    select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                    nullif(u.raw_user_meta_data ->> 'full_name', ''),
                    nullif(split_part(u.email::text, '@', 1), ''),
                    p_id::text)
      into v_name
      from auth.users u
     where u.id = p_id;

    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.person_kernel_id(), 'record',
            jsonb_build_object('name', coalesce(v_name, p_id::text),
                               'full_name', coalesce(v_name, p_id::text),
                               'user_id', p_id::text))
    returning id into v_id;
    return v_id;
  end if;

  if p_kernel_table_id = custom.file_kernel_id() then
    -- A FILE of this organization — or one the caller uploaded with no organization on it.
    -- Another organization's file answers NULL: a relation never becomes the way to reach a
    -- file somebody else holds (REC-29).
    begin
      v_uid := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
    exception when others then
      v_uid := null;
    end;

    select f.id, f.file_name, f.mime_type, f.size_bytes
      into v_file
      from files.files f
     where f.id = p_id
       and f.deleted_at is null
       and (f.organization_id = p_organization_id
            or (f.organization_id is null and v_uid is not null and f.created_by = v_uid));
    if not found then
      return null;
    end if;

    select r.id into v_id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.file_kernel_id()
       and r.deleted_at is null
       and nullif(r.data ->> 'file_id', '')::uuid = p_id
     order by r.created_at
     limit 1;
    if v_id is not null then
      return v_id;
    end if;

    insert into custom.record (organization_id, table_id, data_class, data)
    values (p_organization_id, custom.file_kernel_id(), 'record',
            jsonb_strip_nulls(jsonb_build_object(
              'name',    coalesce(nullif(v_file.file_name, ''), p_id::text),
              'mime',    nullif(v_file.mime_type, ''),
              'bytes',   v_file.size_bytes,
              'file_id', p_id::text)))
    returning id into v_id;
    return v_id;
  end if;

  -- Any other Table: the id is a record of that Table or it is nothing. Not this function's
  -- question — custom.validate_values answers it.
  return null;
end;
$function$;

comment on function custom.relation_kernel_record(uuid, uuid, uuid) is
  'RELATION-TARGETS: the ONE answer to "which Person / File record is this id?" — the record '
  'itself, a member''s user id (→ their Person record, written on first use), or a file''s '
  'files.files id (→ its File record, written on first use). NULL for anything else.';

-- No client calls this: it has no EXECUTE for `authenticated` or `anon` (the birth guard clears
-- PUBLIC's default on a new definer), and the only caller is the trigger below, which runs inside
-- the store's own write doors after they have judged the caller. Declared IN DATA, as the
-- provision shape guard requires of every SECURITY DEFINER function.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'relation_kernel_record',
   'p_organization_id uuid, p_kernel_table_id uuid, p_id uuid',
   array['uuid','uuid','uuid']::regtype[]::oid[],
   'p_organization_id is the organization of the record being written, taken from the row the '
   'store''s own write door already admitted (custom.assert_store_door / assert_client_may_change '
   'ran first); p_kernel_table_id is the Person or File kernel id read from the Field''s declared '
   'relation_target, never from a caller; p_id is the value in the cell. p_id is checked against '
   'THIS organization only: a live kernel record of it, a member of it (iam.organization_member), '
   'or a files.files row of it (or one the signed-in caller uploaded with no organization). Any '
   'NULL argument answers NULL, and so does anything that is none of those, so another '
   'organization''s person or file is never reached.',
   'migrations/campaign/reltargets_a_person_or_a_file_field_takes_the_id_you_hold.sql (lane RELATION-TARGETS)',
   'server_only: called only by the BEFORE-ROW trigger custom._relation_kernel_targets on '
   'custom.record, inside the store''s own write doors, after they have judged the caller; no '
   'client ever calls it directly.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

create or replace function custom._relation_kernel_targets()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_on    boolean;
  f       record;
  v_val   jsonb;
  v_items jsonb;
  v_out   jsonb;
  v_one   jsonb;
  v_to    uuid;
  v_new   jsonb;
  v_org   text;
begin
  -- Only an ordinary, live record of an ordinary Table holds cells to resolve.
  if new.data_class is distinct from 'record' or new.table_id is null
     or new.deleted_at is not null
     or new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.data is not distinct from new.data
     and old.table_id is not distinct from new.table_id then
    return new;
  end if;

  -- THE SWITCH, as custom._resolve_choice_words reads it: while the store is off for this
  -- organization the document is left exactly as the writer sent it.
  begin
    v_on := custom.store_is_open(new.organization_id);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    return new;
  end if;

  for f in
    select coalesce(nullif(fd.data ->> 'key', ''), fd.data ->> 'name')        as k,
           coalesce(nullif(fd.data ->> 'label', ''), fd.data ->> 'name')      as label,
           (fd.data ->> 'relation_target')::uuid                              as tgt
      from custom.record fd
     where fd.table_id = custom.field_kernel_id()
       and fd.data_class <> 'kernel'
       and fd.deleted_at is null
       and fd.organization_id = new.organization_id
       and nullif(fd.data ->> 'entity_definition_id', '')::uuid = new.table_id
       and fd.data ->> 'type' = 'relation'
       and fd.data ->> 'relation_target' in (custom.person_kernel_id()::text,
                                             custom.file_kernel_id()::text)
  loop
    v_val := new.data -> f.k;
    if v_val is null or jsonb_typeof(v_val) not in ('string', 'array') then
      continue;
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select x from jsonb_array_elements(v_items) x loop
      -- Not an id at all: custom.validate_values refuses it in its own words.
      if jsonb_typeof(v_one) <> 'string'
         or (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;

      v_to := custom.relation_kernel_record(new.organization_id, f.tgt, (v_one #>> '{}')::uuid);

      if v_to is null then
        select coalesce(nullif(o.name, ''), 'this organization') into v_org
          from iam.organizations o where o.id = new.organization_id;
        -- A kernel record of this organization that has been REMOVED is a different sentence
        -- from a stranger: the person (or file) was here, and somebody took their record away.
        if exists (select 1 from custom.record t
                    where t.organization_id = new.organization_id
                      and t.id = (v_one #>> '{}')::uuid
                      and t.table_id = f.tgt) then
          raise exception '% names % that was removed from %.', f.label,
                case when f.tgt = custom.person_kernel_id() then 'a person' else 'a file' end,
                coalesce(v_org, 'this organization')
            using errcode = '23514',
                  hint = format('Pick %s again for %s, or restore the removed record first — the store never points a column at something that is gone.',
                                case when f.tgt = custom.person_kernel_id() then 'who it is now' else 'the file' end,
                                f.label);
        end if;
        if f.tgt = custom.person_kernel_id() then
          raise exception '% names someone who is not a member of %.', f.label, coalesce(v_org, 'this organization')
            using errcode = '23514',
                  hint = format('%s holds a member of this organization — pick them from the list, or give their user id and the store finds their Person record. Somebody who is not a member has to be invited first.', f.label);
        end if;
        raise exception '% names a file % does not have.', f.label, coalesce(v_org, 'this organization')
          using errcode = '23514',
                hint = format('%s holds a file of this organization — upload it here first, then give its id and the store makes its File record. A file that belongs to another organization cannot be attached here.', f.label);
      end if;

      v_out := v_out || jsonb_build_array(to_jsonb(v_to::text));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(f.k, v_new);
    end if;
  end loop;

  return new;
end;
$function$;

comment on function custom._relation_kernel_targets() is
  'RELATION-TARGETS: BEFORE-ROW on custom.record. Rewrites each id in a Person or File '
  'relation cell to its kernel record through custom.relation_kernel_record, and refuses one '
  'with no answer in the person''s own words. Fires after _value_envelope and before every '
  'custom_record_* validation.';

-- `_w…` sorts after `_value_envelope` (the door is judged first) and before every
-- `custom_record_*` trigger (validation judges the resolved id). Trigger order is by name.
create or replace trigger _w_relation_kernel_targets
  before insert or update on custom.record
  for each row execute function custom._relation_kernel_targets();

-- ── THE 34 FIELDS: MEASURED, NOT EDITED ─────────────────────────────────────────────────────
-- Every cell of every live Person / File relation field must already name a live record of its
-- kernel Table in its own organization. One that does not is a value the store would refuse on
-- the record's next save; this file refuses to land beside it, naming it, rather than rewrite it.
do $census$
declare
  v_fields int;
  v_bad    int;
  v_list   text;
begin
  select count(*) into v_fields
    from custom.record f
   where f.table_id = custom.field_kernel_id() and f.data_class <> 'kernel'
     and f.deleted_at is null and f.data ->> 'type' = 'relation'
     and f.data ->> 'relation_target' in (custom.person_kernel_id()::text, custom.file_kernel_id()::text);

  with f as (
    select f.organization_id, coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') as k,
           nullif(f.data ->> 'entity_definition_id', '')::uuid as tbl,
           (f.data ->> 'relation_target')::uuid as tgt
      from custom.record f
     where f.table_id = custom.field_kernel_id() and f.data_class <> 'kernel'
       and f.deleted_at is null and f.data ->> 'type' = 'relation'
       and f.data ->> 'relation_target' in (custom.person_kernel_id()::text, custom.file_kernel_id()::text)
  ), cells as (
    select f.organization_id, r.id as record_id, f.k, f.tgt, x.val #>> '{}' as v
      from f
      join custom.record r
        on r.organization_id = f.organization_id and r.table_id = f.tbl
       and r.data_class = 'record' and r.deleted_at is null
     cross join lateral jsonb_array_elements(
             case jsonb_typeof(r.data -> f.k) when 'array' then r.data -> f.k
                                               when 'string' then jsonb_build_array(r.data -> f.k)
                                               else '[]'::jsonb end) x(val)
  )
  select count(*), string_agg(format('%s · record %s · %L = %s', c.organization_id, c.record_id, c.k, c.v), '; ')
    into v_bad, v_list
    from cells c
   where not exists (select 1 from custom.record t
                      where t.organization_id = c.organization_id and t.id::text = c.v
                        and t.table_id = c.tgt and t.deleted_at is null);

  if v_bad <> 0 then
    raise exception 'RELATION-TARGETS: % Person/File relation cell(s) hold a value that is not a live kernel record of their organization, so the store would refuse the next save of each: %', v_bad, v_list
      using errcode = '23514',
            hint = 'Nothing landed. Resolve each through custom.relation_kernel_record (a member''s user id or an uploaded file''s id) with a history.migration_log line, then apply this file again.';
  end if;
  raise notice 'RELATION-TARGETS: % Person/File relation field(s); 0 cells the store would refuse.', v_fields;
end $census$;
