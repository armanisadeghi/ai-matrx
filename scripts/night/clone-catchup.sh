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
# ─────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

LANE=clone-catchup
DRY_RUN=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    *) say "REFUSED: unknown argument '$a'. This job takes --dry-run and nothing else."; exit 78 ;;
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
LEDGER_SQL="select source, filename, checksum, applied_at::text from public._schema_migrations"
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
REFUSE_N=$(grep -c '^REFUSE' "$WORK/plan.tsv" 2>/dev/null || true); REFUSE_N=${REFUSE_N:-0}
say "delta: $APPLY_N file(s) to apply, $REFUSE_N refusal(s)"

while IFS=$'\x1f' read -r kind source filename checksum repo relpath runner selector reapply reason applied_at; do
  [ "$kind" = "REFUSE" ] || continue
  say "REFUSED (named, nothing applied for it): $source/$filename — $reason"
done < "$WORK/plan.tsv"

if [ "$APPLY_N" -eq 0 ]; then
  say "nothing to apply; the clone already carries production's ledger."
  [ "$REFUSE_N" -gt 0 ] && exit 71
  exit 0
fi

while IFS=$'\x1f' read -r kind source filename checksum repo relpath runner selector reapply reason applied_at; do
  [ "$kind" = "APPLY" ] || continue
  say "  $source/$filename [$runner${selector:+/$selector}] — $reason"
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
                 values ('$source', '$filename', '$ck', now(), 0, 'catchup — ${mode} — ' || \$cnote\$${note}\$cnote\$, '$LANE') on conflict do nothing;"
  if [ "$mode" = "record" ]; then
    say "recording (direct apply, bytes already on the clone): $relpath"
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

# ── apply, in production's own ledger order ──────────────────────────────────
APPLIED=0; FAILED=0; REPAIRED=0; SUPERSEDED=0; FAILED_NAMES=(); SUPERSEDED_NAMES=()
while IFS=$'\x1f' read -r kind source filename checksum repo relpath runner selector reapply reason applied_at; do
  [ "$kind" = "APPLY" ] || continue
  local_rc=0
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
  apply_one "$source" "$filename" "$repo" "$relpath" "$runner" "$selector" "$reapply" || local_rc=$?

  if [ $local_rc -ne 0 ] && ! grep -q 'based on sha256' "$APPLY_OUT" 2>/dev/null \
     && already_level "$repo" "$relpath"; then
    SUPERSEDED=$((SUPERSEDED+1))
    SUPERSEDED_NAMES+=("$source/$filename (already level: every body it writes matches production)")
    say "ALREADY LEVEL: $source/$filename did not land, and every function body it writes already"
    say "  hashes identically on the clone and on production. Nothing to carry, nothing to repair."
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
      continue
    fi
  fi

  if [ $local_rc -ne 0 ]; then
    # 🚨 A REFUSAL IS NOT A CRASH, AND STOPPING ON ONE STRANDS THE CLONE HALF-CAUGHT-UP.
    # Both runners are transactional: a refused or failed file lands NOTHING and writes no
    # ledger row, so the clone is exactly where it was before that file was attempted and the
    # next file is judged on its own merits. Measured on the first two real runs (2026-09-22):
    # stopping at the first refusal carried 1 of 65 files, then 17 of 55.
    FAILED=$((FAILED+1))
    FAILED_NAMES+=("$source/$filename (exit $local_rc)")
    say "REFUSED/FAILED: $source/$filename exited $local_rc — nothing landed for it. Continuing"
    say "  with the rest of the delta; this run will exit nonzero and name every one at the end."
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

say "parity repairs made: $REPAIRED; superseded on production: $SUPERSEDED"
for n in "${SUPERSEDED_NAMES[@]:-}"; do [ -n "$n" ] && say "  superseded, not carried: $n"; done
for n in "${FAILED_NAMES[@]:-}"; do [ -n "$n" ] && say "  did not land: $n"; done
say "clone-catchup done: $APPLIED applied, $REPAIRED parity repair(s), $SUPERSEDED superseded, $FAILED failed, $REFUSE_N refused."
[ "$BODY_RC" -ne 0 ] && say "body drift: bodies remain unlevelled (exit $BODY_RC) — named above."
[ "$FAILED" -gt 0 ] && exit 70
[ "$REFUSE_N" -gt 0 ] && exit 71
[ "$BODY_RC" -ne 0 ] && exit 72
exit 0
