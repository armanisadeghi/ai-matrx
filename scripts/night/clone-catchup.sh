#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# clone-catchup.sh — the nightly's FIRST step after the clone is refreshed.
#
# 🚨 THE CLASS IT CLOSES (VERIFIER-13 item 4, 2026-09-22).
#
# The nightly dev clone is a PHYSICAL RESTORE taken once a day, so every migration ledgered on
# production AFTER the snapshot is simply absent from it — silently, because the clone carries
# production's own `public._schema_migrations` as it stood at the restore point, and that table
# says the missing files are applied. On 2026-09-22 lane STORE-TXN's whole suite PASSED on the
# clone and FAILED on main: `custom._relation_halves_agree`, a DEFERRED trigger applied to
# production at 15:15:46Z, did not exist on a clone promoted at 06:20Z. Two lanes, each correct
# on its own bytes, and the pair did not work. As long as heavy work belongs on the clone, the
# clone must carry what production carries, or every green it prints is about a database nobody
# runs.
#
# So, every night, right after the refresh: read BOTH ledgers, compute the delta, and apply it
# with THE REAL RUNNERS at `--target clone` — same judgement, same refusals, same guards, same
# ledger row. This job owns no apply path of its own and never will.
#
# WHAT IT DOES NOT DO:
#   · it never writes production — the production connection is a proven read-only transaction
#     (`night_assert_target_readonly`, which makes the server itself refuse a write before the
#     first row is read);
#   · it never skips a file because it looks awkward. A REVOKE in a protected schema, a chair
#     step, a policy file: the clone is a MIRROR, so everything production ran, it runs. Chair
#     steps need no confirmation at `--target clone` (both runners announce and proceed);
#   · it never applies bytes it cannot prove. The delta is resolved against `origin/main` and a
#     file whose committed bytes do not hash to production's ledgered checksum is REFUSED BY
#     NAME, with nothing applied for it.
#
# THE WINDOW. This job reads production and writes only the clone, so it is exempt from
# 01:00-03:30 Pacific — and the exemption is EARNED, not flagged: `night_window_guard` grants it
# only after the assertions have proven that every database this run can write is the clone.
# There is no switch here that removes the window, and there never may be (lib-night.sh's
# opening comment is the incident that wrote that rule).
#
# Usage:
#   scripts/night/clone-catchup.sh              apply the delta
#   scripts/night/clone-catchup.sh --dry-run    print the delta and change nothing
#   scripts/night/clone-catchup.sh --self-test  no database: the planner, inspection, later-owner and
#                                               dated-rule self-tests (pnpm check:clone-catchup:self-test)
# ─────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

LANE=clone-catchup
DRY_RUN=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    --self-test)
      # No database: every rule this job and its helpers judge by, RED cases first
      # (lane CLONE-LEDGER-VERDICTS, 2026-09-26: parity verdicts, the direct-apply regime, rule-4
      # inverses, owners, level-by-inspection, later owners of a replayed body, dated runner rules).
      rc=0
      /usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-plan.py" --self-test || rc=1
      /usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-inspect.py" --self-test || rc=1
      /usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-repair.py" --self-test || rc=1
      ( cd "$FRONTEND" && node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts --rule-dates-self-test ) || rc=1
      say "clone-catchup self-test: $([ $rc -eq 0 ] && print GREEN || print RED)"
      exit $rc ;;
    *) say "REFUSED: unknown argument '$a'. This job takes --dry-run or --self-test and nothing else."; exit 78 ;;
  esac
done

WORK="$(mktemp -d)"
say "clone-catchup starting (dry-run=$DRY_RUN), work dir $WORK"

night_resolve_psql || exit $?

# ── the clone, which this job WRITES ─────────────────────────────────────────
CLONE_DSN="$(night_target_dsn clone)" || exit 78
if [ -z "$CLONE_DSN" ]; then
  say "REFUSED: the clone's connection could not be assembled from CLONE_DATABASE_URL or"
  say "  $CLONE_REF_FILE plus the password file it names. Nothing attempted."
  exit 78
fi
night_dsn_args "$CLONE_DSN" || { say "REFUSED: the clone DSN is not a DSN. Nothing attempted."; exit 78; }
CLONE_ARGS=("${NIGHT_DSN_ARGS[@]}")
# No PGPASSWORD anywhere in this job: the clone's password is in PGPASSFILE (lib-night.sh), and so
# is production's, each matched by (host, port, user). Until 2026-09-23 this job toggled one
# exported PGPASSWORD between the two by hand, which is one missed toggle from sending production's
# password to the clone.
night_assert_target clone "${CLONE_ARGS[@]}" || exit $?

# ── production, which this job only READS ────────────────────────────────────
# The five SUPABASE_MATRIX_* values, read where a reader can see them (lib-night deliberately
# has no production helper). aidream/.env is where they live on this machine.
prod_env() { grep -m1 "^SUPABASE_MATRIX_$1=" "$AIDREAM/.env" | cut -d= -f2- | tr -d '"'; }
P_USER="$(prod_env USER)"; P_HOST="$(prod_env HOST)"; P_PORT="$(prod_env PORT)"
P_DB="$(prod_env DATABASE_NAME)"; P_PW="$(prod_env PASSWORD)"
if [ -z "$P_USER" ] || [ -z "$P_HOST" ] || [ -z "$P_PW" ]; then
  say "REFUSED: the five SUPABASE_MATRIX_* values are not readable at $AIDREAM/.env, so this"
  say "  run cannot read production's ledger. Nothing attempted."
  exit 78
fi
PROD_ARGS=(-h "$P_HOST" -p "${P_PORT:-6543}" -U "$P_USER" -d "${P_DB:-postgres}")
night_pgpass_add "$P_HOST" "${P_PORT:-6543}" "$P_USER" "$P_PW" || { say "REFUSED: could not register production's password in PGPASSFILE. Nothing attempted."; exit 78; }
P_PW=""
night_assert_target_readonly production "${PROD_ARGS[@]}" || exit $?

# Proven: clone (writable) + production(read-only). That earns the window exemption.
night_window_guard 0100 0330 || exit $?

# ── the two ledgers ──────────────────────────────────────────────────────────
# Columns 5-7 (lane CLONE-LEDGER-VERDICTS): duration, whether a RUNNER wrote the row, and its lane —
# how the planner tells a hand-ledgered direct apply (judged by no runner) and names who to ask.
LEDGER_SQL="select source, filename, checksum, applied_at::text, duration_ms::text, (coalesce(applied_by_process, '') <> '')::text, replace(replace(coalesce(applied_by_lane, ''), E'\\t', ' '), E'\\n', ' ') from public._schema_migrations"
night_readonly_psql "${PROD_ARGS[@]}" -F $'\t' --sql "$LEDGER_SQL" > "$WORK/production.tsv" || {
  say "REFUSED: production's ledger could not be read. Nothing applied."; exit 70; }
