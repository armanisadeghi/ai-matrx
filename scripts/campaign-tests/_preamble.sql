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
--   1. Accepts the MAIN database OR the rehearsal branch, and REFUSES anything else by name.
--      The branch's identity is read from the checked-in plan file
--      common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF — never typed in here, so a
--      rebuilt branch needs no edit to any suite. An unreadable BRANCH-REF is a refusal.
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
--
-- A token may be NEGATED with a leading `!`: `!tablegrant:authenticated:platform.associations:DELETE`
-- means the suite needs that privilege to be ABSENT here. Production revokes a door's direct
-- write and the branch does not, so a suite about what the door decides proves nothing here —
-- and says so by name instead of failing as if the door were broken.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- The branch identity, read from BRANCH-REF by the checked-in helper. Relative paths resolve
-- from the repository root, which is where suites are run from.
\set matrx_branch_sysid `sh scripts/campaign-tests/_branch-sysid.sh`

-- Defaults, so a suite that declares neither still works.
\if :{?suite}
\else
  \set suite 'campaign suite'
\endif
\if :{?requires}
\else
  \set requires ''
\endif

-- psql does NOT interpolate :variables inside dollar-quoted bodies, so the three values the
-- DO blocks below need are handed to the server as session settings first.
select set_config('matrx.suite_name',     :'suite',              false),
       set_config('matrx.branch_sysid',   :'matrx_branch_sysid', false),
       set_config('matrx.suite_requires', :'requires',           false)
\g (tuples_only=on format=unaligned) /dev/null

select
  (select system_identifier from pg_control_system())::text as matrx_sysid,
  case (select system_identifier from pg_control_system())::text
    when '7642734024280108049' then 'MAIN'
    when :'matrx_branch_sysid'  then 'REHEARSAL BRANCH'
    else 'UNKNOWN'
  end as matrx_db,
  case when (select system_identifier from pg_control_system())::text
         not in ('7642734024280108049', :'matrx_branch_sysid')
       then 'true' else 'false' end as matrx_unknown
\gset

\echo '── suite:' :suite
\echo '── database:' :matrx_db '(pg_control_system().system_identifier' :matrx_sysid ')'

\if :matrx_unknown
  \echo 'REFUSED: a campaign suite runs on the MAIN database or on the rehearsal branch named'
  \echo 'REFUSED: in common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF, and nowhere else.'
  \echo 'REFUSED: expected MAIN 7642734024280108049 or BRANCH' :matrx_branch_sysid
  \echo 'REFUSED: the server answered' :matrx_sysid
  do $matrx_refuse$
  begin
    raise exception
      'REFUSED: % runs on the MAIN database (7642734024280108049) or the rehearsal branch (%) only, and this server is %. Nothing attempted.',
      current_setting('matrx.suite_name'), current_setting('matrx.branch_sysid'),
      (select system_identifier from pg_control_system());
  end
  $matrx_refuse$;
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

\if :matrx_skip
  \echo 'SKIPPED:' :suite 'asserted nothing. This' :matrx_db 'database does not have:' :matrx_missing
  \echo 'SKIPPED: this is NOT a pass. Re-run it once the dependency above exists here.'
\endif
-- The caller stops itself: `\quit` inside an \i-included file ends only the include, so every
-- suite closes the include with the three lines documented at the top of this file.
