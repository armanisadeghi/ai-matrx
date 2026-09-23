-- additive: yes
--
-- chair-step: it BINDS the existing `platform.no_change_keeps_its_version()` (STORE-VERSION-NOOP
--   file 1 created it; this file refuses to run without it) as the LAST before-row UPDATE trigger
--   on FIVE tables whose version a screen, an agent or a client sends back when it saves:
--   `web.page`, `workbench.notes`, `content_ir.kind_definition`, `browser.profile`,
--   `scheduler.sch_task` — with the arguments 'version', 'updated_at' and NOTHING else (notes adds
--   its stored generated `content_preview`, which a before-row trigger sees as NULL). And it
--   REPAIRS data on those five plus `workflow.definition`: a row whose version ran ahead of the
--   last version its history recorded, and whose content is IDENTICAL to that history row, gets
--   its version lowered to the history's number (never below a number something else holds), with
--   one `history.migration_log` line per row. A row whose content DIFFERS is never touched.
--   Nothing is replaced, dropped, granted or revoked; no function body changes. The repair runs
--   FIRST (row locks on the repaired rows only); the five `create trigger` statements run LAST, so
--   each table's SHARE ROW EXCLUSIVE (writers wait, readers and sign-in do not) is held only from
--   its own `create trigger` to COMMIT. The inverse is
--   `migrations/inverse/versionhistoryfix_a_a_save_that_changes_nothing_keeps_the_screens_number_down.sql`.
-- window-class: the up is not (create trigger on a plain table, no hook, 0 ACCESS EXCLUSIVE); its
--   INVERSE is (DROP TRIGGER fires the supautils hook: ACCESS EXCLUSIVE on auth/storage/realtime,
--   sign-in stops), and the repair lowers numbers that an open screen holds (the realtime origin
--   ledger drops a revision older than the one it holds), which is safest when few screens are
--   open. So the pair goes in 01:00–04:00 Pacific.
-- lock: platform
-- lane: VERSION-HISTORY-FIX
--
-- VERSION-HISTORY-FIX, CLASS (a) — A SAVE THAT CHANGED NOTHING NO LONGER MOVES THE NUMBER THAT
-- A SCREEN SENDS BACK.
--
-- WHAT IS WRONG. `platform._touch_row` sets `version := OLD.version + 1` on every UPDATE, while
-- `platform._version_capture` skips an update that changed nothing but version/updated_at. So a
-- no-op save moved the version and wrote no history row (VERSION-HISTORY-CENSUS.md, measured
-- 2026-09-23: 12,936 rows on 55 tables on production). On these five tables a client holds the
-- version and CASes on it, so a no-op save by anyone between its read and its save makes it lose
-- a race it should have won — the marketing page editor (`features/marketing/data/service.ts`,
-- no rebase) says "This page changed in another session" when nobody changed it.
--
-- THE TRIGGER. The same generic function STORE-VERSION-NOOP bound on custom.record, with the
-- keys `platform._version_capture` ignores on these tables: 'version', 'updated_at'. None of
-- them has `search_tsv` or `embedding`. The one addition is notes' STORED GENERATED
-- `content_preview` (see its `create trigger` below): not data, and NULL in NEW before-row. 🚨 NEVER a table's own WHEN-clause keys: on
-- `scheduler.sch_task` `next_due_at` / `last_run_at` are real data the capture merely does not
-- record; passing them would make the function return OLD on a schedule tick and throw it away.
-- With only 'version','updated_at', a tick still lands (and still moves the version, by design).
--
-- WHY `workflow.definition` GETS THE REPAIR BUT NOT THE TRIGGER (the census recommended both).
-- Its version is ALSO the publish counter: `matrx_graph.db.definition_store.DefinitionStore.publish`
-- does `update … set version = version + 1` and nothing else, then inserts
-- `workflow.definition_version (definition_id, version_number)` from the returned version, under a
-- UNIQUE (definition_id, version_number). A version-only update is exactly what the trigger
-- swallows, so with it bound the publish would answer the OLD version, and the second publish of
-- an unedited draft would hit that unique index — publish breaks. Measured on the clone in a
-- rolled-back transaction with the trigger bound: the first publish-shaped update (`set version =
-- version + 1 … returning version`, app.actor_system set) answered 2 only because it changed
-- `updated_by_system`; the SECOND, by the same system, answered 2 again. The fix belongs in
-- publish (make a publish a recorded change), which is its own lane; see
-- PROGRESS-VERSION-HISTORY-FIX.md.
--
-- THE REPAIR, AND WHAT MAY HOLD A NUMBER. Lowering is safe only if nothing points at the numbers
-- above the history's. Measured on the clone for every candidate row (PROGRESS doc, Receipts):
--   · workflow.definition — `workflow.definition_version.version_number` HOLDS them (26 snapshots
--     on the clone sit above their definition's history number: publishes are version-only
--     updates the capture skips), and `engram_version_tags.published_version` names a snapshot.
--     So the floor is greatest(history, newest snapshot, published_version): a later publish then
--     numbers past every snapshot and the unique index never sees a reused number.
--   · content_ir.kind_definition — `kind_component.pinned_kind_version`, `kind_edge.pinned_child_
--     version`, `kind_example.kind_version`, `kind_instance.kind_version` can pin a version: 0 above
--     the history number on the clone, and the floor is computed anyway, so production is judged on
--     its own rows.
--   · web.page, workbench.notes, browser.profile, scheduler.sch_task — no column anywhere names
--     their version (every `%version%` column on the database was read); no migration_log line
--     names a candidate.
-- The one holder no query can see is a screen open during the repair: the realtime origin ledger
-- (`@ai-matrx` realtime core, rule R1) drops a revision older than the one it holds, so an open
-- page or note ignores the next remote change until the row passes the number it held. That is
-- why this file is applied in the night window.
--
-- CONTENT-SAME, EXACTLY. `to_jsonb(row)` minus the capture's ignored keys (plus the WHEN-clause keys
-- on sch_task, which the capture does not record either) equals the last history row's
-- `row_data` minus the same keys — where a key the history row does not carry at all counts as
-- equal only when the live value is null, {} or [] (a column added after the history row was
-- written, still empty: `custom_fields` on 11,276 of web.page's rows). Anything else is REAL DRIFT
-- and is never lowered: 83 notes on the clone, counted by the receipt and left alone.
--
-- THE LOG. One `history.migration_log` line per repaired row, verb `version_agrees_with_history`
-- (STORE-VERSION-NOOP's verb), `inverse = {"kind":"none", store, version_before, version_after,
-- lane}`: undoing it would put the defect back. The whole-file inverse exists for rule 27.

set local lock_timeout = '5s';

do $pre$
begin
  if to_regprocedure('platform.no_change_keeps_its_version()') is null then
    raise exception 'VERSION-HISTORY-FIX: platform.no_change_keeps_its_version() does not exist on this database — apply STORE-VERSION-NOOP''s storeversionnoop_a_write_that_changes_nothing_keeps_its_version.sql first';
  end if;
end
$pre$;

create temporary table _vhf_repair (
  store text, token text, organization_id uuid, id uuid,
  version_before integer, version_after integer
) on commit drop;

create temporary table _vhf_census (
  store text, ahead integer, same integer, drift integer, held integer
) on commit drop;

do $plan$
declare
  c record;
begin
  for c in
    select * from (values
      ('web.page',                   'web_page',        array[]::text[],                  'null::integer'),
      ('workbench.notes',            'note',            array[]::text[],                  'null::integer'),
      ('workflow.definition',        'workflow',        array[]::text[],
         'greatest((select max(d.version_number) from workflow.definition_version d where d.definition_id = t.id),
                   (t.engram_version_tags ->> ''published_version'')::integer)'),
      ('content_ir.kind_definition', 'content_ir_kind', array[]::text[],
         'greatest((select max(k.pinned_kind_version) from content_ir.kind_component k where k.kind_definition_id = t.id),
                   (select max(k.pinned_child_version) from content_ir.kind_edge k where k.child_definition_id = t.id),
                   (select max(k.kind_version) from content_ir.kind_example k where k.kind_definition_id = t.id),
                   (select max(k.kind_version) from content_ir.kind_instance k where k.kind_definition_id = t.id))'),
      ('browser.profile',            'browser_profile', array[]::text[],                  'null::integer'),
      ('scheduler.sch_task',         'sch_task',        array['next_due_at','last_run_at'], 'null::integer')
    ) v(store, token, extra, floor_sql)
  loop
    execute format($q$
      with cand as (
        select t.organization_id, t.id, t.version,
               greatest(h.mv, %4$s) as floor_v,
               (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                  from jsonb_each((to_jsonb(t) - 'search_tsv' - 'embedding') - $1) e
                 where h.row_data ? e.key or e.value not in ('null'::jsonb, '{}'::jsonb, '[]'::jsonb))
                 = ((h.row_data - 'search_tsv' - 'embedding') - $1) as same
          from %1$s t
          cross join lateral (select r.version as mv, r.row_data from history.row_versions r
                               where r.entity_type = %3$L and r.row_id = t.id
                               order by r.version desc, r.id desc limit 1) h
         where t.version > h.mv),
      ins as (
        insert into _vhf_repair
        select %2$L, %3$L, organization_id, id, version, floor_v
          from cand where same and floor_v < version
        returning 1)
      insert into _vhf_census
      select %2$L, count(*), count(*) filter (where same), count(*) filter (where not same),
             count(*) filter (where same and floor_v >= version)
        from cand$q$, c.store::regclass, c.store, c.token, c.floor_sql)
    using array['version', 'updated_at'] || c.extra;
  end loop;
end
$plan$;

do $refuse$
begin
  if exists (select 1 from _vhf_repair where organization_id is null) then
    raise exception 'VERSION-HISTORY-FIX: a candidate row carries no organization_id, so it cannot have its migration_log line — nothing is kept';
  end if;
end
$refuse$;

-- THE STATEMENTS THAT RUN WITHOUT TRIGGERS, and only they: `_touch_row` would raise the version
-- being lowered, and a capture/outbox row would record a change that is not one.
set local session_replication_role = replica;

do $lower$
declare s text;
begin
  for s in select distinct store from _vhf_repair loop
    execute format(
      'update %1$s t set version = x.version_after from _vhf_repair x
        where x.store = %2$L and t.id = x.id and t.version = x.version_before',
      s::regclass, s);
  end loop;
end
$lower$;

set local session_replication_role = origin;

insert into history.migration_log (organization_id, verb, target_kind, target_id, inverse, note)
select x.organization_id, 'version_agrees_with_history', x.token, x.id,
       jsonb_build_object(
         'kind', 'none',
         'why', 'Undoing this would put the defect back: a version ahead of a history that recorded no change.',
         'store', x.store,
         'version_before', x.version_before,
         'version_after', x.version_after,
         'lane', 'VERSION-HISTORY-FIX'),
       format('VERSION-HISTORY-FIX (2026-09-24): %s version %s -> %s. Every version above %s was raised by a write that changed nothing, so the history never recorded it; the row''s content is identical to its history at that version.',
              x.store, x.version_before, x.version_after, x.version_after)
  from _vhf_repair x;

-- THE TRIGGERS, LAST. 'version', 'updated_at' and nothing else — except notes' generated column.
create trigger zzzzz_no_change_keeps_its_version
  before update on web.page
  for each row execute function platform.no_change_keeps_its_version('version', 'updated_at');

-- workbench.notes ALSO names `content_preview`: it is a STORED GENERATED column, and PostgreSQL does
-- not compute a generated column before the BEFORE-row triggers run, so NEW.content_preview is
-- NULL there while OLD's holds the preview — with 'version','updated_at' alone the function would
-- see a difference on every save and never fire (measured on the clone, rule 27 leg 1:
-- versionhistoryfix_green clause 1 RED on notes with the trigger bound). It is a pure function of
-- `content`, never independent data, so excluding it can never swallow a real change.
create trigger zzzzz_no_change_keeps_its_version
  before update on workbench.notes
  for each row execute function platform.no_change_keeps_its_version('version', 'updated_at', 'content_preview');

create trigger zzzzz_no_change_keeps_its_version
  before update on content_ir.kind_definition
  for each row execute function platform.no_change_keeps_its_version('version', 'updated_at');

create trigger zzzzz_no_change_keeps_its_version
  before update on browser.profile
  for each row execute function platform.no_change_keeps_its_version('version', 'updated_at');

create trigger zzzzz_no_change_keeps_its_version
  before update on scheduler.sch_task
  for each row execute function platform.no_change_keeps_its_version('version', 'updated_at');

-- THE RECEIPT, and the refusal if the numbers do not add up.
do $receipt$
declare
  v_planned integer := (select count(*) from _vhf_repair);
  v_landed  integer := 0;
  v_logged  integer;
  v_n       integer;
  s         text;
  v_line    text;
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'VERSION-HISTORY-FIX: session_replication_role is still %', current_setting('session_replication_role');
  end if;
  for s in select distinct store from _vhf_repair loop
    execute format('select count(*) from _vhf_repair x join %1$s t on t.id = x.id
                     where x.store = %2$L and t.version = x.version_after', s::regclass, s)
      into v_n;
    v_landed := v_landed + v_n;
  end loop;
  select count(*) into v_logged from history.migration_log m
   where m.verb = 'version_agrees_with_history' and m.inverse ->> 'lane' = 'VERSION-HISTORY-FIX'
     and m.undone_at is null and m.applied_at = now();
  if v_landed <> v_planned or v_logged <> v_planned then
    raise exception 'VERSION-HISTORY-FIX (a): % row(s) planned, % landed, % logged — nothing is kept', v_planned, v_landed, v_logged;
  end if;
  select string_agg(format('%s ahead %s / lowered %s / real drift left %s / held by another number %s',
                           c.store, c.ahead, c.same - c.held, c.drift, c.held), '; ' order by c.store)
    into v_line from _vhf_census c;
  raise notice 'VERSION-HISTORY-FIX (a): % row(s) brought back to their history''s version, % log line(s). %', v_planned, v_logged, v_line;
end
$receipt$;