"$PSQL" "${CLONE_ARGS[@]}" -qAt -F $'\t' -v ON_ERROR_STOP=1 -c "$LEDGER_SQL" > "$WORK/clone.tsv" || {
  say "REFUSED: the clone's ledger could not be read. Nothing applied."; exit 70; }
say "ledgers read: production $(wc -l < "$WORK/production.tsv" | tr -d ' ') rows, clone $(wc -l < "$WORK/clone.tsv" | tr -d ' ') rows"

# ── the delta ────────────────────────────────────────────────────────────────
/usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-plan.py" \
  "$WORK/production.tsv" "$WORK/clone.tsv" > "$WORK/plan.tsv" || {
  say "REFUSED: the delta could not be computed. Nothing applied."; exit 70; }

APPLY_N=$(grep -c '^APPLY' "$WORK/plan.tsv" 2>/dev/null || true); APPLY_N=${APPLY_N:-0}
PARITY_N=$(grep -c '^PARITY' "$WORK/plan.tsv" 2>/dev/null || true); PARITY_N=${PARITY_N:-0}
REFUSE_N=$(grep -c '^REFUSE' "$WORK/plan.tsv" 2>/dev/null || true); REFUSE_N=${REFUSE_N:-0}
say "delta: $APPLY_N file(s) to apply, $REFUSE_N refusal(s); $PARITY_N production file(s) held by a parity verdict on the clone (compared level, not run here — not in the delta)"

while IFS=$'\x1f' read -r kind source filename checksum repo relpath runner selector reapply reason applied_at inverse owner; do
  [ "$kind" = "REFUSE" ] || continue
  say "REFUSED (named, nothing applied for it): $source/$filename — $reason"
  say "    who to ask: $owner"
done < "$WORK/plan.tsv"

if [ "$APPLY_N" -eq 0 ]; then
  say "nothing to apply; the clone already carries production's ledger."
  [ "$REFUSE_N" -gt 0 ] && exit 71
  exit 0
fi

while IFS=$'\x1f' read -r kind source filename checksum repo relpath runner selector reapply reason applied_at inverse owner; do
  [ "$kind" = "APPLY" ] || continue
  say "  $source/$filename [$runner${selector:+/$selector}] — $reason"
  [ -n "$inverse" ] && say "      rule 4: the clone holds an earlier version of this file; inverse first: $inverse"
  say "      who to ask: $owner"
done < "$WORK/plan.tsv"

if [ "$DRY_RUN" = "1" ]; then
  say "--dry-run: the delta above is what a real run would apply. Nothing was applied."
  exit 0
fi

# ── one file through its own runner ──────────────────────────────────────────
# The ONLY apply path this job has. Output goes to $APPLY_OUT so a refusal can be read.
APPLY_OUT="$WORK/apply.out"
apply_one() {  # apply_one <source> <filename> <repo> <relpath> <runner> <selector> <reapply>
  local source="$1" filename="$2" repo="$3" relpath="$4" runner="$5" selector="$6" reapply="$7"
  local -a cmd
  if [ "$runner" = "direct" ] || [ "$runner" = "record" ]; then
    direct_one "$source" "$filename" "$repo" "$relpath" "$runner" 2>&1 | tee "$APPLY_OUT"
    return ${pipestatus[1]}
  fi
  if [ "$runner" = "frontend" ]; then
    cmd=(node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts "$relpath" --target clone)
    [ "$selector" = "campaign" ] && cmd+=(--source campaign --lane "$LANE")
    [ "$reapply" = "yes" ] && cmd+=(--reapply)
    # Rule 2 (chair, 2026-09-26): judged by the rules in force when PRODUCTION ran it.
    [ -n "${JUDGED_AS_OF:-}" ] && cmd+=(--judged-as-of "$JUDGED_AS_OF")
  else
    cmd=(uv run python db/apply_migrations.py --no-generate --target clone)
    if [ "$reapply" = "yes" ]; then cmd+=(--rerun "$filename"); else cmd+=(--only "$filename"); fi
    case "$selector" in
      campaign|inverse) cmd+=(--source "$selector"); cmd+=(--lane "$LANE") ;;
      "") [ "$source" != "aidream" ] && cmd+=(--source "$source") ;;
    esac
  fi
  say "applying ($runner): $relpath$([ "$reapply" = yes ] && print -n ' (reapply)')"
  ( cd "$repo" && "${cmd[@]}" ) 2>&1 | tee "$APPLY_OUT"
  return ${pipestatus[1]}
}

