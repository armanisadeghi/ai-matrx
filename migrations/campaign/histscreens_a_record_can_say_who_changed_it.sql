-- target: branch,production
-- additive: yes
--   It ADDS seven functions under this lane's reserved prefix (`custom.history_*`,
--   `custom.record_history`, `custom.field_history`, `custom.record_restore_preview`,
--   `custom.record_restore_version`, `custom.value_restore`) and their
--   `platform.client_callable_door` rows. It REPLACES exactly one existing body,
--   `custom.io_restore`, in place, with its prior definition pinned by the `-- based-on:`
--   line below; the signature, the rung and the return type are unchanged. No table,
--   column, trigger, policy or enum is touched, nothing is dropped, nothing is revoked,
--   no row is rewritten. No business-shaped table is created, so the provisioner is not
--   involved.
--   The inverse is `migrations/inverse/histscreens_a_record_can_say_who_changed_it_down.sql`.
-- guard: custom/system_enabled
-- based-on: custom.io_restore(uuid, uuid, integer) 65f48ea1d294b02cad326c34923b7b013428f13084a3150bf306fd42cb9ea5e3
--
-- LANE HISTORY-SCREENS — PRODUCTS row 4, *"Who changed this price, and can I put it back?"*
-- Champions: Notion page history (restore a prior version from the same panel that lists
-- them) and Airtable revision history (per-field, per-record, with the author on each).
-- Contract rows: SCR-17 HistoryPanel, HIS-1, HIS-7, HIS-8, HIS-N-2, VAL-1, VAL-7, VAL-8.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- THE HISTORY WAS ALL THERE. NOBODY COULD READ IT.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- `history.row_versions` has every version of every record, W3-HIST's trigger records
-- structure and Values in the ONE store, and MERGE-HISTORY taught every compound verb to
-- sign the versions it wrote. What a person could ask for was `custom.io_revisions`, which
-- answers six columns: a version number, a moment, `changed_by` as a RAW UUID, an English
-- summary, the operation word and the keys that moved. Four things the product's own
-- sentence needs were missing from every one of them:
--
--   1. **WHO, as a person.** `changed_by` is a uuid. A timeline that says
--      `4060701e-706a-4c76-b3ca-0bbc69fa5a14 changed the price` is a timeline nobody reads,
--      and SCR-N-5 forbids printing it at a customer at all.
--   2. **user / agent / system, and the person an agent acted for.** VAL-8 fixes the
--      vocabulary and `custom._value_envelope` already refuses an agent write that names
--      nobody — so the store KNOWS "the agent did it, for Dana". `io_revisions` never
--      looked, and the whole differentiating claim of PRODUCTS row 4 lived in a column no
--      door read.
--   3. **Before and after.** `changed_fields` is a list of KEYS. "price changed" is not an
--      answer to "who changed this price"; `950 → 1200` is.
--   4. **The Rule and version that produced a derived value, and the source pointer.**
--      FLD-9/REC-19 put `_computed` in the document and VAL-1 interns every source once
--      under `_sources`. Both are IN the version row already and neither reached a screen.
--
-- So this file does not invent a history. It reads the one the store has been keeping and
-- says it in the words a person asked the question in.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- AND THE DEFECT: "RESTORE" DID NOT RESTORE.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- `custom.io_restore` calls `history.snapshot_restore`, which calls `custom.record_update`
-- with the old document. `custom.record_update` is `data = data || p_patch` — a SHALLOW
-- MERGE. So restoring a record to version 3 put version 3's values back and LEFT EVERY KEY
-- ADDED SINCE exactly where it was. A record that gained a `discount` field at version 5
-- and was then "restored to version 3" kept the discount, silently, and the panel said the
-- restore succeeded. Measured on the main database, 2026-09-20 (green suite PART 3).
--
-- That is the product's headline verb answering "yes" and doing something else. The fix is
-- in `custom.io_restore` itself and not in a new door beside it: a safe path next to an
-- unsafe one is not a fix, and every existing caller — the panel, the agent, a suite —
-- inherits the correction. The restore now clears, through the SAME one write path, every
-- key the record has today that the target version did not have, and the preview door
-- below names each one as "cleared" BEFORE anybody presses anything.
--
-- `custom.record_update` cannot remove a key (it merges), and this file does not add a
-- second write path to get one. A cleared key is therefore set to JSON null — which is
-- what VAL-2 calls a value that is not there, is what `custom.read_record` already renders
-- as empty, and is what the preview says out loud. It is stated here rather than
-- discovered later.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- NEVER REWRITING HISTORY
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Every restore in this file goes through `custom.record_update`, so it is a NEW version
-- with its own author, its own moment and its own row in `history.row_versions`. Nothing
-- here deletes, edits or re-stamps a version. Undoing a compound operation stays the
-- existing verb, `custom.migrate_undo`, which MERGE-HISTORY already taught to sign itself
-- "undo of merge" — this lane adds no second undo.

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.history_people — uuid → a person, once per panel.
--
-- Resolved the way `custom.share_people` resolves it (display_name, then full_name, then
-- the local part of the email), because two doors answering "who is this" with two
-- different names is how a product starts disagreeing with itself. It is narrowed to the
-- MEMBERS of the organization the caller has already been admitted to, so it can never
-- become a way to read `auth.users`.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.history_people(p_organization_id uuid, p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select coalesce(
           jsonb_object_agg(
             m.user_id::text,
             jsonb_build_object(
               'user_id', m.user_id,
               'name', coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                                nullif(u.raw_user_meta_data ->> 'full_name', ''),
                                split_part(u.email::text, '@', 1)))),
           '{}'::jsonb)
    from iam.organization_member m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_organization_id
     and m.user_id = any (coalesce(p_ids, array[]::uuid[]));
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'history_people',
        'p_organization_id uuid, p_ids uuid[]',
        array['uuid'::regtype, 'uuid[]'::regtype]::oid[],
        'p_organization_id is never checked here because this function is never reached with a caller''s arguments: every caller in this file has already run custom.assert_client_may_reach or custom.assert_client_may_open against the same organization before calling it. It answers only the display name of people who are MEMBERS of that one organization, for the ids the caller already holds from the version rows it was allowed to read, and it reads no record, no permission and no email out.',
        'histscreens_a_record_can_say_who_changed_it.sql',
        'server_only: it is the name half of custom.record_history and custom.field_history, both of which have already taken their access decision against the same organization; a client that wanted a roster asks custom.share_people, which is the declared door for that and takes the record-level decision this one deliberately does not.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.history_actor — the VAL-8 vocabulary, per version, out of what the store stamped.
