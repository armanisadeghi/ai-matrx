#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# POLICY-LOCK — the release gate around the honest guard.
#
# It runs `scripts/campaign-tests/policylock_green.sql` against the NIGHTLY DEV CLONE and
# nothing else. The suite asks one question: does a `create policy` on a throwaway table take
# ACCESS EXCLUSIVE on its own table plus EXACTLY the relations `supautils.policy_grants`
# declares, and nothing more? Green today. Red the day one of our event triggers starts
# escalating a policy change, or the day Supabase changes that list — both of which we want to
# be told about before a maintenance window, not during one.
#
# WHY THE CLONE AND ONLY THE CLONE. The probe issues a real `create policy`, and on the main
# database that would freeze sign-in, file reads and realtime for the length of its own
# transaction. The suite rolls back, but "brief" is not "free". `night_assert_target clone` is
# the only target this asks for; there is no flag, variable or mode that points it anywhere
# else.
#
# AN UNMEASURED GUARD IS NOT A PASS. If the clone's connection cannot be assembled this exits
# non-zero and says why. It carries no force switch and no skip.
# ─────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

night_resolve_psql || exit $?

DSN="$(night_clone_dsn)" || true
if [ -z "${DSN:-}" ]; then
  say "REFUSED: the dev clone's connection could not be assembled, so the policy-lock set was"
  say "  NOT measured — and an unmeasured guard is not a pass. Set CLONE_DATABASE_URL, or make"
  say "  sure common-docs/operations/clone/CLONE-REF names a readable password_file."
  exit 78
fi
night_assert_target clone "$DSN" || exit $?

export PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=10000'
cd /Users/armanisadeghi/code/matrx-frontend
"$PSQL" "$DSN" -X -v ON_ERROR_STOP=1 -f scripts/campaign-tests/policylock_green.sql