# ── a DIRECT APPLY is carried the way production took it ─────────────────────
# 🚨 lane BRANCH-REFRESH-4, 2026-09-24. Since the owner's 2026-09-24 ~17:30 PT ruling lanes apply
# campaign files to production directly (Supabase MCP / psql, one transaction, lock_timeout 30s)
# and ledger them by hand under source `campaign`. No runner wrote that row, so no runner can
# replay it (the plan refused all seven on the first run: "ledger source 'campaign' is not a
# source this step knows"). `direct` runs the SAME committed bytes the SAME way, then writes the
# SAME row; `record` writes only the row, because the clone already ran these exact bytes under
# the runner's label (the lane rehearsed here). Production's own chair_step text is copied, so the
# clone's row says what production's says.
direct_one() {  # direct_one <source> <filename> <repo> <relpath> direct|record
  local source="$1" filename="$2" repo="$3" relpath="$4" mode="$5" ck note
  ck="$(shasum -a 256 "$repo/$relpath" | cut -d' ' -f1)"
  note="$(night_readonly_psql "${PROD_ARGS[@]}" --sql "select coalesce(chair_step, '') from public._schema_migrations where source = '$source' and filename = '$filename'" 2>/dev/null | head -1)"
  note="${note//\$cnote\$/}"   # dollar-quoted below; the one sequence that could end it is removed
  local ledger="insert into public._schema_migrations (source, filename, checksum, applied_at, duration_ms, chair_step, applied_by_lane)
                 values ('$source', '$filename', '$ck', now(), 0, 'catchup — ${mode} — ' || \$cnote\$${note}\$cnote\$, '$LANE')
                 on conflict (source, filename) do update set checksum = excluded.checksum, applied_at = excluded.applied_at,
                   chair_step = excluded.chair_step, applied_by_lane = excluded.applied_by_lane;"
  if [ "$mode" = "record" ]; then
    say "recording (direct apply, bytes already on the clone): $relpath"
    "$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "$ledger"
    return $?
  fi
  # 🚨 AN AUTOCOMMIT FILE IS CARRIED IN AUTOCOMMIT (lane PROVISION-BATCH-FIX, 2026-09-26).
  # `CREATE INDEX CONCURRENTLY` / `REINDEX ... CONCURRENTLY` cannot run inside a transaction
  # block, so production ran those files statement by statement; wrapping them in `psql -1`
  # refused both (storereadperf3_*, trash2_*: "cannot run inside a transaction block") and the
  # clone stayed a file behind every night. Such a file runs WITHOUT -1, each statement its own
  # transaction (no `set local` — it means nothing outside one, and the clone's pooler runs in
  # transaction mode, so a session SET would not follow the next statement), and its ledger row
  # is written only after every statement succeeded. Detection reads
  # statements, not comments: a line that is not a `--` comment and carries CONCURRENTLY.
  if grep -vE '^[[:space:]]*--' "$repo/$relpath" | grep -qiE '(^|[^a-z_])concurrently([^a-z_]|$)'; then
    # 🚨 A CANCELLED CONCURRENTLY BUILD LEAVES AN INVALID INDEX, AND `if not exists` THEN SKIPS IT
    # FOREVER (lane PROVISION-BATCH-FIX, 2026-09-26; the class invalid-indexes.sh names). The first
    # autocommit run of trash2_* hit a lock timeout on the clone (peers holding transactions) and
    # left files_trash_owner_deleted_idx / files_trash_org_deleted_idx INVALID; a retry would have
    # "succeeded" over them and ledgered a file whose indexes the planner cannot use. So every index
    # this file builds CONCURRENTLY is dropped first when the clone holds it INVALID, and judged
    # again after the run: a file is carried only when every one of them is valid.
    local -a cidx; local ix bad
    cidx=("${(@f)$(grep -vE '^[[:space:]]*--' "$repo/$relpath" \
      | grep -oiE 'create[[:space:]]+(unique[[:space:]]+)?index[[:space:]]+concurrently[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?[a-z_][a-z0-9_.]*' \
      | awk '{print tolower($NF)}' | sort -u)}")
    invalid_of() {  # invalid_of <index name, bare or schema-qualified> -> schema.name when INVALID
      local s="${1%.*}" n="${1##*.}"; [ "$s" = "$1" ] && s=""
      "$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "select format('%I.%I', ns.nspname, c.relname)
         from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace ns on ns.oid = c.relnamespace
        where c.relname = '$n' and ('$s' = '' or ns.nspname = '$s') and not (i.indisvalid and i.indisready)" 2>/dev/null
    }
    for ix in "${cidx[@]}"; do
      [ -n "$ix" ] || continue
      bad="$(invalid_of "$ix")"
      [ -n "$bad" ] || continue
      say "  the clone holds $bad INVALID (a cancelled earlier build); dropping it so this file rebuilds it"
      "$PSQL" "${CLONE_ARGS[@]}" -q -v ON_ERROR_STOP=1 -c "drop index concurrently if exists $bad" || return $?
    done
    say "applying (direct, AUTOCOMMIT — the file carries CONCURRENTLY, as production ran it): $relpath"
    local arc=0
    "$PSQL" "${CLONE_ARGS[@]}" -q -v ON_ERROR_STOP=1 -f "$repo/$relpath" || arc=$?
    for ix in "${cidx[@]}"; do
      [ -n "$ix" ] || continue
      bad="$(invalid_of "$ix")"
      [ -n "$bad" ] || continue
      say "  $bad is INVALID after this run; dropping it (nothing half-built is left behind), the file is NOT carried"
      "$PSQL" "${CLONE_ARGS[@]}" -q -v ON_ERROR_STOP=1 -c "drop index concurrently if exists $bad" || true
      [ $arc -eq 0 ] && arc=1
    done
    [ $arc -eq 0 ] || return $arc
    "$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "$ledger"
    return $?
  fi
  say "applying (direct, as production did): $relpath"
  { print -r -- "set local lock_timeout = '30s';"; cat "$repo/$relpath"; print; print -r -- "$ledger"; } > "$WORK/direct.sql"
  "$PSQL" "${CLONE_ARGS[@]}" -q -1 -v ON_ERROR_STOP=1 -f "$WORK/direct.sql"
}

# ── the body hash the clone actually holds, for one `schema.name(argtypes)` ──
# Built exactly the way `pnpm db:based-on` and `migration-based-on.ts` build it, so the number
# is comparable with what a `-- based-on:` line declares.
body_hash_sql() {  # body_hash_sql <schema.name(argtypes)>
  local sig="$1" q n a
  q="${sig%%\(*}"; a="${sig#*\(}"; a="${a%\)}"
  n="${q##*.}"; q="${q%.*}"
  print -r -- "select encode(sha256(convert_to(pg_get_functiondef(p.oid), 'utf8')), 'hex')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = '$q' and p.proname = '$n'
        and coalesce((select string_agg(format_type(t, null), ', ' order by ord)
                        from unnest(p.proargtypes) with ordinality as u(t, ord)), '') = '$a'"
}

clone_body_hash() {  # clone_body_hash <schema.name(argtypes)>
  "$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "$(body_hash_sql "$1")" 2>/dev/null | tr -d ' \r'
}

prod_body_hash() {  # prod_body_hash <schema.name(argtypes)> — SELECT-only, proven read-only
  night_readonly_psql "${PROD_ARGS[@]}" --sql "$(body_hash_sql "$1")" 2>/dev/null | tr -d ' \r'
}

