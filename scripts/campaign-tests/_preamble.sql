-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- THE ONE CAMPAIGN-SUITE PREAMBLE.  \i scripts/campaign-tests/_preamble.sql
--
-- WHY IT EXISTS. Ninety-four of the 191 campaign suites used to carry their own private copy
-- of this guard:
--
--     if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
--       raise exception '<file> runs on the MAIN database only';
--     end if;
--
-- A suite that can only run on the main database is a suite that runs on the main database or
-- never: no rehearsal copy, however fresh, can ever prove it. Measured 2026-09-22, a sweep of
-- all 191 suites against the rehearsal branch produced 4 passes and 94 self-refusals.
--
-- WHAT THIS FILE DOES INSTEAD.
--   1. Accepts the MAIN database, the rehearsal branch, OR the nightly dev clone, and REFUSES
--      anything else by name. Every identity is read from a checked-in reference file — never
--      typed in here, so a rebuilt branch or a fresh nightly clone needs no edit to any suite:
--        common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF   (branch + production)
--        common-docs/operations/clone/CLONE-REF                        (the current dev clone)
--      An unreadable reference file is a refusal, never a fallback.
--
--      🚨 THE IDENTITY TRAP, AND WHY `system_identifier` ALONE IS NOT AN IDENTITY.
--      A Supabase DATA branch (`with_data: true`) is a PHYSICAL restore of production's cluster,
--      so the nightly dev clone answers `pg_control_system().system_identifier` with
--      production's own 7642734024280108049 (measured 2026-09-22). Keyed on that number alone,
--      this preamble would have called the clone MAIN and every suite would have believed it was
--      on production. So the target is identified by the CONNECTION as well: the Supabase pooler
--      user carries the project ref (`postgres.<ref>`) and the direct host is
--      `db.<ref>.supabase.co`. A database is MAIN / BRANCH / CLONE only when BOTH its
--      system_identifier and its project ref match that target's checked-in pair.
--
--      A suite (or the runner around it) may also DECLARE which of the three it intends:
--        \set expect 'clone'      -- one of: main | branch | clone
--      and a server that is something else is refused even though it is a legal target.
--   2. Says out loud which database the suite is about to run on. Nothing fails silently.
--   3. Lets a suite DECLARE the production-only data and objects it depends on. When one is
--      absent the suite SKIPS, naming exactly what it lacks, and exits 0 without asserting
--      anything. A skip is never a pass: it prints the word SKIPPED and the missing token.
--      When the branch refresh lands the dependency, the suite lights up on its own.
--
-- HOW A SUITE USES IT (before any `begin;`):
--
--     \set suite 'my_suite.sql'
--     \set requires 'relation:custom.io_outbox|exec:custom.record_write'    -- optional
--     \i scripts/campaign-tests/_preamble.sql
--     \if :matrx_skip
--     \quit
--     \endif
--
-- DEPENDENCY TOKENS, separated by `|`:
--     relation:<schema>.<name>            a table, view, matview or sequence
--     type:<schema>.<name>                a type or domain
--     function:<schema>.<name>            a function or procedure by name (any signature)
--     exec:<schema>.<name>                the above AND EXECUTE on it for the CONNECTED role
--     grant:<role>:<schema>.<name>        the above AND EXECUTE on it for <role> — this is the
--                                         one that matters: a suite takes a member's seat
--                                         (`authenticated`), and the branch is missing hundreds
--                                         of the EXECUTE grants production gives that role
--     column:<schema>.<table>.<column>    a column
--     schema:<name>                       a schema
--     row:<schema>.<table>:<predicate>    at least one row matching the predicate. Inner quotes
--                                         are escaped for psql's \set, e.g.
--                                         row:platform.feature_knob:key = \'agents.x\'
--     tablegrant:<role>:<schema>.<table>:<priv>   <role> holds <priv> on that table
--     extension:<name>                    an installed extension
--     compute:<pg_settings name>:<min>    THE SIZE-AWARE CEILING. The server's own
--                                         `pg_settings.setting` for that name, as a number, is
--                                         at least <min>. Added by SUITES-TIDY 2026-09-22 for
--                                         the perf suites: they measure a real query against
--                                         production's real row counts, and the nightly dev
--                                         clone runs on SMALLER COMPUTE than production does.
--                                         Measured 2026-09-22 — clone: shared_buffers 262144
--                                         (2 GB), effective_cache_size 786432, max_connections
--                                         160; production: 524288 (4 GB), 1572864, 240. A
--                                         number measured on the clone is therefore not
--                                         production's number, and a ceiling that is honest on
--                                         production is a false alarm here. So a perf suite
--                                         DECLARES the compute it needs and SKIPS BY NAME on a
--                                         smaller server instead of failing as if the query
--                                         had broken. `shared_buffers` is the setting to use:
--                                         it is the one that moves with the instance class and
--                                         nothing else sets it.
--
-- A token may be NEGATED with a leading `!`: `!tablegrant:authenticated:platform.associations:DELETE`
-- means the suite needs that privilege to be ABSENT here. Production revokes a door's direct
-- write and the branch does not, so a suite about what the door decides proves nothing here —
-- and says so by name instead of failing as if the door were broken.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- The three legal targets, read from the checked-in reference files by the checked-in helper.
-- Relative paths resolve from the repository root, which is where suites are run from.
\set matrx_branch_sysid `sh scripts/campaign-tests/_branch-sysid.sh branch_sysid`
\set matrx_branch_ref   `sh scripts/campaign-tests/_branch-sysid.sh branch_ref`
\set matrx_prod_sysid   `sh scripts/campaign-tests/_branch-sysid.sh prod_sysid`
\set matrx_prod_ref     `sh scripts/campaign-tests/_branch-sysid.sh prod_ref`
\set matrx_clone_sysid  `sh scripts/campaign-tests/_branch-sysid.sh clone_sysid`
\set matrx_clone_ref    `sh scripts/campaign-tests/_branch-sysid.sh clone_ref`

