#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# NIGHT-SWEEP — ONE SHOT, 2026-09-23, 02:05 America/Los_Angeles.
#
# W1-ORG's four chair steps, applied to the MAIN database in the order the chair step
# document fixes, each as its own short transaction, with the documented seat probe
# after every one and a HARD STOP the moment a probe does not answer what it must.
#
#   common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/W1-ORG-CHAIR-STEP.md
#
# THE FOUR, IN ORDER (smallest lock first, the two auth.users retries last):
#   1  C   w1_org_audience_is_a_word_on_main.sql            context.templates only
#   2  A   w1_org_is_personal_is_deprecated_on_main.sql     iam.organizations only
#   3  B1  w1_org_billing_lets_go_of_auth_users_on_main.sql ACCESS EXCLUSIVE on auth.users
#   4  B2  w1_org_billing_owner_columns_move_on_main.sql    the column move + 12 policies
#
# 🚨 WHY 02:05 AND NOT ANY OTHER TIME. Every `CREATE`/`ALTER`/`DROP POLICY` run as
# `postgres` on this database takes ACCESS EXCLUSIVE on twenty-three relations that
# have nothing to do with it — sixteen `auth.*`, five `storage.*`,
# `realtime.messages` and `realtime.subscription` — and PostgreSQL holds them until
# COMMIT. It is Supabase's own `supautils.policy_grants` hook, context `sighup`, and
# `SET`, `SET LOCAL` and `ALTER ROLE … SET` are each refused: there is nothing of ours
# to turn off, and the only lever we own is how long the transaction lasts. File 4
# creates twelve policies, so its ~7 seconds are seven seconds in which nobody on the
# platform can sign in, refresh a token, read a file or receive a realtime message.
# That belongs inside the 1-4 AM Pacific window and nowhere else. 02:05 is after the
# 01:05 branch refresh so the two never contend.
#
# 🚨 FILE 3 IS EXPECTED TO FAIL AND RETRY, AND THAT IS THE DESIGN WORKING. It sets
# `lock_timeout = '5s'`, so when it cannot get ACCESS EXCLUSIVE on `auth.users` it
# gives up instead of queueing every sign-in behind itself. On the dev clone — with no
# user traffic at all — it needed one retry twice and two retries once. Each attempt
# costs nothing because its transaction does nothing else. THE LOCK TIMEOUT IS NEVER
# RAISED TO FORCE IT THROUGH: that is precisely the freeze the B1/B2 split exists to
# avoid. Every file here gets three attempts for the same reason.
#
# 🚨 A PROBE FAILURE STOPS THE WHOLE JOB. The four are ordered, and B2 is only correct
# on the state B1 leaves. A job that shrugged off a probe and carried on would apply a
# file to a database that is not what it was written against — which is exactly how
# B2, run with B1 skipped, once left `billing.customer.organization_id` carrying a
# foreign key to `auth.users`: silently, confidently wrong, with nothing complaining.
#
# NO FORCE SWITCH. There is exactly one override, `NIGHT_REHEARSE=1`, and it does not
# remove the window — it changes the DATABASE to the nightly dev clone and refuses a
# production connection string outright. The rule and the incident that wrote it live
# at the top of lib-night.sh.
# ─────────────────────────────────────────────────────────────────────────────
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

LABEL="com.aimatrx.night-sweep.w1-org-apply"
LANE=W1-ORG-APPLY
OPEN=0100 CLOSE=0330
ATTEMPTS=3

# The object-scoped locks this job holds for its whole run — one per schema it writes,
# which is what another lane reads to know these objects are being worked on.
LOCKS=(context iam billing)

HANDOFF=/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20
LOG="$HANDOFF/night-2026-09-23-w1-org-apply.log"
[ "$REHEARSE" = "1" ] && LOG="${LOG%.log}-rehearsal.log"
exec >>"$LOG" 2>&1

