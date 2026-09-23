-- LANE VERSION-HISTORY-FIX — A SAVE THAT CHANGED NOTHING KEEPS THE NUMBER A SCREEN SENDS BACK.
-- GREEN when, on each of the five class (a) tables, a save that changes nothing answers the
-- version it was sent against and writes no history row, while a save that changes something
-- still moves the version and is recorded. RED on the bytes' absence (clause 1 fails: the no-op
-- moved the version). Ends in ROLLBACK; writes nothing that survives.
--
-- The saves are the guarded shape every one of these screens uses (`guardedUpdate`: SET the patch
-- and `version: expected + 1`, WHERE version = expected, RETURNING version):
--   · a marketer at Oak Street Studio reopens a page's SEO intent and presses Save unchanged
--     (web.page); a writer re-saves a note she did not edit (workbench.notes); a Shape author
--     saves an untouched Shape (content_ir.kind_definition); the cloud browser re-stamps a
--     profile it just read (browser.profile); an alarm is muted to the state it already had
--     (scheduler.sch_task).
--
--   1  per table: the no-op save answers the SAME version, the row keeps it, no history row
--   2  per table: a real change (a metadata key) moves the version by one and writes one history row
--   3  scheduler.sch_task: a schedule tick (next_due_at only) still lands and still moves the
--      version (the trigger is bound with 'version','updated_at' only — never the WHEN keys)
--   4  the trigger is bound, enabled, LAST among before-row UPDATE triggers on all five, with
--      exactly the arguments {version, updated_at} (notes: + its stored generated content_preview)
--   5  workflow.definition carries NO such trigger, and a publish-shaped version-only update
--      still moves its version (the publish counter; see the migration header)

\set ON_ERROR_STOP on
\set suite 'versionhistoryfix_green.sql'
\set requires 'function:platform.no_change_keeps_its_version'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
-- clause 5 writes as the server's publish does, which must name its system (provenance guard).
set local app.actor_system = 'matrx_graph.definition_store.publish';

do $suite$
declare
  c record; v_id uuid; v_ver int; v_ans int; v_now int; v_h0 int; v_h1 int;
  v_last text; v_args text;
begin
  for c in select * from (values
      ('web.page', 'web_page', 'version,updated_at'),
      ('workbench.notes', 'note', 'version,updated_at,content_preview'),
      ('content_ir.kind_definition', 'content_ir_kind', 'version,updated_at'),
      ('browser.profile', 'browser_profile', 'version,updated_at'),
      ('scheduler.sch_task', 'sch_task', 'version,updated_at')) v(store, token, args)
  loop
    execute format('select id, version from %s where deleted_at is null order by updated_at desc, id limit 1',
                   c.store::regclass) into v_id, v_ver;
    if v_id is null then
      raise exception 'SETUP: % has no live row to save', c.store;
    end if;
    select count(*) into v_h0 from history.row_versions where entity_type = c.token and row_id = v_id;

    -- 1: the no-op save
    execute format('update %s set metadata = metadata, version = $2 + 1 where id = $1 and version = $2 returning version',
                   c.store::regclass) into v_ans using v_id, v_ver;
    execute format('select version from %s where id = $1', c.store::regclass) into v_now using v_id;
    select count(*) into v_h1 from history.row_versions where entity_type = c.token and row_id = v_id;
    if v_ans is distinct from v_ver or v_now <> v_ver or v_h1 <> v_h0 then
      raise exception '1: % — a Save that changed nothing answered version %, stored %, history rows % -> % (it was sent against %)',
        c.store, v_ans, v_now, v_h0, v_h1, v_ver;
    end if;
    raise notice '1 PASSED — % no-op save kept version % and wrote no history row', c.store, v_ver;

    -- 2: a real change
    execute format($u$update %s set metadata = coalesce(metadata, '{}'::jsonb) || '{"versionhistoryfix_probe": true}'::jsonb,
                      version = $2 + 1 where id = $1 and version = $2 returning version$u$,
                   c.store::regclass) into v_ans using v_id, v_ver;
    select count(*) into v_h1 from history.row_versions where entity_type = c.token and row_id = v_id;
    if v_ans is distinct from v_ver + 1 or v_h1 <> v_h0 + 1 then
      raise exception '2: % — a real change answered version % (expected %) and history rows % -> % (expected one more)',
        c.store, v_ans, v_ver + 1, v_h0, v_h1;
    end if;
    raise notice '2 PASSED — % real change moved % -> % and was recorded', c.store, v_ver, v_ans;

    -- 4: bound, enabled, last, exact args
    select tg.tgname,
           array_to_string((select array_agg(a order by o) from unnest(string_to_array(
             rtrim(encode(tg.tgargs, 'escape'), E'\\000'), E'\\000')) with ordinality u(a, o)), ',')
      into v_last, v_args
      from pg_trigger tg
     where tg.tgrelid = c.store::regclass and not tg.tgisinternal and tg.tgenabled <> 'D'
       and (tg.tgtype & 2) = 2 and (tg.tgtype & 16) = 16 and (tg.tgtype & 1) = 1
     order by tg.tgname collate "C" desc limit 1;
    if v_last is distinct from 'zzzzz_no_change_keeps_its_version' or v_args is distinct from c.args then
      raise exception '4: the last enabled before-row UPDATE trigger on % is % with args (%) — expected zzzzz_no_change_keeps_its_version (%)',
        c.store, v_last, v_args, c.args;
    end if;
    raise notice '4 PASSED — % trigger last, args (%)', c.store, c.args;
  end loop;

  -- 3: a schedule tick on sch_task still lands
  select id, version into v_id, v_ver from scheduler.sch_task where deleted_at is null order by updated_at desc, id limit 1;
  update scheduler.sch_task set next_due_at = coalesce(next_due_at, now()) + interval '1 minute'
   where id = v_id returning version into v_ans;
  if v_ans is distinct from v_ver + 1 then
    raise exception '3: a schedule tick on scheduler.sch_task answered version % — expected % (a tick is real data; the trigger must not swallow it)', v_ans, v_ver + 1;
  end if;
  raise notice '3 PASSED — a sch_task schedule tick still lands (% -> %)', v_ver, v_ans;

  -- 5: workflow.definition keeps its publish counter
  if exists (select 1 from pg_trigger where tgrelid = 'workflow.definition'::regclass
                and tgname = 'zzzzz_no_change_keeps_its_version') then
    raise exception '5: workflow.definition carries zzzzz_no_change_keeps_its_version — DefinitionStore.publish (version = version + 1 and nothing else) would answer the old version and its snapshot insert would collide';
  end if;
  select id, version into v_id, v_ver from workflow.definition where deleted_at is null order by updated_at desc, id limit 1;
  update workflow.definition set version = version + 1 where id = v_id returning version into v_ans;
  if v_ans is distinct from v_ver + 1 then
    raise exception '5: a publish-shaped update on workflow.definition answered % — expected %', v_ans, v_ver + 1;
  end if;
  raise notice '5 PASSED — workflow.definition has no no-op trigger; a publish still counts (% -> %)', v_ver, v_ans;

  raise notice 'versionhistoryfix_green: ALL 5 CLAUSES PASSED';
end
$suite$;
rollback;
