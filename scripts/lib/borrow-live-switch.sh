# BORROWING A LIVE SETTING, SO A PROOF CAN NEVER LEAVE A CREW DARK.
#
# WHAT THIS CLOSES (V11-A, measured on the main database on 2026-09-22). Rincon Plumbing
# Co — the crew the guides send the owner to — had its record store switched OFF, with
# 401 live records, 36 tables, 10 portals, 4 document templates and a published form dark
# behind it. The last write on that switch was `STORE-OFF proof — restored`, and the
# proof that wrote it (scripts/store-off/proof.sh) did this:
#
#     ... turn it ON  ...  measure  ...  turn it OFF          <- a HARDCODED "restore"
#
# It never read what the setting was before it touched it, so "restored" meant "off"
# whatever the crew actually had. It also restored on ONE exit path: any failure between
# those two lines left the switch wherever the proof had put it, because `set -e` walks
# out of the script without running the last line. And three proofs were flipping that
# same organization's switch inside the same second (audit rows 80385-80404), so even a
# proof that DID read the prior value would have read a peer's transient one and written
# that back.
#
# THE THREE RULES THIS ENFORCES, TOGETHER:
#   1. READ FIRST — what gets put back is what was there, never a constant.
#   2. RESTORE IN A TRAP — on EXIT, INT and TERM, so EVERY exit path restores.
#   3. ONE PROOF PER ORGANIZATION — an object-scoped row in campaign_watch.build_lock
#      named `store-switch:<organization>`. A peer holding it means you wait; if it is
#      still held the borrow REFUSES and touches nothing, rather than racing it.
#
# USE IT LIKE THIS, from any zsh proof (PG* already exported):
#
#     source "${0:a:h}/../lib/borrow-live-switch.sh"
#     borrow_store_switch "$ORG" "$ADMIN" "STORE-OFF proof"   # locks, reads, arms the trap
#     set_store_switch true                                   # flip it as the proof needs
#     ...                                                     # measure
#     # nothing to write back by hand: the trap does it, on every way out.
#
# The borrow prints what it took and what it will put back, so the proof's own transcript
# carries the evidence that the organization was handed back unchanged.

: ${PSQL_BIN:=$(brew --prefix libpq)/bin/psql}

_BORROW_ORG=""
_BORROW_ACTOR=""
_BORROW_PRIOR=""
_BORROW_LOCK=""
_BORROW_WHO="${BORROW_HELD_BY:-$(whoami)@$(hostname -s)}"

_borrow_q() { "$PSQL_BIN" -v ON_ERROR_STOP=1 -Atc "$1"; }

borrow_store_switch() {
  _BORROW_ORG="$1"
  _BORROW_ACTOR="$2"
  local why="${3:-a proof}"
  if [[ -z "$_BORROW_ORG" || -z "$_BORROW_ACTOR" ]]; then
    echo "borrow_store_switch: name the organization and the acting user. Nothing was touched." >&2
    _BORROW_ORG=""
    return 2
  fi
  _BORROW_LOCK="store-switch:$_BORROW_ORG"

  # 3. THE LOCK, FIRST — object-scoped, one row per organization. A lock older than
  #    fifteen minutes belonged to a proof that died; it is taken over and said so.
  local took
  took=$(_borrow_q "
    with cleared as (
      delete from campaign_watch.build_lock
       where lock_name = '$_BORROW_LOCK' and taken_at < now() - interval '15 minutes'
      returning held_by
    ), tried as (
      insert into campaign_watch.build_lock (lock_name, held_by, note)
      values ('$_BORROW_LOCK', '$_BORROW_WHO', '$why')
      on conflict (lock_name) do nothing
      returning 1
    )
    select case when exists (select 1 from tried) then 'took'
                else 'held_by:' || coalesce((select held_by from campaign_watch.build_lock where lock_name='$_BORROW_LOCK'), '?')
           end;")
  if [[ "$took" != "took" ]]; then
    echo "borrow_store_switch: another proof is holding this organization's record-store switch ($took). NOTHING was touched — wait for it, or take it over once its lock is fifteen minutes old." >&2
    _BORROW_ORG=""
    return 3
  fi

  # 1. READ FIRST. This is the value the trap will put back, whatever it is.
  # psql prints a boolean as `t`/`f`, and `t` is not SQL this can hand back to the door.
  # The value travels as the literal word the setter takes.
  _BORROW_PRIOR=$(_borrow_q "select case when coalesce((platform.unified_data_store_state('$_BORROW_ORG'::uuid) ->> 'switched_on')::boolean, false) then 'true' else 'false' end")
  if [[ "$_BORROW_PRIOR" != "true" && "$_BORROW_PRIOR" != "false" ]]; then
    _borrow_release_lock
    echo "borrow_store_switch: could not read this organization's current switch, so there is nothing safe to put back. Nothing was touched." >&2
    _BORROW_ORG=""
    return 4
  fi
  echo "   borrowed $_BORROW_ORG — its record store is ${_BORROW_PRIOR} right now; that is what will be put back."

  # 2. THE TRAP IS ALREADY ARMED — see the bottom of this file. In zsh a `trap ... EXIT`
  #    set INSIDE a function fires when that FUNCTION returns, not when the script exits,
  #    which would put the switch back before the proof had measured anything. So the
  #    traps are installed once at source time, in the script's own scope, and they do
  #    nothing until there is something borrowed to give back.
}

set_store_switch() {
  if [[ -z "$_BORROW_ORG" ]]; then
    echo "set_store_switch: nothing has been borrowed. Call borrow_store_switch first — flipping a live organization's switch without a borrow is exactly how a crew goes dark." >&2
    return 2
  fi
  _borrow_q "select platform.unified_data_store_set('$_BORROW_ORG'::uuid, $1, '$_BORROW_ACTOR'::uuid, 'borrowed by a proof — it will be put back to ${_BORROW_PRIOR}') is not null" >/dev/null
}

_borrow_release_lock() {
  [[ -z "$_BORROW_LOCK" ]] && return 0
  _borrow_q "delete from campaign_watch.build_lock where lock_name = '$_BORROW_LOCK' and held_by = '$_BORROW_WHO'" >/dev/null 2>&1
  _BORROW_LOCK=""
  return 0
}

_borrow_restore_store_switch() {
  [[ -z "$_BORROW_ORG" ]] && { _borrow_release_lock; return 0 }
  local org="$_BORROW_ORG" prior="$_BORROW_PRIOR"
  _BORROW_ORG=""          # so a nested exit cannot restore twice
  if _borrow_q "select platform.unified_data_store_set('$org'::uuid, $prior, '$_BORROW_ACTOR'::uuid, 'proof finished — the switch put back to what the organization had') is not null" >/dev/null; then
    echo "   returned $org — its record store is back to ${prior}."
  else
    echo "   🚨 COULD NOT PUT $org BACK to ${prior}. Its record store is whatever the proof left it at. Set it right before anything else runs." >&2
  fi
  _borrow_release_lock
  return 0
}

# ── THE TRAPS, ARMED AT SOURCE TIME, IN THE SCRIPT'S OWN SCOPE ──────────────────────────
# Every exit path of the sourcing script runs the restore. Until `borrow_store_switch`
# has taken something, the handler returns immediately, so sourcing this file costs a
# proof nothing. A script with an EXIT trap of its own must source this file FIRST and
# call the restore from its own handler.
trap '_borrow_restore_store_switch' EXIT
trap '_borrow_restore_store_switch; exit 130' INT
trap '_borrow_restore_store_switch; exit 143' TERM
