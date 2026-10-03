-- chair-step: this GRANTs EXECUTE on THREE new functions — custom.table_duplicate(uuid, boolean, text, uuid), custom.table_duplicate_continue(uuid) and custom.table_copies_in_progress() — to `authenticated`, after declaring each in platform.client_callable_door (signed-in callers only; anon gains nothing), and REVOKEs PUBLIC's implicit EXECUTE on the eight new internal helpers it adds. It REPLACES seven peer bodies, each declared below with the body it was written against: custom.table_kept_out_of_lists (a copy being made joins the kept-out set), custom.tables_at_home (a copy being made is in no Home list but its maker's), custom.assert_may_know_table, custom.assert_client_may_open and custom.assert_client_may_change (each asks custom._copy_in_progress_guard: a table still being copied answers only its maker), custom._field_reads_what_it_reads (no cycle walk for a column the copy writes) and custom.trg_associations_bump_visibility (no per-row organization version bump while a copy is written; one bump at handover). No table, column, trigger or policy is touched; the only rows written are the door-register rows. No strong lock: CREATE FUNCTION and INSERTs into the register. The schema-wide door-reopen sweep is held off for this transaction only (see "THE SWEEP" below).
-- lock: custom
-- lane: TABLE-ACTIONS
-- based-on: custom.table_kept_out_of_lists(text) 36607167b69fb78a08c5777621ef8d6802ef88cda2622c10ee94188c070f1865
-- based-on: custom.assert_may_know_table(uuid, uuid, text) 5f76f911bd987e79f75178983a636badb097abbcd513ec6083580e4997f231da
-- based-on: custom.assert_client_may_open(uuid, uuid, text, permission_level, text) 6a95285026132e93020169e2995d14b3a422cc73581676852702b7fd7e459d18
-- based-on: custom.assert_client_may_change(uuid, uuid, text, permission_level, text) 6976bb1bb47394294021f9caf0567bc94fc9686040e12491a467e040e3a7b3af
-- based-on: custom._field_reads_what_it_reads() 22aaa6382efe9f384d9c696a9902c7a172c9dfbd8019a31b33bacd7c53124c6f
-- based-on: custom.trg_associations_bump_visibility() 283af85cf282d9e72e35821eced1a0f07ebf4aceb6c4653b15867c0739c9c2e2
-- based-on: custom.tables_at_home(uuid, uuid[]) ac36784874b016f818478a4aa79515c093ff18897625e9489d4336a8db245648
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
-- first call (custom.table_duplicate) checks the rights, fixes what the copy carries (the
-- columns, views and choice lists live now, the maker's read mask, and which rows made by now the
-- maker is handed), records the job and makes the copy's Table record; the client then calls
-- custom.table_duplicate_continue(<the copy>) until "done". Every pass does at least one unit and
-- starts no new unit 1.5 s (first call) / 2.5 s (later) into the call; a unit is small (a choice
-- list's Table, its columns, 200 options, 5 stored columns, ONE worked-out column, one view, 25
-- records, 50 links). Later passes read what is fixed from the job (no visible-set or mask is
-- worked out again) and page records and links from cursors the job keeps. Each copied row's id
-- is worked out from the copy and the source row (custom._duplicate_id), so the copy is
-- resumable and exactly-once. One pass at a time per copy (an advisory lock; a second answers
-- "busy" and the client waits). The job is the copy's one history row (verb "duplicate"): state
-- copying | done | failed | discarded. While copying the copy is kept_for "copying" and "Shown to:
-- only me": out of every table list (custom.table_kept_out_of_lists, and "only me" even where a
-- list asks for the app's own tables) and refused by every open, read, view and write door
-- to anyone but its maker (custom._copy_in_progress_guard). Its maker finds unfinished copies with
-- custom.table_copies_in_progress() and carries one on or discards it (archiving the half copy;
-- its job is then closed). A source archived, or with an archive under way, while it is copied
-- fails the copy: it is not handed over and the answer says so. The organization's version is
-- bumped once, at handover, never per row. No record ceiling.
--
-- THE SOURCE MAY MOVE WHILE IT IS COPIED. The copy's structure and row set are the ones fixed at
-- the first pass: a column archived since is still copied (complete for the rows copied before)
-- and named in changed_during_copy.columns_archived_since; rows changed after they were copied
-- keep their values then and are counted (rows_changed_after_copied), as are rows archived or
-- added since. Counts are exact: totals are what was fixed.
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
--   Ids of source ROWS the copy carries are rewritten by custom._remap_rows against the job.
--   An id the map does not hold (another Table, a person, a file) is left exactly as it was.
--   metadata.copied_from_view on a copied view keeps the source view's id on purpose (provenance).
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

CREATE OR REPLACE FUNCTION custom.table_kept_out_of_lists(p_kept_for text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  -- WHICH PLACEMENT WORDS STAY OUT OF EVERY DEFAULT LIST (lane CHAIR-DOORS-2, v6 N-C8). One word today:
  -- agent_output — the table an agent's outputs land in (KINDS-GLUE wave 2). A list shows such a Table
  -- only when its caller asks (p_include_app_tables). Null and every other word: not kept out.
  select coalesce(p_kept_for, '') = any (array['agent_output', 'copying'])
$function$;

CREATE OR REPLACE FUNCTION custom.tables_at_home(p_organization_id uuid, p_home_ids uuid[])
 RETURNS TABLE(table_id uuid, home_record_id uuid, kind text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.tables_at_home');
  -- THIS DOOR TAKES A LIST, so the answer is FILTERED rather than refused: asking about ten
  -- homes and being refused because one of them is somebody else's would be a different
  -- leak, told the other way round. Both ends are asked — the Home the placement is in and
  -- the Table it places — because either one alone tells her something (VIS-5).
  return query
    select h.table_id, h.home_record_id, h.kind
      from custom.home h
     where h.organization_id = p_organization_id
       and h.home_record_id = any (p_home_ids)
       and (custom.query_is_store_owner()
            or (v_me is not null
                and custom.has_visibility(v_me, 'record', h.home_record_id, 'viewer'::public.permission_level)
                and custom.has_visibility(v_me, 'record', h.table_id, 'viewer'::public.permission_level)))
       -- TABLE-ACTIONS: a table still being copied is in no Home list but its maker's.
       and not exists (select 1 from custom.record t
                        where t.organization_id = p_organization_id and t.id = h.table_id
                          and t.data ->> 'kept_for' = 'copying'
                          and t.created_by is distinct from v_me);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.assert_may_know_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid;
  v_pred text;
  v_any  boolean := false;
  v_memo text := 'w:k:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS TABLE. The wall
  -- below is part of that yes: this memo entry is only ever written after it has been passed.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
    return;
  end if;

  -- The wall first, always, and in the same order every other door asks it.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- WAY THROUGH 1: the Table record itself. Unchanged — this is the whole of what this
  -- function used to be, and it is still the answer under the shipped setting.
  if custom.query_is_store_owner() then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  v_me := custom.query_principal();
  if v_me is null or p_table_id is null then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  -- TABLE-ACTIONS: a table still being copied answers only the person copying it (its rows,
  -- its columns, its views). Everyone else hears one sentence until the copy is handed over.
  perform custom._copy_in_progress_guard(p_table_id, v_me);
  if custom.has_visibility(v_me, 'record', p_table_id, 'viewer'::public.permission_level) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- WAY THROUGH 2: anything IN it that she may see. The same ladder, asked set-wise over the
  -- table's own partition and stopped at the first row.
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  execute format(
    'select exists (select 1 from custom.record r
                     where r.organization_id = %L::uuid
                       and r.table_id = %L::uuid
                       and r.deleted_at is null
                       and (%s)
                     limit 1)', p_organization_id, p_table_id, v_pred)
    into v_any;
  if v_any then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- NEITHER. T10's refusal, word for word — and it is now true when it is said: there is
  -- nothing in this table she may see, so telling her it exists would be the leak.
  raise exception 'You do not have access to this table, so % has nothing to show you.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.assert_client_may_open(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'viewer'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
begin
  -- ONE order, always, and it is `custom.assert_client_may_change`'s order: the
  -- organization wall first, then the row.
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
    return;
  end if;
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous doors, which have
  -- already decided the request against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- TABLE-ACTIONS: a table still being copied answers only the person copying it (its rows,
  -- its columns, its views). Everyone else hears one sentence until the copy is handed over.
  perform custom._copy_in_progress_guard(p_subject_id, v_me);

  -- WHERE THE SUBJECT ACTUALLY LIVES, BY ITS ID AND NOTHING ELSE (2026-09-23).
  -- This used to look only inside p_organization_id and RETURN — let the call through —
  -- when the subject was elsewhere, trusting every door to filter by that organization a
  -- line later. Sixteen doors never did: `custom.record_as_of` handed a member of one
  -- organization the full, unmasked state of a record in an organization she does not
  -- belong to (proven live 2026-09-23 as test@test.com, rolled back). Access is a question
  -- about the PERSON and the ROW, never about which organization was passed in
  -- (organization-is-the-container rule 5).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.id = p_subject_id;

  -- Not there at all: the door raises its own 02000, the same for an invented id.
  if v_subject_org is null then
    return;
  end if;

  -- The platform's globally readable tenants (the Matrx System kernel Tables every
  -- organization builds on) stay reachable exactly as before.
  if v_subject_org is distinct from p_organization_id
     and exists (select 1 from iam.system_orgs s
                  where s.organization_id = v_subject_org and s.global_readable) then
    return;
  end if;

  -- THE ONE LADDER, asked about the row wherever it lives.
  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  raise exception 'You do not have access to this %, so % has nothing to show you.',
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization.',
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            p_required);
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
  v_held        public.permission_level;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    return;
  end if;
  -- ONE order, always: the organization wall first, then the row.
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

  -- TABLE-ACTIONS: a table still being copied answers only the person copying it (its rows,
  -- its columns, its views). Everyone else hears one sentence until the copy is handed over.
  perform custom._copy_in_progress_guard(p_subject_id, v_me);

  -- WHERE THE SUBJECT ACTUALLY LIVES, BY ITS ID AND NOTHING ELSE (2026-09-23). A subject
  -- outside p_organization_id used to be waved through on the promise that the door would
  -- filter by that organization; the same promise was broken on the read side
  -- (`custom.record_as_of`, a cross-organization leak proven live). Access is decided by the
  -- PERSON and the ROW (organization-is-the-container rule 5).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.id = p_subject_id;

  -- Not there at all: the door raises its own 02000 a line later.
  if v_subject_org is null then
    return;
  end if;

  -- The globally readable platform tenant's kernel Tables: unchanged — the door decides.
  if v_subject_org is distinct from p_organization_id
     and exists (select 1 from iam.system_orgs s
                  where s.organization_id = v_subject_org and s.global_readable) then
    return;
  end if;

  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  -- THE REFUSAL NAMES THE RUNG HELD, NOT ONLY THE RUNG NEEDED (lane TAILS, 2026-09-21).
  v_held := custom.effective_level(v_me, v_subject_org, p_subject_id, 'record');

  if v_held is null then
    raise exception 'You do not have access to this %, so % may not write to it.',
      coalesce(nullif(btrim(p_subject_word), ''), 'record'),
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '42501',
            hint = format(
              'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              p_required);
  end if;

  raise exception 'You hold the % level on this %, and % needs the % level.',
    v_held,
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door'),
    p_required
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question, on ONE ladder: viewer < commenter < editor < admin. You hold %s on this %s and %s needs the %s level, so ask an admin of this %s - or an owner of this organization - to raise your level. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
            v_held,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_door), ''), 'that door'),
            p_required,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'));
