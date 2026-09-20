-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._checklist_watch_stmt_update() a81d19c80337a043166ff22bd894915b68904240a288078cce79f3947961d7bd
--
-- SCREENS-2 — THE CHECKLIST PRODUCT WAS DEAD ON THE MAIN DATABASE, AND NOTHING SAID SO.
--
-- MEASURED 2026-09-20 23:42 UTC, on main, from the `authenticated` seat: every write to
-- `custom.record` in an organization that owns a checklist raised
--
--   ERROR:  cannot cast type record to custom.record
--   QUERY:  SELECT custom._checklist_watch_for('UPDATE', r.orow, r.nrow)
--
-- so PRODUCTS row 13 — *"every new hire gets these twelve steps"* — could not start a single
-- run. `custom.checklist_start` and the `record_created` trigger both end in
-- `custom._checklist_instantiate`, which calls `custom.work_assign`, which calls
-- `custom.record_update`; the UPDATE lands on `custom.record`, the statement trigger
-- `zz_ckl_watch_s_u` fires, and the whole transaction dies. The CHECKLISTS lane's own green
-- suite (`scripts/campaign-tests/checklists_green.sql`) fails at PART 2, after 1c PASS.
--
-- THE CAUSE, and it is not a typo. `cfe0e8cdef` (WRITE-PERF-2, 15:25 UTC the same day) turned
-- seven AFTER-ROW triggers on `custom.record` into fourteen AFTER-STATEMENT triggers over
-- `REFERENCING OLD TABLE / NEW TABLE`. Thirteen of the fourteen are fine. The fourteenth had
-- to hand TWO whole rows to a function typed `(text, custom.record, custom.record)`, and it
-- did it by selecting whole-row references into a `record` variable:
--
--     declare r record;
--     for r in select n as nrow, o as orow from new_rows n join old_rows o on …
--     loop perform custom._checklist_watch_for('UPDATE', r.orow, r.nrow); end loop;
--
-- A whole-row reference taken from a transition table and stored as a FIELD of a PL/pgSQL
-- `record` loses its composite type — the field's type is the generic `record`, and Postgres
-- refuses to cast that to `custom.record` at the call. The INSERT twin next to it got this
-- right by accident of having only one row to pass (`declare r custom.record; select n.*`),
-- which is why the failure looks like a checklist bug rather than a rewrite bug.
--
-- THE CLASS, CENSUSED ON THE LIVE CATALOGUE. Eight functions read a transition table
-- (`_checklist_watch_stmt_insert/update`, `_containment_association_stmt_insert/update`,
-- `_relation_associations_stmt_insert/update`, `io_record_changed_stmt_insert/update`).
-- Exactly ONE puts a whole-row reference into a `record` field —
-- `_checklist_watch_stmt_update` — and it is the one repaired here. The other seven select
-- COLUMNS, which is the shape that cannot go wrong.
--
-- THE REPAIR. The membership query is unchanged, character for character; it now yields the
-- two KEY columns, and each row is read into a variable that is `custom.record` by
-- declaration. A typed variable cannot lose its type, so the class is closed by shape rather
-- than by care.
--
-- AND IT NOW READS THE OFF SWITCH, which the broken body never did. While
-- `custom/system_enabled` resolves false for an organization nothing in that organization's
-- store may act, and a statement trigger is the one write path that fires without a door in
-- front of it. The read is the runner's own prescribed shape —
-- `platform.knob_resolve('custom','system_enabled', <org>)` — asked once per organization in
-- the statement rather than once per row, with `custom.store_is_open`'s exact semantics on
-- both edges: a knob that answers nothing is CLOSED, and a knob this writer cannot READ is
-- closed too (`platform.knob_resolve` is SECURITY INVOKER and RAISES `P0001 … is not seeded`
-- for a role that merely cannot see the row, which reads like a missing knob and is not one).
--
-- ITS RED TWIN is `migrations/inverse/screens2_the_checklist_watch_survived_the_perf_rewrite_down.sql`,
-- which puts the broken body back so `scripts/campaign-tests/checklists_green.sql` can be
-- shown failing at PART 2 and passing again.

set lock_timeout = '45s';

create or replace function custom._checklist_watch_stmt_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  -- THE TWO ROWS ARE `custom.record` BY DECLARATION. A `record` variable holding a whole-row
  -- reference from a transition table carries the generic `record` type, which is what broke
  -- this; a declared composite cannot.
  k      record;
  nrow   custom.record;
  orow   custom.record;
  v_org  uuid := null;
  v_open boolean := false;
begin
  for k in
    select n.organization_id as org_id, n.id as rec_id
      from new_rows n
      join old_rows o on o.organization_id = n.organization_id and o.id = n.id
     where n.data_class = 'record' and n.deleted_at is null
       and (n.data ? 'run_id'
            or (n.table_id is not null and exists (
                  select 1 from custom.record c
                   where c.organization_id = n.organization_id
                     and c.data_class = 'checklist_template'
                     and c.deleted_at is null
                     and (c.data #>> '{trigger,table_id}') = n.table_id::text
                     and coalesce(c.data #>> '{trigger,kind}', 'manual') = 'status_reached')))
     order by n.id
  loop
    -- THE OFF SWITCH, once per organization. `order by n.id` does not group by organization,
    -- so the answer is cached against the last organization asked and re-asked whenever it
    -- changes — never once per row, and never assumed.
    if v_org is distinct from k.org_id then
      v_org := k.org_id;
      begin
        v_open := coalesce(
          (platform.knob_resolve('custom', 'system_enabled', k.org_id) #>> '{}')::boolean,
          false);
      exception when others then
        v_open := false;
      end;
    end if;
    if not v_open then
      continue;
    end if;
    select * into nrow from new_rows w where w.organization_id = k.org_id and w.id = k.rec_id;
    select * into orow from old_rows w where w.organization_id = k.org_id and w.id = k.rec_id;
    perform custom._checklist_watch_for('UPDATE', orow, nrow);
  end loop;
  return null;
end;
$function$;