# ── re-establish parity before giving up on a DD-220 refusal ─────────────────
#
# 🚨 CHAIR RULING 2026-09-22. The clone is the MIRROR; a rehearsal that leaves a body moved is
# the defect, not this job. So a `-- based-on:` refusal is NOT skipped and NOT bypassed: the
# file(s) that own the drifted body are found by (function name -> production's ledger -> the
# file on origin/main, checksum-verified), re-applied at `--target clone --reapply` newest
# first, and the catch-up retries the delta file only once the body hashes to what that file
# DECLARES. If no ledgered production file reproduces it, this refuses by name. DD-220 itself
# is never weakened — there is no flag here that does that, and there never may be.
# Returns 0 = repaired, retry the file. 2 = the file is superseded on production, skip it.
# 1 = neither; the refusal stands and is reported by name.
repair_parity() {  # repair_parity <cutoff applied_at>  (reads $APPLY_OUT, $REPAIR_EXCLUDE)
  local cutoff="$1" repaired=0 line sig want fn got
  local -a decls
  SUPERSEDED_ON_PRODUCTION=0
  decls=("${(@f)$(grep -oE '\`[^`]+\` based on sha256 [0-9a-f]{64}' "$APPLY_OUT" 2>/dev/null)}")
  [ -n "${decls[1]:-}" ] || return 1
  for line in "${decls[@]}"; do
    [ -n "$line" ] || continue
    sig="${line#\`}"; sig="${sig%%\`*}"
    want="${line##* }"
    fn="${sig%%\(*}"
    got="$(clone_body_hash "$sig")"
    if [ "$got" = "$want" ]; then continue; fi
    # 🚨 PARITY IS THE CRITERION, NOT THE FILE'S DECLARATION. Measured live 2026-09-22:
    # `doorsdecide3_two_doors_ask_the_wall_in_their_own_body.sql` declares
    # `custom.read_records_archived` at f3a603af…, and BOTH production and the clone hold
    # 0c08c11f… — production ran that file at 07:58Z and something later replaced the body, so
    # the declaration is stale against PRODUCTION too. The clone is already level; the file is
    # HISTORY, exactly like an inverse production superseded, and carrying it would write an
    # OLD body onto the clone — the opposite of the mirror. So: if the clone and production
    # agree on this body, nothing is repaired and nothing is applied.
    local prod_has; prod_has="$(prod_body_hash "$sig")"
    if [ -n "$prod_has" ] && [ "$got" = "$prod_has" ]; then
      say "  parity: the clone and PRODUCTION both hold $got for \`$sig\`; the file declares"
      say "    $want, which production itself has moved past. Nothing is drifted, so this file"
      say "    is SUPERSEDED history, not state. Not carried, and DD-220 is not touched."
      SUPERSEDED_ON_PRODUCTION=1
      continue
    fi
    say "  parity: the clone's \`$sig\` is ${got:-(absent)}, production holds ${prod_has:-(absent)},"
    say "    and production's file declares $want. The clone has DRIFTED; repairing."
    say "  parity: looking for the ledgered production file that owns that body."
    /usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-repair.py" \
      "$WORK/production.tsv" "$fn" "$cutoff" "$REPAIR_EXCLUDE" > "$WORK/candidates.tsv" || return 1
    local ck2 c_source c_file c_sum c_repo c_rel c_runner c_sel c_re c_why fixed=0
    while IFS=$'\x1f' read -r ck2 c_source c_file c_sum c_repo c_rel c_runner c_sel c_re c_why; do
      [ "$ck2" = "CANDIDATE" ] || continue
      say "  parity: re-applying production's bytes of $c_source/$c_file to put \`$fn\` back."
      apply_one "$c_source" "$c_file" "$c_repo" "$c_rel" "$c_runner" "$c_sel" yes >/dev/null 2>&1 || true
      got="$(clone_body_hash "$sig")"
      if [ "$got" = "$want" ]; then
        say "  parity RE-ESTABLISHED for \`$sig\` by $c_file."
        fixed=1; repaired=1; break
      fi
    done < "$WORK/candidates.tsv"
    if [ "$fixed" != "1" ]; then
      say "  parity REFUSED for \`$sig\`: no file production has ledgered reproduces that body"
      say "    (clone ${got:-absent}, wanted $want). The catch-up will not bypass DD-220."
      return 1
    fi
  done
  [ "$repaired" = "1" ] && return 0
  [ "$SUPERSEDED_ON_PRODUCTION" = "1" ] && return 2
  return 1
}


# ── is the clone already level with production on everything this file writes? ──
#
# 🚨 THE SAME CRITERION, ONE STEP WIDER. A `-- based-on:` refusal names a signature; a plain
# `create function` replayed onto a clone that already carries it answers 42723 and names
# nothing. Both ask the same question — are the clone and production already level on the
# bodies this file writes? — so both get the same answer. Measured live 2026-09-22:
# `suitestidy2_a_refusal_names_the_door_the_person_called.sql` refused 42723 because a lane had
# already rehearsed `custom.doors_refusing_in_another_doors_name` onto the clone; the body was
# already production's, so there was nothing to carry and nothing to repair.
already_level() {  # already_level <repo> <relpath> -> 0 when every body this file writes agrees
  local repo="$1" relpath="$2" name any=0 c p
  local -a names
  names=("${(@f)$(/usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-repair.py" \
            --functions-written "$repo/$relpath" 2>/dev/null)}")
  for name in "${names[@]}"; do
    [ -n "$name" ] || continue
    any=1
    c="$("$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "$(name_hashes_sql "$name")" 2>/dev/null)"
    p="$(night_readonly_psql "${PROD_ARGS[@]}" --sql "$(name_hashes_sql "$name")" 2>/dev/null)"
    [ -n "$p" ] || return 1
    [ "$c" = "$p" ] || return 1
  done
  [ "$any" = "1" ] || return 1
  return 0
}

name_hashes_sql() {  # name_hashes_sql <schema.name> — every overload, signature + hash, ordered
  local q="${1%.*}" n="${1##*.}"
  print -r -- "select string_agg(sig || ' ' || h, '|' order by sig) from (
       select n.nspname || '.' || p.proname || '(' || coalesce(
                (select string_agg(format_type(t, null), ', ' order by ord)
                   from unnest(p.proargtypes) with ordinality as u(t, ord)), '') || ')' as sig,
              encode(sha256(convert_to(pg_get_functiondef(p.oid), 'utf8')), 'hex') as h
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = '$q' and p.proname = '$n' and p.prokind in ('f','p')) s"
}

# ── a provision PROJECTION is a record, and is carried as one ─────────────────
# 🚨 lane BRANCH-REFRESH-3, 2026-09-23. `db/provision_pull.py` renders every applied
# platform.provision_spec row as a file headed "-- Projection of platform.provision_spec", and
# production LEDGERS it with `--mark-applied` — it executes nothing, because the call it records
# has already run. Replaying it EXECUTES it, and that can never land: the runner's transaction
# carries a 15min statement_timeout that provision_preflight() refuses (1s…60s), and past that
# the projection holds the NORMALIZED spec (with `platform_answers`), which provision() answers
# with "already carries a DIFFERENT declaration" (measured on the clone for
# 20260923082013_provision_agent_term_list.sql). So a projection is carried the way production
# carried it — `--mark-applied` — and ONLY when the declaration it records already stands on the
# clone: the token's current spec_hash equals the file's `-- spec_hash:` and its relation exists.
# Anything else is a named refusal; nothing is recorded that the clone does not actually hold.
is_projection() { [ -r "$1" ] && head -1 "$1" | grep -q '^-- Projection of platform.provision_spec'; }

carry_projection() {  # carry_projection <source> <filename> <repo> <relpath> <selector>
  local source="$1" filename="$2" repo="$3" relpath="$4" selector="$5" token want have
  token="$(head -1 "$repo/$relpath" | sed -nE 's/.*token=([A-Za-z0-9_]+).*/\1/p')"
  want="$(grep -m1 '^-- spec_hash: ' "$repo/$relpath" | sed -E 's/^-- spec_hash: *//' | tr -d ' \r')"
  if [ -z "$token" ] || [ -z "$want" ]; then
    say "PROJECTION NOT CARRIED: $source/$filename names no token or spec_hash in its header."; return 1
  fi
  have="$("$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c \
    "select c.spec_hash from platform.v_provision_spec_current c where c.token = '$token'
        and to_regclass(format('%I.%I', c.spec->>'schema', c.spec->>'table')) is not null" 2>&1 | tr -d ' \r')"
  if [ "$have" != "$want" ]; then
    say "PROJECTION NOT CARRIED: $source/$filename records $token at spec_hash $want, and the clone's"
    say "  current declaration is ${have:-absent}. Recording it would claim a declaration the clone"
    say "  does not hold; apply the provision that produced it first. Nothing recorded."
    return 1
  fi
  local -a cmd; cmd=(uv run python db/apply_migrations.py --no-generate --target clone --mark-applied --only "$filename")
  case "$selector" in
    campaign|inverse) cmd+=(--source "$selector" --lane "$LANE") ;;
    "") [ "$source" != "aidream" ] && cmd+=(--source "$source") ;;
  esac
  say "recording projection ($token, spec_hash $want — already the clone's declaration): $relpath --mark-applied"
  ( cd "$repo" && "${cmd[@]}" ) 2>&1 | tee "$APPLY_OUT"
  return ${pipestatus[1]}
}

