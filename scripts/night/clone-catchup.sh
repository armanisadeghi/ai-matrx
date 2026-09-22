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
CLONE_PW="$NIGHT_DSN_PASSWORD"
export PGPASSWORD="$CLONE_PW"
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
export PGPASSWORD="$P_PW"
night_assert_target_readonly production "${PROD_ARGS[@]}" || exit $?

# Proven: clone (writable) + production(read-only). That earns the window exemption.
night_window_guard 0100 0330 || exit $?

# ── the two ledgers ──────────────────────────────────────────────────────────
LEDGER_SQL="select source, filename, checksum, applied_at::text from public._schema_migrations"

export PGPASSWORD="$P_PW"
night_readonly_psql "${PROD_ARGS[@]}" -F $'\t' --sql "$LEDGER_SQL" > "$WORK/production.tsv" || {
  say "REFUSED: production's ledger could not be read. Nothing applied."; exit 70; }
export PGPASSWORD="$CLONE_PW"
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

while IFS=$'\x1f' read -r kind source filename checksum repo relpath runner selector reapply reason; do
  [ "$kind" = "REFUSE" ] || continue
  say "REFUSED (named, nothing applied for it): $source/$filename — $reason"
done < "$WORK/plan.tsv"

if [ "$APPLY_N" -eq 0 ]; then
  say "nothing to apply; the clone already carries production's ledger."
  [ "$REFUSE_N" -gt 0 ] && exit 71
  exit 0
fi

while IFS=$'\x1f' read -r kind source filename checksum repo relpath runner selector reapply reason; do
  [ "$kind" = "APPLY" ] || continue
  say "  $source/$filename [$runner${selector:+/$selector}] — $reason"
done < "$WORK/plan.tsv"

if [ "$DRY_RUN" = "1" ]; then
  say "--dry-run: the delta above is what a real run would apply. Nothing was applied."
  exit 0
fi

# ── apply, in production's own ledger order ──────────────────────────────────
APPLIED=0; FAILED=0; FAILED_NAMES=()
while IFS=$'\x1f' read -r kind source filename checksum repo relpath runner selector reapply reason; do
  [ "$kind" = "APPLY" ] || continue
  local_rc=0
  if [ "$runner" = "frontend" ]; then
    cmd=(node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts "$relpath" --target clone)
    [ "$selector" = "campaign" ] && cmd+=(--source campaign --lane "$LANE")
    [ "$reapply" = "yes" ] && cmd+=(--reapply)
    say "applying (frontend): $relpath"
    ( cd "$repo" && "${cmd[@]}" ) || local_rc=$?
  else
    cmd=(uv run python db/apply_migrations.py --no-generate --target clone)
    if [ "$reapply" = "yes" ]; then cmd+=(--rerun "$filename"); else cmd+=(--only "$filename"); fi
    case "$selector" in
      campaign|inverse) cmd+=(--source "$selector"); cmd+=(--lane "$LANE") ;;
      "") [ "$source" != "aidream" ] && cmd+=(--source "$source") ;;
    esac
    say "applying (aidream): $relpath"
    ( cd "$repo" && "${cmd[@]}" ) || local_rc=$?
  fi

  if [ $local_rc -ne 0 ]; then
    # 🚨 A REFUSAL IS NOT A CRASH, AND STOPPING ON ONE STRANDS THE CLONE HALF-CAUGHT-UP.
    # Both runners are transactional: a refused or failed file lands NOTHING and writes no
    # ledger row, so the clone is exactly where it was before that file was attempted and the
    # next file is judged on its own merits — including its own prerequisites, loudly, if they
    # are missing. Measured on the first two real runs (2026-09-22): stopping at the first
    # refusal carried 1 of 65 files, then 17 of 55, and both refusals were the DD-220
    # `-- based-on:` check correctly protecting a body a REHEARSAL had moved on the clone —
    # the clone is production's snapshot PLUS whatever lanes rehearsed on it, so a production
    # file written against production's body at that moment can legitimately disagree with it.
    # That is the runner doing its job and must never be bypassed here; there is no flag in
    # this job that softens it, and there never may be. So: name it, keep going, fail the run.
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
  export PGPASSWORD="$CLONE_PW"
  "$PSQL" "${CLONE_ARGS[@]}" -qAt -v ON_ERROR_STOP=1 -c \
    "update public._schema_migrations set rehearsal_on = 'catchup — ' || coalesce(rehearsal_on, '') \
       where source = '$source' and filename = '$filename' and rehearsal_on not like 'catchup%'" \
    >/dev/null 2>&1 || say "  (note: could not mark the ledger row rehearsal_on=catchup)"
done < "$WORK/plan.tsv"

for n in "${FAILED_NAMES[@]:-}"; do [ -n "$n" ] && say "  did not land: $n"; done
say "clone-catchup done: $APPLIED applied, $FAILED failed, $REFUSE_N refused."
[ "$FAILED" -gt 0 ] && exit 70
[ "$REFUSE_N" -gt 0 ] && exit 71
exit 0