# ── the four files and the four inverses ─────────────────────────────────────
# Each inverse's sha256 is the one PROVEN under rule 27 on the nightly dev clone by
# `pnpm db:rehearse <file> --target clone` — up, inverse, up again, three real runs
# each. A moved inverse is an unproven inverse and this job refuses before it connects
# to anything. Re-pin only by re-running rule 27 and copying what it executed.
FILES=(
  w1_org_audience_is_a_word_on_main.sql
  w1_org_is_personal_is_deprecated_on_main.sql
  w1_org_billing_lets_go_of_auth_users_on_main.sql
  w1_org_billing_owner_columns_move_on_main.sql
)
INVERSE_SHA=(
  28f815faf9eb90fb827920f1aaaa339ea43f6ff4691847eadb06203bd8e1958e
  880367f62280e2f0a20d298e44937d6499e56deb27bedc8a76d0ae05adbb0e18
  04a3aaaa041ee7e8fe852bb1640d21a417f6514ac2d55f0b79b035b525376750
  9230b615d98e0f9fdeec0941dcffb08d1eb273d4e0c6337d01ebe5b5b4212bac
)

# ── the seat probes ──────────────────────────────────────────────────────────
# One SQL probe per file, taken from the chair step's own table. Each returns exactly
# the word `PASS` when the file did what it said it would, and anything else — a
# different word, an error, an empty answer — stops the job.
#
# They are SELECT-only and they read what the file CHANGED, never the ledger row: a
# ledger row says a transaction committed, which is not the same as the database
# being the shape the next file needs. The UI-seat probes in the chair step (the org
# switcher, the template gallery, the billing panel) are a person's job in the
# morning and are named in the log at the end so nobody thinks this job did them.
PROBES=(
  # C — the audience word is there AND list_templates still emits the derived boolean.
  "select case when (public.list_templates(null, null) -> 0 ->> 'audience') in ('individual','organization')
               and (public.list_templates(null, null) -> 0 ->> 'is_personal') is not null
          then 'PASS' else 'FAIL: list_templates does not emit audience and the derived is_personal' end"
  # A — the partial unique index is gone and the rewrite list answers as a query.
  "select case when (select count(*) from pg_indexes where indexname='organizations_one_personal_per_creator') = 0
               and (select count(*) from iam.is_personal_dependents()) > 0
          then 'PASS' else 'FAIL: the one-personal-per-creator index is still there, or is_personal_dependents() is empty' end"
  # B1 — billing holds no foreign key or CHECK on auth.users any more.
  "select case when (select count(*) from pg_constraint
                      where conname in ('customer_user_id_fkey','connect_account_user_id_fkey',
                                        'subscription_user_id_fkey','subscription_user_or_org')) = 0
          then 'PASS' else 'FAIL: billing still holds a foreign key or CHECK on auth.users' end"
  # B2 — the three owner columns are organization_id, and NOBODY'S TIER FELL BECAUSE OF
  # THIS FILE. The second half is filled in at run time by $TIER_GAP_BEFORE; see below.
  "select case when (select count(*) from information_schema.columns
                     where table_schema='billing' and column_name='organization_id'
                       and table_name in ('customer','subscription','connect_account')) = 3
               and (select count(*) from billing.tier_no_downgrade()) <= __TIER_GAP_BEFORE__
          then 'PASS' else 'FAIL: the three owner columns did not all become organization_id, or billing.tier_no_downgrade() grew past __TIER_GAP_BEFORE__ (it is '
                          || (select count(*) from billing.tier_no_downgrade())::text || ' now)' end"
)

# ── 🚨 THE SEAT PROBE THE CHAIR STEP GOT WRONG, AND WHAT IT IS INSTEAD ────────
# W1-ORG-CHAIR-STEP.md says B2's probe is `select * from billing.tier_no_downgrade();`
# -> "zero rows — REC-62's own proof that nobody's tier fell". Measured by lane
# W1-ORG-APPLY on 2026-09-22, SELECT-only: it is **340 rows on production and 340 on
# the nightly dev clone, BEFORE anything is applied**, and B2 cannot move it —
# `billing.subscription` holds zero rows, so removing that arm from
# `_resolve_tier_legacy` changes no answer, and `resolve_org_tier` only renames a
# column. The 340 are people whose own `billing.user_plan` row (805 live rows) is a
# higher tier than the best tier of any organization they are an active member of.
# That is a real, pre-existing gap in the DATA — the work of attaching billing to
# organizations — and it is not a downgrade this file causes.
#
# A probe that asserts zero would therefore have STOPPED the night job at its last
# file, every time, on a database where nothing was wrong. Proven RED in rehearsal
# against the clone on 2026-09-22 before it was fixed. So the probe asks the question
# the chair step MEANT: take the count immediately before the file and refuse if the
# file grew it. Zero growth is the proof; zero rows never was.