# ═════════════════════════════════════════════════════════════════════════════
# 🚨 CHAIR RULINGS 2026-09-26 (lane CLONE-LEDGER-VERDICTS) — verdicts the ledger can hold.
# ═════════════════════════════════════════════════════════════════════════════

# ── rule 1: LEVEL BY INSPECTION, and the honest `parity` row it earns ─────────
# Every schema object the file writes (clone-catchup-inspect.py names them) is hashed on the
# clone and on production (read-only) and compared. INSPECT_NOTE carries what was compared.
# Returns 0 LEVEL · 1 DIFFERS · 2 NOTHING (no object to compare).
INSPECT_NOTE=""
level_by_inspection() {  # level_by_inspection <repo> <relpath>
  local repo="$1" relpath="$2" rc
  INSPECT_NOTE=""
  /usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-inspect.py" sql "$repo/$relpath" > "$WORK/inspect.sql" 2>/dev/null
  rc=$?
  if [ $rc -eq 2 ]; then INSPECT_NOTE="the file writes no schema object this inspection can hash (data-only)"; return 2; fi
  [ $rc -eq 0 ] || { INSPECT_NOTE="inspection could not read the file"; return 1; }
  "$PSQL" "${CLONE_ARGS[@]}" -qAt -F $'\t' -v ON_ERROR_STOP=1 -c "begin read only; $(cat "$WORK/inspect.sql") commit;" \
    > "$WORK/inspect.clone.tsv" 2> "$WORK/inspect.err" || { INSPECT_NOTE="clone read failed: $(head -1 "$WORK/inspect.err")"; return 1; }
  night_readonly_psql "${PROD_ARGS[@]}" -F $'\t' --sql "$(cat "$WORK/inspect.sql")" \
    > "$WORK/inspect.prod.tsv" 2> "$WORK/inspect.err" || { INSPECT_NOTE="production read failed: $(head -1 "$WORK/inspect.err")"; return 1; }
  /usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-inspect.py" compare "$WORK/inspect.clone.tsv" "$WORK/inspect.prod.tsv" > "$WORK/inspect.out"
  rc=$?
  if [ $rc -eq 0 ]; then INSPECT_NOTE="$(cut -f4- "$WORK/inspect.out")"
  else INSPECT_NOTE="$(cut -f2- "$WORK/inspect.out" | head -5 | tr '\n' ';')"; fi
  return $rc
}

# The row says what it is: source `parity`, duration 0, "NOT RUN on the clone", the verdict, and what
# was compared. The ledger's own guard forbids a row claiming a file ran that did not; this row claims
# the opposite, and the planner lets it hold a production row only while production still carries
# exactly these bytes (the checksum is production's, the one the verdict is about).
PARITY_WRITTEN=0; PARITY_NAMES=()
record_parity() {  # record_parity <source> <filename> <production checksum> <verdict> <note>
  local source="$1" filename="$2" ck="$3" verdict="$4" note="$5" text
  text="parity for $source/$filename @ ${ck:0:12} — NOT RUN on the clone: $verdict. Level by inspection: $note"
  text="${text//\$pnote\$/}"
  "$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "insert into public._schema_migrations
      (source, filename, checksum, applied_at, duration_ms, chair_step, rehearsal_on, applied_by_lane)
      values ('parity', '$filename', '$ck', now(), 0, \$pnote\$${text}\$pnote\$, 'parity verdict — not an apply', '$LANE')
      on conflict (source, filename) do update set checksum = excluded.checksum, applied_at = excluded.applied_at,
        chair_step = excluded.chair_step, rehearsal_on = excluded.rehearsal_on, applied_by_lane = excluded.applied_by_lane;" \
    > "$WORK/parity.out" 2>&1 || { say "  parity row NOT written for $filename: $(grep -m1 ERROR "$WORK/parity.out")"; return 1; }
  PARITY_WRITTEN=$((PARITY_WRITTEN+1)); PARITY_NAMES+=("$source/$filename — $verdict")
  say "  PARITY ROW written on the clone: $source/$filename — $verdict; $note" | cut -c1-600
  return 0
}

# A file that did not land gets a parity row ONLY when inspection proves it level. A data-only file
# (nothing to hash) earns one only when its OWN guard refused on the clone's data (a RAISE the file
# carries — P0001), and the row says exactly that: nothing was compared, and why it cannot run here.
verdict_after_failure() {  # verdict_after_failure <source> <filename> <checksum> <repo> <relpath> <verdict>
  local source="$1" filename="$2" ck="$3" repo="$4" relpath="$5" verdict="$6" irc
  level_by_inspection "$repo" "$relpath"; irc=$?
  if [ $irc -eq 0 ]; then record_parity "$source" "$filename" "$ck" "$verdict" "$INSPECT_NOTE"; return $?; fi
  # The file's OWN raise: db:apply prints `SQLSTATE P0001` then the message; aidream prints
  # `error: ERROR | <message> | context: … at RAISE`. Either way the message is the reason.
  if [ $irc -eq 2 ] && grep -qE 'P0001|at RAISE' "$APPLY_OUT" 2>/dev/null \
     && grep -qiE '^[^-]*\braise[[:space:]]+exception\b' "$repo/$relpath"; then
    local why
    why="$(sed 's/\x1b\[[0-9;]*m//g' "$APPLY_OUT" | awk '/SQLSTATE P0001/ { getline; print; exit } /error: ERROR \|/ { sub(/.*error: ERROR \| /, ""); sub(/ \| context:.*/, ""); print; exit }' | cut -c1-240)"
    [ -n "$why" ] || why="(the runner printed no message)"
    record_parity "$source" "$filename" "$ck" "cannot run on the clone for a data reason — its own guard refused: ${why}" \
      "data-only file, no schema object to compare (nothing compared)"
    return $?
  fi
  say "  not level by inspection: $INSPECT_NOTE" | cut -c1-600
  return 1
}

