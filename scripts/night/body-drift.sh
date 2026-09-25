#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# body-drift.sh — is every function and view BODY on the copy the source's body?
#
# 🚨 THE CLASS IT CLOSES (lane BRANCH-REFRESH-4, 2026-09-24). The clone catch-up and the branch
# refresh compare LEDGERS: a (source, filename, checksum) row says a file RAN, never what stands
# now. `platform.knob_archive` held its pre-knobguard2 body (8159fb54…) on BOTH the clone and the
# branch while both ledgers listed knobguard2 as applied (ERRORS-HONEST, 2026-09-24); S6 hit the
# same shape on `custom.portal_public`. No ledger disagreed, so no job reported anything. This job
# hashes every function (owner + pg_get_functiondef) and view (owner + reloptions + columns +
# pg_get_viewdef) in the
# campaign schemas on the copy and on the source, in one catalogue read each, and names every
# object the source holds whose body the copy does not hold byte-for-byte.
#
# --repair levels each one from the SOURCE'S OWN BODY — the executable `pg_get_functiondef`, or
# `create or replace view … as <pg_get_viewdef>` — one transaction per object, `lock_timeout 30s`,
# `check_function_bodies off` (a body naming a function the copy has not caught yet still lands;
# the next re-measure judges it). Then it measures again; the exit code is the AFTER count.
# A materialized view is reported, never rebuilt (a rebuild is a data operation). A body that
# will not land is named with the server's own error.
#
# The source is read inside `begin read only` (night_readonly_psql), proven read-only first
# (night_assert_target_readonly) — this job writes the copy and nothing else.
#
# A VIEW is hashed as reloptions + its column list (name and type) + pg_get_viewdef with each
# line-final ` AS <name>` removed. Measured 2026-09-24: `platform.v_unit_purpose_coverage` created
# long ago on production deparses its UNION arms as `SELECT 'workflow'::text,`, and the same text
# replayed on the branch deparses as `SELECT 'workflow'::text AS text,` — same server version
# (17.6), same meaning, different stored tree. The column list keeps a real rename visible.
#
# ONE DIRECTION: an object only the copy holds is a lane building on its copy — printed as a
# count, never a mismatch (check:branch-schema-drift's rule).
#
# Usage:
#   scripts/night/body-drift.sh --target clone|branch [--source production|clone] [--repair]
#                               [--schemas platform,iam,history,custom] [--list-file <path>]
#   scripts/night/body-drift.sh --self-test      no database: the differ's fixtures + this
#                                                script's bare-PATH tool resolution
# Exit: 0 level (after repair, if asked) · 1 mismatches remain · 2 a read failed · 78 refused.
# ─────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

TARGET="" SOURCE=production REPAIR=0 SELFTEST=0 LIST_FILE=""
SCHEMAS="platform,iam,history,custom"
while [ $# -gt 0 ]; do
  case "$1" in
    --target)    TARGET="${2:-}"; shift 2 ;;
    --source)    SOURCE="${2:-}"; shift 2 ;;
    --schemas)   SCHEMAS="${2:-}"; shift 2 ;;
    --list-file) LIST_FILE="${2:-}"; shift 2 ;;
    --repair)    REPAIR=1; shift ;;
    --self-test) SELFTEST=1; shift ;;
    *) say "REFUSED: unknown argument '$1'."; exit 78 ;;
  esac
done

if [ "$SELFTEST" = "1" ]; then
  # launchd hands a job /usr/bin:/bin:/usr/sbin:/sbin (the 2026-09-23 exit-127 night). Every tool
  # this job calls must resolve through lib-night.sh's PATH, not the caller's shell.
  rc=0
  for t in python3 shasum mktemp; do
    if command -v "$t" >/dev/null 2>&1; then say "PASS tool on PATH: $t -> $(command -v "$t")"
    else say "FAIL tool not on PATH: $t"; rc=1; fi
  done
  night_resolve_psql >/dev/null || { say "FAIL psql does not resolve"; rc=1; }
  [ -x "${PSQL:-}" ] && say "PASS psql resolves: $PSQL"
  /usr/bin/env python3 "$FRONTEND/scripts/night/body-drift.py" --self-test || rc=1
  /usr/bin/env python3 "$FRONTEND/scripts/night/body-drift-inverses.py" --self-test || rc=1
  # The catalogue query must name the four campaign schemas by default and be ONE statement.
  case "$SCHEMAS" in *platform*iam*history*custom*) say "PASS default schemas: $SCHEMAS" ;; *) say "FAIL default schemas: $SCHEMAS"; rc=1 ;; esac
  say "body-drift self-test: $([ $rc -eq 0 ] && print GREEN || print RED)"
  exit $rc