--
-- `custom.stamp_value_envelopes` writes `actor` and `on_behalf_of` onto EVERY value
-- envelope on every write, so a version's own document carries the word for that write. It
-- is the truest source: it is the word `custom.actor_word` settled on at the door, after
-- the forward and converse arms that refuse an agent naming nobody.
--
-- A version with no values at all (a structural row, a delete, a restore of a record) has
-- no envelope to read, and falls back to `history.row_versions.actor_tier`, translated
-- through `custom.retired_actor_words()` — the ONE translation, so this file never learns
-- a second spelling of the vocabulary.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.history_actor(p_tier text, p_document jsonb, p_actor_id uuid,
                                     p_people jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $$
  with envelope as (
    select e.value ->> 'actor'        as word,
           e.value ->> 'on_behalf_of' as obo
      from jsonb_each(case when jsonb_typeof(p_document -> '_values') = 'object'
                           then p_document -> '_values' else '{}'::jsonb end) e
     where jsonb_typeof(e.value) = 'object'
       and e.value ? 'actor'
     limit 1
  ),
  said as (
    select coalesce((select word from envelope),
                    custom.retired_actor_words() ->> p_tier,
                    'system') as kind,
           (select obo from envelope) as obo
  )
  select jsonb_build_object(
           -- user | agent | system, and nothing else is ever printed here.
           'kind', said.kind,
           'user_id', p_actor_id,
           'name', coalesce(p_people -> (p_actor_id::text) ->> 'name',
                            case said.kind when 'system' then 'the platform' else null end),
           -- AGT-N-4 / VAL-8: an agent NEVER stands alone on this screen. It names the
           -- person whose authority it carried, because that is who is answerable.
           'on_behalf_of',
           case when said.obo is null then null
                else jsonb_build_object(
                       'user_id', said.obo,
                       'name', coalesce(p_people -> said.obo ->> 'name', null))
           end)
    from said;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.history_changes — what moved, with BEFORE and AFTER, and what produced it.
--
-- The key list is `custom.io_changed_keys`, which MERGE-HISTORY already taught to look
-- inside `_values` and `_retired` as well as the document's top level — so a merge that
-- files the losing phone number as a ranked alternate is a change to `phone` here, which
-- is what a person would say. Nothing about which keys changed is re-derived in this file.
--
-- `label` is the Field's own label where the Table declares one, `custom.field_options`'
-- humanisation of the key otherwise, and never the raw key (SCR-N-5). `rule` is FLD-9's
-- `_computed` block for that key AT THAT VERSION, so a derived value names the Rule and
-- the Rule VERSION that produced it. `source` is VAL-1's interned pointer, resolved
-- through the same version's `_sources`.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.history_changes(p_organization_id uuid, p_table_id uuid,
                                       p_old jsonb, p_new jsonb)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $$
  with keys as (
    select k from unnest(custom.io_changed_keys(coalesce(p_old, '{}'::jsonb),
                                                coalesce(p_new, '{}'::jsonb))) k
  ),
  fields as (
    select f.data ->> 'key' as key, f.id as field_id,
           nullif(btrim(coalesce(f.data ->> 'label', '')), '') as label
      from custom.applicable_fields(p_organization_id, p_table_id, null) f
     where p_table_id is not null
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'key', keys.k,
               'field_id', fields.field_id,
               'label', coalesce(fields.label,
                                 initcap(replace(replace(keys.k, '_', ' '), '-', ' '))),
               'before', coalesce(p_old, '{}'::jsonb) -> keys.k,
               'after',  coalesce(p_new, '{}'::jsonb) -> keys.k,
               -- FLD-9 / REC-19: which Rule, and which VERSION of it, produced this value.
               'rule',
               case when jsonb_typeof(p_new -> '_computed' -> keys.k) = 'object'
                    then jsonb_build_object(
                           'rule_id', p_new -> '_computed' -> keys.k -> 'rule_id',
                           'rule_version', p_new -> '_computed' -> keys.k -> 'rule_version',
                           'computed_at', p_new -> '_computed' -> keys.k -> 'at')
                    else null end,
               -- VAL-1: the value points at its source through a pointer interned once per
               -- document; this resolves the pointer so the panel never prints "s3".
               'source',
               case when jsonb_typeof(p_new -> '_values' -> keys.k -> 'src') = 'string'
                    then p_new -> '_sources' -> (p_new -> '_values' -> keys.k ->> 'src')
                    when jsonb_typeof(p_new -> '_values' -> keys.k -> 'src') = 'object'
                    then p_new -> '_values' -> keys.k -> 'src'
                    else null end,
               -- VAL-2: a value that is absent says WHY it is absent.
               'absent_reason', p_new -> '_values' -> keys.k -> 'absent_reason',
               -- VAL-3/VAL-4: the other candidates the store kept, in rank order.
               'alternates', p_new -> '_values' -> keys.k -> 'alternates')
             order by keys.k),
           '[]'::jsonb)
    from keys
    left join fields on fields.key = keys.k;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'history_changes',
        'p_organization_id uuid, p_table_id uuid, p_old jsonb, p_new jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'jsonb'::regtype]::oid[],
        'It takes no decision and needs none: it is a pure diff over two documents its caller has ALREADY been admitted to read, and the only thing it reaches the database for is custom.applicable_fields, to put a Field''s label on a key. It reads no record, no permission and no version row of its own; handed another tenant''s table id it would answer labels for a Table with no rows in the answer, because the documents come from the caller, not from here.',
        'histscreens_a_record_can_say_who_changed_it.sql',
        'server_only: its callers are custom.record_history and custom.field_history, each of which has decided access on the record or the Table before a document reaches this function. A client holding two documents already holds the diff; a door for it would be a second reading path into nothing.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.record_history — THE DOOR PRODUCTS ROW 4 IS ABOUT.