say "─────────── $LANE starting (pid $$)$([ "$REHEARSE" = 1 ] && print -n ' REHEARSAL') ───────────"
say "four chair steps, in order: ${FILES[*]}"
say "locks: ${LOCKS[*]}   window: $OPEN-$CLOSE Pacific   attempts per file: $ATTEMPTS"

night_resolve_psql || exit $?
night_window_guard $OPEN $CLOSE || exit $?

# Every inverse is gated BEFORE anything connects to a database. A file whose way back
# has moved does not go anywhere near the live database, and the job refuses as a
# whole rather than applying the first two and stopping at the third.
for i in {1..4}; do
  night_inverse_gate "$FRONTEND/migrations/inverse/${FILES[$i]%.sql}_down.sql" "${INVERSE_SHA[$i]}" || exit $?
done

# 🚨 A REHEARSAL REACHES THE NIGHTLY DEV CLONE, NOT THE BRANCH. The clone is a
# PHYSICAL restore of production's data, which is the only place the four files mean
# anything: the branch has no `billing.customer` rows to count, no 629 organizations
# and no 34 templates, so a probe there would pass on an empty database and prove
# nothing. The clone is also where rule 27 was run on these exact bytes. It reports
# production's own `system_identifier`, so naming it is only safe because
# `night_assert_target` checks the project ref in the CONNECTION as well — and it is
# reached only through CLONE-REF and the password file it names, never through the
# five SUPABASE_MATRIX_* values.
if [ "$REHEARSE" = "1" ]; then
  TARGET=clone
  PROBE_DSN="$(night_clone_dsn)"
  if [ -z "$PROBE_DSN" ]; then
    say "REFUSED: could not build the dev clone's connection from CLONE-REF. Nothing attempted."
    exit 78
  fi
  night_assert_target clone "$PROBE_DSN" || exit $?