fi

case "$TARGET" in clone|branch) ;; *) say "REFUSED: --target must be clone or branch (got '${TARGET}')."; exit 78 ;; esac
case "$SOURCE" in production|clone) ;; *) say "REFUSED: --source must be production or clone."; exit 78 ;; esac
[ "$SOURCE" = "$TARGET" ] && { say "REFUSED: the source and the copy are the same database."; exit 78; }
[[ "$SCHEMAS" =~ '^[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*$' ]] || { say "REFUSED: --schemas is a comma list of schema names."; exit 78; }

night_resolve_psql || exit $?
WORK="$(mktemp -d)"

# ── the copy, which this job may WRITE (only with --repair) ──────────────────
COPY_DSN="$(night_target_dsn "$TARGET")" || exit 78
[ -n "$COPY_DSN" ] || { say "REFUSED: no connection for the $TARGET."; exit 78; }
night_dsn_args "$COPY_DSN" || { say "REFUSED: the $TARGET DSN is not a DSN."; exit 78; }
COPY_ARGS=("${NIGHT_DSN_ARGS[@]}")
night_assert_target "$TARGET" "${COPY_ARGS[@]}" || exit $?

# ── the source, which this job only READS ────────────────────────────────────
if [ "$SOURCE" = "production" ]; then
  prod_env() { grep -m1 "^SUPABASE_MATRIX_$1=" "$AIDREAM/.env" | cut -d= -f2- | tr -d '"'; }
  P_USER="$(prod_env USER)"; P_HOST="$(prod_env HOST)"; P_PORT="$(prod_env PORT)"
  P_DB="$(prod_env DATABASE_NAME)"; P_PW="$(prod_env PASSWORD)"
  [ -n "$P_USER" ] && [ -n "$P_HOST" ] && [ -n "$P_PW" ] || { say "REFUSED: SUPABASE_MATRIX_* unreadable at $AIDREAM/.env."; exit 78; }
  SRC_ARGS=(-h "$P_HOST" -p "${P_PORT:-6543}" -U "$P_USER" -d "${P_DB:-postgres}")
  night_pgpass_add "$P_HOST" "${P_PORT:-6543}" "$P_USER" "$P_PW" || exit 78
  P_PW=""
else
  SRC_DSN="$(night_target_dsn clone)" || exit 78
  night_dsn_args "$SRC_DSN" || exit 78
  SRC_ARGS=("${NIGHT_DSN_ARGS[@]}")
fi
night_assert_target_readonly "$SOURCE" "${SRC_ARGS[@]}" || exit $?

SCHEMA_ARRAY="'{${SCHEMAS}}'::text[]"
# One statement; search_path pinned so both sides print qualified names identically.
CATALOGUE_SQL="set local search_path = pg_catalog;
select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       encode(sha256(convert_to('owner ' || pg_get_userbyid(p.proowner) || '|' || pg_get_functiondef(p.oid), 'utf8')), 'hex')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = any($SCHEMA_ARRAY) and p.prokind in ('f','p')
   and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
union all
select case c.relkind when 'm' then 'matview' else 'view' end, n.nspname || '.' || c.relname,
       encode(sha256(convert_to('owner ' || pg_get_userbyid(c.relowner) || '|' || coalesce(array_to_string(c.reloptions, ','), '') || '|' ||
         (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum)
            from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) || '|' ||
         regexp_replace(pg_get_viewdef(c.oid), ' AS "?[A-Za-z_][A-Za-z0-9_]*"?(,?)$', '\\1', 'gn'), 'utf8')), 'hex')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = any($SCHEMA_ARRAY) and c.relkind in ('v','m')
   and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')"

