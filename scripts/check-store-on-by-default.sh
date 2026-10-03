#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────────────────────
# STORE-ON — the release gate around the honest guard.
#
# It runs `scripts/campaign-tests/storeon_green.sql` against the LIVE database (owner ruling
# 2026-10-03: checks run on live; the clone is only for DDL rehearsal). The suite asks one question, in the words of the owner ruling of 2026-09-23:
#
#     no ACTIVE organization reads the record store OFF unless one of its own owners or
#     administrators switched it off through the settings door, and nothing has rewritten
#     the switch since.
#
# (Tightened 2026-09-23, VERIFIER-15: the first version excused any OFF organization with "a
# written reason", and Alex Hart's Workspace sat OFF under a note that said "on by default".)
#
# It also holds the platform default itself (value AND factory reset) to ON for both halves of
# the one switch and for the older store's relation columns, proves an organization born one
# statement ago is open, and reads the store from the `authenticated` seat rather than only as
# the database owner.
#
# ON LIVE. The suite creates an organization to prove a new one is open at birth; that row lives
# inside one transaction that ends in ROLLBACK, and the suite issues no DDL.
#
# AN UNMEASURED GUARD IS NOT A PASS. If the live connection cannot be assembled this exits
# non-zero and says why. It carries no force switch and no skip.
#
# Its red twin is scripts/campaign-tests/storeon_red.sql, which plants all four failures and
# proves this suite's own predicates would name them.
# ─────────────────────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

night_resolve_psql || exit $?

# THE LIVE DATABASE IS NAMED IN ITS OWN FIVE VARIABLES, where a reader can see it.
ENVFILE=""
for f in /Users/armanisadeghi/code/matrx-frontend/.env.local \
         /Users/armanisadeghi/code/matrx-frontend/.env \
         /Users/armanisadeghi/code/aidream/.env; do
  if [ -r "$f" ] && grep -q '^SUPABASE_MATRIX_PASSWORD=' "$f"; then ENVFILE="$f"; break; fi
done
if [ -z "$ENVFILE" ]; then
  say "REFUSED: the five SUPABASE_MATRIX_* values were not found, so the record store's default"
  say "  was NOT measured — and an unmeasured guard is not a pass."
  exit 78
fi
say "connection from $ENVFILE"
eval "$(grep -E '^SUPABASE_MATRIX_(USER|PASSWORD|HOST|PORT|DATABASE_NAME)=' "$ENVFILE" \
        | sed -E "s/^([A-Z_]+)=[\"']?(.*)$/\1='\2'/" | sed -E "s/['\"]'\$/'/")"
export PGHOST="$SUPABASE_MATRIX_HOST" PGPORT="$SUPABASE_MATRIX_PORT" \
       PGUSER="$SUPABASE_MATRIX_USER" PGPASSWORD="$SUPABASE_MATRIX_PASSWORD" \
       PGDATABASE="$SUPABASE_MATRIX_DATABASE_NAME"
night_assert_target production || exit $?

export PGOPTIONS='-c statement_timeout=600000 -c lock_timeout=10000'
cd /Users/armanisadeghi/code/matrx-frontend
"$PSQL" -X -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storeon_green.sql