# ── the coordinator's class: a REPLAY never overwrites a body a later ledgered file replaced ──
# At 05:42:56Z a replay of copywritable_people_test_the_copy_until_the_switch.sql (runner `direct`,
# which judged nothing) put platform._cutover_seam_readiness back to its pre-CUTOVER-READINESS body
# and undid cutoverready_the_switch_waits_until_each_copy_matches_its_older_table.sql. A direct run
# and a `--reapply` / `--rerun` of an already-ledgered file skip the runner's DD-220 check, so this
# judges the file's `-- based-on:` lines against the clone's LIVE bodies exactly as a production apply
# does. A declared body the clone no longer holds is refused BY NAME when a later file (ledgered on the
# clone, not re-run later in this plan) owns the live one; with no later owner it is drift, and the
# runner-shaped sentence goes into APPLY_OUT so the existing parity repair (DD-220, never bypassed)
# takes it. A function the file replaces WITHOUT a declaration is refused the same way when a later
# file owns it. Returns 0 clear · 3 refused (a later owner) · 4 drift (repair path).
GATE_OWNERS=""
replay_gate() {  # replay_gate <repo> <relpath> <filename> <applied_at> <pending-file>
  local repo="$1" relpath="$2" filename="$3" after="$4" pending="$5" line sig want got fn owners drift=0
  local -a decl_names
  GATE_OWNERS=""; : > "$APPLY_OUT"
  while IFS= read -r line; do
    sig="$(print -r -- "$line" | sed -E 's/^-- based-on:[[:space:]]+//; s/[[:space:]]+[0-9a-f]{64}[[:space:]]*$//')"
    want="$(print -r -- "$line" | grep -oE '[0-9a-f]{64}' | tail -1)"
    case "$sig" in trigger\ *|view\ *) continue ;; esac
    fn="${sig%%\(*}"; decl_names+=("$fn")
    got="$(clone_body_hash "$sig")"
    [ "$got" = "$want" ] && continue
    owners="$(/usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-repair.py" --later-owners \
               "$WORK/production.tsv" "$WORK/clone.tsv" "$fn" "$after" "$filename" "$pending" | cut -d$'\x1f' -f2-4 | tr '\x1f' ' ' | tr '\n' ';')"
    if [ -n "$owners" ]; then
      GATE_OWNERS+="\`$sig\` (clone ${got:0:12}, file declares ${want:0:12}) is owned by later ${owners} "
    else
      print -r -- "  line: \`$sig\` based on sha256 $want — the clone's live body is ${got:-absent} (DD-220, judged by the catch-up on a replay)" >> "$APPLY_OUT"
      drift=1
    fi
  done < <(grep -E '^-- based-on:[[:space:]]' "$repo/$relpath")
  local -a written; written=("${(@f)$(/usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-repair.py" --functions-written "$repo/$relpath" 2>/dev/null)}")
  for fn in "${written[@]}"; do
    [ -n "$fn" ] || continue
    (( ${decl_names[(Ie)$fn]} )) && continue
    owners="$(/usr/bin/env python3 "$FRONTEND/scripts/night/clone-catchup-repair.py" --later-owners \
               "$WORK/production.tsv" "$WORK/clone.tsv" "$fn" "$after" "$filename" "$pending" | cut -d$'\x1f' -f2-4 | tr '\x1f' ' ' | tr '\n' ';')"
    [ -n "$owners" ] && GATE_OWNERS+="\`$fn\` (replaced with no -- based-on line) is owned by later ${owners} "
  done
  [ -n "$GATE_OWNERS" ] && return 3
  [ "$drift" = 1 ] && return 4
  return 0
}

# ── rule 2: the 1051 slot collision — a slot held on the clone ONLY by a rehearsal row ─────────
# `_schema_migrations_slot_guard` refuses a second file per number slot. On the clone the slot
# [1051] of aidream is held by `1051_sources_converge_into_processed_documents.sql`, a peer's
# rehearsal of a file production ledgered as 1055_… — production never held that row, so when it
# ran 1051_db_host_recorder.sql the slot was free. The rule production judged it by (a free slot)
# is honoured by grandfathering exactly these two filenames on the clone, announced; a holder that
# production DID ledger is a real collision and is left to refuse.
slot_grandfather() {  # slot_grandfather <source> <filename>
  local source="$1" filename="$2" holder slot
  slot="$("$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "select public.migration_slot('$filename')" 2>/dev/null)"
  [ -n "$slot" ] || return 0
  holder="$("$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "select m.filename from public._schema_migrations m
      where m.source = '$source' and m.filename <> '$filename' and public.migration_slot(m.filename) = '$slot'
        and not exists (select 1 from public._schema_migrations x where x.source = '$source' and x.filename = '$filename')
        and not exists (select 1 from public._schema_migration_slot_grandfather g where g.source = '$source' and g.slot = '$slot' and '$filename' = any (g.filenames))
      order by m.applied_at limit 1" 2>/dev/null)"
  [ -n "$holder" ] || return 0
  if awk -F'\t' -v s="$source" -v f="$holder" '$1 == s && $2 == f { found = 1 } END { exit !found }' "$WORK/production.tsv"; then
    say "  slot [$slot] is held on the clone by $holder, which production ALSO ledgered — a real collision; left to refuse."
    return 0
  fi
  say "  ran under older rules: slot [$slot] is held on the clone only by $holder, a rehearsal row production never"
  say "    ledgered; production ran $filename with the slot free. Grandfathering exactly these two filenames on the clone."
  "$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c "insert into public._schema_migration_slot_grandfather (source, slot, filenames)
      values ('$source', '$slot', array['$holder', '$filename'])
      on conflict (source, slot) do update set filenames = (select array_agg(distinct f) from unnest(public._schema_migration_slot_grandfather.filenames || excluded.filenames) f)" >/dev/null
}

# ── rule 4: the clone holds an EARLIER version of this same file → its inverse first, then the up ──
inverse_first() {  # inverse_first <source> <filename> <repo> <inverse relpath> <runner>
  local source="$1" filename="$2" repo="$3" inv="$4" runner="$5" invname ledgered rc=0
  invname="${inv:t}"
  ledgered="$(awk -F'\t' -v f="$invname" '$2 == f { print "yes"; exit }' "$WORK/clone.tsv")"
  local -a cmd
  if [ "$repo" = "$FRONTEND" ]; then
    cmd=(node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts "$inv" --target clone)
    [ "$ledgered" = yes ] && cmd+=(--reapply)
  else
    cmd=(uv run python db/apply_migrations.py --no-generate --target clone --source inverse --lane "$LANE")
    if [ "$ledgered" = yes ]; then cmd+=(--rerun "$invname"); else cmd+=(--only "$invname"); fi
  fi
  say "rule 4: the clone holds an earlier version of $filename; running its inverse first: $inv"
  ( cd "$repo" && "${cmd[@]}" ) > "$WORK/inverse.out" 2>&1 || rc=$?
  if [ $rc -ne 0 ]; then
    say "  the inverse did not land (exit $rc): $(grep -m1 -E 'FAIL|ERROR|error' "$WORK/inverse.out" | cut -c1-240)"
    say "  nothing landed for it; the up is tried over the clone's current state, as before."
    return $rc
  fi
  say "  inverse landed; now the up."
  return 0
}

