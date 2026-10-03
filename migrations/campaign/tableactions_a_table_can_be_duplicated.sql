-- chair-step: this GRANTs EXECUTE on TWO new functions, custom.table_duplicate(uuid, boolean, text, uuid) and custom.table_duplicate_continue(uuid), to `authenticated`, after declaring each in platform.client_callable_door (signed-in callers only; anon gains nothing). It also REVOKEs PUBLIC's implicit EXECUTE on the five new internal helpers, custom._uuid_remap(jsonb, jsonb), custom._copied_metadata(jsonb), custom._without_rows_of(jsonb, uuid, uuid), custom._duplicate_id(uuid, uuid) and custom._table_duplicate_step(uuid, interval), so no client can call them. Nothing else is granted, revoked, dropped or rewritten; no table, column, trigger or policy is touched; the only row written is the one door-register row. No strong lock: CREATE FUNCTION and one INSERT into the register. The schema-wide door-reopen sweep is held off for this transaction only (see "THE SWEEP" below) so the apply never contends for locks across `custom`.
-- lock: custom
-- lane: TABLE-ACTIONS
--
-- The inverse is `migrations/inverse/tableactions_a_table_can_be_duplicated_down.sql`.
--
-- THE USE CASE. Cedar Ridge Physical Therapy keeps a "Referral Intake Queue": who referred each
-- patient, the referral date, visits authorized, an intake status choice list, a link to the
-- patient's row in "Patients", a "Follow-up of" link back into the queue itself, a formula, and
-- two saved views ("New referrals this month", a board of physician referrals). The front desk
-- wants the same queue for the second clinic. Until this file the only way was to rebuild every
-- column, choice and view by hand. Now one call makes "Referral Intake Queue (copy)" with the same
-- columns, the same choices in the same order and colours, the same views pointing at the copy's
-- columns, and (when asked) the same rows.
--
-- PAGED, LIKE custom.table_archive. One call never holds more than a few seconds of work: the
-- first call (custom.table_duplicate) checks the rights, records the job, makes the copy's Table
-- record and stops starting new work 1.5 s into the call; it answers "copying" with progress, and the
-- client calls custom.table_duplicate_continue(<the copy>) — each stops starting new work 2.5 s into the call — until "done". Every unit of work is
-- small (a choice list's Table, its Fields, 200 options, 5 fields, one view, 25 records, 50 links) and the budget
-- is checked between units, so a call ends within the budget plus one unit even when the
-- database is busy. Nothing is stored about how far it got: each copied row's id is worked out
-- from the copy and the source row (custom._duplicate_id), so what remains is read off the copy
-- itself, exactly as custom.table_archive reads what remains off the records. The job is the
-- copy's one history row (verb "duplicate"): its  flag says the copy is unfinished. While
-- unfinished the copy is the app's (kept_for "copying"), which keeps it out of every person's
-- table list, so nobody opens or edits a half copy; the last pass hands it over. Only the person
-- who started a copy carries it on, and the source is asked again on every pass. No record
-- ceiling: any size is copied, one page at a time.
--
-- WHAT IS COPIED
--   · the Table record: every setting and its look (decorations, default sort, row actions),
--     under a new name ("<name> (copy)", "(copy 2)", … when the name is taken in that
--     organization) and a new slug;
--   · every live Field (archived ones stay behind), with new ids;
--   · every choice list a Field uses, as a NEW choice list (its own Table, Fields and options:
--     words, colours, stable keys and order), so editing the copy's choices never edits the original's;
--   · every live saved view of the Table the caller may see (another person's "only me" view
--     stays theirs), made through the house door for a new view (custom.view_declare) and then
--     given the source view's look, order, hand-set positions and "Shown to";
--   · with p_with_records, every live record the caller is handed as a list shows it
--     (custom.query_visible_ids at viewer; archived, quarantined, not-given rows and another
--     person's "only me" rows stay behind).
--
-- SHARING IS CARRIED BY NAME, through the columns T-13 keeps: "Shown to" (shown_to) on every
-- copied row and view. The row column T-13 retires is never named or read here (its ratchet
-- forbids a new reader, and routing around it would be routing around a peer's guard), so each
-- copied row and view gets that column's house default for a new row: an organization view /
-- an organization record. Where the source was "only me" the copy keeps "Shown to: only me" — a
-- list filter, not a lock — and the answer names those views in left_behind.views_shared_as_new_views.
-- "Published to the web" is never carried (a copy starts unpublished).
--
-- A COPY CARRIES ONLY WHAT THE CALLER CAN READ. The rows are the ones the store hands this
-- person (custom.query_visible_ids at viewer: the one ladder, then "Shown to"), and
-- each row's values go through the SAME field mask the read doors use (custom.read_mask_for for
-- this person, organization, Table and level, applied by custom.mask_document). A column this
-- person may not read (a "restricted" diagnosis, say) is still copied as a column, its values
-- are left empty, and the answer's left_behind.hidden_columns names it with how many values
-- stayed behind. RULING (lane manager, TABLE-ACTIONS fix round): a viewer of a shared table may
-- copy it into an organization of their own — Google Drive's default ("viewers can make a
-- copy"), defaults lean open — and because of the mask they copy exactly what they can see.
--
-- HOW IDS ARE KEPT POINTING AT THE RIGHT THING (the remap). The store names a Field by its KEY
-- almost everywhere (record values, sorts, filters, group/date/image fields, hidden columns,
-- widths in `presentation`, lookups' via/of/pick), and keys are copied unchanged — so those need
-- nothing. The places that name a Field, a Table, an option, a view or a record BY ID are
-- rewritten through one map (custom._uuid_remap, old id -> new id, any letter case) applied to
-- the whole document:
--     Table      data.decorations.color_by.field, .rules[].field, .rows{<record id>},
--                .cells{<record id>}{<field id>}; data.row_actions[].steps[].field / .value;
--                any other id the Table document holds
--     Field      data.entity_definition_id; data.relation_target when it is the Table itself
--                (a link to ANOTHER Table keeps pointing at that Table); data.config.options_table_id;
--                data.config.expr {"field": <id>} (formulas); a default naming a row
--     View       definition.table_id; definition.where.args[].field / {const: <record id>};
--                definition.filters values; definition.grid.widths{<id>};
--                metadata.record_positions{<record id>} (hand-set order)
--     Record     a link value naming another row of the same Table
--   An id the map does not hold (another Table, a person, a file) is left exactly as it was.
--
-- A ROW THAT WAS NOT COPIED IS NEVER POINTED AT. After the remap, any id still naming a row of
-- the SOURCE table (always, without records; with records, a row that stayed behind) is taken
-- out by custom._without_rows_of: a condition that names it (anything with an "op": a view's
-- where-clause node, a colour rule) is dropped whole; a step's "value" is cleared to null; any
-- other key holding it, or keyed by it, is dropped; an and/or left empty is dropped. Each
-- document that lost such a reference is named in left_behind.row_references_dropped. Census
-- on the clone 2026-10-02 of every Table, Field, view and Rule document: record ids sit only in
-- decorations.rows/.cells keys, view metadata.record_positions keys, and Table parent_id (a
-- Home, never a row of the copied table); where-constants, filter values, step values and
-- field defaults are the shapes the store accepts and are handled the same way.
--
-- WHAT IS NOT COPIED (said in the answer too): archived fields and records, the source's
-- history, forms, booking pages, portals, dashboards, capture sheets, rules (validation,
-- membership, digests), webhooks, Tables nested inside its rows, per-person view looks,
-- sharing grants, and comments. A view that names a membership Rule (`rule_id`) keeps naming
-- the source's Rule. Airtable's "Duplicate table" draws the same line.
--
-- RIGHTS. The caller must be able to open the source (custom.where_id_opens: the organization
-- wall or a share, then the ladder at viewer) and must be a MEMBER of the destination
-- organization (the copy is a new Table there, and the store lets any member declare a Table —
-- custom.table_declare asks exactly custom.assert_client_may_reach + custom.assert_store_door).
-- A portal client is not a member and cannot make a copy.
--
-- HISTORY. One history.migration_log row on the NEW table (verb "duplicate", note "Duplicated
-- from <name>"); every row the copy writes carries that event's id in history.row_versions.
-- The source is read, never written: no version, no event, no outbox row.
--
-- THE SWEEP. Every CREATE FUNCTION / GRANT / REVOKE fires platform_reopen_declared_doors, which
-- walks EVERY closed schema re-granting declared doors and closing undeclared client grants; on
-- the clone it hit its 2 s lock timeout six times per apply. This file needs none of it: the one
-- client door is declared in platform.client_callable_door and THEN granted (the order the
-- definer guard requires and honours on its own), and the three helpers are revoked from PUBLIC
-- explicitly below. So the sweep is held off for this transaction with its own re-entrancy mark
-- (platform.closed_schema_sweep, transaction-local, reset at the end of the file); the
-- per-function ddl guards still run. Proof: the resulting ACLs are read back after the apply.

select set_config('platform.closed_schema_sweep', '1', true);

create or replace function custom._uuid_remap(p_doc jsonb, p_map jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $function$
declare
  v_text text;
  v_id   text;
begin
  if p_doc is null or p_map is null or p_map = '{}'::jsonb then
    return p_doc;
  end if;
  v_text := p_doc::text;
  -- Every uuid-shaped string in the document, values AND object keys, once each, in ANY letter
  -- case (the map's keys are uuid::text, lower case). A uuid is 36 fixed characters with no quote
  -- or backslash in it, so a plain replace cannot cut into anything else, and an id the map does
  -- not hold is left exactly as it was.
  for v_id in
    select distinct m[1]
      from regexp_matches(v_text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'gi') m
  loop
    if p_map ? lower(v_id) then
      v_text := replace(v_text, v_id, p_map ->> lower(v_id));
    end if;
  end loop;
  return v_text::jsonb;
end;
$function$;

revoke execute on function custom._uuid_remap(jsonb, jsonb) from public;

comment on function custom._uuid_remap(jsonb, jsonb) is
  'TABLE-ACTIONS. Rewrites every id in a document that the map names (old id -> new id, any letter case), in values and in object keys; every other id is left as it was. Internal to custom.table_duplicate; no client grant.';

create or replace function custom._copied_metadata(p_meta jsonb)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- What a copy of a record keeps of its metadata: only the system keys the platform registers
  -- for record-store rows (platform.metadata_reserved_keys, token 'record' — an option's stable
  -- key and position, a pick-list mark), minus where the ORIGINAL was moved in from, which is
  -- not true of the copy. Anything else a row picked up is not the copy's to carry.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(coalesce(p_meta, '{}'::jsonb)) e
   where e.key <> 'moved_from'
     and exists (select 1 from platform.metadata_reserved_keys k
                  where k.table_token = 'record' and k.key = e.key);
$function$;

revoke execute on function custom._copied_metadata(jsonb) from public;

comment on function custom._copied_metadata(jsonb) is
  'TABLE-ACTIONS. The metadata a copied record-store row keeps: registered system keys only (platform.metadata_reserved_keys, token record), never moved_from. Internal to custom.table_duplicate; no client grant.';

create or replace function custom._without_rows_of(p_doc jsonb, p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_out   jsonb;
  v_child jsonb;
  v_lost  boolean := false;
  e       record;
begin
  -- SQL NULL means "this whole value named a row that was not copied: take it out".
  if p_doc is null then
    return null;
  end if;
  case jsonb_typeof(p_doc)
    when 'string' then
      if (p_doc #>> '{}') ~* c_uuid
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id
                        and r.id = lower(p_doc #>> '{}')::uuid
                        and r.table_id = p_table_id) then
        return null;
      end if;
      return p_doc;
    when 'array' then
      v_out := '[]'::jsonb;
      for e in select value as v from jsonb_array_elements(p_doc) loop
        v_child := custom._without_rows_of(e.v, p_organization_id, p_table_id);
        if v_child is not null then
          v_out := v_out || jsonb_build_array(v_child);
        end if;
      end loop;
      return v_out;
    when 'object' then
      v_out := '{}'::jsonb;
      for e in select key as k, value as v from jsonb_each(p_doc) loop
        -- keyed BY a row (decorations.rows, record_positions): the entry goes.
        if e.k ~* c_uuid
           and exists (select 1 from custom.record r
                        where r.organization_id = p_organization_id
                          and r.id = lower(e.k)::uuid
                          and r.table_id = p_table_id) then
          v_lost := true;
          continue;
        end if;
        v_child := custom._without_rows_of(e.v, p_organization_id, p_table_id);
        if v_child is null then
          v_lost := true;
          if e.k = 'value' then
            v_out := v_out || jsonb_build_object(e.k, 'null'::jsonb);   -- a step's value, cleared
          end if;
        else
          if v_child is distinct from e.v then
            v_lost := true;
          end if;
          v_out := v_out || jsonb_build_object(e.k, v_child);
        end if;
      end loop;
      if v_lost and p_doc ? 'op' then
        -- and / or / not keep what is left of their arguments; any other condition that named a
        -- row that is not here is dropped whole.
        if lower(coalesce(p_doc ->> 'op', '')) in ('and', 'or', 'not') then
          if jsonb_typeof(v_out -> 'args') = 'array' and jsonb_array_length(v_out -> 'args') > 0 then
            return v_out;
          end if;
          return null;
        end if;
        return null;
      end if;
      if v_lost and v_out = '{}'::jsonb then
        return null;                                   -- {"const": <row>} and its like
      end if;
      return v_out;
    else
      return p_doc;
  end case;
end;
$function$;

revoke execute on function custom._without_rows_of(jsonb, uuid, uuid) from public;

comment on function custom._without_rows_of(jsonb, uuid, uuid) is
  'TABLE-ACTIONS. Takes out of a document every reference to a row of the given Table: a condition (anything with an op) naming one is dropped whole, a "value" naming one is cleared to null, any other key holding or keyed by one is dropped. NULL when the whole value goes. Internal to custom.table_duplicate; no client grant.';

create or replace function custom._duplicate_id(p_copy uuid, p_old uuid)
returns uuid
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- THE COPY'S ID FOR ONE SOURCE ROW, worked out, never stored: the same copy and the same source
  -- row always give the same id. That is what makes a copy resumable without a job table — every
  -- call reads what is already there off the copy itself, exactly as custom.table_archive reads
  -- what remains off the records.
  select md5(p_copy::text || ':' || p_old::text)::uuid;
$function$;

revoke execute on function custom._duplicate_id(uuid, uuid) from public;

comment on function custom._duplicate_id(uuid, uuid) is
  'TABLE-ACTIONS. The id a copy gives one source row: md5(copy:source) as a uuid, the same on every call, so a paged copy resumes from what already exists. Internal to custom.table_duplicate; no client grant.';

create or replace function custom._table_duplicate_step(p_copy uuid, p_budget interval)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  c_fields_per_unit  constant integer := 5;
  c_records_per_unit constant integer := 25;
  c_options_per_unit constant integer := 200;
  c_links_per_unit   constant integer := 50;
  -- The budget is counted from the start of THIS CALL (statement_timestamp), so the rights,
  -- the mask and the map a call works out first are inside it, not on top of it.
  v_start      timestamptz := statement_timestamp();
  v_me         uuid := custom.query_principal();
  v_job        record;
  v_inv        jsonb;
  v_from       uuid;
  v_to         uuid;
  v_src        uuid;
  v_with       boolean;
  v_map        jsonb;
  v_level      public.permission_level;
  v_mask       jsonb;
  v_visible    text[] := array[]::text[];
  v_declared   text[] := array[]::text[];
  v_hidden     text[] := array[]::text[];
  v_seen       uuid[] := array[]::uuid[];
  v_self_keys  text[] := array[]::text[];
  v_dead_keys  text[] := array[]::text[];
  v_opt        record;
  v_new_opts   uuid;
  v_opt_dead   text[];
  v_view       record;
  v_new_view   uuid;
  v_def        jsonb;
  v_meta       jsonb;
  v_k          integer;
  v_step       text := 'done';
  v_done       boolean := false;
  v_refs_out   jsonb;
  v_hidden_out jsonb := '{}'::jsonb;
  v_views_failed jsonb;
  v_out        jsonb;
  v_t_fields   bigint; v_d_fields bigint;
  v_t_views    bigint; v_d_views  bigint;
  v_t_recs     bigint; v_d_recs   bigint;
  v_t_lists    bigint; v_d_lists  bigint;
begin
  -- THE JOB is the copy's one history row (verb "duplicate"); its stored undo carries what the
  -- copy was asked for, and `open` says it is not finished — custom.table_archive's own signal.
  select m.id, m.organization_id, m.inverse into v_job
    from history.migration_log m
   where m.verb = 'duplicate' and m.target_kind = 'table' and m.target_id = p_copy
   order by m.applied_at desc
   limit 1;
  if v_job.id is null then
    raise exception 'That is not a copy that is being made, so there is nothing to carry on.'
      using errcode = '42501';
  end if;
  v_inv  := v_job.inverse;
  v_to   := v_job.organization_id;
  v_from := (v_inv ->> 'duplicated_from_organization_id')::uuid;
  v_src  := (v_inv ->> 'duplicated_from')::uuid;
  v_with := coalesce((v_inv ->> 'with_records')::boolean, false);

  -- EVERY ROW THIS CALL WRITES IS PART OF THE ONE DUPLICATE EVENT (history.migration_record's
  -- own mark, set again for this statement because the event was recorded by an earlier one).
  perform set_config('history.mark_at',   statement_timestamp()::text, true);
  perform set_config('history.mark_id',   v_job.id::text,              true);
  perform set_config('history.mark_verb', 'duplicate',                 true);

  -- WHAT THIS PERSON MAY READ OF THE SOURCE: the same field mask custom.read_records asks.
  v_level := custom.effective_level(v_me, v_from, v_src);
  v_mask  := custom.read_mask_for(v_me, v_from, v_src, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  select coalesce(array_agg(d), '{}'::text[]) into v_hidden
    from unnest(v_declared) d where not (d = any (v_visible));
  if v_with then
    -- THE ROWS THIS PERSON IS HANDED (custom.query_visible_ids at viewer: the ladder, then
    -- "Shown to" — another person's "only me" rows stay theirs).
    v_seen := array(select q from custom.query_visible_ids(v_from, v_src, 'viewer') q);
  end if;

  -- THE MAP: every source id the copy carries -> its worked-out id in the copy.
  v_map := jsonb_build_object(v_src::text, p_copy::text);
  v_map := v_map || coalesce((
    select jsonb_object_agg(x.id::text, custom._duplicate_id(p_copy, x.id)::text)
      from custom.record x
     where x.organization_id = v_from
       and (   (x.table_id = custom.field_kernel_id() and x.data_class <> 'kernel' and x.deleted_at is null
                and x.data ->> 'entity_definition_id' = v_src::text)
            or (v_with and x.table_id = v_src and x.data_class = 'record' and x.deleted_at is null
                and coalesce(x.metadata ->> 'quarantine', 'false') <> 'true' and x.id = any (v_seen)))), '{}'::jsonb);
  v_map := v_map || coalesce((
    select jsonb_object_agg(o.id::text, custom._duplicate_id(p_copy, o.id)::text)
      from custom.record x
      join custom.record o
        on o.organization_id = v_from
       and (   o.id = (x.data -> 'config' ->> 'options_table_id')::uuid
            or (o.table_id = custom.field_kernel_id() and o.data_class <> 'kernel' and o.deleted_at is null
                and o.data ->> 'entity_definition_id' = x.data -> 'config' ->> 'options_table_id')
            or (o.table_id::text = x.data -> 'config' ->> 'options_table_id' and o.data_class = 'record'
                and o.deleted_at is null))
     where x.organization_id = v_from and x.table_id = custom.field_kernel_id()
       and x.data_class <> 'kernel' and x.deleted_at is null
       and x.data ->> 'entity_definition_id' = v_src::text
       and nullif(x.data -> 'config' ->> 'options_table_id', '') is not null), '{}'::jsonb);

  <<work>>
  loop
    -- 1. EVERY CHOICE LIST, AS A NEW ONE: its own Table (in a Home of its own), its Fields and
    -- its live options — words, colours, stable keys, order. Record values store the option's
    -- key, so they stay valid unchanged; editing the copy's choices never edits the original's.
    for v_opt in
      select distinct o.id as opts_id, o.data as opts_data, o.metadata as opts_meta, o.shown_to as opts_shown_to
        from custom.record f
        join custom.record o
          on o.organization_id = v_from and o.id = (f.data -> 'config' ->> 'options_table_id')::uuid
         and o.table_id = custom.table_kernel_id() and o.data_class = 'table'
       where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel' and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = v_src::text
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
    loop
      v_new_opts := custom._duplicate_id(p_copy, v_opt.opts_id);
      if not exists (select 1 from custom.record t where t.organization_id = v_to and t.id = v_new_opts) then
        if clock_timestamp() - v_start > p_budget then v_step := 'choices'; exit work; end if;
        insert into custom.record (id, organization_id, table_id, data)
        values (custom._duplicate_id(p_copy, custom._duplicate_id(p_copy, v_opt.opts_id)), v_to,
                custom.person_kernel_id(),
                jsonb_build_object('name', coalesce(nullif(v_opt.opts_data ->> 'name', ''), 'Choices') || ' Home'));
        insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
        values (v_new_opts, v_to, custom.table_kernel_id(), 'table',
                custom._uuid_remap(v_opt.opts_data, v_map)
                  || jsonb_build_object(
                       'parent_id', custom._duplicate_id(p_copy, custom._duplicate_id(p_copy, v_opt.opts_id))::text,
                       'slug', left(regexp_replace(coalesce(nullif(v_opt.opts_data ->> 'slug', ''), 'choices'),
                                                   '_[0-9a-f]{16,}$', '')
                                    || '_' || left(replace(v_new_opts::text, '-', ''), 20), 48)),
                custom._copied_metadata(v_opt.opts_meta), v_opt.opts_shown_to);
      end if;
      -- its Fields (a list may carry more than a title — "name" and "color" are common), as their own unit.
      if exists (select 1 from custom.record x
                  where x.organization_id = v_from and x.table_id = custom.field_kernel_id()
                    and x.data_class <> 'kernel' and x.deleted_at is null
                    and x.data ->> 'entity_definition_id' = v_opt.opts_id::text
                    and not exists (select 1 from custom.record c where c.organization_id = v_to
                                       and c.id = custom._duplicate_id(p_copy, x.id))) then
        if clock_timestamp() - v_start > p_budget then v_step := 'choices'; exit work; end if;
        insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
        select custom._duplicate_id(p_copy, x.id), v_to, x.table_id, x.data_class,
               custom._uuid_remap(x.data, v_map), custom._copied_metadata(x.metadata), x.shown_to
          from custom.record x
         where x.organization_id = v_from and x.table_id = custom.field_kernel_id()
           and x.data_class <> 'kernel' and x.deleted_at is null
           and x.data ->> 'entity_definition_id' = v_opt.opts_id::text
           and not exists (select 1 from custom.record c where c.organization_id = v_to
                              and c.id = custom._duplicate_id(p_copy, x.id))
         order by coalesce((x.data ->> 'sort')::integer, 0), x.created_at;
      end if;
      -- the options, in pages; a value kept under an ARCHIVED column of the list stays behind.
      select coalesce(array_agg(distinct d.data ->> 'key'), array[]::text[]) into v_opt_dead
        from custom.record d
       where d.organization_id = v_from and d.table_id = custom.field_kernel_id()
         and d.data_class <> 'kernel' and d.deleted_at is not null
         and d.data ->> 'entity_definition_id' = v_opt.opts_id::text
         and not exists (select 1 from custom.record l
                          where l.organization_id = v_from and l.table_id = custom.field_kernel_id()
                            and l.data_class <> 'kernel' and l.deleted_at is null
                            and l.data ->> 'entity_definition_id' = v_opt.opts_id::text
                            and l.data ->> 'key' = d.data ->> 'key');
      loop
        exit when not exists (
          select 1 from custom.record x
           where x.organization_id = v_from and x.table_id = v_opt.opts_id
             and x.data_class = 'record' and x.deleted_at is null
             and not exists (select 1 from custom.record c where c.organization_id = v_to
                                and c.id = custom._duplicate_id(p_copy, x.id)));
        if clock_timestamp() - v_start > p_budget then v_step := 'choices'; exit work; end if;
        insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
        select custom._duplicate_id(p_copy, x.id), v_to, v_new_opts, 'record',
               custom._uuid_remap(x.data - '_values' - v_opt_dead, v_map), custom._copied_metadata(x.metadata), x.shown_to
          from custom.record x
         where x.organization_id = v_from and x.table_id = v_opt.opts_id
           and x.data_class = 'record' and x.deleted_at is null
           and not exists (select 1 from custom.record c where c.organization_id = v_to
                              and c.id = custom._duplicate_id(p_copy, x.id))
         order by x.created_at, x.id
         limit c_options_per_unit;
      end loop;
    end loop;

    -- 2. THE FIELDS, the stored ones first, then the ones worked out from them (a formula's
    -- guard reads the Fields it names, so they have to be there), a few at a time.
    loop
      exit when not exists (
        select 1 from custom.record f
         where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
           and f.data_class <> 'kernel' and f.deleted_at is null
           and f.data ->> 'entity_definition_id' = v_src::text
           and not exists (select 1 from custom.record c where c.organization_id = v_to
                              and c.id = custom._duplicate_id(p_copy, f.id)));
      if clock_timestamp() - v_start > p_budget then v_step := 'fields'; exit work; end if;
      insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
      select custom._duplicate_id(p_copy, f.id), v_to, f.table_id, f.data_class,
             coalesce(custom._without_rows_of(custom._uuid_remap(f.data, v_map), v_from, v_src), '{}'::jsonb),
             custom._copied_metadata(f.metadata), f.shown_to
        from custom.record f
       where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel' and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = v_src::text
         and not exists (select 1 from custom.record c where c.organization_id = v_to
                            and c.id = custom._duplicate_id(p_copy, f.id))
       order by (coalesce(f.data ->> 'type', '') = 'formula' or coalesce(f.data ->> 'source', '') = 'formula'),
                coalesce((f.data ->> 'sort')::integer, 0), f.created_at
       limit c_fields_per_unit;
    end loop;

    -- 3. THE VIEWS this person may see (another person's "only me" view stays theirs), made
    -- through the house door for a new view (custom.view_declare), so a copied view is born the
    -- way every new view is; then its look, order, hand-set positions and "Shown to" are set on
    -- it by name. A view the house door refuses is named in left_behind, never half made.
    for v_view in
      select sv.id, sv.name, sv.description, sv.definition, sv.metadata, sv.shown_to, sv.sort_order,
             (sv.is_default or (sv.definition -> 'is_default') = 'true'::jsonb) as is_default
        from platform.saved_view sv
       where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
         and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_src
         and (sv.shown_to is distinct from 'only_me' or sv.created_by = v_me)
         and not exists (select 1 from platform.saved_view c
                          where c.organization_id = v_to and c.subject_id = p_copy and c.deleted_at is null
                            and c.metadata ->> 'copied_from_view' = sv.id::text)
         and not (coalesce(v_inv -> 'views_failed', '{}'::jsonb) ? sv.id::text)
       order by sv.sort_order nulls last, sv.created_at
    loop
      if clock_timestamp() - v_start > p_budget then v_step := 'views'; exit work; end if;
      v_def := coalesce(custom._without_rows_of(custom._uuid_remap(v_view.definition, v_map), v_from, v_src), '{}'::jsonb);
      v_meta := coalesce(custom._without_rows_of(custom._uuid_remap(coalesce(v_view.metadata, '{}'::jsonb), v_map),
                                                 v_from, v_src), '{}'::jsonb);
      begin
        v_new_view := custom.view_declare(v_to, p_copy, jsonb_build_object(
          'name', v_view.name,
          'filters', coalesce(v_def -> 'filters', '{}'::jsonb),
          'definition', v_def - 'table_id' - 'filters' - 'order' - 'is_default' - 'moved_from' - 'hidden_fields'));
        update platform.saved_view sv
           set description = v_view.description,
               sort_order  = v_view.sort_order,
               shown_to    = v_view.shown_to,
               definition  = case when v_def ->> 'order' = 'manual'
                                  then jsonb_set(sv.definition, '{order}', '"manual"'::jsonb, true)
                                  else sv.definition end,
               metadata    = coalesce(sv.metadata, '{}'::jsonb) || v_meta
                             || jsonb_build_object('copied_from_view', v_view.id::text)
         where sv.organization_id = v_to and sv.id = v_new_view;
        if v_view.is_default then
          perform custom.view_designate(v_to, p_copy, v_new_view, null);
        end if;
      exception when others then
        v_inv := jsonb_set(v_inv, '{views_failed}',
                           coalesce(v_inv -> 'views_failed', '{}'::jsonb)
                           || jsonb_build_object(v_view.id::text, v_view.name || ': ' || sqlerrm), true);
        update history.migration_log set inverse = v_inv where id = v_job.id;
      end;
    end loop;

    -- 4. THE RECORDS this person may open, in pages, through the read mask: a column this person
    -- may not read keeps its place in the copy and its values stay behind. A link to another row
    -- of this same Table is written in step 5, once its target is there.
    if v_with then
      select coalesce(array_agg(f.data ->> 'key'), array[]::text[]) into v_self_keys
        from custom.record f
       where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel' and f.deleted_at is null
         and f.data ->> 'entity_definition_id' = v_src::text
         and f.data ->> 'relation_target' = v_src::text
         and not (f.data ->> 'key' = any (v_hidden));
      select coalesce(array_agg(distinct d.data ->> 'key'), array[]::text[]) into v_dead_keys
        from custom.record d
       where d.organization_id = v_from and d.table_id = custom.field_kernel_id()
         and d.data_class <> 'kernel' and d.deleted_at is not null
         and d.data ->> 'entity_definition_id' = v_src::text
         and not exists (select 1 from custom.record l
                          where l.organization_id = v_from and l.table_id = custom.field_kernel_id()
                            and l.data_class <> 'kernel' and l.deleted_at is null
                            and l.data ->> 'entity_definition_id' = v_src::text
                            and l.data ->> 'key' = d.data ->> 'key');
      loop
        exit when not exists (
          select 1 from custom.record r
           where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
             and v_map ? r.id::text
             and not exists (select 1 from custom.record c where c.organization_id = v_to
                                and c.id = custom._duplicate_id(p_copy, r.id)));
        if clock_timestamp() - v_start > p_budget then v_step := 'records'; exit work; end if;
        insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
        select custom._duplicate_id(p_copy, r.id), v_to, p_copy, 'record',
               custom._uuid_remap(
                 custom.mask_document(r.data - '_values' - v_dead_keys, v_visible, '{}'::jsonb,
                                      false, '{}'::jsonb, v_declared)
                 - v_hidden, v_map) - v_self_keys,
               custom._copied_metadata(r.metadata), r.shown_to
          from custom.record r
         where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
           and v_map ? r.id::text
           and not exists (select 1 from custom.record c where c.organization_id = v_to
                              and c.id = custom._duplicate_id(p_copy, r.id))
         order by r.created_at, r.id
         limit c_records_per_unit;
      end loop;

      -- 5. THE LINKS WITHIN THE TABLE, now that every row is there: each follows the map to the
      -- copy's row; a link to a row that stayed behind is left empty, never the original.
      if cardinality(v_self_keys) > 0 then
        loop
          exit when not exists (
            select 1
              from custom.record r
              cross join unnest(v_self_keys) k(key)
              join custom.record c on c.organization_id = v_to and c.id = custom._duplicate_id(p_copy, r.id)
             where r.organization_id = v_from and r.table_id = v_src and v_map ? r.id::text
               and not (c.data ? k.key)
               and ((jsonb_typeof(r.data -> k.key) = 'string' and v_map ? lower(r.data ->> k.key))
                    or (jsonb_typeof(r.data -> k.key) = 'array' and jsonb_array_length(r.data -> k.key) > 0)));
          if clock_timestamp() - v_start > p_budget then v_step := 'links'; exit work; end if;
          update custom.record x
             set data = x.data || p.patch
            from (select custom._duplicate_id(p_copy, r.id) as new_id,
                         jsonb_object_agg(k.key,
                           case jsonb_typeof(r.data -> k.key)
                             when 'string' then to_jsonb(v_map ->> lower(r.data ->> k.key))
                             else (select coalesce(jsonb_agg(to_jsonb(v_map ->> lower(e.v))), '[]'::jsonb)
                                     from jsonb_array_elements_text(r.data -> k.key) e(v)
                                    where v_map ? lower(e.v))
                           end) as patch
                    from custom.record r
                    cross join unnest(v_self_keys) k(key)
                    join custom.record c on c.organization_id = v_to and c.id = custom._duplicate_id(p_copy, r.id)
                   where r.organization_id = v_from and r.table_id = v_src and v_map ? r.id::text
                     and not (c.data ? k.key)
                     and ((jsonb_typeof(r.data -> k.key) = 'string' and v_map ? lower(r.data ->> k.key))
                          or (jsonb_typeof(r.data -> k.key) = 'array' and jsonb_array_length(r.data -> k.key) > 0))
                   group by r.id
                   limit c_links_per_unit) p
           where x.organization_id = v_to and x.id = p.new_id;
        end loop;
      end if;
    end if;

    -- 6. FINISHED: the copy stops being the app's work in progress and becomes a person's table.
    update custom.record t
       set data = t.data - 'kept_by_the_app' - 'kept_for'
     where t.organization_id = v_to and t.id = p_copy
       and (t.data ? 'kept_by_the_app' or t.data ? 'kept_for');
    v_inv := jsonb_set(v_inv, '{open}', 'false'::jsonb, true);
    update history.migration_log set inverse = v_inv where id = v_job.id;
    v_done := true;
    v_step := 'done';
    exit work;
  end loop work;

  -- PROGRESS, read off the copy itself.
  select count(*), count(*) filter (where exists (select 1 from custom.record c where c.organization_id = v_to
                                                     and c.id = custom._duplicate_id(p_copy, f.id)))
    into v_t_fields, v_d_fields
    from custom.record f
   where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel' and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_src::text;
  select count(*), count(*) filter (where exists (select 1 from custom.record c where c.organization_id = v_to
                                                     and c.id = custom._duplicate_id(p_copy, o.id)))
    into v_t_lists, v_d_lists
    from (select distinct (f.data -> 'config' ->> 'options_table_id')::uuid as id
            from custom.record f
           where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
             and f.data_class <> 'kernel' and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_src::text
             and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null) o;
  select count(*) into v_t_views
    from platform.saved_view sv
   where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
     and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_src
     and (sv.shown_to is distinct from 'only_me' or sv.created_by = v_me);
  select count(*) into v_d_views
    from platform.saved_view c
   where c.organization_id = v_to and c.subject_id = p_copy and c.deleted_at is null and c.metadata ? 'copied_from_view';
  if v_with then
    select count(*) into v_t_recs from jsonb_object_keys(v_map) k
     where exists (select 1 from custom.record r where r.organization_id = v_from and r.id = k::uuid
                     and r.table_id = v_src and r.data_class = 'record');
    select count(*) into v_d_recs from custom.record c
     where c.organization_id = v_to and c.table_id = p_copy and c.data_class = 'record' and c.deleted_at is null;
  end if;

  v_out := jsonb_build_object(
    'status', case when v_done then 'done' else 'copying' end,
    'step', v_step,
    'progress', jsonb_build_object(
      'choice_lists', jsonb_build_object('done', v_d_lists, 'total', v_t_lists),
      'fields',       jsonb_build_object('done', v_d_fields, 'total', v_t_fields),
      'views',        jsonb_build_object('done', v_d_views, 'total', v_t_views),
      'records',      case when v_with then jsonb_build_object('done', v_d_recs, 'total', v_t_recs) end));

  if v_done then
    -- WHAT STAYED BEHIND, said once, when the copy is finished.
    v_refs_out := '[]'::jsonb;
    if exists (select 1 from custom.record s where s.organization_id = v_from and s.id = v_src
                 and custom._without_rows_of(custom._uuid_remap(s.data, v_map), v_from, v_src)
                     is distinct from custom._uuid_remap(s.data, v_map)) then
      v_refs_out := v_refs_out || jsonb_build_array('the table''s colours or row actions');
    end if;
    v_refs_out := v_refs_out || coalesce((
      select jsonb_agg('column ' || coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'))
        from custom.record f
       where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel' and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_src::text
         and custom._without_rows_of(custom._uuid_remap(f.data, v_map), v_from, v_src)
             is distinct from custom._uuid_remap(f.data, v_map)), '[]'::jsonb);
    v_refs_out := v_refs_out || coalesce((
      select jsonb_agg('view ' || sv.name)
        from platform.saved_view sv
       where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
         and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_src
         and (sv.shown_to is distinct from 'only_me' or sv.created_by = v_me)
         and (custom._without_rows_of(custom._uuid_remap(sv.definition, v_map), v_from, v_src)
                is distinct from custom._uuid_remap(sv.definition, v_map)
              or custom._without_rows_of(custom._uuid_remap(coalesce(sv.metadata, '{}'::jsonb), v_map), v_from, v_src)
                is distinct from custom._uuid_remap(coalesce(sv.metadata, '{}'::jsonb), v_map))), '[]'::jsonb);
    if v_with then
      select coalesce(jsonb_object_agg(coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), n.c), '{}'::jsonb)
        into v_hidden_out
        from custom.record f
        cross join lateral (
          select count(*) as c from custom.record r
           where r.organization_id = v_from and r.table_id = v_src and v_map ? r.id::text
             and r.data ? (f.data ->> 'key') and jsonb_typeof(r.data -> (f.data ->> 'key')) <> 'null') n
       where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel' and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_src::text
         and f.data ->> 'key' = any (v_hidden);
    end if;
    v_out := v_out || jsonb_build_object(
      'copied', jsonb_build_object(
        'fields', v_d_fields, 'choice_lists', v_d_lists,
        'choices', (select count(*) from custom.record o
                     where o.organization_id = v_to and o.data_class = 'record' and o.deleted_at is null
                       and o.table_id in (select custom._duplicate_id(p_copy, (f.data -> 'config' ->> 'options_table_id')::uuid)
                                            from custom.record f
                                           where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
                                             and f.data_class <> 'kernel' and f.deleted_at is null
                                             and f.data ->> 'entity_definition_id' = v_src::text
                                             and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null)),
        'views', v_d_views, 'records', coalesce(v_d_recs, 0), 'with_records', v_with),
      'left_behind', jsonb_build_object(
        'archived_fields', (select count(*) from custom.record f
                             where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
                               and f.data_class <> 'kernel' and f.deleted_at is not null
                               and f.data ->> 'entity_definition_id' = v_src::text),
        'archived_records', case when v_with then (select count(*) from custom.record r
                             where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
                               and (r.deleted_at is not null or coalesce(r.metadata ->> 'quarantine', 'false') = 'true')) end,
        'records_not_yours_to_open', case when v_with then (select count(*) from custom.record r
                             where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
                               and r.deleted_at is null and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
                               and not (v_map ? r.id::text)) end,
        'hidden_columns', v_hidden_out,
        'private_views', (select count(*) from platform.saved_view sv
                           where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
                             and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_src
                             and sv.shown_to = 'only_me' and sv.created_by is distinct from v_me),
        -- A copied view is born as every new view is (the house door). Where the source view was
        -- "only me" the copy keeps "Shown to: only me" but is an organization view underneath:
        -- the retiring row column cannot be carried by name (T-13), and "Shown to" is a list
        -- filter, not a lock. Those views are named here.
        'views_shared_as_new_views', coalesce((
            select jsonb_agg(sv.name) from platform.saved_view sv
             where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
               and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_src
               and sv.shown_to = 'only_me' and sv.created_by = v_me), '[]'::jsonb),
        'views_not_copied', coalesce((select jsonb_agg(value) from jsonb_each_text(coalesce(v_inv -> 'views_failed', '{}'::jsonb))), '[]'::jsonb),
        'row_references_dropped', v_refs_out,
        'not_copied', jsonb_build_array('history', 'forms', 'booking pages', 'portals', 'dashboards',
                                        'capture sheets', 'rules', 'webhooks', 'tables inside its rows',
                                        'sharing', 'comments', 'published to the web')));
  end if;
  return v_out;
end;
$function$;

revoke execute on function custom._table_duplicate_step(uuid, interval) from public;

comment on function custom._table_duplicate_step(uuid, interval) is
  'TABLE-ACTIONS. One bounded pass of a copy: choice lists, fields, views, records (through the read mask), links within the table, then finish — each unit small, stopping when the time budget is spent; what remains is read off the copy itself. Internal to custom.table_duplicate / custom.table_duplicate_continue; no client grant.';

create or replace function custom.table_duplicate(
  p_table_id        uuid,
  p_with_records    boolean default false,
  p_name            text    default null,
  p_organization_id uuid    default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  -- ONE CALL'S TIME BUDGET. A client call is cancelled at 8 s (authenticated's statement_timeout);
  -- a call stops starting new work after this much and answers "copying", and the client calls
  -- custom.table_duplicate_continue until "done". Each unit of work is small (5 fields, 25
  -- records, 200 options, one view), so a call ends within budget + one unit. The first call
  -- also checks the rights, records the job and makes the Table record, so it spends less.
  -- Measured on the loaded nightly copy 2026-10-02 (1,002 records, 11 columns): see the lane report.
  c_budget     constant interval := interval '1.5 seconds';
  v_me         uuid := custom.query_principal();
  v_with       boolean := coalesce(p_with_records, false);
  v_opens      jsonb;
  v_id         uuid;
  v_from       uuid;
  v_to         uuid;
  v_src        custom.record;
  v_src_name   text;
  v_to_name    text;
  v_name       text;
  v_slug       text;
  v_base_slug  text;
  v_n          integer;
  v_k          integer;
  v_new        uuid := gen_random_uuid();
  v_map        jsonb;
  v_parent     uuid;
  v_data       jsonb;
  v_cross      record;
  v_event      uuid;
  v_seen       uuid[] := array[]::uuid[];
begin
  if v_me is null then
    raise exception 'Sign in to duplicate a table.' using errcode = '42501';
  end if;
  if p_table_id is null then
    raise exception 'Say which table to duplicate.' using errcode = '22004';
  end if;

  -- READ ACCESS TO THE SOURCE: the store's one answer to "may this person open this id".
  v_opens := custom.where_id_opens(p_table_id);
  if v_opens is null or v_opens ->> 'kind' is distinct from 'table' then
    raise exception 'That table is not one you have been given, so nothing was copied.'
      using errcode = '42501',
            hint = 'The store says the same for a table you may not open and one that does not exist.';
  end if;
  v_from := (v_opens ->> 'organization_id')::uuid;
  v_id   := (v_opens ->> 'resolved_id')::uuid;
  -- THE DECISION, IN THIS BODY: the source organization's wall, asked here and not only inside
  -- custom.where_id_opens.
  perform custom.assert_client_may_reach(v_from, 'custom.table_duplicate');

  select r.* into v_src
    from custom.record r
   where r.organization_id = v_from and r.id = v_id;
  v_src_name := coalesce(nullif(btrim(v_src.data ->> 'name'), ''), 'This table');

  if v_src.data_class is distinct from 'table' then
    raise exception '% is part of how the record store is built, so it cannot be copied.', v_src_name
      using errcode = '42501';
  end if;
  if v_src.deleted_at is not null then
    raise exception '% is archived. Bring it back from the trash, then copy it.', v_src_name
      using errcode = '55000';
  end if;
  if coalesce(v_src.data ->> 'kept_for', '') = 'copying' then
    raise exception '% is still being copied itself. Wait for that copy to finish, then copy it.', v_src_name
      using errcode = '55000';
  end if;

  -- CREATE RIGHTS IN THE DESTINATION: a member of it, its record store open.
  v_to := coalesce(p_organization_id, v_from);
  select coalesce(nullif(btrim(o.name), ''), 'that organization') into v_to_name
    from iam.organizations o where o.id = v_to;
  if v_to_name is null or not iam.is_org_member(v_me, v_to) then
    raise exception 'You are not a member of that organization, so a copy of % cannot be made there.', v_src_name
      using errcode = '42501',
            hint = 'A table is copied only into an organization you belong to.';
  end if;
  perform custom.assert_client_may_reach(v_to, 'custom.table_duplicate');
  perform custom.assert_store_door(v_to, 'custom.table_duplicate');

  -- A COLUMN'S OWN TARGET NEVER CROSSES AN ORGANIZATION (custom.organization_references marks a
  -- Field's relation_target not openable). Refused here, by name, before anything is made.
  if v_to <> v_from then
    select f.data ->> 'label' as label, coalesce(t.data ->> 'name', 'another table') as target
      into v_cross
      from custom.record f
      left join custom.record t
        on t.organization_id = v_from and t.id = nullif(f.data ->> 'relation_target', '')::uuid
     where f.organization_id = v_from
       and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel'
       and f.deleted_at is null
       and f.data ->> 'entity_definition_id' = v_id::text
       and nullif(f.data ->> 'relation_target', '') is not null
       and f.data ->> 'relation_target' <> v_id::text
     order by coalesce((f.data ->> 'sort')::integer, 0)
     limit 1;
    if found then
      raise exception '% links its column % to %, and a column cannot link across organizations. Copy it into %, or remove that column first.',
                      v_src_name, coalesce(v_cross.label, 'a link'), v_cross.target,
                      coalesce((select o.name from iam.organizations o where o.id = v_from), 'its own organization')
        using errcode = '55000';
    end if;
  end if;

  -- THE NAME. A name the person gave is used as given; otherwise "<name> (copy)", then
  -- "(copy 2)", "(copy 3)", … until no live Table of the destination carries it.
  v_name := nullif(btrim(p_name), '');
  if v_name is null then
    v_name := v_src_name || ' (copy)';
    v_n := 1;
    while exists (select 1 from custom.record t
                   where t.organization_id = v_to and t.table_id = custom.table_kernel_id()
                     and t.deleted_at is null and t.data ->> 'name' = v_name) loop
      v_n := v_n + 1;
      v_name := v_src_name || ' (copy ' || v_n || ')';
    end loop;
  end if;
  v_base_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g');
  v_base_slug := regexp_replace(v_base_slug, '^_+|_+$', '', 'g');
  if v_base_slug !~ '^[a-z]' then v_base_slug := 't_' || v_base_slug; end if;
  v_base_slug := left(v_base_slug, 56);
  v_slug := v_base_slug;
  v_k := 1;
  while exists (select 1 from custom.record t
                 where t.organization_id = v_to and t.table_id = custom.table_kernel_id()
                   and t.deleted_at is null and t.data ->> 'slug' = v_slug) loop
    v_k := v_k + 1;
    v_slug := v_base_slug || '_' || v_k;
  end loop;

  -- WHERE THE COPY LIVES: beside the source in its own organization; in another organization,
  -- in that organization's own record (made if the store never gave it one, as custom.table_move does).
  if v_to = v_from then
    v_parent := nullif(v_src.data ->> 'parent_id', '')::uuid;
  else
    v_parent := (select h.id from custom.record h
                  where h.organization_id = v_to and h.table_id = custom.organization_kernel_id()
                    and h.deleted_at is null order by h.created_at, h.id limit 1);
    if v_parent is null then
      insert into custom.record (organization_id, table_id, data)
      values (v_to, custom.organization_kernel_id(), jsonb_build_object('name', v_to_name))
      returning id into v_parent;
    end if;
  end if;

  -- THE ONE HISTORY ROW, ON THE NEW TABLE: it is also the job. Its stored undo says what was asked
  -- for and `open` says the copy is not finished (custom.table_archive's own signal).
  v_event := history.migration_record(
    v_to, 'duplicate', 'table', v_new,
    jsonb_build_object('kind', 'none',
                       'why', 'A copy is undone by archiving it; the table it was copied from was never changed.',
                       'duplicated_from', v_id,
                       'duplicated_from_organization_id', v_from,
                       'with_records', v_with,
                       'by', v_me,
                       'open', true),
    format('Duplicated from %s', v_src_name));

  -- THE TABLE RECORD, made now so the copy has its id; its settings and look remapped, every
  -- reference to a row that will not be copied taken out. WHILE IT IS BEING MADE it is the app's
  -- (kept_for "copying"): kept tables stay out of every person's table list, so nobody opens or
  -- edits a half copy; only the person making it holds its id, and the last pass hands it over.
  if v_with then
    v_seen := array(select q from custom.query_visible_ids(v_from, v_id, 'viewer') q);
  end if;
  v_map := jsonb_build_object(v_id::text, v_new::text);
  v_map := v_map || coalesce((
    select jsonb_object_agg(x.id::text, custom._duplicate_id(v_new, x.id)::text)
      from custom.record x
     where x.organization_id = v_from
       and (   (x.table_id = custom.field_kernel_id() and x.data_class <> 'kernel' and x.deleted_at is null
                and x.data ->> 'entity_definition_id' = v_id::text)
            or (v_with and x.table_id = v_id and x.data_class = 'record' and x.deleted_at is null
                and coalesce(x.metadata ->> 'quarantine', 'false') <> 'true' and x.id = any (v_seen)))), '{}'::jsonb);
  v_data := coalesce(custom._without_rows_of(custom._uuid_remap(v_src.data, v_map), v_from, v_id), '{}'::jsonb)
            || jsonb_build_object('name', v_name, 'slug', v_slug, 'kept_by_the_app', true, 'kept_for', 'copying');
  if v_parent is not null then
    v_data := v_data || jsonb_build_object('parent_id', v_parent::text);
  end if;
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
  values (v_new, v_to, custom.table_kernel_id(), 'table', v_data,
          custom._copied_metadata(v_src.metadata), v_src.shown_to);

  return jsonb_build_object(
    'duplicated', true,
    'table', jsonb_build_object('id', v_new, 'name', v_name),
    'from', jsonb_build_object('id', v_id, 'name', v_src_name, 'organization_id', v_from),
    'organization', jsonb_build_object('id', v_to, 'name', v_to_name),
    'event_id', v_event,
    'path', '/data-v2/' || v_new::text)
    || custom._table_duplicate_step(v_new, c_budget);
end;
$function$;

create or replace function custom.table_duplicate_continue(p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  -- ONE PASS'S TIME BUDGET (see custom.table_duplicate): stop starting new work 2.5 s into the call.
  c_budget  constant interval := interval '2.5 seconds';
  v_me      uuid := custom.query_principal();
  v_to      uuid;
  v_name    text;
  v_inv     jsonb;
  v_opens   jsonb;
begin
  if v_me is null then
    raise exception 'Sign in to carry on with a copy.' using errcode = '42501';
  end if;
  select t.organization_id, t.data ->> 'name' into v_to, v_name
    from custom.record t
   where t.id = p_table_id and t.table_id = custom.table_kernel_id() and t.deleted_at is null
   limit 1;
  select m.inverse into v_inv
    from history.migration_log m
   where m.organization_id = v_to and m.verb = 'duplicate' and m.target_kind = 'table' and m.target_id = p_table_id
   order by m.applied_at desc limit 1;
  -- Only the person who started a copy carries it on; anybody else hears the same sentence as
  -- for a table that is not a copy at all.
  if v_to is null or v_inv is null or (v_inv ->> 'by') is distinct from v_me::text then
    raise exception 'That is not a copy you are making, so there is nothing to carry on.'
      using errcode = '42501';
  end if;
  perform custom.assert_client_may_reach(v_to, 'custom.table_duplicate_continue');
  perform custom.assert_store_door(v_to, 'custom.table_duplicate_continue');
  -- The source is asked again, every pass: a person who lost access mid-copy copies no more.
  v_opens := custom.where_id_opens((v_inv ->> 'duplicated_from')::uuid);
  if v_opens is null or v_opens ->> 'kind' is distinct from 'table' then
    raise exception 'The table this was being copied from is no longer one you have been given, so the copy stops here.'
      using errcode = '42501';
  end if;
  perform custom.assert_client_may_reach((v_inv ->> 'duplicated_from_organization_id')::uuid, 'custom.table_duplicate_continue');
  return jsonb_build_object(
    'duplicated', true,
    'table', jsonb_build_object('id', p_table_id, 'name', v_name),
    'path', '/data-v2/' || p_table_id::text)
    || custom._table_duplicate_step(p_table_id, c_budget);
end;
$function$;

comment on function custom.table_duplicate_continue(uuid) is
  'TABLE-ACTIONS. Carries on a copy custom.table_duplicate started: one bounded pass (new work stops 2.5 s into the call; small units), answering copying|done with progress, then what stayed behind. Only the person who started the copy; the source is re-checked every pass.';

comment on function custom.table_duplicate(uuid, boolean, text, uuid) is
  'TABLE-ACTIONS. Duplicates a Table the caller may open into an organization the caller is a member of (default: the same one): its settings and look, every live Field (new ids), every choice list as a new list (same words, keys, order), every live saved view (filters, sorts, layouts and every id inside them remapped to the copy), and with p_with_records every live record the caller may open, its values through the read doors'' own field mask (custom.read_mask_for + custom.mask_document: a column the caller may not read is copied empty and named in left_behind.hidden_columns); links within the Table follow to the copy, links to other Tables stay, and a reference to a row that was not copied is taken out. Name: p_name, else "<name> (copy)", "(copy 2)", …. Writes one history.migration_log row on the new Table (verb duplicate); the source is never written. Paged: it makes the copy''s Table record, stops starting new work 1.5 s into the call and answers status copying|done with progress; custom.table_duplicate_continue carries it on. Refuses with one sentence: not given / archived / still being copied / not a member of the destination / a column linking across organizations.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_duplicate',
   'p_table_id uuid, p_with_records boolean, p_name text, p_organization_id uuid',
   array['uuid'::regtype::oid, 'bool'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'Takes a Table id. Refuses unless custom.where_id_opens says the signed-in caller may open that Table (the organization wall or a share, then the ladder at viewer), the Table is live, and the caller is a member of the destination organization (iam.is_org_member) whose record store is open (custom.assert_client_may_reach + custom.assert_store_door, exactly what custom.table_declare asks). Only then does it write a NEW Table in the destination with copies of the source''s live Fields, choice lists, the saved views the caller may see and (when asked) the records the caller is handed (custom.query_visible_ids at viewer), each record''s values through the read doors'' field mask (custom.read_mask_for + custom.mask_document), so a copy never carries a value the caller could not read. It never writes the source.',
   'tableactions_a_table_can_be_duplicated.sql', null, true, false,
   jsonb_build_object(
     'version', 1,
     'declared_by', 'tableactions_a_table_can_be_duplicated.sql',
     'arguments', jsonb_build_object(
       'p_table_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false,
         'check', 'custom.where_id_opens(p_table_id) decides first (the organization wall or a share, then the ladder at viewer); a Table the caller may not open is refused 42501 with the same sentence as one that does not exist, and only the resolved id is read after that.',
         'access', 'viewer on the Table (custom.where_id_opens)',
         'entity', 'custom_record',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
                                       'note', 'A foreign or invented id gets the same refusal; the copy is made only from a Table the caller may already open, so it cannot widen what the caller sees.'),
         'null_rule', jsonb_build_object('says', 'Say which table to duplicate.', 'sqlstate', '22004')),
       'p_with_records', jsonb_build_object(
         'type', 'boolean', 'position', 2, 'optional', true, 'sql_default', 'false',
         'check', 'A choice: copy the live records the caller is handed too, any number, in pages (custom.table_duplicate_continue).',
         'foreign', jsonb_build_object('not_an_id', true),
         'null_rule', jsonb_build_object('means', 'false')),
       'p_name', jsonb_build_object(
         'type', 'text', 'position', 3, 'optional', true, 'sql_default', 'null',
         'check', 'The copy''s name; blank or null means "<name> (copy)", made unique in the destination.',
         'foreign', jsonb_build_object('not_an_id', true),
         'null_rule', jsonb_build_object('means', '"<name> (copy)", then "(copy 2)", …')),
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 4, 'optional', true, 'sql_default', 'null',
         'check', 'The destination. iam.is_org_member(caller, p_organization_id) decides before anything is written (refused 42501 by name), then custom.assert_client_may_reach and custom.assert_store_door; a non-member, an invented id and a foreign one get the same sentence.',
         'access', 'member',
         'entity', 'organization',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
                                       'note', 'The copy is written only into an organization the caller is a member of.'),
         'null_rule', jsonb_build_object('means', 'the source Table''s own organization'))))),
  ('custom', 'table_duplicate_continue',
   'p_table_id uuid',
   array['uuid'::regtype::oid],
   'Takes the id of a copy custom.table_duplicate started. Refuses unless that copy''s job (its history.migration_log row, verb duplicate) was started by the signed-in caller, the caller still reaches the destination organization (custom.assert_client_may_reach + custom.assert_store_door), and custom.where_id_opens still says the caller may open the source Table. Only then does it spend one bounded pass copying what remains (choice lists, fields, views, records through the read doors'' field mask, links), and answers copying|done with progress. It never writes the source.',
   'tableactions_a_table_can_be_duplicated.sql', null, true, false,
   jsonb_build_object(
     'version', 1,
     'declared_by', 'tableactions_a_table_can_be_duplicated.sql',
     'arguments', jsonb_build_object(
       'p_table_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false,
         'check', 'The copy''s id. Its duplicate job must name the caller as the one who started it; a copy somebody else is making, an invented id and a table that is not a copy all get the same 42501 sentence. The source is re-checked with custom.where_id_opens on every pass.',
         'access', 'the person who started the copy',
         'entity', 'custom_record',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
                                       'note', 'Only the caller''s own copy is carried on, and only from a source the caller may still open.'),
         'null_rule', jsonb_build_object('says', 'That is not a copy you are making, so there is nothing to carry on.', 'sqlstate', '42501')))))
on conflict do nothing;

grant execute on function custom.table_duplicate(uuid, boolean, text, uuid) to authenticated;
grant execute on function custom.table_duplicate_continue(uuid) to authenticated;

select set_config('platform.closed_schema_sweep', '0', true);
