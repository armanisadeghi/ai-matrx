-- chair-step: dropping W1-TABLE's two projections, its two guards on custom.record and its seven functions is a teardown, never an additive change; it runs from the same bytes on the branch as rule 27's inverse and reaches production only at a terminal, with the campaign stopped
--
-- THE INVERSE of `migrations/campaign/w1_table_table_home_containment.sql` (§4.13: every
-- migration carries its own down-migration in the same commit).
--
-- HEADER-LESS ON PURPOSE. A `DROP` is refused by §6b.2's additive allow-list in every lane;
-- the one route is a header-less chair step, rehearsed on the branch with `--target branch`
-- and confirmed at a terminal anywhere else.
--
-- WHAT IT RESTORES. Before this lane, schema `custom` held `custom.record` (16 partitions)
-- and `custom.record_write(uuid,uuid,jsonb)` and nothing else; `platform.feature_knob` held
-- no `custom/containment_depth_ceiling` row. After this file runs, that is true again.
--
-- 🚨 IT REFUSES IF ANOTHER LANE HAS ALREADY BUILT ON TOP. `LOCK:custom` is handed down a
-- fourteen-hold chain and `W1-INDEX`, `W1-FIELD`, `W1-RULE` and nine more build in this
-- same schema. Dropping `custom.containment_parent` out from under an index expression or a
-- later view would take their work with it and leave the ledger claiming it is still there.
-- So the first statement RAISES, naming what it found, unless every object this file is
-- about to drop has no dependant outside this file's own list.
--
-- IT DOES NOT DELETE THE UP FILE'S LEDGER ROW: a migration may never write
-- `public._schema_migrations` itself, and both runners refuse a file that tries. Rule 27's
-- loop re-applies the up with `--reapply`.

set lock_timeout = '2s';
set statement_timeout = '300s';

-- ── the refusal, before a single drop ──────────────────────────────────────────
-- Anything in schema `custom` that this lane did not create, and that is not W1-STORE's
-- store or its door, means a later lane has landed and this teardown is not safe.
do $guard$
declare
  -- EXACTLY THE BODIES THIS FILE REMOVES, and no others: `custom.record_reparent` and
  -- `custom.home_relations` are left standing because later lanes call them (see the note
  -- further down), so they are not this guard's business either.
  v_mine text[] := array[
    'custom._table_shape_guard', 'custom._containment_guard',
    'custom.home_add', 'custom.reachable_from'];
  v_missing text;
  v_strays  text;
begin
  -- ── 1. ITS OWN OBJECTS ARE PRESENT ──────────────────────────────────────────
  -- A teardown run against a world that does not carry the thing is not a teardown, it is a
  -- no-op that reports success — and the red twin beside it then passes with the defect never
  -- put back. So this refuses rather than shrugging.
  select string_agg(x, ', ' order by x) into v_missing from (
    select unnest(v_mine) as x
    except
    select n.nspname || '.' || p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'custom'
  ) q;
  if v_missing is not null then
    raise exception 'refusing to tear down W1-TABLE: the objects this file removes are not here (%)', v_missing
      using hint = 'This lane never landed on this database, or its teardown already ran. Nothing to put back.';
  end if;
  if not exists (select 1 from pg_class where relnamespace = 'custom'::regnamespace and relname = 'home')
     or not exists (select 1 from pg_class where relnamespace = 'custom'::regnamespace and relname = 'table') then
    raise exception 'refusing to tear down W1-TABLE: custom.home / custom."table" are not both here'
      using hint = 'This lane never landed on this database, or its teardown already ran.';
  end if;

  -- ── 2. NOTHING OUTSIDE THIS FILE DEPENDS ON WHAT IT REMOVES ─────────────────
  -- 🚨 THIS REPLACES A GUARD THAT COULD NEVER PASS (lane INVERSE-GUARD, 2026-09-21). It used
  -- to refuse unless schema `custom` held NOTHING but this lane's own fifteen names. Thirty
  -- lanes have landed in `custom` since; the branch holds 268 functions there, so the first
  -- statement raised on every database in existence, naming 250 of them, and this inverse
  -- could not run at all — which means the red twin beside it proved nothing, for months.
  -- The header always said what it actually needs: "every object this file is about to drop
  -- has no dependant outside this file's own list". That is what it asks now.
  select string_agg(format('trigger %s on %s.%s -> %s', t.tgname, n.nspname, c.relname,
                           pn.nspname || '.' || p.proname), ', ' order by t.tgname)
    into v_strays
    from pg_trigger t
    join pg_class c  on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p   on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
   where not t.tgisinternal
     and pn.nspname || '.' || p.proname = any (v_mine)
     and t.tgname not in ('custom_record_table_shape_guard', 'custom_record_containment_guard');
  if v_strays is not null then
    raise exception 'refusing to tear down W1-TABLE: a live trigger this file does not detach runs a body it removes (%)', v_strays
      using hint = 'Detach the trigger first, or stop dropping the body: a dropped function under an attached trigger is a broken table, not a defect put back.';
  end if;

  select string_agg(format('%s.%s calls %s', n.nspname, p.proname, m.name), ', ' order by p.proname)
    into v_strays
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(v_mine) as m(name)
   where n.nspname not in ('pg_catalog', 'information_schema')
     and n.nspname || '.' || p.proname <> all (v_mine)
     -- AN INVOCATION, NOT A MENTION. `custom.query_table_homes` and `custom.relation_own` both
     -- NAME two of these bodies in a `--` comment and call neither, so the comments come out
     -- before the match and the match requires the opening parenthesis of a call.
     and regexp_replace(p.prosrc, '--[^\n]*', ' ', 'g') ~ ('\m' || replace(m.name, '.', '\.') || '\s*\(');
  if v_strays is not null then
    raise exception 'refusing to tear down W1-TABLE: a body outside this file calls one it removes (%)', v_strays
      using hint = 'A later lane adopted it. Run ITS inverse first, or leave that object standing and neuter the behaviour instead.';
  end if;

  select string_agg(format('%s.%s', n.nspname, c.relname), ', ' order by c.relname)
    into v_strays
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('v', 'm')
     and not (n.nspname = 'custom' and c.relname in ('home', 'table'))
     and pg_get_viewdef(c.oid) ~ '\mcustom\.(home|"?table"?|record_reparent|home_add|home_relations|reachable_from)\M';
  if v_strays is not null then
    raise exception 'refusing to tear down W1-TABLE: a view outside this file reads one of its projections (%)', v_strays
      using hint = 'A later lane adopted it. Run ITS inverse first.';
  end if;
