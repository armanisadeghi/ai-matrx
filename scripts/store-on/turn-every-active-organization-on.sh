#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────────────────────
# STORE-ON — TURN THE RECORD STORE ON FOR EVERY ACTIVE ORGANIZATION, THROUGH THE DOOR.
#
# OWNER RULING, Arman, 2026-09-23: the record store's default is ON, and every active
# organization gets it turned on now.
# `migrations/campaign/storeon_the_record_store_is_on_by_default.sql` moved the PLATFORM
# default; this moves every organization, so the answer no longer depends on which side of a
# default an organization happens to fall, and so every one of them carries an audited row
# saying who turned it on and why.
#
# IT USES THE DOOR, NEVER THE TABLE. `platform.unified_data_store_set` is the one switch: it
# asks `platform.knob_write_door_for`, writes BOTH halves (`custom/system_enabled` and
# `custom/code_paths_enabled`) through `platform._knob_override_write`, and READS EACH ONE BACK
# before it returns. A raw UPDATE of `platform.knob_override` would skip all three, and would
# also skip FIX-11A's `store_switch_halves_follow_each_other_tg`. A stale `false` override is
# not deleted and does not need to be: the door overwrites it with `true` at the same rung, so
# no stale false survives.
#
# IT SKIPS NOBODY — including the three Rincon Plumbing Co branches that were off by their own
# setting, which FIX-11A named and deliberately left alone. The ruling overrides that. The
# switch is still theirs: a `false` an owner writes from their own settings screen tomorrow
# stands, and this script is not run again.
#
# CHUNKED, AND EACH CHUNK IS ITS OWN TRANSACTION under a 2 s `lock_timeout` — so it never holds
# row locks on `platform.knob_override` across hundreds of organizations while the live app is
# writing to it (the maintenance-window law, 2026-09-21). A chunk that cannot take its locks
# dies on its own and every chunk already committed stands; re-running is idempotent.
#
#   ./scripts/store-on/turn-every-active-organization-on.sh            # counts only, changes nothing
#   ./scripts/store-on/turn-every-active-organization-on.sh --apply
#
# The connection is the five `SUPABASE_MATRIX_*` variables every runner in this repo reads.
# ─────────────────────────────────────────────────────────────────────────────────────────────
set -u
setopt PIPE_FAIL 2>/dev/null || true

ROOT=/Users/armanisadeghi/code/matrx-frontend
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

# admin@admin.com — the platform-admin seat this ruling is executed from. The door REQUIRES a
# named actor (`auth.uid()` is null on a direct connection) and writes it into every override's
# audit trail, so the change is attributable rather than anonymous.
ACTOR='87a6e699-3622-4869-8843-d0867456c0dd'
REASON='owner ruling 2026-09-23: on by default'
CHUNK=50

PSQL="$(cd "$ROOT" && pnpm -s exec tsx scripts/lib/psql-path.ts --print 2>/dev/null)"
[[ -x "$PSQL" ]] || PSQL="$(brew --prefix libpq)/bin/psql"

envget() { grep -m1 "^$1=" /Users/armanisadeghi/code/aidream/.env | sed "s/^$1=//; s/^['\"]//; s/['\"]\$//"; }
export PGUSER="$(envget SUPABASE_MATRIX_USER)"
export PGPASSWORD="$(envget SUPABASE_MATRIX_PASSWORD)"
export PGHOST="$(envget SUPABASE_MATRIX_HOST)"
export PGPORT="$(envget SUPABASE_MATRIX_PORT)"
export PGDATABASE="$(envget SUPABASE_MATRIX_DATABASE_NAME)"
if [[ -z "$PGUSER" || -z "$PGHOST" ]]; then
  print -u2 "REFUSED: the five SUPABASE_MATRIX_* variables could not be read, so nothing was attempted."
  exit 78
fi

q() { "$PSQL" -X -q -v ON_ERROR_STOP=1 -tAc "$1"; }

BEFORE_ON=$(q "select count(*) from iam.organizations o where o.archived_at is null and platform.knob_resolve('custom','system_enabled',o.id,null,null) = 'true'::jsonb")
ACTIVE=$(q "select count(*) from iam.organizations where archived_at is null")
print "STORE-ON: $ACTIVE active organizations; $BEFORE_ON of them read the record store ON before this run."

if (( ! APPLY )); then
  print "STORE-ON: counts only — nothing was changed. Re-run with --apply."
  exit 0
fi

# ONE id per line, ordered, taken once so the set this run acts on is fixed and reportable.
IDS=$(q "select id from iam.organizations where archived_at is null order by created_at")
TOTAL=$(print -r -- "$IDS" | grep -c . )
print "STORE-ON: switching all $TOTAL on through platform.unified_data_store_set, in chunks of $CHUNK."

SEEN=0
print -r -- "$IDS" | while IFS= read -r line; do print -r -- "$line"; done | paste -sd, - > /dev/null 2>&1
i=0
BUF=()
flush() {
  (( ${#BUF} == 0 )) && return 0
  local LIST="$(print -r -- "${(j:,:)BUF}")"
  "$PSQL" -X -q -v ON_ERROR_STOP=1 <<SQL
begin;
set local lock_timeout = '2s';
set local statement_timeout = '5min';
select set_config('matrx.storeon_actor', '$ACTOR', true);
select set_config('matrx.storeon_reason', \$reason\$$REASON\$reason\$, true);
do \$chunk\$
declare v_org uuid;
begin
  foreach v_org in array string_to_array('$LIST', ',')::uuid[] loop
    perform platform.unified_data_store_set(
      v_org, true,
      current_setting('matrx.storeon_actor')::uuid,
      current_setting('matrx.storeon_reason'));
  end loop;
end
\$chunk\$;
commit;
SQL
  local rc=$?
  if (( rc != 0 )); then
    print -u2 "STORE-ON: a chunk FAILED (exit $rc). Chunks already committed stand; nothing was rolled back beyond this one."
    exit $rc
  fi
  SEEN=$(( SEEN + ${#BUF} ))
  print "STORE-ON: $SEEN of $TOTAL switched on."
  BUF=()
}

while IFS= read -r ORG; do
  [[ -z "$ORG" ]] && continue
  BUF+=("$ORG")
  (( ${#BUF} >= CHUNK )) && flush
done <<< "$IDS"
flush

AFTER_ON=$(q "select count(*) from iam.organizations o where o.archived_at is null and platform.knob_resolve('custom','system_enabled',o.id,null,null) = 'true'::jsonb")
AFTER_ROWS=$(q "select count(*) from platform.knob_override k join iam.organizations o on o.id = k.organization_id and o.archived_at is null where k.feature='custom' and k.key='system_enabled' and k.scope_kind='organization' and k.value='true'::jsonb")
STILL_FALSE=$(q "select count(*) from platform.knob_override k join iam.organizations o on o.id = k.organization_id and o.archived_at is null where k.feature='custom' and k.key in ('system_enabled','code_paths_enabled') and k.scope_kind='organization' and k.value='false'::jsonb")
print "STORE-ON: DONE — $AFTER_ON of $ACTIVE active organizations now read the record store ON (was $BEFORE_ON)."
print "STORE-ON: $AFTER_ROWS active organizations carry their own explicit ON override; $STILL_FALSE stale false halves remain."