end
$function$;

CREATE OR REPLACE FUNCTION custom._field_reads_what_it_reads()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_deps  jsonb;
  v_floor record;
  v_path  text[];                      -- STORE-TAILS-3: a circle this definition would close
  v_cp    record;                      -- STORE-TAILS-3: the agent-visibility floor
  r       record;
begin
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  -- STORE-TAILS-3: A COLUMN AN AGENT IS NOW KEPT FROM MORE FIRMLY TAKES ITS READERS WITH IT
  -- (any column, worked out or not — Budget is a plain number). Every formula, lookup and rollup
  -- that reads it, directly or through another, is given at least the same word, here, in the
  -- write that raised it; each reader's own write passes this same trigger and carries it on.
  if tg_op = 'UPDATE'
     and custom.context_policy_rank(new.data ->> 'context_policy')
         > custom.context_policy_rank(old.data ->> 'context_policy') then
    for r in
      select f.organization_id, f.id
        from custom.record f
       where f.organization_id = new.organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel'
         and f.id <> new.id
         and f.data ->> 'type' = 'formula'
         and coalesce(f.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']
         and custom.context_policy_rank(f.data ->> 'context_policy') < custom.context_policy_rank(new.data ->> 'context_policy')
         and exists (select 1 from custom.field_input_closure(f.organization_id, f.data, f.id) c
                      where c.input_id = new.id)
    loop
      update custom.record
         set data = jsonb_set(data, '{context_policy}', to_jsonb(new.data ->> 'context_policy'))
       where organization_id = r.organization_id
         and id = r.id;
    end loop;
  end if;
  if coalesce(new.data ->> 'type', '') <> 'formula'
     or not (coalesce(new.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']) then
    return new;
  end if;
  -- A retirement is not a change of shape (the shared rule): the document stays byte-for-byte
  -- what it was, so every guard after this one still sees a retirement.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at, old.data, new.data,
                                old.table_id, new.table_id, old.organization_id,
                                new.organization_id, old.data_class, new.data_class) then
    return new;
  end if;

  -- STORE-TAILS-3: A COLUMN THAT WOULD READ ITSELF IS NOT SAVED. The walk starts from the
  -- definition being written (not the stored one) and comes back to this column's id through
  -- whatever reads it — by id, or by key for a lookup's far column and the older formula shape.
  -- TABLE-ACTIONS: a column custom.table_duplicate copies is not walked for a circle. The graph
  -- is the source's, already proven acyclic when its columns were saved, and the copy remaps it
  -- one to one (every id it reads becomes the copy's own), so the walk could only say "no" —
  -- at 5-6 s a computed column in a large organization. Marked by the copy's own transaction-
  -- local setting, which no client can set (set_config is no client door).
  if new.deleted_at is null
     and coalesce(current_setting('custom.table_duplicate_into', true), '') is distinct from new.data ->> 'entity_definition_id' then
    v_path := custom.field_cycle(new.organization_id, new.data, new.id);
    if v_path is not null then
      raise exception 'The column "%" would be worked out from itself: % — so it was not saved.',
        coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
        array_to_string(v_path, ' reads ')
        using errcode = '42P17',
              hint = 'STORE-TAILS-3: a formula, lookup or rollup that reads itself round a circle has no answer. Point one of the columns in that circle at something outside it, and save again.';
    end if;
  end if;

  -- depends_on: the columns of THIS table it reads, by key (the list custom.field_dependants
  -- and REC-18's "this field is used by …" read). Worked out from the definition, never typed.
  select coalesce(jsonb_agg(distinct i.input_key order by i.input_key), '[]'::jsonb)
    into v_deps
    from custom.field_inputs_of(new.organization_id, new.data) i
   where i.input_table::text = new.data ->> 'entity_definition_id'
     and not i.retired;
  if new.data -> 'depends_on' is distinct from v_deps then
    new.data := jsonb_set(new.data, '{depends_on}', v_deps);
  end if;

  select * into v_floor
    from custom.field_sensitivity_floor(new.organization_id, new.data, new.id);
  if v_floor.sensitivity is not null
     and custom.sensitivity_rank(new.data ->> 'sensitivity') < custom.sensitivity_rank(v_floor.sensitivity) then
    raise notice 'the column "%" reads %, which is %, so it is % too (it was %)',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_floor.reads) e),
      v_floor.sensitivity, v_floor.sensitivity, coalesce(new.data ->> 'sensitivity', 'nothing');
    new.data := jsonb_set(new.data, '{sensitivity}', to_jsonb(v_floor.sensitivity));
  end if;

  -- STORE-TAILS-3: WHAT AN AGENT MAY SEE FOLLOWS WHAT THE COLUMN READS, the same way sensitivity
  -- does. A column worked out from one the organization keeps out of conversations (`exclude`),
  -- gives an agent only on request, or only as a summary, is kept from an agent at least as
  -- firmly — raised to the strictest word among everything it reads, never lowered here.
  select * into v_cp
    from custom.field_context_policy_floor(new.organization_id, new.data, new.id);
  if v_cp.context_policy is not null
     and custom.context_policy_rank(new.data ->> 'context_policy') < custom.context_policy_rank(v_cp.context_policy) then
    raise notice 'the column "%" reads %, which an agent is given as "%", so an agent is given it as "%" too (it was "%")',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_cp.reads) e),
      v_cp.context_policy, v_cp.context_policy, coalesce(new.data ->> 'context_policy', 'nothing');
    new.data := jsonb_set(new.data, '{context_policy}', to_jsonb(v_cp.context_policy));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.trg_associations_bump_visibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row   record := coalesce(new, old);
  v_org   uuid;