# ── apply, in production's own ledger order ──────────────────────────────────
APPLIED=0; FAILED=0; REPAIRED=0; SUPERSEDED=0; FAILED_NAMES=(); SUPERSEDED_NAMES=()
while IFS=$'\x1f' read -r kind source filename checksum repo relpath runner selector reapply reason applied_at inverse owner; do
  [ "$kind" = "APPLY" ] || continue
  local_rc=0
  JUDGED_AS_OF="$applied_at"
  # The files this plan re-runs AFTER this one (a later owner that is itself about to run again).
  awk -F$'\x1f' -v f="$filename" 'seen && $1 == "APPLY" { print $3 } $3 == f { seen = 1 }' "$WORK/plan.tsv" > "$WORK/pending.txt"
  if [ "$runner" != "frontend" ] && is_projection "$repo/$relpath"; then
    if carry_projection "$source" "$filename" "$repo" "$relpath" "$selector"; then
      APPLIED=$((APPLIED+1))
      "$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c \
        "update public._schema_migrations set rehearsal_on = 'catchup — provision projection recorded with --mark-applied, as production did — ' || coalesce(rehearsal_on, '') \
           where source = '$source' and filename = '$filename' and coalesce(rehearsal_on, '') not like 'catchup%'" \
        >/dev/null 2>&1 || say "  (note: could not mark the ledger row rehearsal_on=catchup)"
    else
      FAILED=$((FAILED+1)); FAILED_NAMES+=("$source/$filename (projection not carried)")
    fi
    continue
  fi
  slot_grandfather "$source" "$filename"

  # The coordinator's class: a direct run or a replay judges the file's based-on itself.
  gate_rc=0
  if [ "$runner" = "direct" ] || [ "$reapply" = "yes" ]; then
    replay_gate "$repo" "$relpath" "$filename" "$applied_at" "$WORK/pending.txt"; gate_rc=$?
  fi
  if [ $gate_rc -eq 3 ]; then
    SUPERSEDED=$((SUPERSEDED+1))
    SUPERSEDED_NAMES+=("$source/$filename (replay refused: a later file owns a body it would overwrite)")
    say "REPLAY REFUSED: $source/$filename would overwrite a body a LATER ledgered file replaced — $GATE_OWNERS" | cut -c1-900
    say "  Nothing executed. A replay never undoes a newer file (judged as a production apply judges based-on)."
    verdict_after_failure "$source" "$filename" "$checksum" "$repo" "$relpath" \
      "superseded — its replay was refused because a later file owns what it replaces: ${GATE_OWNERS:0:300}" || true
    continue
  fi
  if [ $gate_rc -eq 4 ]; then
    say "  the catch-up's own based-on check refused this $([ "$reapply" = yes ] && print replay || print 'direct run'): the clone's bodies are not the ones it declares."
    local_rc=1
  fi

  if [ $local_rc -eq 0 ] && [ -n "$inverse" ]; then
    if [[ "$inverse" == MISSING:* ]]; then
      say "rule 4: the clone holds an earlier version of $filename and its inverse is NAMED MISSING — ${inverse#MISSING: }"
      say "  (who to ask: $owner). The up is tried over the clone's current state, as before."
    else
      inverse_first "$source" "$filename" "$repo" "$inverse" "$runner" || true
    fi
  fi

  [ $local_rc -eq 0 ] && { apply_one "$source" "$filename" "$repo" "$relpath" "$runner" "$selector" "$reapply" || local_rc=$?; }

  if [ $local_rc -ne 0 ] && ! grep -q 'based on sha256' "$APPLY_OUT" 2>/dev/null \
     && already_level "$repo" "$relpath"; then
    SUPERSEDED=$((SUPERSEDED+1))
    SUPERSEDED_NAMES+=("$source/$filename (already level: every body it writes matches production)")
    say "ALREADY LEVEL: $source/$filename did not land, and every function body it writes already"
    say "  hashes identically on the clone and on production. Nothing to carry, nothing to repair."
    verdict_after_failure "$source" "$filename" "$checksum" "$repo" "$relpath" \
      "already level — it did not land ($(grep -m1 -E 'ERROR|FAIL' "$APPLY_OUT" | cut -c1-160)) and every body it writes matches production" || true
    continue
  fi

  if [ $local_rc -ne 0 ] && grep -q 'based on sha256' "$APPLY_OUT" 2>/dev/null; then
    say "PARITY DRIFT on $source/$filename — the clone's bodies are not production's. Repairing."
    REPAIR_EXCLUDE="$filename"
    repair_parity "$applied_at"; parity_rc=$?
    if [ $parity_rc -eq 0 ]; then
      REPAIRED=$((REPAIRED+1))
      local_rc=0
      apply_one "$source" "$filename" "$repo" "$relpath" "$runner" "$selector" "$reapply" || local_rc=$?
    elif [ $parity_rc -eq 2 ]; then
      SUPERSEDED=$((SUPERSEDED+1))
      SUPERSEDED_NAMES+=("$source/$filename")
      say "SUPERSEDED: $source/$filename is not carried — production has moved past the body it"
      say "  declares and the clone already holds production's. Nothing was applied for it."
      verdict_after_failure "$source" "$filename" "$checksum" "$repo" "$relpath" \
        "superseded — production itself replaced the bodies it declares; the clone holds production's" || true
      continue
    fi
  fi

  if [ $local_rc -ne 0 ]; then
    # 🚨 A REFUSAL IS NOT A CRASH, AND STOPPING ON ONE STRANDS THE CLONE HALF-CAUGHT-UP.
    # Both runners are transactional: a refused or failed file lands NOTHING and writes no
    # ledger row, so the clone is exactly where it was before that file was attempted and the
    # next file is judged on its own merits. Measured on the first two real runs (2026-09-22):
    # stopping at the first refusal carried 1 of 65 files, then 17 of 55.
    if verdict_after_failure "$source" "$filename" "$checksum" "$repo" "$relpath" \
         "did not land ($(grep -m1 -E 'ERROR|FAIL' "$APPLY_OUT" | cut -c1-200)), and the clone already holds exactly what production holds for everything it writes"; then
      SUPERSEDED=$((SUPERSEDED+1))
      SUPERSEDED_NAMES+=("$source/$filename (did not land; level by inspection, parity row written)")
      continue
    fi
    FAILED=$((FAILED+1))
    FAILED_NAMES+=("$source/$filename (exit $local_rc) — who to ask: $owner")
    say "REFUSED/FAILED: $source/$filename exited $local_rc — nothing landed for it. Continuing"
    say "  with the rest of the delta; this run will exit nonzero and name every one at the end."
    say "  who to ask: $owner"
    continue
  fi

  APPLIED=$((APPLIED+1))
  # THE ROW SAYS WHAT IT IS. The runner already marks a clone row `rehearsal_on`; this names
  # the catch-up, so anybody reading the clone's ledger can tell "production ran this and the
  # night job carried it over" from "a lane rehearsed here".
  "$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c \
    "update public._schema_migrations set rehearsal_on = 'catchup — ' || coalesce(rehearsal_on, '') \
       where source = '$source' and filename = '$filename' and rehearsal_on not like 'catchup%'" \
    >/dev/null 2>&1 || say "  (note: could not mark the ledger row rehearsal_on=catchup)"
