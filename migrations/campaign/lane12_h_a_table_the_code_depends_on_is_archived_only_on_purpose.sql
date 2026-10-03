-- chair-step: lane 12 P5, the "code depends on this" mark and its guard. It (1) ADDS custom._code_depends_refuse(uuid, jsonb, text) (the one refusal sentence) and custom._code_depends_hold(uuid, uuid, timestamptz, jsonb, uuid, timestamptz, jsonb) (the guard's question); (2) REPLACES the body of the existing trigger function custom._table_columns_word_guard() (trigger zzz_table_columns_word, BEFORE INSERT OR UPDATE on custom.record and every partition) so it first asks custom._code_depends_hold on an UPDATE of a Table document — a body replacement: NO trigger is created or dropped and no table lock is taken (a new trigger on custom.record is window-class); (3) REPLACES the body of custom.table_archive(uuid, uuid, integer, boolean) — one early refusal for a marked table, nothing else changed; (4) REPLACES the body of custom.table_ensure(uuid, jsonb) — an app-table spec carrying code_depends merges the mark (and declared_in) onto an existing copy that lacks it; (5) ADDS the door custom.table_archive_deliberately(uuid, uuid, text, text), its platform.client_callable_door row and EXECUTE to authenticated (the single grant every sibling store door holds). No column, policy, index or other grant is touched; no data is moved. Inverse: migrations/inverse/lane12_h_a_table_the_code_depends_on_is_archived_only_on_purpose_down.sql.
-- lane: PLATFORM-APP-DATA (v6 lane 12)
-- lock: custom
-- based-on: custom.table_archive(uuid, uuid, integer, boolean) 4217f48bd6da0564be9cd014f5447047ba77182516d95fe3fedb2ed3428845e2
-- based-on: custom.table_ensure(uuid, jsonb) 18d76e92b326ab3cf2a2090df778547496cc614d02d1882fd5c4648ef7f8da38
-- based-on: custom._table_columns_word_guard() d6b1e19509b1a3f5d857438a1fc81c5a5de2b5bdd3f9c0f6839e66143916ae2e
--
-- THE USE CASE (Arman, 2026-10-02): tables "the app absolutely relies on … cannot easily be deleted
-- since we will have actual code written against them, so deleting them would be with multiple checks
-- and create something that would scream in the app release as well (but never block)".
-- Design: common-docs projects/data-doctrine-adoption/v6/DESIGN-PLATFORM-APP-DATA-WAVE3.md §4 (N-P2).
--
-- THE MARK. ensureAppTable (@ai-matrx/records/app-table) writes `code_depends: true` on the app
-- table's document, and `app_table.declared_in` (the file(s) that declare it) when the definition
-- names them. The release check (matrx-frontend scripts/check-app-tables.ts) screams ARCHIVED for an
-- archived copy and UNMARKED for a live copy without the mark.
--
-- THE GUARD — ONE PLACE EVERY DOOR PASSES. Every door that archives, renames, moves or unmarks a
-- table writes its Table document in custom.record: custom.table_archive (and the bulk archive page,
-- which calls it per table), custom.record_delete / record_archiver on the kernel row, custom.
-- record_update of the table document, custom.table_move. The store's existing row trigger
-- zzz_table_columns_word (custom._table_columns_word_guard, on every UPDATE of custom.record) asks
-- custom._code_depends_hold, which refuses, on a marked table:
--   · archiving it (deleted_at set);
--   · renaming it — a change of `slug` or `kept_for` (the code finds it by both);
--   · moving it — a change of organization_id;
--   · removing the mark — code_depends no longer true.
-- custom.table_archive is also refused at its first line, so no chunk empties a table whose last
-- step would be refused. The display name, columns and rows change as on any table. A hard DELETE
-- of a Table row is already refused to every client by custom._store_door (delete means archive).
--
-- THE ONLY WAY THROUGH: custom.table_archive_deliberately(org, table, typed slug, reason) — the
-- store switch, then the organization wall; refuses the agent actor (and a system run carrying an
-- agent); requires the typed slug to match and a reason; then archives through custom.table_archive
-- itself (the caller's own rung, the same event, the same restore) with the guard opened for THAT
-- table for THAT transaction only, and writes the reason onto the archive event.

set local lock_timeout = '2s';
set local statement_timeout = '120s';

create or replace function custom._code_depends_refuse(p_table_id uuid, p_doc jsonb, p_what text)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_name  text;
  v_where text;
  v_slug  text;
begin
  if p_doc is null or not (p_doc @> '{"code_depends": true}'::jsonb) then
    return;
  end if;
  -- custom.table_archive_deliberately opens the guard for one table, for its own transaction.
  if coalesce(current_setting('custom.code_depends_deliberate', true), '') = p_table_id::text then
    return;
  end if;
  v_name := coalesce(nullif(btrim(p_doc ->> 'name'), ''), 'This table');
  v_slug := coalesce(p_doc ->> 'slug', '');
  v_where := case jsonb_typeof(p_doc #> '{app_table,declared_in}')
               when 'array' then (select string_agg(x, ', ') from jsonb_array_elements_text(p_doc #> '{app_table,declared_in}') x)
               when 'string' then p_doc #>> '{app_table,declared_in}'
             end;
  raise exception '% is a table the app''s code depends on (declared in %), so it cannot be % this way.',
                  v_name, coalesce(nullif(v_where, ''), 'the app''s code'), p_what
    using errcode = '55000',
          hint = case when p_what in ('archived', 'removed')
                   then format('A person can archive it on purpose with "Archive deliberately", typing its slug "%s" and a reason; an agent cannot. Nothing was changed.', v_slug)
                   else 'Change the code that declares it first, then archive it deliberately. Nothing was changed.' end,
          detail = jsonb_build_object('table_id', p_table_id, 'code_depends', true, 'refused', p_what,
                                      'declared_in', p_doc #> '{app_table,declared_in}', 'slug', v_slug)::text;
end;
$function$;

comment on function custom._code_depends_refuse(uuid, jsonb, text) is
  'Lane PLATFORM-APP-DATA P5: raises the one plain refusal (55000) when a Table document carries code_depends: true and custom.table_archive_deliberately has not opened the guard for this table in this transaction; otherwise returns. Called by custom._code_depends_hold and custom.table_archive.';

create or replace function custom._code_depends_hold(p_table_id uuid, p_org uuid, p_deleted_at timestamptz, p_data jsonb,
                                                     p_new_org uuid, p_new_deleted_at timestamptz, p_new_data jsonb)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
begin
  if p_data is null or not (p_data @> '{"code_depends": true}'::jsonb) then
    return;
  end if;
  if p_deleted_at is null and p_new_deleted_at is not null then
    perform custom._code_depends_refuse(p_table_id, p_data, 'archived');
  end if;
  if (p_new_data ->> 'slug') is distinct from (p_data ->> 'slug')
     or nullif(btrim(p_new_data ->> 'kept_for'), '') is distinct from nullif(btrim(p_data ->> 'kept_for'), '') then
    perform custom._code_depends_refuse(p_table_id, p_data, 'renamed');
  end if;
  if p_new_org is distinct from p_org then
    perform custom._code_depends_refuse(p_table_id, p_data, 'moved to another organization');
  end if;
  if not (coalesce(p_new_data, '{}'::jsonb) @> '{"code_depends": true}'::jsonb) then
    perform custom._code_depends_refuse(p_table_id, p_data, 'unmarked');
  end if;
end;
$function$;

comment on function custom._code_depends_hold(uuid, uuid, timestamptz, jsonb, uuid, timestamptz, jsonb) is
  'Lane PLATFORM-APP-DATA P5: asked by custom._table_columns_word_guard on every UPDATE of a Table document. On a document carrying code_depends: true, refuses archive, a change of slug or kept_for, a move to another organization and removal of the mark — through every door — unless custom.table_archive_deliberately opened the guard for that table.';

-- custom._table_columns_word_guard: the body production holds (based-on above) with the one question first.
CREATE OR REPLACE FUNCTION custom._table_columns_word_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- LANE 12 P5: A TABLE THE APP'S CODE DEPENDS ON is held here — the one row trigger every door that
  -- archives, renames, moves or unmarks a Table document passes (custom._code_depends_hold). Asked in
  -- this existing trigger's body because a NEW trigger on custom.record is window-class.
  if tg_op = 'UPDATE' and old.data_class = 'table' and old.data @> '{"code_depends": true}'::jsonb then
    perform custom._code_depends_hold(old.id, old.organization_id, old.deleted_at, old.data,
                                      new.organization_id, new.deleted_at, new.data);
  end if;
  -- Deliberately NOT folded into custom._table_shape_guard: replacing a 217-line live guard
  -- to add one sentence is how a fix takes something else down with it. This asks its own
  -- question, in its own body, and every other refusal that guard makes is untouched.
  if new.data_class <> 'table' then
    return new;
  end if;
  if (new.data ? 'columns')
     and coalesce(new.data ->> 'columns', '') not in ('fields', 'free_form') then
    raise exception 'a table''s columns come from its fields or the table is free-form, and this one says %',
                    custom.said(new.data ->> 'columns', 'nothing')
      using errcode = '23514',
            hint = 'REC-1: `columns` is `fields` (its Field rows are its columns, the default) or `free_form` (its shape is defined in code or by the author, and other keys pass). Leave it out to mean `fields`.';
  end if;
  return new;
end;
$function$;

-- custom.table_archive: the body production holds (based-on above) with the one early refusal.
CREATE OR REPLACE FUNCTION custom.table_archive(p_organization_id uuid, p_table_id uuid, p_chunk integer DEFAULT 50, p_include_table boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- THE MOST ONE CALL WILL TAKE ON. Not the most a SCREEN should ask for: a client call goes
  -- through PostgREST, which cancels at ~8 s whatever this function would have been happy to
  -- do, so `p_chunk`'s DEFAULT (50) is the honest number and this cap is for a caller with a
  -- real budget.
  c_max     constant integer := 1000;
  v_chunk   integer;
  v_id      uuid;
  v_did     integer := 0;
  v_live    integer;
  v_gone    integer;
  v_name    text;
  v_table   boolean;                   -- is the Table record itself still live?
  v_whole   boolean;                   -- was this call asked to archive the Table too?
  v_done    boolean := false;
  v_table_now boolean := false;      -- did THIS call archive the Table record itself?
  v_event   uuid;                    -- STORE-TAILS-3: the one archive event of this operation
  v_prev_event text;
  -- DATA-V2-BASICS-2: an archive of this table was started and has not finished.
  v_open    boolean := false;
  v_list    uuid;                    -- DATA-V2-BASICS-2: a pick list this table's columns made
  -- THE REVERSIBLE ACTION (2026-10-02): the organization's line above which a screen asks before
  -- archiving this table (knob custom/archive_confirm_over). At or under it a screen archives at once
  -- and announces it with Undo. Answered on every call, the chunk-0 look included.
  v_confirm_over integer;
  -- T2.1 (2026-10-02): WHAT IS BUILT ON THIS TABLE GOES WITH IT, in this same archive event.
  v_built   uuid;
  v_now     timestamptz := now();
  v_on      jsonb := '[]'::jsonb;
  -- CHAIR-ACCESS d (lane 2): a child Table the store names by THIS table's id (a bookings Table's slots)
  v_child   uuid;
  v_child_res jsonb;
  -- TABLE-ACTIONS (2026-10-03): THE LAST STEP IS CHUNKED TOO. What is left of p_chunk after this call's
  -- records is the budget for what is built on the table; nothing new starts once the call has run
  -- for c_pass and done something.
  c_pass    constant interval := interval '1 second';
  v_until   timestamptz := clock_timestamp() + c_pass;
  v_left    integer;
  v_on_did  integer := 0;               -- built-on rows (and child-table passes) THIS call archived
  v_more    boolean := false;           -- something built on the table is left for the next call
  v_n       integer;
begin
  -- THE SWITCH, THE WALL, THE RUNG — all three by name, before anything is read or written.
  -- The rung is the one `custom.record_delete` asks of the Table record, asked ONCE here so a
  -- person who may not do this is told before the first row moves rather than after.
  perform custom.assert_store_door(p_organization_id, 'custom.table_archive');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_archive');

  if p_organization_id is null or p_table_id is null then
    raise exception 'Archiving a table needs the organization and the table, and this call does not say which.'
      using errcode = '22004';
  end if;

  select coalesce(nullif(r.data ->> 'name', ''), 'this table'), r.deleted_at is null
    into v_name, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.data_class = 'table';
  if not found then
    raise exception 'There is no such table in this organization, so there is nothing to archive.' using errcode = '02000',
            hint = 'The store is keyed (organization_id, id), so a table of another organization is not found by this one. Nothing was changed.',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;

  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_archive');

  -- LANE 12 P5 (Arman, 2026-10-02: a table the app's code relies on "cannot easily be deleted").
  -- A table whose document carries `code_depends: true` is refused HERE, before the first record
  -- moves — not at the last step, where earlier chunks would already have emptied it. Emptying it
  -- and keeping it (p_include_table = false) is not archiving it, and is unchanged. The one way
  -- through is custom.table_archive_deliberately; custom._code_depends_hold (asked by the
  -- zzz_table_columns_word row trigger) holds every other door.
  if coalesce(p_include_table, true) then
    perform custom._code_depends_refuse(p_table_id,
      (select r.data from custom.record r
        where r.organization_id = p_organization_id and r.id = p_table_id and r.data_class = 'table'),
      'archived');
  end if;

  v_confirm_over := greatest(0,
    (platform.knob_resolve('custom', 'archive_confirm_over', p_organization_id) #>> '{}')::integer);

  v_whole := coalesce(p_include_table, true);
  -- HOW MUCH THIS CALL TAKES ON. 0 means "tell me, change nothing" — which is what a screen
  -- asks before it shows a person a number and a button. Above c_max is clamped rather than
  -- refused, because a caller asking for too much wants the work done, not a lecture; the
  -- answer says what it actually did.
  v_chunk := least(greatest(coalesce(p_chunk, 50), 0), c_max);

  -- STORE-TAILS-3: ONE EVENT FOR THE WHOLE OPERATION. A screen calls this door until `done`;
  -- every call's rows are written to the SAME open event, so the restore brings back the records
  -- chunk one archived together with the columns the last call archived. Opened only when this
  -- call is going to archive something.
  if v_chunk > 0
     and (exists (select 1 from custom.record r
                   where r.organization_id = p_organization_id and r.table_id = p_table_id
                     and r.data_class = 'record' and r.deleted_at is null)
          or (v_whole and v_table)) then
    select m.id into v_event
      from history.migration_log m
     where m.organization_id = p_organization_id
       and m.verb = 'archive'
       and m.target_kind = 'table'
       and m.target_id = p_table_id
       and m.undone_at is null
       and coalesce((m.inverse ->> 'open')::boolean, false)
     order by m.applied_at desc
     limit 1;
    if v_event is null then
      v_event := history.migration_record(p_organization_id, 'archive', 'table', p_table_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_table_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true,
                                      'whole', v_whole),
                   format('STORE-TAILS-3: %s archived as one unit — its records, fields, saved views and rules with it; restoring it brings back exactly this set.', v_name));
    end if;
    v_prev_event := coalesce(current_setting('custom.archive_event', true), '');
    perform set_config('custom.archive_event', v_event::text, true);
  end if;

  if v_chunk > 0 then
    for v_id in select r.id
                  from custom.record r
                 where r.organization_id = p_organization_id
                   and r.table_id = p_table_id
                   and r.data_class = 'record'
                   and r.deleted_at is null
                 order by r.created_at, r.id
                 limit v_chunk
    loop
      -- TABLE-ACTIONS (2026-10-03): a pass that has archived something and run for c_pass stops and
      -- says what it took; the caller's loop carries on.
      exit when v_did > 0 and clock_timestamp() > v_until;
      -- A RECORD THAT CONTAINS OTHER RECORDS TAKES THEM WITH IT, so a row this loop is about
      -- to reach may already have gone with an earlier one. That is not an error and it is
      -- not a second delete; it is simply already done.
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_id);
        v_did := v_did + 1;
      end if;
    end loop;
  end if;

  select count(*) filter (where r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null)
    into v_live, v_gone
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.data_class = 'record';

  -- THE TABLE GOES LAST, AND ONLY WHEN IT IS EMPTY — AND ONLY AFTER WHAT IS BUILT ON IT HAS GONE.
  -- … AND ONLY WHEN THIS CALL WAS ASKED TO CHANGE SOMETHING. `p_chunk = 0` means "tell me,
  -- change nothing" (ARGS-RULED-2, 2026-09-23): until this line an empty Table with the table
  -- included was archived by the very call that promised to change nothing.
  --
  -- THE LAST STEP IS CHUNKED TOO (TABLE-ACTIONS, 2026-10-03). It used to take the pick lists, every
  -- dashboard and checklist, every form, inbound address, saved view and portal, every child Table
  -- (looped to its end) AND the Table itself in ONE call; with 5 records left it hit the 8 s signed-in
  -- limit under load, and nothing bounded it but how much happened to be built on the table. Now the
  -- built-on rows go in their own passes, out of the same budget the records use: at most what is
  -- left of `p_chunk` after this call's records, and nothing new is started once the call has run
  -- for c_pass and done something. A pass that stops early answers done = false and the caller's loop
  -- calls again (the contract it already keeps). The Table itself flips only in a pass that found
  -- nothing more built on it and still has time: never after a long one. Every row, in every pass,
  -- goes into the SAME open archive event — the records and dashboards through custom.record_delete
  -- (its `took`), the rest named in its `built_on` with the moment each went — so custom.record_restore
  -- brings back exactly these and never something archived on its own earlier.
  if v_chunk > 0 and v_live = 0 and v_whole and v_table then
    v_left := greatest(v_chunk - v_did, 0);

    -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-24): ITS PICK LISTS GO WITH IT. Every choice column
    -- makes a list of its own ("Visit Status choices"); archiving the table left all six of them live
    -- in the Tables index. A list that only this table's columns use (live or removed, in use or kept
    -- by a column that became Text) is archived in this same event, so bringing the table back brings
    -- them back. A list another table's column also uses stays.
    for v_list in
      select distinct l.id
        from custom.record f
        cross join lateral (select nullif(f.data -> 'config' ->> 'options_table_id', '')::uuid as id
                            union select nullif(f.data -> 'config' ->> 'list_kept', '')::uuid) l
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and coalesce(f.data_class, '') <> 'kernel'
         and f.data ->> 'entity_definition_id' = p_table_id::text
         and l.id is not null
    loop
      if exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id and t.id = v_list
                    and t.table_id = custom.table_kernel_id() and t.deleted_at is null)
         and not exists (select 1 from custom.record o
                          where o.organization_id = p_organization_id
                            and o.table_id = custom.field_kernel_id()
                            and o.deleted_at is null
                            and o.data ->> 'entity_definition_id' is distinct from p_table_id::text
                            and (o.data -> 'config' ->> 'options_table_id' = v_list::text
                                 or o.data -> 'config' ->> 'list_kept' = v_list::text)) then
        if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
          v_more := true;
          exit;
        end if;
        perform custom.record_delete(p_organization_id, v_list);
        v_left := v_left - 1;
        v_on_did := v_on_did + 1;
      end if;
    end loop;

    -- WHAT IS BUILT ON IT GOES WITH IT (handoff T2.1, 2026-10-02: "Restore (or Undo) brings it
    -- back with its forms and dashboards"). Before this a table's forms and booking pages kept
    -- taking submissions into an archived table, its dashboards and saved views stayed listed, and
    -- a portal kept opening onto it.
    --   · dashboards and checklists are store records: through the store's own door, so they join
    --     the event's `took` list like every other row;
    if not v_more then
      for v_built in
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.deleted_at is null
           and ((r.data_class = 'dashboard' and r.data ->> 'subject_table_id' = p_table_id::text)
                or (r.data_class in ('checklist_template', 'checklist_run')
                    and r.data ->> 'about_table_id' = p_table_id::text))
         order by r.created_at, r.id
      loop
        if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
          v_more := true;
          exit;
        end if;
        perform custom.record_delete(p_organization_id, v_built);
        v_left := v_left - 1;
        v_on_did := v_on_did + 1;
      end loop;
    end if;

    --   · forms and booking pages (custom.anon_form), inbound addresses (custom.anon_inbound),
    --     saved views (platform.saved_view) and portals opened onto it (custom.portal) live outside
    --     the record table, so the event names them in `built_on` with the moment they went. Each
    --     kind is taken at most v_left rows a pass.
    if not v_more and exists (select 1 from custom.anon_form x
                               where x.organization_id = p_organization_id and x.table_id = p_table_id and x.deleted_at is null) then
      if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
        v_more := true;
      else
        with g as (
          update custom.anon_form f set deleted_at = v_now
           where f.organization_id = p_organization_id
             and f.id in (select x.id from custom.anon_form x
                           where x.organization_id = p_organization_id and x.table_id = p_table_id
                             and x.deleted_at is null
                           order by x.id limit v_left)
          returning f.id)
        select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'anon_form', 'id', g.id, 'at', v_now)), '[]'::jsonb),
               count(*)
          into v_on, v_n from g;
        v_left := v_left - v_n;
        v_on_did := v_on_did + v_n;
      end if;
    end if;
    if not v_more and exists (select 1 from custom.anon_inbound x
                               where x.organization_id = p_organization_id and x.table_id = p_table_id and x.deleted_at is null) then
      if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
        v_more := true;
      else
        with g as (
          update custom.anon_inbound i set deleted_at = v_now
           where i.organization_id = p_organization_id
             and i.id in (select x.id from custom.anon_inbound x
                           where x.organization_id = p_organization_id and x.table_id = p_table_id
                             and x.deleted_at is null
                           order by x.id limit v_left)
          returning i.id)
        select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'anon_inbound', 'id', g.id, 'at', v_now)), '[]'::jsonb),
               count(*)
          into v_on, v_n from g;
        v_left := v_left - v_n;
        v_on_did := v_on_did + v_n;
      end if;
    end if;
    if not v_more and exists (select 1 from platform.saved_view x
                               where x.organization_id = p_organization_id and x.subject_id = p_table_id and x.deleted_at is null) then
      if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
        v_more := true;
      else
        with g as (
          update platform.saved_view v set deleted_at = v_now
           where v.organization_id = p_organization_id
             and v.id in (select x.id from platform.saved_view x
                           where x.organization_id = p_organization_id and x.subject_id = p_table_id
                             and x.deleted_at is null
                           order by x.id limit v_left)
          returning v.id)
        select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'saved_view', 'id', g.id, 'at', v_now)), '[]'::jsonb),
               count(*)
          into v_on, v_n from g;
        v_left := v_left - v_n;
        v_on_did := v_on_did + v_n;
      end if;
    end if;
    if not v_more and exists (select 1 from custom.portal x
                               where x.organization_id = p_organization_id and x.client_table_id = p_table_id and x.archived_at is null) then
      if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
        v_more := true;
      else
        with g as (
          update custom.portal p
             set archived_at = v_now, archived_by = custom.query_principal(),
                 archive_reason = 'Its table was archived.'
           where p.organization_id = p_organization_id
             and p.id in (select x.id from custom.portal x
                           where x.organization_id = p_organization_id and x.client_table_id = p_table_id
                             and x.archived_at is null
                           order by x.id limit v_left)
          returning p.id)
        select v_on || coalesce(jsonb_agg(jsonb_build_object('kind', 'portal', 'id', g.id, 'at', v_now)), '[]'::jsonb),
               count(*)
          into v_on, v_n from g;
        v_left := v_left - v_n;
        v_on_did := v_on_did + v_n;
      end if;
    end if;

    --   · CHILD TABLES THE STORE NAMES BY THIS TABLE'S ID (CHAIR-ACCESS d, lane 2 MAKE-HOME): a bookings
    --     Table's slots Table (slug booking_slots_<this table's id without dashes>, made by
    --     custom.booking_declare through custom.work_slots_declare) stayed live when its bookings Table
    --     was archived, still holding and expiring slots for a page that was gone. It goes with its
    --     parent: archived as a whole through this same door (its own event, every chunk, the rung asked
    --     of it by name), and named here in `built_on` (kind table) so custom.record_restore brings it
    --     back with the parent. This is the one pattern by which the store names a child Table after
    --     its parent's id; a second one joins this predicate, never a door of its own. ONE PASS OF THE
    --     CHILD PER PASS OF THE PARENT, out of the parent's budget; the child is named once it is done.
    if not v_more then
      for v_child in
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id = custom.table_kernel_id()
           and r.data_class = 'table'
           and r.deleted_at is null
           and r.id <> p_table_id
           and r.data ->> 'slug' = 'booking_slots_' || replace(p_table_id::text, '-', '')
         order by r.created_at, r.id
      loop
        if v_left < 1 or (v_did + v_on_did > 0 and clock_timestamp() > v_until) then
          v_more := true;
          exit;
        end if;
        v_child_res := custom.table_archive(p_organization_id, v_child, v_left, true);
        v_n := coalesce((v_child_res ->> 'archived')::integer, 0)
             + coalesce((v_child_res ->> 'built_on_archived')::integer, 0)
             + case when coalesce((v_child_res ->> 'table_archived')::boolean, false) then 1 else 0 end;
        v_left := v_left - greatest(v_n, 1);
        v_on_did := v_on_did + greatest(v_n, 1);
        if coalesce((v_child_res ->> 'done')::boolean, true) then
          v_on := v_on || jsonb_build_object('kind', 'table', 'id', v_child, 'at', v_now);
        else
          v_more := true;
          exit;
        end if;
      end loop;
    end if;

    -- WHAT THIS PASS TOOK OUTSIDE THE RECORD TABLE IS NAMED IN THE EVENT NOW, pass by pass, each
    -- entry with the moment it went (custom.record_restore matches on that moment).
    if jsonb_array_length(v_on) > 0 and v_event is not null then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object('built_on', coalesce(m.inverse -> 'built_on', '[]'::jsonb) || v_on)
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;

    -- THE TABLE ITSELF: by now its own cascade is the Fields, the saved views kept as records and the
    -- Rules it carries — tens of rows. It flips in a pass that found nothing more built on it and has
    -- time left (or has done nothing else).
    if not v_more
       and (v_did + v_on_did = 0 or clock_timestamp() <= v_until) then
      perform custom.record_delete(p_organization_id, p_table_id);
      v_table := false;
      v_table_now := true;
    end if;
  end if;

  v_done := v_live = 0 and (not v_whole or not v_table);

  -- STORE-TAILS-3: THE EVENT CLOSES WHEN THE OPERATION IS DONE — the table archived, or (for
  -- "empty it but keep it") every record archived. From then on a restore of the table brings
  -- back exactly what it names, and a later archive is a new event.
  if v_event is not null then
    perform set_config('custom.archive_event', v_prev_event, true);
    if v_done then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object(
               'open', false,
               'archived_at', (select to_jsonb(r.deleted_at) from custom.record r
                                where r.organization_id = p_organization_id and r.id = p_table_id))
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;
  end if;

  -- UNDER WAY (DATA-V2-BASICS-2, 2026-09-29). BREAKER-1 B-F13: a reload in the middle of a run showed a
  -- fresh "Archive this table" button, because nothing the page could ask said a run was open. The open
  -- archive event IS that fact; every answer — the chunk-0 look included — now says it.
  v_open := not v_done and exists (
    select 1 from history.migration_log m
     where m.organization_id = p_organization_id
       and m.verb = 'archive' and m.target_kind = 'table' and m.target_id = p_table_id
       and m.undone_at is null
       and coalesce((m.inverse ->> 'open')::boolean, false));

  return jsonb_build_object(
    'table_id',   p_table_id,
    'in_progress', v_open,               -- an earlier run of this archive was started and not finished
    'table_name', v_name,
    'archived',   v_did,                 -- what THIS call archived
    'remaining',  v_live,                -- records still live in this table
    'total',      v_live + v_gone,       -- records this table has ever held
    'archived_total', v_gone,            -- records of this table already archived, all runs
    'table_archived', not v_table,
    'done',       v_done,
    'chunk',      v_chunk,
    'archive_event', v_event,            -- STORE-TAILS-3: what "Bring it back" will restore
    'built_on_archived', v_on_did,      -- TABLE-ACTIONS: what is built on the table THIS call archived
    'confirm_over', v_confirm_over,      -- THE REVERSIBLE ACTION: ask first above this many live records
    'message',    case
      when v_chunk = 0 and v_live > 0 then
        format('%s record%s in %s would be archived. Nothing has been changed yet.',
               v_live, case when v_live = 1 then '' else 's' end, v_name)
      -- SAY WHAT THIS CALL DID (ARGS-RULED-2). An empty Table archived by THIS call used to be
      -- told "is already archived. Nothing was changed." — the opposite of what had happened.
      when v_chunk = 0 and v_whole and v_table then
        format('%s has no records left, so archiving it now would archive the table itself. Nothing has been changed yet.', v_name)
      when v_table_now and v_did = 0 then
        format('%s had no records left to archive, so the table itself is now archived — it can be brought back.', v_name)
      when v_done and v_did = 0 and not v_whole then
        format('Nothing is left to archive in %s. Nothing was changed.', v_name)
      when v_done and v_did = 0 then
        format('%s is already archived. Nothing was changed.', v_name)
      -- WHICH OF THE TWO ACTUALLY HAPPENED. Archiving everything IN a table is not archiving
      -- the table, and a screen that says it is has lied to the person who kept it on purpose.
      when v_done and not v_whole then
        format('%s record%s archived. %s is now empty and still here, and everything in it can be brought back.',
               v_did, case when v_did = 1 then '' else 's' end, v_name)
      when v_done then
        format('%s record%s archived. %s is archived, and everything in it can still be brought back.',
               v_did, case when v_did = 1 then '' else 's' end, v_name)
      -- TABLE-ACTIONS: the records are gone and what is built on the table is going, pass by pass.
      when not v_done and v_live = 0 and v_whole then
        format('%s record%s and %s thing%s built on %s archived. Call again to carry on — the table itself goes last.',
               v_did, case when v_did = 1 then '' else 's' end,
               v_on_did, case when v_on_did = 1 then '' else 's' end, v_name)
      else
        format('%s record%s archived, %s to go in %s. Call again to carry on — it picks up where this left off.',
               v_did, case when v_did = 1 then '' else 's' end, v_live, v_name)
    end);