begin
  -- The row's organization is established FIRST, because the off switch below is an
  -- org-overridable knob and resolving it without an organization silently reads the
  -- platform value for every tenant.
  v_org := v_row.organization_id;

  -- THE OFF SWITCH, READ INSIDE THE BODY. A trigger's guard cannot live in the file header: the
  -- header is not consulted at run time and an UPDATE would still pay for this work while every
  -- additive check read green. So the knob is read here, and while it resolves false this trigger
  -- is a no-op on every write to platform.associations.
  if not custom.store_is_open(v_org) then
    return null;
  end if;

  -- THE SECOND GATE, AND THE REASON THIS TRIGGER IS INERT FOR TODAY'S WRITES: it does nothing at
  -- all unless the row's role is one of the new store's declared carrying roles. A trigger WHEN
  -- clause cannot carry a subquery, so the check lives here, one index lookup on a three-row table.
  if not exists (
    select 1 from custom.carrying_rule cr
    where cr.is_active and cr.role = v_row.role
  ) then
    return null;
  end if;

  -- The moved record's own epoch, and its container's. Two rows, never a subtree.
  -- TABLE-ACTIONS: while custom.table_duplicate writes a copy (its own transaction-local mark),
  -- the organization's visibility version is NOT bumped per row: every pass used to hold that one
  -- hot row to its end, queueing every other writer in the organization. The half copy is hidden
  -- from everyone but its maker, and the copy bumps once, when it is handed over.
  if coalesce(current_setting('custom.table_duplicate_into', true), '') = '' then
    perform custom.bump_epoch(v_row.source_type, v_row.source_id, v_org);
    perform custom.bump_epoch(v_row.target_type, v_row.target_id, v_org);
  end if;

  -- The pair's cache entries go in the SAME COMMIT. This is the "invalidated in the same commit"
  -- half of VIS-7, and it is bounded: the pair, never the closure below it.
  delete from custom.visibility_cache c
   where (c.container_type = v_row.source_type and c.container_id = v_row.source_id)
      or (c.container_type = v_row.target_type and c.container_id = v_row.target_id)
      or (c.item_type      = v_row.source_type and c.item_id      = v_row.source_id)
      or (c.item_type      = v_row.target_type and c.item_id      = v_row.target_id);

  return null;
end;
$function$;

create or replace function custom._duplicate_id(p_copy uuid, p_old uuid)
returns uuid
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- THE COPY'S ID FOR ONE SOURCE ROW, worked out, never stored: the same copy and the same source
  -- row always give the same id. That is what makes a copy resumable without a job table — every
  -- pass reads what is already there off the copy itself.
  select md5(p_copy::text || ':' || p_old::text)::uuid;
$function$;

revoke execute on function custom._duplicate_id(uuid, uuid) from public;

comment on function custom._duplicate_id(uuid, uuid) is
  'TABLE-ACTIONS. The id a copy gives one source row: md5(copy:source) as a uuid, the same on every call, so a paged copy resumes from what already exists. Internal to custom.table_duplicate; no client grant.';

