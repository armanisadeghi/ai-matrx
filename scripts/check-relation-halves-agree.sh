#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# STORE-TXN-4 — THE LIVE CENSUS OF RELATION HALVES THAT DISAGREE. RATCHET: ZERO.
#
# It runs `scripts/campaign-tests/relhalvescensus_green.sql` against the MAIN database and asks
# one question of the ESTATE, not of the catalogue: does any record on this database hold a
# relation VALUE with no association beside it, or a relation ASSOCIATION with no value? Either
# way the deferred guard `custom._relation_halves_agree` refuses the NEXT write to that record —
# so a number above zero is a person about to be refused for somebody else's defect.
#
# WHY THE MAIN DATABASE AND NOT THE CLONE. Every other census in these gates measures a RULE, and
# a rule is the same on any copy. This one measures ROWS, and the rows that matter are the live
# ones — a clone that is a day old answers about yesterday's estate. The suite is SELECT-only from
# end to end, so reading production costs nothing and needs no maintenance window; the clone sweep
# picks the same file up on its own (every *.sql in scripts/campaign-tests/ runs there nightly)
# and answers about the clone, which is a second, independent reading.
#
# AND THE READ-ONLY CLAIM IS PROVEN, NOT PROMISED. `night_assert_target_readonly` makes the server
# itself refuse a write in this job's own transaction shape (25006) before the target is accepted.
# Supavisor silently drops `default_transaction_read_only` in transaction mode, so a session
# setting would be a promise; the server's own refusal is a proof.
#
# AN UNMEASURED GUARD IS NOT A PASS. No credentials, no census function, no connection — each
# exits non-zero and says which. There is no force switch and no skip.
# ─────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

night_resolve_psql || exit $?

# THE LIVE DATABASE IS NAMED IN ITS OWN FIVE VARIABLES, where a reader can see it —
# `night_target_dsn` deliberately has no production entry for exactly this reason.
ENVFILE=""
for f in /Users/armanisadeghi/code/matrx-frontend/.env.local \
         /Users/armanisadeghi/code/matrx-frontend/.env \
         /Users/armanisadeghi/code/aidream/.env; do
  if [ -r "$f" ] && grep -q '^SUPABASE_MATRIX_PASSWORD=' "$f"; then ENVFILE="$f"; break; fi
done
if [ -z "$ENVFILE" ]; then
  say "REFUSED: the five SUPABASE_MATRIX_* values were not found in matrx-frontend/.env.local,"
  say "  matrx-frontend/.env or aidream/.env, so the live estate was NOT measured — and an"
  say "  unmeasured ratchet is not a green one. Nothing attempted."
  exit 78
fi
say "connection from $ENVFILE"
eval "$(grep -E '^SUPABASE_MATRIX_(USER|PASSWORD|HOST|PORT|DATABASE_NAME)=' "$ENVFILE" \
        | sed -E "s/^([A-Z_]+)=[\"']?(.*)$/\1='\2'/" | sed -E "s/['\"]'\$/'/")"
export PGHOST="$SUPABASE_MATRIX_HOST" PGPORT="$SUPABASE_MATRIX_PORT" \
       PGUSER="$SUPABASE_MATRIX_USER" PGPASSWORD="$SUPABASE_MATRIX_PASSWORD" \
       PGDATABASE="$SUPABASE_MATRIX_DATABASE_NAME"

night_assert_target_readonly production || exit $?

cd /Users/armanisadeghi/code/matrx-frontend
# THE GATE DATABASE LIMITS (scripts/lib/gate-db.ts, 2026-09-25). This used to export
# PGOPTIONS='-c statement_timeout=300000 ...', which Supavisor drops on the floor — measured on the
# clone, a startup option never reaches the server — so the census ran under the role default and
# the 300 s was a promise nobody kept. The suite opens ONE read-only transaction after its preamble
# and runs `:gate_limits` first inside it (60 s per statement, 3 s locks, 60 s idle), stamped
# `gate:check:relation-halves-agree` in pg_stat_activity. (`psql -1` cannot do this: the shared
# preamble commits its own transaction, which would end psql's.)
LIMITS="$(pnpm exec tsx scripts/gate-db-limits.ts check:relation-halves-agree)" || {
  say "REFUSED: could not read the gate database limits (scripts/gate-db-limits.ts). Nothing attempted."
  exit 78
}
"$PSQL" -X -v ON_ERROR_STOP=1 -v gate_limits="$LIMITS" -f scripts/campaign-tests/relhalvescensus_green.sql