done < "$WORK/plan.tsv"

# THE CHECKED-IN LEDGER SNAPSHOT IS REFRESHED HERE, WHOLE (lane LEDGER-LOCK, 2026-09-22).
# `pnpm db:apply` keeps migrations/LEDGER.json current for applies made from THIS machine;
# only a full read of production can carry applies made from aidream's runner, another
# checkout, or another machine. The commit-time guard and the `check:ledgered-files-unedited`
# release gate both judge against this file, so it is refreshed every night, unconditionally —
# including on a run where the delta was empty. READ-ONLY on production: one SELECT.
# A failure here never fails the catch-up (the clone is already caught up) but it is named.
say "refreshing the checked-in production ledger snapshot (migrations/LEDGER.json)"
if ( cd "$FRONTEND" && node node_modules/tsx/dist/cli.mjs scripts/refresh-ledger-snapshot.ts ); then
  say "  ledger snapshot refreshed — commit it if git reports it changed."
else
  say "  NOTE: could not refresh migrations/LEDGER.json. The commit guard and the release gate"
  say "  are judging against yesterday's snapshot until someone runs pnpm refresh:ledger-snapshot."
fi

# BOTH REPOS, ONE NIGHTLY READ. aidream's runner writes into the SAME production ledger
# table on the SAME database, so its snapshot goes stale for exactly the same reasons and
# is refreshed in the same step — one job, not two that can fall out of step.
if ( cd /Users/armanisadeghi/code/aidream && uv run python scripts/refresh_ledger_snapshot.py ); then
  say "  aidream ledger snapshot refreshed — commit it if git reports it changed."
else
  say "  NOTE: could not refresh aidream's db/migrations/LEDGER.json; its commit guard and"
  say "  release gate are judging against yesterday's snapshot."
fi

# ── THE BODIES, NOT THE LEDGERS ──────────────────────────────────────────────
# 🚨 lane BRANCH-REFRESH-4, 2026-09-24. Everything above compares LEDGERS. A ledger row says a
# file ran, never what stands: `platform.knob_archive` held its pre-knobguard2 body on the clone
# under a ledger row saying knobguard2 was applied, and nothing above could see it. So the
# catch-up ends by hashing every function and view in the campaign schemas against production
# and levelling each mismatch from production's own body (scripts/night/body-drift.sh). A body
# that will not level is named, and the run exits nonzero.
BODY_RC=0
say "─── body drift: the clone's function and view bodies against production's ───"
if [ "$DRY_RUN" = "1" ]; then
  zsh "$FRONTEND/scripts/night/body-drift.sh" --target clone 2>&1 | grep -v 'target ok:\|psql:\|read-only proven' | while read -r l; do say "  ${l#\[*\] }"; done
else
  zsh "$FRONTEND/scripts/night/body-drift.sh" --target clone --repair > "$WORK/body-drift.out" 2>&1; BODY_RC=$?
  grep -E 'MISMATCHES|NOT REPAIRED|levelled|RESULT|REFUSED|READ FAILED' "$WORK/body-drift.out" | while read -r l; do say "  ${l#\[*\] }"; done
fi

# ── INVALID INDEXES (lane STORE-READ-PERF-3 found five; guard built lane INDEX-GUARD, 2026-09-25) ──
# A CREATE INDEX CONCURRENTLY that a build error or a cancel interrupts leaves an INVALID index
# behind (never rolled back), and `if not exists` treats an invalid index as present, so nothing
# ever retries it — the planner cannot use it, and it is still MAINTAINED on every write. Report
# only, here: this job reads production and writes only the clone, so it never repairs production
# itself (scripts/night/invalid-indexes.sh --fix --target production is a deliberate, separate,
# named act). A red result is surfaced the same way body drift is, and named.
INDEX_RC=0
say "─── invalid indexes: production and the clone, read-only ───"
zsh "$FRONTEND/scripts/night/invalid-indexes.sh" > "$WORK/invalid-indexes.out" 2>&1; INDEX_RC=$?
grep -E 'invalid indexes|RESULT|REFUSED|READ FAILED' "$WORK/invalid-indexes.out" | while read -r l; do say "  ${l#\[*\] }"; done

# ── KERNEL FINGERPRINT AUTO RE-RECORDS (lane PROVISIONER-SELF-HEAL, 2026-09-25) ──
# The provisioner re-records a stale access-kernel fingerprint ITSELF when the kernel's equivalence
# self-check still answers identically, so table creation no longer stops (83 minutes on
# 2026-09-25). Correct, and it must still be SEEN: each one means a file changed a kernel body and
# re-recorded nothing. Report only (production read-only; the fixture check on the clone rolls back).
# A report never fails the catch-up; it is named in the summary.
KFP_RC=0
say "─── kernel fingerprint: auto re-records and stale refusals of the last 24h ───"
zsh "$FRONTEND/scripts/night/kernel-fingerprint-auto-rerecords.sh" > "$WORK/kernel-fingerprint.out" 2>&1; KFP_RC=$?
grep -E 'kernel fingerprint|AUTO RE-RECORD|STALE REFUSAL|LIVE MISMATCH|fixture|RESULT|REFUSED|READ FAILED' "$WORK/kernel-fingerprint.out" | while read -r l; do say "  ${l#\[*\] }"; done

say "parity repairs made: $REPAIRED; superseded on production: $SUPERSEDED; parity rows written: $PARITY_WRITTEN"
for n in "${PARITY_NAMES[@]:-}"; do [ -n "$n" ] && say "  parity row: ${n:0:300}"; done
for n in "${SUPERSEDED_NAMES[@]:-}"; do [ -n "$n" ] && say "  superseded, not carried: $n"; done
for n in "${FAILED_NAMES[@]:-}"; do [ -n "$n" ] && say "  did not land: $n"; done
say "clone-catchup done: $APPLIED applied, $REPAIRED parity repair(s), $SUPERSEDED superseded, $FAILED failed, $REFUSE_N refused."
[ "$BODY_RC" -ne 0 ] && say "body drift: bodies remain unlevelled (exit $BODY_RC) — named above."
[ "$KFP_RC" -ne 0 ] && say "kernel fingerprint: the provisioner re-recorded or refused on its own in the last 24h, or the fixture drifted (exit $KFP_RC) — named above."
[ "$INDEX_RC" -ne 0 ] && say "invalid indexes: at least one remains on production or the clone (exit $INDEX_RC) — named above. Fix with scripts/night/invalid-indexes.sh --fix --target <clone|production>."
[ "$FAILED" -gt 0 ] && exit 70
[ "$REFUSE_N" -gt 0 ] && exit 71
[ "$BODY_RC" -ne 0 ] && exit 72
[ "$INDEX_RC" -ne 0 ] && exit 73
exit 0