create or replace function custom._copy_in_progress_guard(p_subject_id uuid, p_me uuid)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_name text;
begin
  -- A TABLE STILL BEING COPIED ANSWERS ONLY THE PERSON COPYING IT. The subject is the Table
  -- itself or a row of it; the copy's maker is its Table record's created_by (stamped when the
  -- copy's first pass made it). Asked by custom.assert_may_know_table (every read door),
  -- custom.assert_client_may_open (open, views) and custom.assert_client_may_change (writes).
  if p_subject_id is null or p_me is null then
    return;
  end if;
  select coalesce(nullif(t.data ->> 'name', ''), 'This table') into v_name
    from custom.record s
    join custom.record t
      on t.organization_id = s.organization_id
     and t.id = case when s.table_id = custom.table_kernel_id() then s.id else s.table_id end
   where s.id = p_subject_id
     and t.table_id = custom.table_kernel_id()
     and t.data ->> 'kept_for' = 'copying'
     and t.created_by is distinct from p_me
   limit 1;
  if found then
    raise exception '% is still being copied, so only the person copying it can open it until the copy is finished.', v_name
      using errcode = '42501';
  end if;
end;
$function$;

revoke execute on function custom._copy_in_progress_guard(uuid, uuid) from public;

comment on function custom._copy_in_progress_guard(uuid, uuid) is
  'TABLE-ACTIONS. Refuses, with one sentence, anyone but its maker on a Table still being copied (kept_for copying) or a row of it. Asked by custom.assert_may_know_table, custom.assert_client_may_open and custom.assert_client_may_change. Internal; no client grant.';

create or replace function custom._remap_rows(p_doc jsonb, p_copy uuid, p_job jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_text text;
  v_id   text;
  v_src  uuid := (p_job ->> 'duplicated_from')::uuid;
  v_org  uuid := (p_job ->> 'duplicated_from_organization_id')::uuid;
begin
  -- EVERY ID OF A SOURCE ROW THIS COPY CARRIES becomes that row's id in the copy (any letter
  -- case). Which rows the copy carries was fixed when it started (custom.table_duplicate:
  -- live then, made by then, handed to its maker): asked here row by row against the job, so no
  -- pass works the whole set out again. An id of a row it does not carry is left for
  -- custom._without_rows_of to take out.
  if p_doc is null then
    return null;
  end if;
  v_text := p_doc::text;
  for v_id in
    select distinct m[1]
      from regexp_matches(v_text, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'gi') m
  loop
    if custom._duplicate_carries_row(p_job, v_org, v_src, lower(v_id)::uuid) then
      v_text := replace(v_text, v_id, custom._duplicate_id(p_copy, lower(v_id)::uuid)::text);
    end if;
  end loop;
  return v_text::jsonb;
end;
$function$;

create or replace function custom._duplicate_carries_row(p_job jsonb, p_org uuid, p_src uuid, p_id uuid)
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- Is this source row one the copy carries? Live and made when the copy started, not
  -- quarantined, and handed to its maker then (the job keeps whichever is shorter: the rows
  -- handed, or the rows not handed).
  select coalesce((p_job ->> 'with_records')::boolean, false)
     and exists (
       select 1 from custom.record r
        where r.organization_id = p_org and r.id = p_id and r.table_id = p_src
          and r.data_class = 'record'
          and r.created_at <= (p_job ->> 'cutoff')::timestamptz
          and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true')
     and case when p_job ? 'rows_handed'
              then (p_job -> 'rows_handed') ? p_id::text
              else not (coalesce(p_job -> 'rows_not_handed', '{}'::jsonb) ? p_id::text) end;
$function$;

revoke execute on function custom._remap_rows(jsonb, uuid, jsonb) from public;
revoke execute on function custom._duplicate_carries_row(jsonb, uuid, uuid, uuid) from public;

comment on function custom._remap_rows(jsonb, uuid, jsonb) is
  'TABLE-ACTIONS. Rewrites every id of a source row the copy carries to that row''s id in the copy. Internal to custom.table_duplicate; no client grant.';
comment on function custom._duplicate_carries_row(jsonb, uuid, uuid, uuid) is
  'TABLE-ACTIONS. Whether a source row is one the copy carries, as fixed when the copy started. Internal; no client grant.';

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
  -- The budget is counted from the start of THIS CALL (statement_timestamp), and is asked only
  -- after a pass has done at least one unit, so every pass moves the copy on.
  v_start      timestamptz := statement_timestamp();
  v_units      integer := 0;
  v_me         uuid := custom.query_principal();
  v_job        record;
  v_inv        jsonb;
  v_from       uuid;
  v_to         uuid;
  v_src        uuid;
  v_with       boolean;
  v_cutoff     timestamptz;
  v_fields     uuid[];
  v_views      uuid[];
  v_lists      uuid[];
  v_visible    text[];
  v_declared   text[];
  v_hidden     text[];
  v_self_keys  text[];
  v_dead_keys  text[];
  v_map        jsonb;
  v_opt        uuid;
  v_opt_data   jsonb;
  v_opt_meta   jsonb;
  v_opt_shown  platform.shown_to;
  v_new_opts   uuid;
  v_opt_dead   text[];
  v_view       record;
  v_new_view   uuid;
  v_def        jsonb;
  v_meta       jsonb;
  v_k          integer;
  v_cursor     jsonb;
  v_step       text := 'done';
  v_status     text := 'copying';
  v_sentence   text;
  v_src_live   boolean;
  v_src_name   text;
  v_d_fields   bigint; v_d_views bigint; v_d_lists bigint; v_d_recs bigint;
  v_out        jsonb;
  v_setup_ms   numeric;
begin
  -- ONE PASS AT A TIME PER COPY. A second pass that arrives while one is running answers "busy"
  -- (the client waits and asks again), never a duplicate-key error halfway through a page.
  if not pg_try_advisory_xact_lock(hashtextextended('custom.table_duplicate:' || p_copy::text, 0)) then
    return jsonb_build_object('status', 'busy', 'step', 'busy',
      'sentence', 'Another pass of this copy is running. Wait a moment and carry on.');
  end if;

  -- THE JOB is the copy's one history row (verb "duplicate"): its stored undo carries what the
  -- copy was asked for and everything fixed when it started.
  select m.id, m.organization_id, m.inverse into v_job
    from history.migration_log m
   where m.verb = 'duplicate' and m.target_kind = 'table' and m.target_id = p_copy
   order by m.applied_at desc
   limit 1;
  if v_job.id is null then
    raise exception 'That is not a copy that is being made, so there is nothing to carry on.'
      using errcode = '42501';
  end if;
  v_inv    := v_job.inverse;
  v_to     := v_job.organization_id;
  v_from   := (v_inv ->> 'duplicated_from_organization_id')::uuid;
  v_src    := (v_inv ->> 'duplicated_from')::uuid;
  v_with   := coalesce((v_inv ->> 'with_records')::boolean, false);
  v_cutoff := (v_inv ->> 'cutoff')::timestamptz;
  select coalesce(array_agg(x::uuid), '{}') into v_fields from jsonb_array_elements_text(v_inv -> 'fields') x;
  select coalesce(array_agg(x::uuid), '{}') into v_views  from jsonb_array_elements_text(v_inv -> 'views') x;
  select coalesce(array_agg(x::uuid), '{}') into v_lists  from jsonb_array_elements_text(v_inv -> 'choice_lists') x;
  select coalesce(array_agg(x), '{}') into v_visible   from jsonb_array_elements_text(v_inv -> 'mask_visible') x;
  select coalesce(array_agg(x), '{}') into v_declared  from jsonb_array_elements_text(v_inv -> 'mask_declared') x;
  select coalesce(array_agg(x), '{}') into v_hidden    from jsonb_array_elements_text(v_inv -> 'mask_hidden') x;
  select coalesce(array_agg(x), '{}') into v_self_keys from jsonb_array_elements_text(v_inv -> 'self_keys') x;
  select coalesce(array_agg(x), '{}') into v_dead_keys from jsonb_array_elements_text(v_inv -> 'dead_keys') x;

  -- ALREADY OVER: handed over, failed, or discarded (the half copy archived).
  if (v_inv ->> 'state') in ('done', 'failed', 'discarded') then
    v_status := v_inv ->> 'state';
  elsif exists (select 1 from custom.record t where t.organization_id = v_to and t.id = p_copy and t.deleted_at is not null) then
    v_inv := v_inv || jsonb_build_object('state', 'discarded', 'open', false);
    update history.migration_log set inverse = v_inv where id = v_job.id;
    v_status := 'discarded';
  end if;

  -- THE SOURCE IS STILL WHOLE, OR THE COPY STOPS. An archived source, or one whose archive has
  -- started, would be handed over half-copied; instead the copy is marked failed, kept hidden,
  -- and the person is told how to discard it.
  if v_status = 'copying' then
    select t.deleted_at is null, coalesce(nullif(t.data ->> 'name', ''), 'The table') into v_src_live, v_src_name
      from custom.record t where t.organization_id = v_from and t.id = v_src;
    if not coalesce(v_src_live, false)
       or exists (select 1 from history.migration_log a
                   where a.organization_id = v_from and a.verb = 'archive' and a.target_kind = 'table'
                     and a.target_id = v_src and a.undone_at is null
                     and coalesce((a.inverse ->> 'open')::boolean, false)) then
      v_sentence := format('%s was archived while it was being copied, so the copy was stopped and not handed over. Discard it from your unfinished copies.',
                           coalesce(v_src_name, 'The table'));
      v_inv := v_inv || jsonb_build_object('state', 'failed', 'open', false, 'why', v_sentence);
      update history.migration_log set inverse = v_inv where id = v_job.id;
      v_status := 'failed';
    end if;
  end if;

  if v_status = 'copying' then
    -- EVERY ROW THIS PASS WRITES IS PART OF THE ONE DUPLICATE EVENT (history.migration_record's
    -- own mark, set again for this statement), and this transaction is marked as writing this
    -- copy: the organization's version is bumped once at handover rather than per row, and no cycle walk for the columns it copies.
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   v_job.id::text,              true);
    perform set_config('history.mark_verb', 'duplicate',                 true);
    perform set_config('custom.table_duplicate_into', p_copy::text, true);

    -- THE MAP of structure ids (bounded by the Table's shape, never its rows): the Table, its
    -- columns as fixed when the copy started, and every choice list with its columns and options.
    v_map := jsonb_build_object(v_src::text, p_copy::text);
    v_map := v_map || coalesce((select jsonb_object_agg(f::text, custom._duplicate_id(p_copy, f)::text)
                                  from unnest(v_fields) f), '{}'::jsonb);
    v_map := v_map || coalesce((
      select jsonb_object_agg(o.id::text, custom._duplicate_id(p_copy, o.id)::text)
        from custom.record o
       where o.organization_id = v_from
         and (   o.id = any (v_lists)
              or (o.table_id = custom.field_kernel_id() and o.data_class <> 'kernel' and o.deleted_at is null
                  and (o.data ->> 'entity_definition_id')::uuid = any (v_lists))
              or (o.table_id = any (v_lists) and o.data_class = 'record' and o.deleted_at is null))), '{}'::jsonb);

    -- How long this pass took before its first unit (reported in the answer as pass.setup_ms).
    v_setup_ms := round(extract(epoch from clock_timestamp() - v_start) * 1000);

    <<work>>
    loop
      -- 1. EVERY CHOICE LIST, AS A NEW ONE: its Table (in a Home of its own), its columns, its
      -- options in pages — words, colours, stable keys, order.
      foreach v_opt in array v_lists loop
        v_new_opts := custom._duplicate_id(p_copy, v_opt);
        select o.data, o.metadata, o.shown_to into v_opt_data, v_opt_meta, v_opt_shown
          from custom.record o where o.organization_id = v_from and o.id = v_opt;
        if not exists (select 1 from custom.record t where t.organization_id = v_to and t.id = v_new_opts) then
          if v_units > 0 and clock_timestamp() - v_start > p_budget then v_step := 'choices'; exit work; end if;
          insert into custom.record (id, organization_id, table_id, data)
          values (custom._duplicate_id(p_copy, v_new_opts), v_to, custom.person_kernel_id(),
                  jsonb_build_object('name', coalesce(nullif(v_opt_data ->> 'name', ''), 'Choices') || ' Home'));
          insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
          values (v_new_opts, v_to, custom.table_kernel_id(), 'table',
                  custom._uuid_remap(v_opt_data, v_map)
                    || jsonb_build_object(
                         'parent_id', custom._duplicate_id(p_copy, v_new_opts)::text,
                         'slug', left(regexp_replace(coalesce(nullif(v_opt_data ->> 'slug', ''), 'choices'),
                                                     '_[0-9a-f]{16,}$', '')
                                      || '_' || left(replace(v_new_opts::text, '-', ''), 20), 48)),
                  custom._copied_metadata(v_opt_meta), v_opt_shown);
          v_units := v_units + 1;
        end if;
        if exists (select 1 from custom.record x
                    where x.organization_id = v_from and x.table_id = custom.field_kernel_id()
                      and x.data_class <> 'kernel' and x.deleted_at is null
                      and x.data ->> 'entity_definition_id' = v_opt::text
                      and not exists (select 1 from custom.record c where c.organization_id = v_to
                                         and c.id = custom._duplicate_id(p_copy, x.id))) then
          if v_units > 0 and clock_timestamp() - v_start > p_budget then v_step := 'choices'; exit work; end if;
          insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
          select custom._duplicate_id(p_copy, x.id), v_to, x.table_id, x.data_class,
                 custom._uuid_remap(x.data, v_map), custom._copied_metadata(x.metadata), x.shown_to
            from custom.record x
           where x.organization_id = v_from and x.table_id = custom.field_kernel_id()
             and x.data_class <> 'kernel' and x.deleted_at is null
             and x.data ->> 'entity_definition_id' = v_opt::text
             and not exists (select 1 from custom.record c where c.organization_id = v_to
                                and c.id = custom._duplicate_id(p_copy, x.id))
           order by coalesce((x.data ->> 'sort')::integer, 0), x.created_at;
          v_units := v_units + 1;
        end if;
        select coalesce(array_agg(distinct d.data ->> 'key'), array[]::text[]) into v_opt_dead
          from custom.record d
         where d.organization_id = v_from and d.table_id = custom.field_kernel_id()
           and d.data_class <> 'kernel' and d.deleted_at is not null
           and d.data ->> 'entity_definition_id' = v_opt::text
           and not exists (select 1 from custom.record l
                            where l.organization_id = v_from and l.table_id = custom.field_kernel_id()
                              and l.data_class <> 'kernel' and l.deleted_at is null
                              and l.data ->> 'entity_definition_id' = v_opt::text
                              and l.data ->> 'key' = d.data ->> 'key');
        loop
          exit when not exists (
            select 1 from custom.record x
             where x.organization_id = v_from and x.table_id = v_opt and x.data_class = 'record' and x.deleted_at is null
               and not exists (select 1 from custom.record c where c.organization_id = v_to
                                  and c.id = custom._duplicate_id(p_copy, x.id)));
          if v_units > 0 and clock_timestamp() - v_start > p_budget then v_step := 'choices'; exit work; end if;
          insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
          select custom._duplicate_id(p_copy, x.id), v_to, v_new_opts, 'record',
                 custom._uuid_remap(x.data - '_values' - v_opt_dead, v_map), custom._copied_metadata(x.metadata), x.shown_to
            from custom.record x
           where x.organization_id = v_from and x.table_id = v_opt and x.data_class = 'record' and x.deleted_at is null
             and not exists (select 1 from custom.record c where c.organization_id = v_to
                                and c.id = custom._duplicate_id(p_copy, x.id))
           order by x.created_at, x.id
           limit c_options_per_unit;
          v_units := v_units + 1;
        end loop;
      end loop;

      -- 2. THE COLUMNS AS FIXED WHEN THE COPY STARTED (one archived in the source since is still
      -- copied — and named in the answer). Stored ones five at a time; a worked-out one (formula,
      -- lookup, rollup) one at a time, after every stored one, and never walked for a circle (see
      -- custom._field_reads_what_it_reads).
      loop
        exit when not exists (
          select 1 from custom.record f
           where f.organization_id = v_from and f.id = any (v_fields)
             and not exists (select 1 from custom.record c where c.organization_id = v_to
                                and c.id = custom._duplicate_id(p_copy, f.id)));
        if v_units > 0 and clock_timestamp() - v_start > p_budget then v_step := 'fields'; exit work; end if;
        insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
        select custom._duplicate_id(p_copy, f.id), v_to, f.table_id, f.data_class,
               coalesce(custom._without_rows_of(custom._remap_rows(custom._uuid_remap(f.data, v_map), p_copy, v_inv),
                                                v_from, v_src), '{}'::jsonb),
               custom._copied_metadata(f.metadata), f.shown_to
          from custom.record f
         where f.organization_id = v_from and f.id = any (v_fields)
           and not exists (select 1 from custom.record c where c.organization_id = v_to
                              and c.id = custom._duplicate_id(p_copy, f.id))
           and (coalesce(f.data ->> 'type', '') = 'formula' or coalesce(f.data ->> 'source', '') = 'formula')
               = not exists (select 1 from custom.record g
                              where g.organization_id = v_from and g.id = any (v_fields)
                                and coalesce(g.data ->> 'type', '') <> 'formula' and coalesce(g.data ->> 'source', '') <> 'formula'
                                and not exists (select 1 from custom.record c where c.organization_id = v_to
                                                   and c.id = custom._duplicate_id(p_copy, g.id)))
         order by coalesce((f.data ->> 'sort')::integer, 0), f.created_at
         limit case when exists (select 1 from custom.record g
                                  where g.organization_id = v_from and g.id = any (v_fields)
                                    and coalesce(g.data ->> 'type', '') <> 'formula' and coalesce(g.data ->> 'source', '') <> 'formula'
                                    and not exists (select 1 from custom.record c where c.organization_id = v_to
                                                       and c.id = custom._duplicate_id(p_copy, g.id)))
                    then c_fields_per_unit else 1 end;
        v_units := v_units + 1;
      end loop;

      -- 3. THE VIEWS fixed when the copy started (another person's "only me" view stays theirs),
      -- made through the house door for a new view (custom.view_declare), then given the source
      -- view's look, order, hand-set positions and "Shown to" by name. A view the house door
      -- refuses is named in the answer, never half made.
      for v_view in
        select sv.id, sv.name, sv.description, sv.definition, sv.metadata, sv.shown_to, sv.sort_order,
               (sv.is_default or (sv.definition -> 'is_default') = 'true'::jsonb) as is_default
          from platform.saved_view sv
         where sv.organization_id = v_from and sv.id = any (v_views)
           and not exists (select 1 from platform.saved_view c
                            where c.organization_id = v_to and c.subject_id = p_copy and c.deleted_at is null
                              and c.metadata ->> 'copied_from_view' = sv.id::text)
           and not (coalesce(v_inv -> 'views_failed', '{}'::jsonb) ? sv.id::text)
         order by sv.sort_order nulls last, sv.created_at
      loop
        if v_units > 0 and clock_timestamp() - v_start > p_budget then v_step := 'views'; exit work; end if;
        v_def := coalesce(custom._without_rows_of(custom._remap_rows(custom._uuid_remap(v_view.definition, v_map), p_copy, v_inv),
                                                  v_from, v_src), '{}'::jsonb);
        v_meta := coalesce(custom._without_rows_of(custom._remap_rows(custom._uuid_remap(coalesce(v_view.metadata, '{}'::jsonb), v_map),
                                                                      p_copy, v_inv), v_from, v_src), '{}'::jsonb);
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
        v_units := v_units + 1;
      end loop;

      -- 4. THE RECORDS fixed when the copy started, in pages, in (created_at, id) order from a
      -- cursor the job keeps (no pass reads the whole set), through the read mask fixed then:
      -- a column the maker may not read keeps its place in the copy and its values stay behind.
      if v_with then
        loop
          v_cursor := coalesce(v_inv -> 'record_cursor', '{}'::jsonb);
          exit when not exists (
            select 1 from custom.record r
             where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
               and r.deleted_at is null
               and (v_cursor = '{}'::jsonb
                    or (r.created_at, r.id) > ((v_cursor ->> 'at')::timestamptz, (v_cursor ->> 'id')::uuid))
               and custom._duplicate_carries_row(v_inv, v_from, v_src, r.id));
          if v_units > 0 and clock_timestamp() - v_start > p_budget then v_step := 'records'; exit work; end if;
          with page as (
            select r.*
              from custom.record r
             where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
               and r.deleted_at is null
               and (v_cursor = '{}'::jsonb
                    or (r.created_at, r.id) > ((v_cursor ->> 'at')::timestamptz, (v_cursor ->> 'id')::uuid))
               and custom._duplicate_carries_row(v_inv, v_from, v_src, r.id)
             order by r.created_at, r.id
             limit c_records_per_unit
          ), ins as (
            insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
            select custom._duplicate_id(p_copy, p.id), v_to, p_copy, 'record',
                   custom._remap_rows(custom._uuid_remap(
                     custom.mask_document(p.data - '_values' - v_dead_keys, v_visible, '{}'::jsonb,
                                          false, '{}'::jsonb, v_declared)
                     - v_hidden, v_map), p_copy, v_inv) - v_self_keys,
                   custom._copied_metadata(p.metadata), p.shown_to
              from page p
             where not exists (select 1 from custom.record c where c.organization_id = v_to
                                  and c.id = custom._duplicate_id(p_copy, p.id))
            returning 1
          )
          select jsonb_build_object('at', max_at, 'id', max_id) into v_cursor
            from (select p.created_at as max_at, p.id as max_id from page p order by p.created_at desc, p.id desc limit 1) z
           where (select count(*) from ins) >= 0;
          v_inv := jsonb_set(v_inv, '{record_cursor}', v_cursor, true);
          update history.migration_log set inverse = v_inv where id = v_job.id;
          v_units := v_units + 1;
        end loop;

        -- 5. THE LINKS WITHIN THE TABLE, once every row is there, from their own cursor: each
        -- follows to the copy's row; a link to a row the copy does not carry is left empty.
        if cardinality(v_self_keys) > 0 then
          loop
            v_cursor := coalesce(v_inv -> 'link_cursor', '{}'::jsonb);
            exit when not exists (
              select 1 from custom.record r
               where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
                 and (v_cursor = '{}'::jsonb
                      or (r.created_at, r.id) > ((v_cursor ->> 'at')::timestamptz, (v_cursor ->> 'id')::uuid))
                 and exists (select 1 from unnest(v_self_keys) k(key) where jsonb_typeof(r.data -> k.key) in ('string', 'array'))
                 and custom._duplicate_carries_row(v_inv, v_from, v_src, r.id));
            if v_units > 0 and clock_timestamp() - v_start > p_budget then v_step := 'links'; exit work; end if;
            with page as (
              select r.*
                from custom.record r
               where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
                 and (v_cursor = '{}'::jsonb
                      or (r.created_at, r.id) > ((v_cursor ->> 'at')::timestamptz, (v_cursor ->> 'id')::uuid))
                 and exists (select 1 from unnest(v_self_keys) k(key) where jsonb_typeof(r.data -> k.key) in ('string', 'array'))
                 and custom._duplicate_carries_row(v_inv, v_from, v_src, r.id)
               order by r.created_at, r.id
               limit c_links_per_unit
            ), patch as (
              select custom._duplicate_id(p_copy, p.id) as new_id,
                     jsonb_object_agg(k.key,
                       case jsonb_typeof(p.data -> k.key)
                         when 'string' then case when custom._duplicate_carries_row(v_inv, v_from, v_src, lower(p.data ->> k.key)::uuid)
                                                 then to_jsonb(custom._duplicate_id(p_copy, lower(p.data ->> k.key)::uuid)::text) end
                         else (select coalesce(jsonb_agg(to_jsonb(custom._duplicate_id(p_copy, lower(e.v)::uuid)::text)), '[]'::jsonb)
                                 from jsonb_array_elements_text(p.data -> k.key) e(v)
                                where e.v ~* '^[0-9a-f-]{36}$'
                                  and custom._duplicate_carries_row(v_inv, v_from, v_src, lower(e.v)::uuid))
                       end) filter (where jsonb_typeof(p.data -> k.key) in ('string', 'array')) as patch
                from page p cross join unnest(v_self_keys) k(key)
               group by p.id
            ), upd as (
              update custom.record x
                 set data = x.data || jsonb_strip_nulls(pt.patch)
                from patch pt
               where x.organization_id = v_to and x.id = pt.new_id and pt.patch is not null
              returning 1
            )
            select jsonb_build_object('at', z.created_at, 'id', z.id) into v_cursor
              from (select p.created_at, p.id from page p order by p.created_at desc, p.id desc limit 1) z
             where (select count(*) from upd) >= 0;
            v_inv := jsonb_set(v_inv, '{link_cursor}', v_cursor, true);
            update history.migration_log set inverse = v_inv where id = v_job.id;
            v_units := v_units + 1;
          end loop;
        end if;
      end if;

      -- 6. HANDED OVER: the copy stops being the app's work in progress and becomes a person's
      -- table; the organization's version is bumped once, now.
      update custom.record t
         set data = t.data - 'kept_by_the_app' - 'kept_for',
             shown_to = (v_inv ->> 'table_shown_to')::platform.shown_to
       where t.organization_id = v_to and t.id = p_copy;
      perform set_config('custom.table_duplicate_into', '', true);
      perform custom.bump_epoch('record', p_copy, v_to);
      v_inv := v_inv || jsonb_build_object('state', 'done', 'open', false);
      update history.migration_log set inverse = v_inv where id = v_job.id;
      v_status := 'done';
      v_step := 'done';
      exit work;
    end loop work;
    perform set_config('custom.table_duplicate_into', '', true);
  end if;

  -- PROGRESS, exact: totals are what was fixed when the copy started; done is read off the copy.
  select count(*) into v_d_fields from unnest(v_fields) f
   where exists (select 1 from custom.record c where c.organization_id = v_to and c.id = custom._duplicate_id(p_copy, f));
  select count(*) into v_d_lists from unnest(v_lists) l
   where exists (select 1 from custom.record c where c.organization_id = v_to and c.id = custom._duplicate_id(p_copy, l));
  select count(*) into v_d_views from platform.saved_view c
   where c.organization_id = v_to and c.subject_id = p_copy and c.deleted_at is null and c.metadata ? 'copied_from_view';
  if v_with then
    select count(*) into v_d_recs from custom.record c
     where c.organization_id = v_to and c.table_id = p_copy and c.data_class = 'record' and c.deleted_at is null;
  end if;

  v_out := jsonb_build_object(
    'status', v_status,
    'step', case when v_status = 'copying' then v_step else v_status end,
    'pass', jsonb_build_object('setup_ms', v_setup_ms, 'units', v_units,
                               'ms', round(extract(epoch from clock_timestamp() - v_start) * 1000)),
    'progress', jsonb_build_object(
      'choice_lists', jsonb_build_object('done', v_d_lists, 'total', cardinality(v_lists)),
      'fields',       jsonb_build_object('done', v_d_fields, 'total', cardinality(v_fields)),
      'views',        jsonb_build_object('done', v_d_views, 'total', cardinality(v_views)),
      'records',      case when v_with then jsonb_build_object('done', v_d_recs, 'total', (v_inv ->> 'records_total')::bigint) end));

  if v_status in ('failed', 'discarded') then
    v_out := v_out || jsonb_build_object('sentence',
      coalesce(v_inv ->> 'why', 'This copy was discarded, so there is nothing to carry on.'));
  end if;

  if v_status = 'done' then
    v_out := v_out || jsonb_build_object(
      'copied', jsonb_build_object(
        'fields', v_d_fields, 'choice_lists', v_d_lists,
        'choices', (select count(*) from custom.record o
                     where o.organization_id = v_to and o.data_class = 'record' and o.deleted_at is null
                       and o.table_id in (select custom._duplicate_id(p_copy, l) from unnest(v_lists) l)),
        'views', v_d_views, 'records', coalesce(v_d_recs, 0), 'with_records', v_with),
      'left_behind', (v_inv -> 'left_behind')
        || jsonb_build_object(
             'views_not_copied', coalesce((select jsonb_agg(value) from jsonb_each_text(coalesce(v_inv -> 'views_failed', '{}'::jsonb))), '[]'::jsonb)),
      -- WHAT MOVED IN THE SOURCE WHILE IT WAS BEING COPIED: the copy's structure is the one fixed
      -- when it started, so a column archived since is still here (complete for the rows copied
      -- before it went); a row changed after it was copied keeps the values it had then.
      'changed_during_copy', jsonb_build_object(
        'columns_archived_since', coalesce((
            select jsonb_agg(coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'))
              from custom.record f
             where f.organization_id = v_from and f.id = any (v_fields) and f.deleted_at is not null), '[]'::jsonb),
        'rows_changed_after_copied', (
            select count(*) from custom.record r
              join custom.record c on c.organization_id = v_to and c.id = custom._duplicate_id(p_copy, r.id)
             where r.organization_id = v_from and r.table_id = v_src and r.updated_at > c.created_at),
        'rows_archived_since', case when v_with then (
            select count(*) from custom.record r
             where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
               and r.deleted_at is not null and r.deleted_at > v_cutoff
               and custom._duplicate_carries_row(v_inv, v_from, v_src, r.id)) end,
        'rows_added_since', case when v_with then (
            select count(*) from custom.record r
             where r.organization_id = v_from and r.table_id = v_src and r.data_class = 'record'
               and r.deleted_at is null and r.created_at > v_cutoff) end));
  end if;
  return v_out;
end;
$function$;

revoke execute on function custom._table_duplicate_step(uuid, interval) from public;

comment on function custom._table_duplicate_step(uuid, interval) is
  'TABLE-ACTIONS. One bounded pass of a copy: choice lists, columns, views, records and links as fixed when the copy started, each unit small, at least one unit a pass, stopping when the time budget is spent; one pass at a time per copy (advisory lock, else "busy"); a source archived meanwhile fails the copy. Internal; no client grant.';

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
  -- ONE CALL'S TIME BUDGET. A client call is cancelled at 8 s (authenticated's statement_timeout).
  -- This first call does the copy's one-time work (rights, what it carries, the job, the Table
  -- record), then at least one unit, and starts no new unit 1.5 s into the call. The client then
  -- calls custom.table_duplicate_continue until "done".
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
  v_level      public.permission_level;
  v_mask       jsonb;
  v_visible    text[];
  v_declared   text[];
  v_hidden     text[];
  v_job        jsonb;
  v_total      bigint := 0;
  v_handed     jsonb;
  v_not_handed jsonb;
  v_hidden_out jsonb := '{}'::jsonb;
  v_refs_out   jsonb := '[]'::jsonb;
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
  perform custom.assert_client_may_reach(v_from, 'custom.table_duplicate');

  select r.* into v_src
    from custom.record r
   where r.organization_id = v_from and r.id = v_id;
  v_src_name := coalesce(nullif(btrim(v_src.data ->> 'name'), ''), 'This table');

  if v_src.data_class is distinct from 'table' then
    raise exception '% is part of how the record store is built, so it cannot be copied.', v_src_name
      using errcode = '42501';
  end if;
  if v_src.deleted_at is not null
     or exists (select 1 from history.migration_log a
                 where a.organization_id = v_from and a.verb = 'archive' and a.target_kind = 'table'
                   and a.target_id = v_id and a.undone_at is null
                   and coalesce((a.inverse ->> 'open')::boolean, false)) then
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

  -- A COLUMN'S OWN TARGET NEVER CROSSES AN ORGANIZATION. Refused here, by name, before anything is made.
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
  -- "(copy 2)", "(copy 3)", … until no Table of the destination being used or copied carries it.
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

  -- WHAT THE COPY CARRIES, FIXED NOW, ONCE: the columns and views live now, the choice lists they
  -- use, the read mask for this person (the same one custom.read_records asks), and with records,
  -- which live rows made by now this person is handed (custom.query_visible_ids at viewer: the
  -- ladder, then "Shown to"). Later passes read this from the job and never work it out again.
  v_level := custom.effective_level(v_me, v_from, v_id);
  v_mask  := custom.read_mask_for(v_me, v_from, v_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared from jsonb_array_elements(v_mask -> 'declared') x;
  select coalesce(array_agg(d), '{}'::text[]) into v_hidden from unnest(v_declared) d where not (d = any (v_visible));

  v_job := jsonb_build_object(
    'kind', 'none',
    'why_undo', 'A copy is undone by archiving it; the table it was copied from was never changed.',
    'duplicated_from', v_id,
    'duplicated_from_organization_id', v_from,
    'with_records', v_with,
    'by', v_me,
    'open', true,
    'state', 'copying',
    'table_shown_to', v_src.shown_to,
    'cutoff', clock_timestamp(),
    'mask_visible', to_jsonb(v_visible),
    'mask_declared', to_jsonb(v_declared),
    'mask_hidden', to_jsonb(v_hidden),
    'fields', coalesce((select jsonb_agg(f.id order by coalesce((f.data ->> 'sort')::integer, 0), f.created_at)
                          from custom.record f
                         where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
                           and f.data_class <> 'kernel' and f.deleted_at is null
                           and f.data ->> 'entity_definition_id' = v_id::text), '[]'::jsonb),
    'choice_lists', coalesce((select jsonb_agg(distinct o.id)
                                from custom.record f
                                join custom.record o
                                  on o.organization_id = v_from and o.id = (f.data -> 'config' ->> 'options_table_id')::uuid
                                 and o.table_id = custom.table_kernel_id() and o.data_class = 'table'
                               where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
                                 and f.data_class <> 'kernel' and f.deleted_at is null
                                 and f.data ->> 'entity_definition_id' = v_id::text
                                 and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null), '[]'::jsonb),
    'views', coalesce((select jsonb_agg(sv.id)
                         from platform.saved_view sv
                        where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
                          and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_id
                          and (sv.shown_to is distinct from 'only_me' or sv.created_by = v_me)), '[]'::jsonb),
    'self_keys', coalesce((select jsonb_agg(f.data ->> 'key')
                             from custom.record f
                            where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
                              and f.data_class <> 'kernel' and f.deleted_at is null
                              and f.data ->> 'entity_definition_id' = v_id::text
                              and f.data ->> 'relation_target' = v_id::text
                              and not (f.data ->> 'key' = any (v_hidden))), '[]'::jsonb),
    'dead_keys', coalesce((select jsonb_agg(distinct d.data ->> 'key')
                             from custom.record d
                            where d.organization_id = v_from and d.table_id = custom.field_kernel_id()
                              and d.data_class <> 'kernel' and d.deleted_at is not null
                              and d.data ->> 'entity_definition_id' = v_id::text
                              and not exists (select 1 from custom.record l
                                               where l.organization_id = v_from and l.table_id = custom.field_kernel_id()
                                                 and l.data_class <> 'kernel' and l.deleted_at is null
                                                 and l.data ->> 'entity_definition_id' = v_id::text
                                                 and l.data ->> 'key' = d.data ->> 'key')), '[]'::jsonb));
  if v_with then
    v_seen := array(select q from custom.query_visible_ids(v_from, v_id, 'viewer') q);
    select count(*) filter (where r.id = any (v_seen)),
           coalesce(jsonb_object_agg(r.id::text, true) filter (where r.id = any (v_seen)), '{}'::jsonb),
           coalesce(jsonb_object_agg(r.id::text, true) filter (where not (r.id = any (v_seen))), '{}'::jsonb)
      into v_total, v_handed, v_not_handed
      from custom.record r
     where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
       and r.deleted_at is null and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and r.created_at <= (v_job ->> 'cutoff')::timestamptz;
    -- Whichever list is shorter is kept: for a member handed every row it is empty.
    if (select count(*) from jsonb_object_keys(v_handed)) <= (select count(*) from jsonb_object_keys(v_not_handed)) then
      v_job := v_job || jsonb_build_object('rows_handed', v_handed);
    else
      v_job := v_job || jsonb_build_object('rows_not_handed', v_not_handed);
    end if;
    v_job := v_job || jsonb_build_object('records_total', v_total);
    select coalesce(jsonb_object_agg(coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), n.c), '{}'::jsonb)
      into v_hidden_out
      from custom.record f
      cross join lateral (
        select count(*) as c from custom.record r
         where r.organization_id = v_from and r.table_id = v_id and r.id = any (v_seen)
           and r.data ? (f.data ->> 'key') and jsonb_typeof(r.data -> (f.data ->> 'key')) <> 'null') n
     where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel' and f.deleted_at is null and f.data ->> 'entity_definition_id' = v_id::text
       and f.data ->> 'key' = any (v_hidden);
  end if;

  -- WHAT STAYS BEHIND, worked out now while every input is here, and handed back when done.
  v_map := jsonb_build_object(v_id::text, v_new::text)
           || coalesce((select jsonb_object_agg(f #>> '{}', custom._duplicate_id(v_new, (f #>> '{}')::uuid)::text)
                          from jsonb_array_elements(v_job -> 'fields') f), '{}'::jsonb);
  if custom._without_rows_of(custom._remap_rows(custom._uuid_remap(v_src.data, v_map), v_new, v_job), v_from, v_id)
     is distinct from custom._remap_rows(custom._uuid_remap(v_src.data, v_map), v_new, v_job) then
    v_refs_out := v_refs_out || jsonb_build_array('the table''s colours or row actions');
  end if;
  v_refs_out := v_refs_out || coalesce((
    select jsonb_agg('view ' || sv.name)
      from platform.saved_view sv
     where sv.organization_id = v_from and (v_job -> 'views') ? sv.id::text
       and (custom._without_rows_of(custom._remap_rows(custom._uuid_remap(sv.definition, v_map), v_new, v_job), v_from, v_id)
              is distinct from custom._remap_rows(custom._uuid_remap(sv.definition, v_map), v_new, v_job)
            or custom._without_rows_of(custom._remap_rows(custom._uuid_remap(coalesce(sv.metadata, '{}'::jsonb), v_map), v_new, v_job), v_from, v_id)
              is distinct from custom._remap_rows(custom._uuid_remap(coalesce(sv.metadata, '{}'::jsonb), v_map), v_new, v_job))), '[]'::jsonb);
  v_job := v_job || jsonb_build_object('left_behind', jsonb_build_object(
    'archived_fields', (select count(*) from custom.record f
                         where f.organization_id = v_from and f.table_id = custom.field_kernel_id()
                           and f.data_class <> 'kernel' and f.deleted_at is not null
                           and f.data ->> 'entity_definition_id' = v_id::text),
    'archived_records', case when v_with then (select count(*) from custom.record r
                         where r.organization_id = v_from and r.table_id = v_id and r.data_class = 'record'
                           and (r.deleted_at is not null or coalesce(r.metadata ->> 'quarantine', 'false') = 'true')) end,
    'records_not_yours_to_open', case when v_with then (select count(*) from jsonb_object_keys(coalesce(v_not_handed, '{}'::jsonb))) end,
    'hidden_columns', v_hidden_out,
    'private_views', (select count(*) from platform.saved_view sv
                       where sv.organization_id = v_from and sv.deleted_at is null and sv.surface_key = 'custom/records'
                         and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = v_id
                         and sv.shown_to = 'only_me' and sv.created_by is distinct from v_me),
    -- A copied view is born as every new view is (the house door). Where the source view was
    -- "only me" the copy keeps "Shown to: only me" but is an organization view underneath: the
    -- retiring row column cannot be carried by name (T-13). Those views are named here.
    'views_shared_as_new_views', coalesce((
        select jsonb_agg(sv.name) from platform.saved_view sv
         where sv.organization_id = v_from and (v_job -> 'views') ? sv.id::text and sv.shown_to = 'only_me'), '[]'::jsonb),
    'row_references_dropped', v_refs_out,
    'not_copied', jsonb_build_array('history', 'forms', 'booking pages', 'portals', 'dashboards',
                                    'capture sheets', 'rules', 'webhooks', 'tables inside its rows',
                                    'sharing', 'comments', 'published to the web')));

  -- THE ONE HISTORY ROW, ON THE NEW TABLE: it is also the job.
  v_event := history.migration_record(v_to, 'duplicate', 'table', v_new, v_job,
                                      format('Duplicated from %s', v_src_name));

  -- THE TABLE RECORD. While it is being made it is the app's (kept_for "copying"): kept out of
  -- every table list (custom.table_kept_out_of_lists) and refused by every open, read, view and
  -- write door to anyone but its maker (custom._copy_in_progress_guard). The last pass hands it over.
  perform set_config('custom.table_duplicate_into', v_new::text, true);
  v_data := coalesce(custom._without_rows_of(custom._remap_rows(custom._uuid_remap(v_src.data, v_map), v_new, v_job), v_from, v_id), '{}'::jsonb)
            || jsonb_build_object('name', v_name, 'slug', v_slug, 'kept_by_the_app', true, 'kept_for', 'copying');
  if v_parent is not null then
    v_data := v_data || jsonb_build_object('parent_id', v_parent::text);
  end if;
  -- "Shown to: only me" while it is being made, so even a list that asks for the app's own
  -- tables does not show another person a half copy; the source's own "Shown to" comes back at
  -- handover.
  insert into custom.record (id, organization_id, table_id, data_class, data, metadata, shown_to)
  values (v_new, v_to, custom.table_kernel_id(), 'table', v_data,
          custom._copied_metadata(v_src.metadata), 'only_me');
  perform set_config('custom.table_duplicate_into', '', true);

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
  -- ONE PASS: no new unit starts 2.5 s into the call; every pass does at least one unit.
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
   where t.id = p_table_id and t.table_id = custom.table_kernel_id()
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
  if coalesce(v_inv ->> 'state', 'copying') = 'copying' then
    v_opens := custom.where_id_opens((v_inv ->> 'duplicated_from')::uuid);
    if v_opens is not null and v_opens ->> 'kind' is distinct from 'table' then
      v_opens := null;
    end if;
    if v_opens is null and exists (select 1 from custom.record s
                                     where s.id = (v_inv ->> 'duplicated_from')::uuid and s.deleted_at is null) then
      raise exception 'The table this was being copied from is no longer one you have been given, so the copy stops here.'
        using errcode = '42501';
    end if;
  end if;
  return jsonb_build_object(
    'duplicated', true,
    'table', jsonb_build_object('id', p_table_id, 'name', v_name),
    'path', '/data-v2/' || p_table_id::text)
    || custom._table_duplicate_step(p_table_id, c_budget);
end;
$function$;

create or replace function custom.table_copies_in_progress()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me  uuid := custom.query_principal();
  r     record;
  v_out jsonb := '[]'::jsonb;
begin
  -- THE CALLER'S UNFINISHED COPIES: still being made, or stopped (the source archived meanwhile),
  -- each with what it is, where it came from and how far it got — so an abandoned copy is found
  -- and carried on (custom.table_duplicate_continue) or discarded (archive the copy). A copy
  -- whose half table was archived is closed here: its history row stops saying it is open.
  if v_me is null then
    raise exception 'Sign in to see the copies you are making.' using errcode = '42501';
  end if;
  for r in
    select m.id as job, m.organization_id as org, m.target_id as copy, m.inverse as inv, m.applied_at,
           t.data ->> 'name' as name, t.deleted_at is not null as archived,
           s.data ->> 'name' as source_name, o.name as org_name
      from history.migration_log m
      left join custom.record t on t.organization_id = m.organization_id and t.id = m.target_id
      left join custom.record s on s.id = (m.inverse ->> 'duplicated_from')::uuid
                               and s.organization_id = (m.inverse ->> 'duplicated_from_organization_id')::uuid
      left join iam.organizations o on o.id = m.organization_id
     where m.verb = 'duplicate' and m.target_kind = 'table'
       and m.inverse ->> 'by' = v_me::text
       and coalesce(m.inverse ->> 'state', 'copying') in ('copying', 'failed')
       and iam.is_org_member(v_me, m.organization_id)
     order by m.applied_at desc
  loop
    if r.archived or r.name is null then
      update history.migration_log
         set inverse = inverse || jsonb_build_object('state', 'discarded', 'open', false)
       where id = r.job;
      continue;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'table', jsonb_build_object('id', r.copy, 'name', r.name),
      'organization', jsonb_build_object('id', r.org, 'name', r.org_name),
      'from', jsonb_build_object('id', r.inv ->> 'duplicated_from', 'name', r.source_name),
      'status', coalesce(r.inv ->> 'state', 'copying'),
      'sentence', r.inv ->> 'why',
      'started_at', r.applied_at,
      'records', case when (r.inv ->> 'with_records')::boolean then jsonb_build_object(
                   'done', (select count(*) from custom.record c
                             where c.organization_id = r.org and c.table_id = r.copy
                               and c.data_class = 'record' and c.deleted_at is null),
                   'total', (r.inv ->> 'records_total')::bigint) end,
      'path', '/data-v2/' || r.copy::text));
  end loop;
  return v_out;
end;
$function$;

comment on function custom.table_copies_in_progress() is
  'TABLE-ACTIONS. The caller''s unfinished copies (still being made, or stopped because the source was archived), each with its source, status, sentence and progress, so it can be carried on or discarded. A copy whose half table was archived is closed here.';

comment on function custom.table_duplicate_continue(uuid) is
  'TABLE-ACTIONS. Carries on a copy custom.table_duplicate started: one bounded pass (new work stops 2.5 s into the call; small units), answering copying|done with progress, then what stayed behind. Only the person who started the copy; the source is re-checked every pass.';

comment on function custom.table_duplicate(uuid, boolean, text, uuid) is
  'TABLE-ACTIONS. Duplicates a Table the caller may open into an organization the caller is a member of (default: the same one): its settings and look, every live Field (new ids), every choice list as a new list (same words, keys, order), every live saved view (filters, sorts, layouts and every id inside them remapped to the copy), and with p_with_records every live record the caller may open, its values through the read doors'' own field mask (custom.read_mask_for + custom.mask_document: a column the caller may not read is copied empty and named in left_behind.hidden_columns); links within the Table follow to the copy, links to other Tables stay, and a reference to a row that was not copied is taken out. Name: p_name, else "<name> (copy)", "(copy 2)", …. Writes one history.migration_log row on the new Table (verb duplicate); the source is never written. Paged: it fixes what the copy carries, makes the copy''s Table record (hidden from everyone but its maker until handed over), does at least one unit, starts none 1.5 s into the call and answers copying|done|failed|busy with progress; custom.table_duplicate_continue carries it on. Refuses with one sentence: not given / archived / still being copied / not a member of the destination / a column linking across organizations.';

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
   'Takes the id of a copy custom.table_duplicate started. Refuses unless that copy''s job (its history.migration_log row, verb duplicate) was started by the signed-in caller, the caller still reaches the destination organization (custom.assert_client_may_reach + custom.assert_store_door), and custom.where_id_opens still says the caller may open the source Table. Only then does it spend one bounded pass (at least one unit; one pass at a time per copy, else busy) copying what remains (choice lists, fields, views, records through the read doors'' field mask, links), and answers copying|done with progress. It never writes the source.',
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
         'null_rule', jsonb_build_object('says', 'That is not a copy you are making, so there is nothing to carry on.', 'sqlstate', '42501'))))),
  ('custom', 'table_copies_in_progress',
   '',
   array[]::oid[],
   'Takes no argument. Answers only the signed-in caller''s own unfinished copies (history.migration_log rows of verb duplicate whose stored maker is the caller, in organizations the caller is a member of): their names, sources, status and progress. It writes nothing but closing the job of a copy whose half table was archived.',
   'tableactions_a_table_can_be_duplicated.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'tableactions_a_table_can_be_duplicated.sql', 'arguments', '{}'::jsonb))
on conflict do nothing;

grant execute on function custom.table_duplicate(uuid, boolean, text, uuid) to authenticated;
grant execute on function custom.table_duplicate_continue(uuid) to authenticated;
grant execute on function custom.table_copies_in_progress() to authenticated;

select set_config('platform.closed_schema_sweep', '0', true);