-- Defaults, so a suite that declares none of these still works.
\if :{?suite}
\else
  \set suite 'campaign suite'
\endif
\if :{?requires}
\else
  \set requires ''
\endif
\if :{?expect}
\else
  \set expect ''
\endif
-- HOST/USER are set by psql from the CONNECTION itself (libpq's PQhost/PQuser), which is what
-- makes them able to tell a physical clone from its parent. A connection with neither (a local
-- socket with no user given) resolves to no project ref and is therefore refused, by design.
\if :{?HOST}
\else
  \set HOST ''
\endif
\if :{?USER}
\else
  \set USER ''
\endif

-- 🚨 ONE EXPLICIT TRANSACTION AROUND THE WHOLE PREAMBLE. The Supabase pooler runs in
-- TRANSACTION mode on port 6543: outside an explicit transaction every statement may land on a
-- different backend, so a `set_config(..., false)` written by one statement is simply gone by the
-- next — measured 2026-09-22 against production, where the identity block died with
-- `unrecognized configuration parameter "matrx.conn_user"`. An explicit transaction pins one
-- backend for its duration, so the session settings the DO blocks read are the ones just written.
begin;

-- psql does NOT interpolate :variables inside dollar-quoted bodies, so the values the DO blocks
-- below need are handed to the server as session settings first.
select set_config('matrx.suite_name',     :'suite',              false),
       set_config('matrx.branch_sysid',   :'matrx_branch_sysid', false),
       set_config('matrx.suite_requires', :'requires',           false),
       set_config('matrx.conn_user',      :'USER',               false),
       set_config('matrx.conn_host',      :'HOST',               false)
\g (tuples_only=on format=unaligned) /dev/null

-- The project ref of the server we are actually connected to, taken from the connection:
--   pooler  → user  `postgres.<ref>`        (the suffix after the FIRST dot)
--   direct  → host  `db.<ref>.supabase.co`  (or `<ref>.supabase.co`)
-- Anything else yields the empty string, which matches no target and is therefore refused.
select
  (select system_identifier from pg_control_system())::text                    as matrx_sysid,
  case
    when strpos(:'USER', '.') > 0 then split_part(:'USER', '.', 2)
    when :'HOST' ~ '^db\.[a-z0-9]+\.supabase\.(co|com)$' then split_part(:'HOST', '.', 2)
    when :'HOST' ~ '^[a-z0-9]+\.supabase\.(co|com)$'      then split_part(:'HOST', '.', 1)
    else ''
  end                                                                          as matrx_ref
\gset

select
  case
    when :'matrx_sysid' = :'matrx_prod_sysid'   and :'matrx_ref' = :'matrx_prod_ref'
         and :'matrx_prod_ref'   not like '%UNREADABLE%' then 'MAIN'
    when :'matrx_sysid' = :'matrx_branch_sysid' and :'matrx_ref' = :'matrx_branch_ref'
         and :'matrx_branch_ref' not like '%UNREADABLE%' then 'REHEARSAL BRANCH'
    when :'matrx_sysid' = :'matrx_clone_sysid'  and :'matrx_ref' = :'matrx_clone_ref'
         and :'matrx_clone_ref'  not like '%UNREADABLE%' then 'DEV CLONE'
    else 'UNKNOWN'
  end as matrx_db
\gset

select case when :'matrx_db' = 'UNKNOWN' then 'true' else 'false' end as matrx_unknown,
       case when :'expect' = '' then 'false'
            when (:'expect' = 'main'   and :'matrx_db' = 'MAIN')
              or (:'expect' = 'branch' and :'matrx_db' = 'REHEARSAL BRANCH')
              or (:'expect' = 'clone'  and :'matrx_db' = 'DEV CLONE')
            then 'false' else 'true' end as matrx_wrong_target
\gset

\echo '── suite:' :suite
\echo '── database:' :matrx_db '(pg_control_system().system_identifier' :matrx_sysid '· project ref' :matrx_ref '· connected as' :USER 'at' :HOST ')'

\if :matrx_unknown
  \echo 'REFUSED: a campaign suite runs on the MAIN database, on the rehearsal branch named in'
  \echo 'REFUSED: common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF, or on the dev clone'
  \echo 'REFUSED: named in common-docs/operations/clone/CLONE-REF, and nowhere else.'
  \echo 'REFUSED: a target is (system_identifier, project ref) TOGETHER — a data clone reports its'
  \echo 'REFUSED: parent production system_identifier, so the number alone is not an identity.'
  \echo 'REFUSED: expected MAIN' :matrx_prod_sysid '/' :matrx_prod_ref
  \echo 'REFUSED:       BRANCH' :matrx_branch_sysid '/' :matrx_branch_ref
  \echo 'REFUSED:     DEV CLONE' :matrx_clone_sysid '/' :matrx_clone_ref
  \echo 'REFUSED: the server answered' :matrx_sysid '/' :matrx_ref
  do $matrx_refuse$
  begin
    raise exception
      'REFUSED: % runs on the MAIN database, the rehearsal branch or the dev clone only, identified by (system_identifier, project ref) together. This server is % / %. Nothing attempted.',
      current_setting('matrx.suite_name'),
      (select system_identifier from pg_control_system()),
      nullif(current_setting('matrx.conn_user'), '');
  end
  $matrx_refuse$;
\endif

\if :matrx_wrong_target
  \echo 'REFUSED: this run declared expect=' :expect 'and this server is' :matrx_db
  \echo 'REFUSED: sysid' :matrx_sysid '· project ref' :matrx_ref '· Nothing attempted.'
  do $matrx_wrong$
  begin
    raise exception
      'REFUSED: % declared the target it intends and this server is not it. Nothing attempted.',
      current_setting('matrx.suite_name');
  end
  $matrx_wrong$;
\endif

-- ── the declared dependencies ───────────────────────────────────────────────────────────────
do $matrx_req$
declare
  v_tok text; v_kind text; v_arg text; v_pred text; v_rel text;
  v_miss text[] := '{}'; v_ok boolean; v_n bigint; v_neg boolean;
begin
  foreach v_tok in array coalesce(
      string_to_array(nullif(current_setting('matrx.suite_requires', true), ''), '|'), '{}'::text[])
  loop
    v_tok := btrim(v_tok);
    if v_tok = '' then continue; end if;
    v_neg := left(v_tok, 1) = '!';
    if v_neg then v_tok := substr(v_tok, 2); end if;
    v_kind := split_part(v_tok, ':', 1);
    v_arg  := substr(v_tok, length(v_kind) + 2);
    if v_kind = 'relation' then
      v_ok := to_regclass(v_arg) is not null;
    elsif v_kind = 'type' then
      begin v_ok := to_regtype(v_arg) is not null;
      exception when others then v_ok := false; end;
    elsif v_kind in ('function', 'exec') then
      v_ok := exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = split_part(v_arg, '.', 1)
          and p.proname = split_part(v_arg, '.', 2)
          and (v_kind = 'function' or has_function_privilege(current_user, p.oid, 'EXECUTE')));
    elsif v_kind = 'grant' then
      -- grant:<role>:<schema>.<name>
      v_pred := split_part(v_arg, ':', 1);                      -- the role
      v_rel  := substr(v_arg, length(v_pred) + 2);              -- schema.name
      if not exists (select 1 from pg_roles where rolname = v_pred) then
        v_ok := false;
      else
        v_ok := exists (
          select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = split_part(v_rel, '.', 1)
            and p.proname = split_part(v_rel, '.', 2)
            and has_function_privilege(v_pred, p.oid, 'EXECUTE'));
      end if;
    elsif v_kind = 'column' then
      v_ok := exists (
        select 1 from information_schema.columns
        where table_schema = split_part(v_arg, '.', 1)
          and table_name   = split_part(v_arg, '.', 2)
          and column_name  = split_part(v_arg, '.', 3));
    elsif v_kind = 'schema' then
      v_ok := exists (select 1 from pg_namespace where nspname = v_arg);
    elsif v_kind = 'tablegrant' then
      -- tablegrant:<role>:<schema>.<table>:<priv>
      v_pred := split_part(v_arg, ':', 1);                       -- the role
      v_rel  := split_part(v_arg, ':', 2);                       -- schema.table
      if not exists (select 1 from pg_roles where rolname = v_pred)
         or to_regclass(v_rel) is null then
        v_ok := false;
      else
        v_ok := has_table_privilege(v_pred, v_rel::regclass, split_part(v_arg, ':', 3));
      end if;
    elsif v_kind = 'extension' then
      v_ok := exists (select 1 from pg_extension where extname = v_arg);
    elsif v_kind = 'compute' then
      -- compute:<pg_settings name>:<min>
      v_pred := split_part(v_arg, ':', 1);                       -- the setting name
      v_rel  := split_part(v_arg, ':', 2);                       -- the minimum, as a number
      if v_rel !~ '^[0-9]+$' then
        raise exception 'campaign preamble: compute:<setting>:<min> needs a whole number, and "%" is not one', v_tok;
      end if;
      begin
        select (s.setting)::numeric >= v_rel::numeric into v_ok
          from pg_settings s where s.name = v_pred;
      exception when others then
        -- a setting that is not a number is a BROKEN DECLARATION, not a small server.
        raise exception 'campaign preamble: pg_settings."%" could not be read as a number here (%). Pick a numeric setting — shared_buffers is the one that moves with the instance class.', v_pred, sqlerrm;
      end;
      v_ok := coalesce(v_ok, false);
    elsif v_kind = 'row' then
      v_rel  := split_part(v_arg, ':', 1);
      v_pred := substr(v_arg, length(v_rel) + 2);
      if to_regclass(v_rel) is null then
        v_ok := false;
      else
        -- A predicate that will not parse is a BROKEN DECLARATION, never a missing row: it
        -- would skip on every database, production included. It is raised, not swallowed.
        begin
          execute format('select count(*) from %s where %s', v_rel, v_pred) into v_n;
        exception when others then
          raise exception 'campaign preamble: the row: predicate in "%" could not be evaluated here (%). Fix the declaration — escape inner quotes as \'' in psql \set.', v_tok, sqlerrm;
        end;
        v_ok := coalesce(v_n, 0) > 0;
      end if;
    else
      raise exception 'campaign preamble: unknown dependency token kind "%" in "%"', v_kind, v_tok;
    end if;
    if v_neg then v_ok := not v_ok; end if;
    if not v_ok then v_miss := v_miss || ((case when v_neg then '!' else '' end) || v_tok); end if;
  end loop;
  perform set_config('matrx.suite_missing', array_to_string(v_miss, ', '), false);
end
$matrx_req$;

select case when coalesce(current_setting('matrx.suite_missing', true), '') = ''
            then 'false' else 'true' end                      as matrx_skip,
       coalesce(current_setting('matrx.suite_missing', true), '') as matrx_missing
\gset

commit;

\if :matrx_skip
  \echo 'SKIPPED:' :suite 'asserted nothing. This' :matrx_db 'database does not have:' :matrx_missing
  \echo 'SKIPPED: this is NOT a pass. Re-run it once the dependency above exists here.'
\endif
-- The caller stops itself: `\quit` inside an \i-included file ends only the include, so every
-- suite closes the include with the three lines documented at the top of this file.