end;
$function$;

-- custom.table_ensure: the body production holds (based-on above) with the mark's merge.
CREATE OR REPLACE FUNCTION custom.table_ensure(p_organization_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_slug    text := nullif(btrim(p_spec ->> 'slug'), '');
  v_fields  jsonb := case when jsonb_typeof(p_spec -> 'fields') = 'array' then p_spec -> 'fields' else '[]'::jsonb end;
  v_field   jsonb;
  v_table   uuid;
  v_home    uuid;
  v_created boolean := false;
  v_stored  jsonb;
  v_doc     jsonb;
  v_key     text;
  v_drift   jsonb := '[]'::jsonb;
  -- L12-7: which feature keeps the table this spec describes. A slug is not unique, and two tables
  -- of one slug kept for different things (a person's own, and an app's) are different tables.
  v_kept_for text := nullif(btrim(p_spec ->> 'kept_for'), '');
  -- L12-6: the Home the caller names, when she names one. An instruction, never stored.
  v_home_raw text := nullif(btrim(p_spec ->> 'home_id'), '');
  v_home_given uuid;
  -- VERIFIER 2026-10-02: an archived app table, the app Home, and what a new table's rows start with.
  v_gone      record;
  v_app       boolean := jsonb_typeof(p_spec -> 'app_table') = 'object';
  v_row_defs  jsonb := case when jsonb_typeof(p_spec -> 'row_defaults') = 'object' then p_spec -> 'row_defaults' end;
  v_reach     text := nullif(btrim(p_spec ->> 'members_reach'), '');
  v_keys      text[];
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_ensure');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_ensure');

  if v_name is null then
    raise exception 'Give the table a name.'
      using errcode = '22023',
            hint = 'A table is found by its slug and made with its name. Nothing was made.';
  end if;
  if v_slug is null then
    v_slug := coalesce(nullif(left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), '_'), 48), ''), 'table');
  end if;
  if v_home_raw is not null then
    if v_home_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'That home is not one this store knows, so the table was not made.'
        using errcode = '22023', hint = 'Name the Home by its id, or leave it out and one is made. Nothing was made.';
    end if;
    v_home_given := v_home_raw::uuid;
  end if;

  -- THE LOCK IS THE WHOLE RACE GUARANTEE. Held until this transaction ends; the second caller
  -- reads the first one's committed table below instead of making its own.
  perform pg_advisory_xact_lock(
    hashtextextended('custom.table_ensure|' || p_organization_id::text || '|' || v_slug
                     || coalesce('|' || v_kept_for, ''), 0));

  select r.id, (r.data ->> 'parent_id')::uuid into v_table, v_home
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data_class = 'table'
     and r.deleted_at is null
     and r.data ->> 'slug' = v_slug
     and nullif(btrim(r.data ->> 'kept_for'), '') is not distinct from v_kept_for
   order by r.created_at, r.id
   limit 1;

  if v_table is null and v_kept_for is not null then
    -- AN ARCHIVED TABLE IS NEVER MADE AGAIN BEHIND THE BACK OF WHOEVER ARCHIVED IT (verifier,
    -- 2026-10-02: an archived app table was silently remade by the next save, so the archive
    -- "worked" and the table came back empty beside it). A table kept for something is found by
    -- slug and kept_for; when none is live and one is archived, this is refused by name, with the
    -- remedy. A table kept for nothing (a person's "Create table") is unchanged: a new one is made.
    select r.id, coalesce(nullif(r.data ->> 'name', ''), v_name) as name into v_gone
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.data_class = 'table'
       and r.deleted_at is not null
       and r.data ->> 'slug' = v_slug
       and nullif(btrim(r.data ->> 'kept_for'), '') = v_kept_for
     order by r.created_at, r.id
     limit 1;
    if v_gone.id is not null then
      raise exception '% is archived, so it was not made again.', v_gone.name
        using errcode = '55000',
              hint = 'Restore it from Archived tables, then try again. Nothing was made.',
              detail = jsonb_build_object('archived_table_id', v_gone.id)::text;
    end if;
  end if;

  if v_table is not null then
    -- A table she may not know is refused in the read door's own words, never re-made beside it.
    perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.table_ensure');
    -- LANE 12 P5: THE MARK REACHES A TABLE MADE BEFORE IT EXISTED. An app table's spec carries
    -- `code_depends: true` (ensureAppTable); an existing copy without it gets it on this ensure, with
    -- the declaration's `declared_in` when the stored block has none. A merge of two keys, never a
    -- retype; nothing else on the document changes. Adding the mark is never refused (the guard
    -- refuses only its removal).
    if v_app and coalesce((p_spec ->> 'code_depends')::boolean, false) then
      update custom.record r
         set data = r.data
                    || jsonb_build_object('code_depends', true)
                    || case when (p_spec -> 'app_table') ? 'declared_in'
                                 and not coalesce((r.data -> 'app_table') ? 'declared_in', false)
                            then jsonb_build_object('app_table',
                                   coalesce(r.data -> 'app_table', '{}'::jsonb)
                                   || jsonb_build_object('declared_in', p_spec -> 'app_table' -> 'declared_in'))
                            else '{}'::jsonb end
       where r.organization_id = p_organization_id
         and r.id = v_table
         and (not (r.data @> '{"code_depends": true}'::jsonb)
              or ((p_spec -> 'app_table') ? 'declared_in'
                  and not coalesce((r.data -> 'app_table') ? 'declared_in', false)));
    end if;
  elsif v_home_given is null and v_app then
    -- ONE HOME FOR EVERY APP TABLE OF THE ORGANIZATION (verifier, 2026-10-02: each app table made a
    -- Home of its own, so the organization's Homes filled with "<table> Home" entries nobody made).
    -- Found by what it is kept for (`kept_for: agent_output`, lane12_g), never by its display name,
    -- which a person may rename; found or made under its own lock, so two first saves make one Home.
    perform pg_advisory_xact_lock(hashtextextended('custom.table_ensure|app_home|' || p_organization_id::text, 0));
    select h.id into v_home
      from custom.record h
     where h.organization_id = p_organization_id
       and h.table_id = custom.person_kernel_id()
       and h.deleted_at is null
       and h.data ->> 'kept_for' = 'agent_output'
     order by h.created_at, h.id
     limit 1;
    if v_home is null then
      v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                    jsonb_build_object('name', 'Kept by the app', 'kept_for', 'agent_output'));
    end if;
  elsif v_home_given is not null then
    -- L12-6: AN EXISTING HOME, in this organization and live. No second Home is made. Landing a table
    -- in it is the Home's ADD rung (lane12_g): the organization's members_can_add setting, as every
    -- other store door reads it through custom.table_add_rung — never a fixed 'editor'.
    perform custom.assert_client_may_change(p_organization_id, v_home_given, 'custom.table_ensure',
                                            custom.table_add_rung(p_organization_id, v_home_given), 'home');
    if not exists (select 1 from custom.record h
                    where h.organization_id = p_organization_id
                      and h.id = v_home_given
                      and h.deleted_at is null) then
      raise exception 'That home is not here, so the table was not made.'
        using errcode = '22023',
              hint = 'Name a Home of this organization that is not archived, or leave it out and one is made. Nothing was made.';
    end if;
    v_home := v_home_given;
  else
    v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                  jsonb_build_object('name', v_name || ' Home'));
  end if;

  if v_table is null then
    v_table := custom.table_declare(
      p_organization_id,
      (p_spec - 'fields' - 'home_id' - 'row_defaults' - 'members_reach')
        || jsonb_build_object(
             'slug', v_slug,
             'parent_id', v_home,
             -- THE DECLARED KEY, KEPT. A table's `fields` list names each column by its key, and
             -- table_declare's column sketch builds a key from `name` unless one is given — which
             -- collapsed KINDS-GLUE's `cards__flashcard` to `cards_flashcard` and the table was refused.
             'fields', coalesce((select jsonb_agg(jsonb_build_object('name', f ->> 'key', 'key', f ->> 'key') order by n)
                                   from jsonb_array_elements(v_fields) with ordinality e(f, n)
                                  where nullif(f ->> 'key', '') is not null), '[]'::jsonb)));
    v_created := true;

    -- WHAT A NEW TABLE'S ROWS START WITH, AND WHO OF THE ORGANIZATION REACHES IT — each through its
    -- own door, as the caller (who made the table, so may set both). An app table of scope `person`
    -- starts its rows "Only me" (hidden from others' lists, never locked — T-36); an app table every
    -- member adds rows to is reached by members at the level the spec names.
    if v_row_defs is not null then
      perform custom.table_row_defaults_set(p_organization_id, v_table, v_row_defs);
    end if;
    if v_reach is not null then
      perform custom.share_lane_set(p_organization_id, v_table, 'organization', v_reach::public.permission_level);
    end if;
  end if;

  -- THE COLUMNS, through the column door. On a new table every one is defined (the sketches
  -- table_declare made are filled in); on an existing table only a key it does not have yet is
  -- added — a column already defined is never touched, and how it differs from the spec is SAID.
  for v_field in select f from jsonb_array_elements(v_fields) f loop
    v_key := v_field ->> 'key';
    v_stored := null;
    if not v_created then
      select r.data into v_stored
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.data_class = 'field'
         and r.deleted_at is null
         and r.data ->> 'entity_definition_id' = v_table::text
         and r.data ->> 'key' = v_key
         and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
       order by r.created_at, r.id
       limit 1;
    end if;

    if v_stored is null then
      perform custom.field_declare(p_organization_id, v_table, v_field);
      continue;
    end if;

    -- THE DECLARED SIDE, as the store would have stored it. A spec it cannot read is itself a
    -- difference, named with the store's own sentence — never a refusal of the whole call.
    begin
      v_doc := custom._field_document_for(p_organization_id, v_table, v_field);
    exception when others then
      v_drift := v_drift || jsonb_build_array(jsonb_build_object(
        'field', v_key, 'aspect', 'spec', 'stored', null, 'declared', sqlerrm));
      continue;
    end;

    v_drift := v_drift || coalesce((
      select jsonb_agg(jsonb_build_object('field', v_key, 'aspect', a.aspect, 'stored', a.stored, 'declared', a.declared)
                       order by a.n)
        from (values
          (1, 'type',     to_jsonb(coalesce(v_stored ->> 'parity_type', v_stored ->> 'type')),
                          to_jsonb(coalesce(v_doc ->> 'parity_type', v_doc ->> 'type'))),
          (2, 'format',   to_jsonb(nullif(v_stored ->> 'format', '')),
                          to_jsonb(nullif(v_doc ->> 'format', ''))),
          (3, 'label',    to_jsonb(btrim(v_stored ->> 'label')),
                          to_jsonb(btrim(v_doc ->> 'label'))),
          (4, 'multi',    to_jsonb(coalesce((v_stored ->> 'multi')::boolean, false)),
                          to_jsonb(coalesce((v_doc ->> 'multi')::boolean, false))),
          (5, 'required', to_jsonb(coalesce((v_stored ->> 'required')::boolean, false)),
                          to_jsonb(coalesce((v_doc ->> 'required')::boolean, false))),
          (6, 'unique',   to_jsonb(exists (select 1 from jsonb_array_elements(coalesce(v_stored -> 'rules', '[]'::jsonb)) x
                                            where x ->> 'kind' = 'unique')),
                          to_jsonb(exists (select 1 from jsonb_array_elements(coalesce(v_doc -> 'rules', '[]'::jsonb)) x
                                            where x ->> 'kind' = 'unique')))
        ) a(n, aspect, stored, declared)
       where a.stored is distinct from a.declared), '[]'::jsonb);
  end loop;

  -- A STORED COLUMN THE SPEC NO LONGER DECLARES (verifier, 2026-10-02): kept, never removed, and
  -- said — aspect `extra`, its stored type in `stored`.
  if not v_created then
    select coalesce(array_agg(f ->> 'key'), '{}'::text[]) into v_keys from jsonb_array_elements(v_fields) f;
    v_drift := v_drift || coalesce((
      select jsonb_agg(jsonb_build_object('field', r.data ->> 'key', 'aspect', 'extra',
                                          'stored', coalesce(r.data ->> 'parity_type', r.data ->> 'type'),
                                          'declared', null)
                       order by r.created_at, r.id)
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.data_class = 'field'
         and r.deleted_at is null
         and r.data ->> 'entity_definition_id' = v_table::text
         and nullif(r.data ->> 'key', '') is not null
         and not ((r.data ->> 'key') = any (v_keys))), '[]'::jsonb);
  end if;

  return jsonb_build_object('table_id', v_table, 'home_id', v_home, 'created', v_created, 'drift', v_drift);
end;
$function$;

create or replace function custom.table_archive_deliberately(p_organization_id uuid, p_table_id uuid,
                                                              p_typed_slug text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_doc    jsonb;
  v_slug   text;
  v_name   text;
  v_reason text := nullif(btrim(p_reason), '');
  v_prev   text;
  v_res    jsonb;
begin
  -- THE SWITCH, THEN THE WALL, by name, before anything is read.
  perform custom.assert_store_door(p_organization_id, 'custom.table_archive_deliberately');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_archive_deliberately');

  if p_organization_id is null or p_table_id is null then
    raise exception 'Archiving a table on purpose needs the organization and the table, and this call does not say which.'
      using errcode = '22004';
  end if;

  -- AN AGENT NEVER ARCHIVES A TABLE THE CODE DEPENDS ON — neither as the agent tier nor as a system
  -- run that carries an agent.
  if platform.canonical_actor_tier(platform.declared_actor_tier()) = 'agent'
     or platform.declared_actor_agent() is not null then
    raise exception 'An agent cannot archive a table on purpose; a person does it from the table''s menu.'
      using errcode = '42501',
            hint = 'Ask the person who keeps this table to archive it. Nothing was changed.';
  end if;

  select r.data into v_doc
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.table_id = custom.table_kernel_id()
     and r.data_class = 'table'
     and r.deleted_at is null;
  if not found then
    raise exception 'There is no such table in this organization, so there is nothing to archive.'
      using errcode = '02000',
            hint = 'It may be archived already, or belong to another organization. Nothing was changed.',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;
  v_slug := coalesce(v_doc ->> 'slug', '');
  v_name := coalesce(nullif(btrim(v_doc ->> 'name'), ''), 'This table');

  if btrim(coalesce(p_typed_slug, '')) is distinct from v_slug then
    raise exception 'The slug typed does not match %, so it was not archived.', v_name
      using errcode = '22023',
            hint = format('Type its slug exactly: "%s". Nothing was changed.', v_slug);
  end if;
  if v_reason is null then
    raise exception 'Say why % is being archived; the reason is kept with the archive.', v_name
      using errcode = '22023', hint = 'Nothing was changed.';
  end if;

  -- THE NORMAL PATH, with the guard open for THIS table in THIS transaction only (is_local).
  v_prev := coalesce(current_setting('custom.code_depends_deliberate', true), '');
  perform set_config('custom.code_depends_deliberate', p_table_id::text, true);
  v_res := custom.table_archive(p_organization_id, p_table_id, 20, true);  -- the client's TABLE_ARCHIVE_PASS
  perform set_config('custom.code_depends_deliberate', v_prev, true);

  if v_res ->> 'archive_event' is not null then
    update history.migration_log m
       set inverse = m.inverse || jsonb_build_object('deliberate', jsonb_build_object(
             'reason', v_reason, 'by', custom.query_principal(), 'typed_slug', v_slug,
             'code_depends', coalesce((v_doc ->> 'code_depends')::boolean, false),
             'declared_in', v_doc #> '{app_table,declared_in}'))
     where m.organization_id = p_organization_id
       and m.id = (v_res ->> 'archive_event')::uuid;
  end if;

  return v_res || jsonb_build_object('deliberate', true, 'reason', v_reason);
end;
$function$;

comment on function custom.table_archive_deliberately(uuid, uuid, text, text) is
  'Lane PLATFORM-APP-DATA P5: the one way to archive a table whose document carries code_depends: true. Store switch, organization wall, refuses the agent actor (and a system run carrying an agent), requires the typed slug to match and a reason, then runs custom.table_archive (chunk 20, table included) as the caller with the code-depends guard open for that table in this transaction only; the reason is written onto the archive event. Call again until done, as custom.table_archive.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_archive_deliberately',
   'p_organization_id uuid, p_table_id uuid, p_typed_slug text, p_reason text',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid],
   'Archives a table the app''s code depends on, on purpose. Refuses unless custom.assert_store_door and custom.assert_client_may_reach admit the caller to the organization; refuses the agent actor; requires the typed slug to equal the table''s slug and a reason; then calls custom.table_archive (whose own rung, custom.assert_client_may_change, decides whether this person may archive the table) with the code-depends guard open for that one table in this transaction, and records the reason on the archive event.',
   'lane12_h_a_table_the_code_depends_on_is_archived_only_on_purpose.sql', null, true, false,
   '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "check": "custom.assert_store_door(arg1) then custom.assert_client_may_reach(arg1) are the first lines: a non-member is refused 42501 before any read.", "entity": "organization", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "position": 1, "optional": false, "null_rule": {"sqlstate": "22004"}, "verified": "2026-10-03 lane PLATFORM-APP-DATA — read from this body"}, "p_table_id": {"type": "uuid", "check": "resolved WHERE organization_id = p_organization_id AND id = p_table_id on the Table kernel, live — another organization''s table is not found (02000); custom.table_archive then asks custom.assert_client_may_change.", "entity": "custom_record", "foreign": {"sqlstate": "02000", "same_as_invented": true}, "position": 2, "optional": false, "null_rule": {"sqlstate": "22004"}, "verified": "2026-10-03 lane PLATFORM-APP-DATA — read from this body"}, "p_typed_slug": {"type": "text", "check": "must equal the table''s slug after trimming, else 22023.", "position": 3, "optional": false, "verified": "2026-10-03 lane PLATFORM-APP-DATA — read from this body"}, "p_reason": {"type": "text", "check": "must be non-blank, else 22023; written onto the archive event.", "position": 4, "optional": false, "verified": "2026-10-03 lane PLATFORM-APP-DATA — read from this body"}}, "declared_at": "2026-10-03 lane PLATFORM-APP-DATA", "declared_by": "lane12_h_a_table_the_code_depends_on_is_archived_only_on_purpose.sql"}'::jsonb)
on conflict do nothing;

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name = 'table_archive_deliberately' and not signed_in_callers;

grant execute on function custom.table_archive_deliberately(uuid, uuid, text, text) to authenticated;