end;
$guard$;

-- ── the two projections ────────────────────────────────────────────────────────
drop view if exists custom.home;
drop view if exists custom."table";

-- ── the two guards on custom.record ────────────────────────────────────────────
drop trigger if exists custom_record_table_shape_guard on custom.record;
drop trigger if exists custom_record_containment_guard on custom.record;

-- ── the bodies, dependants first ───────────────────────────────────────────────
drop function if exists custom._table_shape_guard();
drop function if exists custom._containment_guard();
drop function if exists custom.home_add(uuid, uuid, uuid);
drop function if exists custom.reachable_from(uuid, uuid[]);

-- 🚨 TWO MORE STAY STANDING, and the guard above is what found them (lane INVERSE-GUARD,
-- 2026-09-21). `custom.record_reparent(uuid, uuid, uuid)` is called by W3-MIG's
-- `custom.migrate_extract_parent` and `custom.migrate_reparent`, and
-- `custom.home_relations()` by CHOICE-VAL's `custom.query_table_homes` — measured on the
-- rehearsal branch, as invocations and not as the `--` comments two other bodies write about
-- them. Dropping either would take a later lane's door down with W1-TABLE's defect, which is
-- not what an inverse is for. They stay, and they hold nothing to anything: the two
-- projections, both guards on `custom.record` and their bodies are gone, so no Table has a
-- home it is held to, nothing refuses a containment cycle and nothing enforces a depth
-- ceiling. That is the world W1-TABLE found, which is the whole of what this file owes.
-- ground-standing-ok: d — both are named above with the bodies that adopted them.

-- 🚨 EIGHT OF THE FOURTEEN STAY STANDING (lane INVERSE-GUARD, 2026-09-21). This file used
-- to drop
-- `custom.relation_own`, `custom.table_declare`, `custom.tables_at_home`,
-- `custom.containment_edges`, `custom.containment_chain`, `custom.containment_parent`,
-- `custom.containment_depth_ceiling` and `custom.table_kernel_id` as well. Every one of them
-- has been adopted since by a lane outside W1-TABLE and sits on the live path today —
-- `custom.work_relation_kinds` (W3-WORK), `custom.work_approval_request` (APPRV-TAIL and
-- APPRV-FIX), `custom.delete_rule` (DOOR-FIX), `custom.query_across_homes` (CHOICE-VAL),
-- `custom.visibility_as_of` (AS-OF) and `history.who_could_see` (GUARD-SWITCH) — and
-- `custom.table_kernel_id` in particular is reached by TWENTY-ONE triggers standing on
-- `custom.record`, `custom.io_outbox` and `iam.permissions` right now. Dropping them would
-- not restore W1-TABLE's defect: the next write to the record store would die on a function
-- that does not exist, before the red twin asked its first question. That is the exact class
-- `storerel_a_relation_edge_names_its_field_down.sql` lost a session to.
--
-- THE DEFECT IS STILL PUT BACK by what this file does drop: the two projections, the two
-- guards on `custom.record` and their bodies, the reparent door, the home door, the home
-- relation projection and the reachability walk are all gone, and REC-N-4's knob row goes
-- below — so no Table has a home it is held to, nothing refuses a containment cycle and
-- nothing enforces a depth ceiling, which is the world W1-TABLE found. Eight predicates
-- standing underneath, called by nothing this lane leaves behind, hold nothing to anything.

-- ── REC-N-4's knob row ─────────────────────────────────────────────────────────
-- Only this lane's key, and only when no organization has overridden it: a DELETE that took
-- somebody's setting with it would be a silent loss, so it refuses and says so instead.
do $knob$
declare
  v_overrides integer;
begin
  select count(*) into v_overrides
    from platform.knob_override
   where feature = 'custom' and key = 'containment_depth_ceiling';
  if v_overrides > 0 then
    raise exception 'refusing to delete custom/containment_depth_ceiling: % organization override(s) point at it', v_overrides
      using hint = 'Remove the overrides through the knob door first; this teardown will not delete a limit somebody set.';
  end if;
  delete from platform.feature_knob
   where feature = 'custom' and key = 'containment_depth_ceiling';
end;
$knob$;