else
  TARGET=production
  U="$(grep -m1 '^SUPABASE_MATRIX_USER=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  H="$(grep -m1 '^SUPABASE_MATRIX_HOST=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  PT="$(grep -m1 '^SUPABASE_MATRIX_PORT=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  N="$(grep -m1 '^SUPABASE_MATRIX_DATABASE_NAME=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  PW="$(grep -m1 '^SUPABASE_MATRIX_PASSWORD=' "$AIDREAM/.env" | cut -d= -f2- | tr -d '"')"
  export PGPASSWORD="$PW"
  night_assert_target production -h "$H" -p "$PT" -U "$U" -d "$N" || exit $?
  PROBE_ARGS=(-h "$H" -p "$PT" -U "$U" -d "$N")
fi

cleanup() {
  local rc=$?
  say "cleanup (exit $rc)"
  night_release_locks
  night_self_destruct "$LABEL"
  say "─────────── $LANE finished, exit $rc ───────────"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

night_take_locks "$LANE" 'W1-ORG four chair steps, 2026-09-23 window' "${LOCKS[@]}" || exit $?

# `lock_timeout` is set INSIDE each file (5 s, deliberately) — it is not set here and
# it is never raised. `statement_timeout` is generous only so a file is never cut in
# half; nothing here scans a table.
export PGOPTIONS='-c statement_timeout=600000'
say "PGOPTIONS: $PGOPTIONS   (lock_timeout stays at the 5s each file sets for itself)"

# One SELECT against whichever database this run is aimed at. Used by the probes and
# by B2's baseline read; it never writes and never takes a lock.
probe_sql() {  # probe_sql <sql> — echoes the single value
  if [ "$REHEARSE" = "1" ]; then
    "$PSQL" "$PROBE_DSN" -qAt -c "$1" 2>&1 | tail -1 | tr -d ' \r'
  else
    "$PSQL" "${PROBE_ARGS[@]}" -qAt -c "$1" 2>&1 | tail -1 | tr -d ' \r'
  fi
}

probe() {  # probe <index> — echoes the answer, returns non-zero on anything but PASS
  # Deliberately NOT through probe_sql: that one squeezes whitespace out of a single
  # value, and a FAIL sentence has to reach the log the way it was written.
  local sql="${PROBES[$1]}" out
  if [ "$REHEARSE" = "1" ]; then
    out="$("$PSQL" "$PROBE_DSN" -qAt -c "$sql" 2>&1)"
  else
    out="$("$PSQL" "${PROBE_ARGS[@]}" -qAt -c "$sql" 2>&1)"
  fi
  say "  seat probe: ${out:-(no answer)}"
  [ "$out" = "PASS" ]
}

cd "$FRONTEND" || exit 78

for i in {1..4}; do
  MIG="${FILES[$i]}"
  say "───── file $i of 4: $MIG"

  # B2's probe is a BEFORE/AFTER comparison (see the note above the probe list), so its
  # baseline is read from the live database immediately before the file runs — never
  # hardcoded, because 340 is a fact about today's data and not a constant.
  if [ "$i" = "4" ]; then
    TIER_GAP_BEFORE="$(probe_sql 'select count(*) from billing.tier_no_downgrade()')"
    case "$TIER_GAP_BEFORE" in
      ''|*[!0-9]*)
        say "STOPPED before file 4: could not read billing.tier_no_downgrade() to take the"
        say "  baseline its seat probe compares against — got '${TIER_GAP_BEFORE:-(no answer)}'."
        say "  A probe with no baseline proves nothing, so the file was not attempted."
        exit 1 ;;
    esac
    say "  baseline: billing.tier_no_downgrade() = $TIER_GAP_BEFORE rows before this file"
    PROBES[4]="${PROBES[4]//__TIER_GAP_BEFORE__/$TIER_GAP_BEFORE}"
  fi

  applied=0
  for attempt in $(seq 1 $ATTEMPTS); do
    say "  attempt $attempt/$ATTEMPTS: pnpm db:apply migrations/campaign/$MIG --source campaign --lane $LANE --target $TARGET --confirm-chair-step $MIG"
    out="$(node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts \
            "migrations/campaign/$MIG" --source campaign --lane "$LANE" \
            --target "$TARGET" --confirm-chair-step "$MIG" 2>&1)"
    rc=$?
    print -r -- "$out"
    # JUDGE BY THE OUTPUT TEXT, NEVER BY THE EXIT CODE — psql exits 0 after a
    # lock-timeout death, and this job's whole reason for retrying is a lock timeout.
    if print -r -- "$out" | grep -q 'Applied and ledgered'; then
      applied=1
      say "  applied on attempt $attempt (runner exit $rc)"
      break
    fi
    if print -r -- "$out" | grep -q 'Already applied, byte-identical'; then
      applied=1
      say "  already ledgered, byte-identical — nothing to do (runner exit $rc)"
      break
    fi
    if print -r -- "$out" | grep -qi 'lock timeout\|canceling statement due to lock'; then
      say "  attempt $attempt gave up its 5s lock_timeout — this is the design working, not a fault. Retrying."
      continue
    fi
    say "  attempt $attempt failed for a reason that is NOT a lock timeout (runner exit $rc). Stopping here."
    break
  done

  if [ "$applied" != "1" ]; then
    say "STOPPED at file $i of 4 ($MIG): not applied after $ATTEMPTS attempts."
    say "  The files after it were NOT attempted. Nothing is half-applied: each file is"
    say "  its own transaction, so the database is exactly as the previous file left it."
    say "  To revert what DID land, run the inverses in REVERSE order — and B2's inverse"
    say "  runs BEFORE B1's, because B1's re-creates foreign keys on a user_id column"
    say "  that does not exist again until B2's inverse has renamed it back."
    exit 1
  fi

  if ! probe $i; then
    say "STOPPED at file $i of 4 ($MIG): it applied, and its seat probe did NOT answer PASS."
    say "  The files after it were NOT attempted, deliberately: each one is only correct on"
    say "  the state the previous one leaves, and a job that shrugged this off would apply"
    say "  a file to a database that is not what it was written against."
    say "  A person reads this log, decides, and either fixes forward or runs the inverses"
    say "  in reverse order (B2's before B1's)."
    exit 1
  fi
  say "  file $i of 4 done and probed."
done

say "all four applied and probed."
say "STILL FOR A PERSON IN THE MORNING — this job did NO browser walk and no UI check:"
say "  · sign in as admin@admin.com, create a disposable organization from the org switcher"
say "    (a second one for the same person must no longer collide)"
say "  · open the scopes template gallery: all 34 templates render, personal/business still split"
say "  · open the billing/entitlements panel: the tier and usage render (entitlement_snapshot"
say "    no longer returns a trial date, by design)"
say "  · regenerate the types: pnpm db-types in matrx-frontend, and commit them"
exit 0
