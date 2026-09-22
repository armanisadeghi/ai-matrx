#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# TRIGGER-LOCK — the release gate around the honest guard.
#
# It runs `scripts/campaign-tests/triggerlock_green.sql` against the NIGHTLY DEV CLONE and
# nothing else. The suite asks, per statement kind, what trigger DDL on a PARTITIONED PARENT
# actually locks: `create trigger` and `alter table … enable/disable trigger` take SHARE ROW
# EXCLUSIVE on the table and every partition and nothing else; `drop trigger` takes ACCESS
# EXCLUSIVE on those PLUS exactly the relations `supautils.policy_grants` declares — which is
# why a DROP TRIGGER stops sign-in the way a policy change does, and why the runner makes a file
# carrying it window-class. Green today. Red the day one of our event triggers starts escalating
# trigger DDL, or the day PostgreSQL or Supabase moves either set — both of which we want to be
# told about before a maintenance window, not during one.
#
# WHY THE CLONE AND ONLY THE CLONE. The probe issues a real `drop trigger`, and on the main
# database that would freeze sign-in, file reads and realtime for the length of its own
# transaction. The suite rolls back, but "brief" is not "free". `night_assert_target clone` is
# the only target this asks for; there is no flag, variable or mode that points it anywhere
# else. (It never touches `custom.record`: a four-partition scratch table proves the same law.)
#
# AN UNMEASURED GUARD IS NOT A PASS. If the clone's connection cannot be assembled this exits
# non-zero and says why. It carries no force switch and no skip.
# ─────────────────────────────────────────────────────────────────────────────
set -u
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

night_resolve_psql || exit $?

DSN="$(night_clone_dsn)" || true
if [ -z "${DSN:-}" ]; then
  say "REFUSED: the dev clone's connection could not be assembled, so the trigger-lock set was"
  say "  NOT measured — and an unmeasured guard is not a pass. Set CLONE_DATABASE_URL, or make"
  say "  sure common-docs/operations/clone/CLONE-REF names a readable password_file."
  exit 78
fi
night_assert_target clone "$DSN" || exit $?

export PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=10000'
cd /Users/armanisadeghi/code/matrx-frontend
"$PSQL" "$DSN" -X -v ON_ERROR_STOP=1 -f scripts/campaign-tests/triggerlock_green.sql