--
-- One record's version list, newest first, each version naming who, when, the operation in
-- the word the person used, and every field that moved with its before and after.
--
-- The rung is VIEWER. Reading who changed something is reading, and a viewer who can see
-- the record can see how it got that way — which is exactly what Notion and Airtable do
-- with a read-only collaborator. Restoring is a separate door and a separate rung.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.record_history(p_organization_id uuid, p_record_id uuid,
                                      p_limit integer default 200,
                                      p_offset integer default 0)
returns table(version integer, occurred_at timestamptz, operation text,
              operation_label text, actor jsonb, changes jsonb,
              migration_id uuid, undoable boolean)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_table  uuid;
  v_people jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_history');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.record_history',
                                        'viewer'::public.permission_level, 'record');

  -- The record's OWN table, by id and whether or not it is deleted: the last version of a
  -- merged-away or deleted record is precisely the one somebody wants explained.
  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- Every name in one pass, so a two-hundred-version panel is one roster read and not two
  -- hundred. The ids are the ones this caller was already allowed to see.
  select custom.history_people(
           p_organization_id,
           array(select distinct a.id from (
                   select v.actor_id as id
                     from history.record_versions(p_organization_id, p_record_id) v
                   union
                   select (e.value ->> 'on_behalf_of')::uuid
                     from history.record_versions(p_organization_id, p_record_id) v,
                          lateral jsonb_each(
                            case when jsonb_typeof(v.row_data -> 'data' -> '_values') = 'object'
                                 then v.row_data -> 'data' -> '_values' else '{}'::jsonb end) e
                    where (e.value ->> 'on_behalf_of') is not null) a
                  where a.id is not null))
    into v_people;

  return query
    select w.version,
           w.occurred_at,
           -- The machine word, for a screen that wants to group or icon by it.
           coalesce(w.operation_name, lower(w.operation)) as operation,
           -- And the word a PERSON used, which is what the panel prints.
           case
             when w.operation_name is not null then
               w.operation_name || case w.operation
                                     when 'SOFT_DELETE' then ' (record removed)'
                                     when 'RESTORE'     then ' (record restored)'
                                     when 'INSERT'      then ' (record created)'
                                     else '' end
             when w.operation = 'INSERT'      then 'created'
             when w.operation = 'UPDATE'      then 'edited'
             when w.operation = 'SOFT_DELETE' then 'deleted'
             when w.operation = 'RESTORE'     then 'restored'
             else lower(w.operation)
           end as operation_label,
           custom.history_actor(w.actor_tier, w.row_data -> 'data', w.actor_id, v_people),
           custom.history_changes(p_organization_id, v_table,
                                  coalesce(w.previous_data, '{}'::jsonb),
                                  coalesce(w.row_data -> 'data', '{}'::jsonb)),
           w.migration_id,
           -- HIS-8: a compound operation is undoable through custom.migrate_undo, and only
           -- while its Migration log row is still there. An ordinary edit is not "undoable"
           -- in that sense — it is RESTORABLE, which is the other two doors in this file.
           (w.migration_id is not null
            and exists (select 1 from history.migration_log m
                         where m.id = w.migration_id
                           and m.organization_id = p_organization_id
                           and m.undone_at is null)) as undoable
      from (select v.*,
                   lag(v.row_data -> 'data') over (order by v.version) as previous_data
              from (select rv.version, rv.operation, rv.occurred_at, rv.actor_id,
                           rv.row_data, rv.migration_id, rv.operation_name,
                           hv.actor_tier
                      from history.record_versions(p_organization_id, p_record_id) rv
                      left join lateral (
                        select h.actor_tier
                          from history.row_versions h
                         where h.entity_type = 'custom.record'
                           and h.organization_id = p_organization_id
                           and h.row_id = p_record_id
                           and h.version = rv.version
                           and h.occurred_at = rv.occurred_at
                         limit 1) hv on true) v) w
     order by w.version desc, w.occurred_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'record_history',
        'p_organization_id uuid, p_record_id uuid, p_limit integer, p_offset integer',
        array['uuid'::regtype, 'uuid'::regtype, 'int4'::regtype, 'int4'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_record_id is checked by custom.assert_client_may_open at the VIEWER rung against THIS organization, so a record from another tenant reads as absent and is refused with the same sentence whether or not it exists. Every version row it reads is keyed (entity_type, organization_id, row_id) to that one admitted record, so no other record''s history is reachable through it. p_limit is clamped to 500 and p_offset to zero or more; neither reaches SQL as text.',
        'histscreens_a_record_can_say_who_changed_it.sql',
        true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.field_history — "who changed the price on ANY record?"
--
-- The half of PRODUCTS row 4 that no revision panel anywhere answers: a column's history
-- across a whole Table. Airtable and Notion both make you open each record and look.
--
-- The wall is two-layered and both layers are needed. `custom.assert_may_know_table`
-- decides whether this person may know the Table at all (VIS-5/T10) — the same question
-- `custom.dashboards` settled on after DASHBOARDS found a member locked out of her own
-- organization's canvas. Then Visibility is a PREDICATE in the same WHERE, built by
-- `custom.visible_predicate_sql` exactly as `custom.dashboard_stuck` and `custom.agg_sql`
-- build it (DOOR-10, READ-PERF): a version of a record this person may not see is never
-- fetched, so it cannot be listed and then hidden, and the ladder is asked once per
-- visibility class rather than once per row.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.field_history(p_organization_id uuid, p_table_id uuid,
                                     p_field_key text,
                                     p_limit integer default 100,
                                     p_offset integer default 0,
                                     p_record_id uuid default null)
returns table(record_id uuid, record_title text, version integer,
              occurred_at timestamptz, operation_label text, actor jsonb,
              before jsonb, after jsonb)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_people jsonb;
  v_titlek text;
  v_sql    text;
  v_ids    uuid[];
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_history');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.field_history');

  if coalesce(btrim(coalesce(p_field_key, '')), '') = '' then
    raise exception 'custom.field_history: name the column whose history you want.'
      using errcode = '22004',
            hint = 'custom.applicable_fields(organization, table, null) lists this table''s columns with their keys.';
  end if;

  -- REFUSED BY NAME, never answered empty. A column that does not exist and a column
  -- nobody has ever changed both produce zero rows, and one of those is a typo.
  if not exists (select 1
                   from custom.applicable_fields(p_organization_id, p_table_id, null) f
                  where (f.data ->> 'key') = p_field_key) then
    raise exception 'This table has no column called "%", so there is no history of it.', p_field_key
      using errcode = '22023',
            hint = 'Check the column''s name on the table''s own settings panel — the history is kept per column key, and a renamed column keeps the key it was declared with.';
  end if;

  -- The Table's own title field, so a row of this answer names a RECORD and not a uuid —
  -- the same key `custom.dashboard_stuck` reads, for the same reason.
  select nullif(t.data ->> 'title_field', '') into v_titlek
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id();

  -- WHICH RECORDS OF THIS TABLE THIS PERSON MAY SEE, as one predicate over `custom.record`,
  -- resolved ONCE. A deleted record keeps its history and keeps its visibility, so it is
  -- not filtered out here: "who changed the price" about a record somebody has since
  -- removed is exactly the question this door exists for.
  v_sql := format(
    'select array_agg(r.id) from custom.record r
      where r.organization_id = %L::uuid and r.table_id = %L::uuid and %s %s',
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    case when p_record_id is null then ''
         else format('and r.id = %L::uuid', p_record_id) end);
  execute v_sql into v_ids;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return;
  end if;

  select custom.history_people(
           p_organization_id,
           array(select distinct h.actor_id
                   from history.row_versions h
                  where h.entity_type = 'custom.record'
                    and h.organization_id = p_organization_id
                    and h.row_id = any (v_ids)
                    and h.actor_id is not null))
    into v_people;

  return query
    select w.row_id,
           coalesce(nullif(btrim(coalesce(
                      case when v_titlek is null then null
                           else w.row_data -> 'data' ->> v_titlek end, '')), ''),
                    'Untitled'),
           w.version,
           w.occurred_at,
           case
             when w.operation_name is not null then w.operation_name
             when w.operation = 'INSERT'      then 'created'
             when w.operation = 'SOFT_DELETE' then 'deleted'
             when w.operation = 'RESTORE'     then 'restored'
             else 'edited'
           end,
           custom.history_actor(w.actor_tier, w.row_data -> 'data', w.actor_id, v_people),
           w.previous_data -> p_field_key,
           w.row_data -> 'data' -> p_field_key
      from (select h.row_id, h.version, h.operation, h.operation_name, h.occurred_at,
                   h.actor_id, h.actor_tier, h.row_data,
                   lag(h.row_data -> 'data') over (partition by h.row_id order by h.version)
                     as previous_data
              from history.row_versions h
             where h.entity_type = 'custom.record'
               and h.organization_id = p_organization_id
               and h.row_id = any (v_ids)) w
     where -- ONLY the versions in which THIS column moved. The whole point of the door is
           -- that a price changed twice in a thousand edits is two rows, not a thousand.
           (coalesce(w.previous_data, '{}'::jsonb) -> p_field_key)
             is distinct from (coalesce(w.row_data -> 'data', '{}'::jsonb) -> p_field_key)
     order by w.occurred_at desc, w.row_id, w.version desc
     limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'field_history',
        'p_organization_id uuid, p_table_id uuid, p_field_key text, p_limit integer, p_offset integer, p_record_id uuid',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'int4'::regtype,
              'int4'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_table_id is checked by custom.assert_may_know_table against THIS organization, so another tenant''s table reads as absent. p_field_key is matched against custom.applicable_fields for that table and refused BY NAME when it names no column; it is never concatenated into SQL and reaches the query only as a jsonb key on documents already admitted. The record ids are resolved by custom.visible_predicate_sql for THIS caller at the viewer rung, built the same way custom.dashboard_stuck and custom.agg_sql build it, so a record this person may not see is never fetched; p_record_id is interpolated with %L as a uuid literal into that same statement and can only ever narrow the set further, never widen it. p_limit is clamped to 500 and p_offset to zero or more.',
        'histscreens_a_record_can_say_who_changed_it.sql',
        true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.record_restore_preview — "THE PUT-IT-BACK ACTION NAMES WHAT WILL CHANGE."
