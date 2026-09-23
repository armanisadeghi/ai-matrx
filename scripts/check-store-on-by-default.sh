#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────────────────────
# STORE-ON — the release gate around the honest guard.
#
# It runs `scripts/campaign-tests/storeon_green.sql` against the NIGHTLY DEV CLONE and nothing
# else. The suite asks one question, in the words of the owner ruling of 2026-09-23:
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
# WHY THE CLONE. The suite creates an organization to prove a new one is open at birth. That row
# lives inside a transaction that rolls back, but a rehearsal database is where a rehearsal
# belongs, and the clone carries production's own data so the census is the real census.
# `night_assert_target clone` is the only target this asks for; there is no flag, variable or
# mode that points it anywhere else.
#
# AN UNMEASURED GUARD IS NOT A PASS. If the clone's connection cannot be assembled this exits
# non-zero and says why. It carries no force switch and no skip.
#
# Its red twin is scripts/campaign-tests/storeon_red.sql, which plants all four failures and
# proves this suite's own predicates would name them.
# ─────────────────────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

night_resolve_psql || exit $?

DSN="$(night_clone_dsn)" || true
if [ -z "${DSN:-}" ]; then
  say "REFUSED: the dev clone's connection could not be assembled, so the record store's default"
  say "  was NOT measured — and an unmeasured guard is not a pass. Set CLONE_DATABASE_URL, or"
  say "  make sure common-docs/operations/clone/CLONE-REF names a readable password_file."
  exit 78
fi
night_assert_target clone "$DSN" || exit $?

export PGOPTIONS='-c statement_timeout=600000 -c lock_timeout=10000'
cd /Users/armanisadeghi/code/matrx-frontend
"$PSQL" "$DSN" -X -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storeon_green.sql