measure() {  # measure <label> -> $WORK/<label>.{source,copy}.tsv and $WORK/<label>.diff
  local label="$1"
  night_readonly_psql "${SRC_ARGS[@]}" -F $'\t' --sql "$CATALOGUE_SQL" > "$WORK/$label.source.tsv" 2> "$WORK/$label.err" || {
    say "READ FAILED on the $SOURCE: $(head -3 "$WORK/$label.err")"; return 2; }
  "$PSQL" "${COPY_ARGS[@]}" -qAt -F $'\t' -v ON_ERROR_STOP=1 -c "begin read only; $CATALOGUE_SQL; commit;" > "$WORK/$label.copy.tsv" 2>> "$WORK/$label.err" || {
    say "READ FAILED on the $TARGET: $(head -3 "$WORK/$label.err")"; return 2; }
  /usr/bin/env python3 "$FRONTEND/scripts/night/body-drift.py" diff "$WORK/$label.source.tsv" "$WORK/$label.copy.tsv" > "$WORK/$label.diff"
  local rc=$?
  if [ $rc -ne 0 ]; then say "REFUSED: $(cut -f2- "$WORK/$label.diff")"; return 2; fi
  return 0
}

report() {  # report <label>
  local label="$1" n co
  n=$(grep -c '^MISMATCH' "$WORK/$label.diff" 2>/dev/null || true); n=${n:-0}
  co="$(sed -nE 's/^COPYONLY\t//p' "$WORK/$label.diff")"
  say "body drift ($label): $TARGET vs $SOURCE over [$SCHEMAS] — source $(wc -l < "$WORK/$label.source.tsv" | tr -d ' ') bodies, copy $(wc -l < "$WORK/$label.copy.tsv" | tr -d ' ') — MISMATCHES $n (differs $(grep -c $'\tdiffers$' "$WORK/$label.diff" || true), absent $(grep -c $'\tabsent$' "$WORK/$label.diff" || true)); copy-only ${co:-0} (not counted)"
  grep '^MISMATCH' "$WORK/$label.diff" | while IFS=$'\t' read -r _ kind key why; do say "  $why  $kind  $key"; done
  [ -n "$LIST_FILE" ] && cp "$WORK/$label.diff" "$LIST_FILE.$label"
  MISMATCHES=$n
}

measure before || exit 2
report before
BEFORE=$MISMATCHES