--
-- A restore button with nothing beside it is a button nobody may responsibly press. This
-- answers exactly what the write below would do, computed the SAME way the write computes
-- it, so the sentence and the act cannot drift.
--
-- The rung is EDITOR, not viewer: this is the first half of an act, and a person who may
-- not perform the act is not shown its preview — they are shown why, by the door that
-- refuses them.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.record_restore_preview(p_organization_id uuid, p_record_id uuid,
                                              p_version integer,
                                              p_field_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_target  jsonb;
  v_current jsonb;
  v_table   uuid;
  v_at      timestamptz;
  v_now     integer;
  v_changes jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_restore_preview');
  perform custom.assert_client_may_change(p_organization_id, p_record_id,
                                          'custom.record_restore_preview');

  select v.row_data -> 'data', v.occurred_at into v_target, v_at
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  if v_target is null then
    raise exception 'There is no saved version % of this to go back to.', p_version
      using errcode = '02000',
            hint = 'The saved versions are listed by custom.record_history(organization, record). Value history older than this table''s retention may have been pruned.';
  end if;

  select r.data, r.table_id, r.version into v_current, v_table, v_now
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  v_changes := custom.history_changes(p_organization_id, v_table,
                                      custom.history_restore_body(v_current, v_target,
                                                                  p_field_key),
                                      coalesce(v_current, '{}'::jsonb));

  return jsonb_build_object(
    'record_id', p_record_id,
    'from_version', v_now,
    'to_version', p_version,
    'saved_at', v_at,
    'field_key', p_field_key,
    -- `changes` is stated in the direction a PERSON reads it: `before` is what the record
    -- says now, `after` is what it would say. `custom.history_changes` diffs old → new, so
    -- the arguments above are handed over the other way round on purpose, and this line is
    -- here so the next reader does not "fix" it.
    'changes', v_changes,
    'count', jsonb_array_length(v_changes));
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'record_restore_preview',
        'p_organization_id uuid, p_record_id uuid, p_version integer, p_field_key text',
        array['uuid'::regtype, 'uuid'::regtype, 'int4'::regtype, 'text'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_record_id is checked by custom.assert_client_may_change — the EDITOR rung — against THIS organization, so another tenant''s record reads as absent, and somebody who could not perform the restore is never shown its preview. p_version is matched together with the organization and the record id, so a version row of another record cannot be named. p_field_key is used only as a jsonb key on documents already admitted. It writes nothing.',
        'histscreens_a_record_can_say_who_changed_it.sql',
        true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.history_restore_body — the one place the restored document is computed.
--
-- THE DEFECT IN THE FILE HEADER LIVES OR DIES HERE. `custom.record_update` merges, so the
-- body handed to it must itself carry a JSON null for every key the record has today that
-- the target version did not — otherwise a field added after the target version survives
-- its own restore, silently, which is what the store did until this file.
--
-- The envelope keys are stripped exactly as `history.snapshot_restore` has always stripped
-- them: `_values`, `_sources`, `_computed`, `_derived` and `_retired` are re-derived by
-- `custom._value_envelope` on the way in, and putting an old envelope back would re-stamp
-- an old author on a new write.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.history_restore_body(p_current jsonb, p_target jsonb,
                                            p_field_key text default null)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $$
  with target as (
    select (coalesce(p_target, '{}'::jsonb)
            - '_values' - '_sources' - '_computed' - '_derived' - '_retired') as body
  ),
  -- ONE FIELD, or the whole record. A single-field restore touches exactly its own key and
  -- clears nothing else, because the person asked about one column.
  scoped as (
    select case when p_field_key is null then target.body
                else jsonb_build_object(p_field_key,
                                        coalesce(target.body -> p_field_key, 'null'::jsonb))
           end as body
      from target
  ),
  cleared as (
    select coalesce(jsonb_object_agg(k, 'null'::jsonb), '{}'::jsonb) as body
      from jsonb_object_keys(coalesce(p_current, '{}'::jsonb)) k
     where p_field_key is null
       and left(k, 1) <> '_'
       and not ((select body from target) ? k)
  )
  select (select body from cleared) || (select body from scoped);
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'history_restore_body',
        'p_current jsonb, p_target jsonb, p_field_key text',
        array['jsonb'::regtype, 'jsonb'::regtype, 'text'::regtype]::oid[],
        'It names no organization and no record and takes no decision, because it reaches nothing: it is a pure function of two documents its caller has already been admitted to both read and change. It writes nothing, reads nothing and executes nothing from either document.',
        'histscreens_a_record_can_say_who_changed_it.sql',
        'server_only: it is the shared half of custom.record_restore_preview, custom.record_restore_version, custom.value_restore and custom.io_restore, so the sentence a person is shown and the write that follows it are computed by one body and cannot drift. A client holding both documents already holds the answer.',
        false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.io_restore — REPLACED IN PLACE, so every caller inherits the correction.
-- Same signature, same rung, same return type. The one change is that it now computes the
-- restored body through custom.history_restore_body and therefore actually restores.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.io_restore(p_organization_id uuid, p_record_id uuid,
                                             p_version integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_user    uuid := custom.query_principal();
  v_doc     jsonb;
  v_target  jsonb;
  v_current jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_restore');
  -- Restoring REWRITES the record, so it needs the level that may rewrite it. A commenter
  -- who could restore would be able to change every value on the record without being
  -- allowed to change one.
  if not custom.has_visibility(v_user, 'record', p_record_id, 'editor'::public.permission_level) then
    raise exception 'You may not restore this record to an earlier version.'
      using errcode = '42501',
            hint = 'Restoring rewrites every value on the record, so it needs the editor level — the same level that lets you change one of them by hand.';
  end if;
  if p_version is null then
    raise exception 'custom.io_restore: name the version to restore. custom.record_history(organization, record) lists them with who changed what.'
      using errcode = '22004';
  end if;

  select v.row_data -> 'data' into v_target
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  if v_target is null then
    raise exception 'There is no saved version % of this to go back to.', p_version
      using errcode = '02000',
            hint = 'The saved versions are listed by custom.record_history(organization, record). Value history older than this table''s retention may have been pruned — the two most recent are always kept.';
  end if;

  select r.data into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- THE SAME WRITE PATH AGAIN, so going back to an old version is a NEW version rather
  -- than a hole in the record: the chain keeps growing forwards, always. What changed in
  -- this lane is the BODY, which now clears the keys the target version did not have —
  -- until 2026-09-20 a restore left every field added since exactly where it was and said
  -- it had succeeded.
  perform custom.record_update(p_organization_id, p_record_id,
                               custom.history_restore_body(v_current, v_target, null));

  -- Read back through THE ONE READ DOOR, not out of custom.record.
  begin
    v_doc := custom.read_record(p_organization_id, p_record_id, true);
  exception when sqlstate '42501' then
    v_doc := null;
  end;
  return (v_doc ->> 'version')::integer;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.record_restore_version — the whole record, back to a version, as a NEW version.
-- It delegates the write to custom.io_restore (one restore, one body) and answers what
-- actually moved, so a screen can say "3 fields changed" without asking again.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.record_restore_version(p_organization_id uuid, p_record_id uuid,
                                              p_version integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_preview jsonb;
  v_new     integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_restore_version');
  -- The preview takes the EDITOR decision and refuses a missing version by name, so this
  -- door does not repeat either judgement in a second spelling.
  v_preview := custom.record_restore_preview(p_organization_id, p_record_id, p_version, null);
  v_new := custom.io_restore(p_organization_id, p_record_id, p_version);
  return jsonb_build_object(
    'record_id', p_record_id,
    'restored_from_version', p_version,
    'version', v_new,
    'changed', v_preview -> 'changes',
    'count', v_preview -> 'count',
    -- Said out loud because it is the thing people fear about an undo button.
    'history_rewritten', false);
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'record_restore_version',
        'p_organization_id uuid, p_record_id uuid, p_version integer',
        array['uuid'::regtype, 'uuid'::regtype, 'int4'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_record_id takes the EDITOR decision twice over, once in custom.record_restore_preview through custom.assert_client_may_change and once in custom.io_restore through custom.has_visibility, both against THIS organization, so another tenant''s record reads as absent. p_version is matched together with the organization and the record id. The write is custom.record_update, which runs every guard, validator and history trigger of an ordinary edit, so the restore is a new version and no stored version is altered.',
        'histscreens_a_record_can_say_who_changed_it.sql',
        true, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.value_restore — HIS-N-2, one field, through the write path the core already uses.
--
-- "Put THIS price back" without touching the eleven other columns somebody else edited in
-- the meantime. `useCellUndo` proved the pattern client-side and it died with the tab;
-- this is the same idea in the store, so it survives the tab, works for the agent, and
-- lands as a version with its own author like everything else.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.value_restore(p_organization_id uuid, p_record_id uuid,
                                     p_field_key text, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_preview jsonb;
  v_target  jsonb;
  v_current jsonb;
  v_new     integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.value_restore');
  if coalesce(btrim(coalesce(p_field_key, '')), '') = '' then
    raise exception 'custom.value_restore: name the column to put back.'
      using errcode = '22004',
            hint = 'custom.record_history(organization, record) names the column on every change it lists.';
  end if;

  v_preview := custom.record_restore_preview(p_organization_id, p_record_id, p_version,
                                             p_field_key);

  select v.row_data -> 'data' into v_target
    from history.row_versions v
   where v.entity_type = 'custom.record'
     and v.organization_id = p_organization_id
     and v.row_id = p_record_id
     and v.version = p_version
   order by v.occurred_at desc, v.id desc
   limit 1;

  select r.data into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  v_new := custom.record_update(
             p_organization_id, p_record_id,
             custom.history_restore_body(v_current, v_target, p_field_key));

  return jsonb_build_object(
    'record_id', p_record_id,
    'field_key', p_field_key,
    'restored_from_version', p_version,
    'version', v_new,
    'changed', v_preview -> 'changes',
    'count', v_preview -> 'count',
    'history_rewritten', false);
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values ('custom', 'value_restore',
        'p_organization_id uuid, p_record_id uuid, p_field_key text, p_version integer',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'int4'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_record_id takes the EDITOR decision in custom.record_restore_preview through custom.assert_client_may_change and again in custom.record_update through custom.assert_client_may_change, both against THIS organization, so another tenant''s record reads as absent. p_version is matched together with the organization and the record id. p_field_key is used only as a jsonb key and is written through custom.record_update, which runs the field validators, the envelope law and the history trigger — a key that names no declared Field is refused there, by name.',
        'histscreens_a_record_can_say_who_changed_it.sql',
        true, false)
on conflict do nothing;