# ── INVERSES WHOSE based-on NAMES A BODY THAT NEVER STANDS LIVE ──────────────
# The chair's finding, 2026-09-25: uichamp_s1's inverse declares custom.view_declare at b6665956…
# while its up-file's own bytes produce e3cbe21f…, which is what production holds, so DD-220 would
# refuse that inverse the one time it is needed. Judged against PRODUCTION only (the ledger that
# says which up-files stand); scripts/night/body-drift-inverses.py holds the rules.
STALE_INVERSES=0
if [ "$SOURCE" = "production" ]; then
  night_readonly_psql "${SRC_ARGS[@]}" -F $'\t' --sql "select source, filename, checksum, applied_at::text from public._schema_migrations" > "$WORK/ledger.tsv" 2>/dev/null
  /usr/bin/env python3 "$FRONTEND/scripts/night/body-drift-inverses.py" sigs "$WORK/ledger.tsv" > "$WORK/inv-sigs.txt"
  if [ -s "$WORK/inv-sigs.txt" ]; then
    INV_ARR="$(/usr/bin/env python3 -c "import sys; print(','.join(\"'\" + l.strip().replace(\"'\", \"''\") + \"'\" for l in open(sys.argv[1]) if l.strip()))" "$WORK/inv-sigs.txt")"
    night_readonly_psql "${SRC_ARGS[@]}" -F $'\t' --sql "select s, coalesce(encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s)), 'utf8')), 'hex'), '') from unnest(array[$INV_ARR]::text[]) s" > "$WORK/inv-live.tsv" 2>/dev/null
    /usr/bin/env python3 "$FRONTEND/scripts/night/body-drift-inverses.py" judge "$WORK/ledger.tsv" "$WORK/inv-live.tsv" > "$WORK/inv.out"
    STALE_INVERSES=$(grep -c '^STALE' "$WORK/inv.out" || true); STALE_INVERSES=${STALE_INVERSES:-0}
    say "inverses judged against production: $(sed -nE 's/^JUDGED\t//p' "$WORK/inv.out") based-on line(s) — STALE $STALE_INVERSES (a body that never stood live; the inverse would be refused), superseded $(grep -c '^SUPERSEDED' "$WORK/inv.out" || true) (production moved on; informational)"
    grep '^STALE' "$WORK/inv.out" | while IFS=$'\t' read -r _ f sig why; do say "  STALE inverse $f — $sig: $why"; done
    [ -n "$LIST_FILE" ] && cp "$WORK/inv.out" "$LIST_FILE.inverses"
  fi
fi

if [ "$REPAIR" = "1" ] && [ "$BEFORE" -gt 0 ]; then
  say "─── repair: levelling each mismatch from the $SOURCE's own body ───"
  REPAIRED=0 NOT_REPAIRED=0
  # Two passes: a body that named something not yet levelled lands on the second.
  for pass in 1 2; do
    grep '^MISMATCH' "$WORK/$([ $pass = 1 ] && print before || print mid).diff" > "$WORK/todo" 2>/dev/null || : > "$WORK/todo"
    [ -s "$WORK/todo" ] || break
    while IFS=$'\t' read -r _ kind key why; do
      q="${key//\'/\'\'}"
      case "$kind" in
        function)
          DEF_SQL="set local search_path = pg_catalog; select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = '$q'" ;;
        view)
          DEF_SQL="set local search_path = pg_catalog; select format('create or replace view %s%s as %s', '$q'::regclass, case when c.reloptions is null then '' else ' with (' || array_to_string(c.reloptions, ', ') || ')' end, pg_get_viewdef(c.oid)) from pg_class c where c.oid = '$q'::regclass" ;;
        *) say "  NOT REPAIRED ($kind) $key — a materialized view is rebuilt by a person, not by this job"; NOT_REPAIRED=$((NOT_REPAIRED+1)); continue ;;
      esac
      night_readonly_psql "${SRC_ARGS[@]}" --sql "$DEF_SQL" > "$WORK/def.sql" 2> "$WORK/def.err" || { say "  NOT REPAIRED $key — could not read the $SOURCE's body: $(head -1 "$WORK/def.err")"; continue; }
      : > "$WORK/door.sql"; : > "$WORK/acl.sql"
      if [ "$kind" = "function" ]; then
        # A SECURITY DEFINER body reaches COMMIT only with its access decision declared
        # (platform._provision_shape_settled), so the source's door rows for THIS signature travel
        # with its body — inserted only where the copy has no row for the same identity, and with
        # identity_argtypes re-read from the COPY's catalogue: type OIDs differ between databases
        # (permission_level is 1699632 on production, 308296 on the branch).
        night_readonly_psql "${SRC_ARGS[@]}" --sql "set local search_path = pg_catalog; select format('insert into platform.client_callable_door select r.* from json_populate_record(null::platform.client_callable_door, jsonb_set(%L::jsonb, ''{identity_argtypes}'', coalesce(to_jsonb((select platform.door_argtypes(p.proargtypes) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || ''.'' || p.proname || ''('' || pg_get_function_identity_arguments(p.oid) || '')'' = %L)), ''null''::jsonb))::json) r where not exists (select 1 from platform.client_callable_door d where d.schema_name = r.schema_name and d.function_name = r.function_name and d.identity_args = r.identity_args) on conflict do nothing;', row_to_json(d), '$q') from platform.client_callable_door d join pg_namespace n on n.nspname = d.schema_name join pg_proc p on p.pronamespace = n.oid and p.proname = d.function_name where n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = '$q' and (d.identity_argtypes = platform.door_argtypes(p.proargtypes) or (d.identity_argtypes is null and d.identity_args = pg_get_function_identity_arguments(p.oid)))" > "$WORK/door.sql" 2>"$WORK/door.err" || { say "  (could not read the $SOURCE's door rows for $key: $(head -1 "$WORK/door.err"))"; : > "$WORK/door.sql"; }
        # The source's own EXECUTE grants, used only when the body must be dropped and recreated
        # (a return-type or parameter change CREATE OR REPLACE cannot make) and so loses its ACL.
        night_readonly_psql "${SRC_ARGS[@]}" --sql "set local search_path = pg_catalog; select 'revoke all on function ' || p.oid::regprocedure::text || ' from public;' union all select format('grant %s on function %s to %s;', a.privilege_type, p.oid::regprocedure, case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end) from pg_proc p join pg_namespace n on n.oid = p.pronamespace cross join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles r on r.oid = a.grantee where n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = '$q' and a.grantee <> p.proowner" > "$WORK/acl.sql" 2>/dev/null || : > "$WORK/acl.sql"
      fi
      # The OWNER is part of the body: a SECURITY DEFINER function runs as it
      # (history.vault_write_revision runs as the NOLOGIN vault_history_writer on production).
      case "$kind" in
        function) OWN_SQL="set local search_path = pg_catalog; select format('alter function %s owner to %I;', p.oid::regprocedure, pg_get_userbyid(p.proowner)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = '$q'" ;;
        view)     OWN_SQL="set local search_path = pg_catalog; select format('alter view %s owner to %I;', c.oid::regclass, pg_get_userbyid(c.relowner)) from pg_class c where c.oid = '$q'::regclass" ;;
      esac
      night_readonly_psql "${SRC_ARGS[@]}" --sql "$OWN_SQL" > "$WORK/own.sql" 2>/dev/null || : > "$WORK/own.sql"
      { print -r -- "set local lock_timeout = '30s'; set local search_path = pg_catalog; set local check_function_bodies = off;"
        cat "$WORK/def.sql"; print -r -- ";"; cat "$WORK/own.sql" "$WORK/door.sql"; } > "$WORK/apply.sql"
      if "$PSQL" "${COPY_ARGS[@]}" -q -1 -v ON_ERROR_STOP=1 -f "$WORK/apply.sql" > "$WORK/apply.out" 2>&1; then
        say "  levelled ($why) $kind $key"
      elif [ "$kind" = "function" ] && grep -qE 'cannot change (return type|name of input parameter)|cannot remove parameter defaults' "$WORK/apply.out"; then
        # CREATE OR REPLACE cannot change a signature's shape; the source's shape is dropped and
        # recreated in ONE transaction with the source's grants. A function something depends on
        # refuses the DROP (no CASCADE, ever) and is named.
        { print -r -- "set local lock_timeout = '30s'; set local search_path = pg_catalog; set local check_function_bodies = off;"
          print -r -- "drop function ${key%%\(*}($(night_readonly_psql "${SRC_ARGS[@]}" --sql "set local search_path = pg_catalog; select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = '$q'"));"
          cat "$WORK/def.sql"; print -r -- ";"; cat "$WORK/own.sql" "$WORK/acl.sql" "$WORK/door.sql"; } > "$WORK/apply2.sql"
        if "$PSQL" "${COPY_ARGS[@]}" -q -1 -v ON_ERROR_STOP=1 -f "$WORK/apply2.sql" > "$WORK/apply.out" 2>&1; then
          say "  levelled ($why, dropped and recreated with the $SOURCE's grants) $kind $key"
        else
          say "  NOT REPAIRED (pass $pass) $kind $key — $(grep -m1 -E 'ERROR' "$WORK/apply.out" | cut -c1-240)"
        fi
      else
        say "  NOT REPAIRED (pass $pass) $kind $key — $(grep -m1 -E 'ERROR' "$WORK/apply.out" | cut -c1-240)"
      fi
    done < "$WORK/todo"
    measure mid || exit 2
  done
fi

if [ "$REPAIR" = "1" ] && [ "$BEFORE" -gt 0 ]; then
  measure after || exit 2
  report after
fi
say "body-drift RESULT: $TARGET vs $SOURCE — mismatches before $BEFORE, after $MISMATCHES$([ "$REPAIR" = 1 ] || print ' (report only, nothing written)')"
[ "$SOURCE" = "production" ] && say "body-drift RESULT: stale inverses $STALE_INVERSES"
[ "$MISMATCHES" -eq 0 ] && [ "$STALE_INVERSES" -eq 0 ] && exit 0
exit 1
