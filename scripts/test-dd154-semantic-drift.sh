#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
runner="$repo/scripts/test-dd154-current-guard-controls.sh"
work=$(mktemp -d /tmp/dd154-semantic-drift.XXXXXX)
trap 'rm -rf "$work"' EXIT
python3 - "$work/owner.sql" "$work/event.sql" <<'PY'
import pathlib,sys
pathlib.Path(sys.argv[1]).write_text("ALTER FUNCTION platform._ddl_guard() OWNER TO fixture_exec; DO $$ BEGIN IF (SELECT proowner::regrole::text FROM pg_proc WHERE oid='platform._ddl_guard()'::regprocedure) <> 'fixture_exec' THEN RAISE EXCEPTION 'owner drift mutation did not persist'; END IF; END $$;")
pathlib.Path(sys.argv[2]).write_text("ALTER EVENT TRIGGER ddl_guard ENABLE REPLICA; DO $$ BEGIN IF (SELECT evtenabled FROM pg_event_trigger WHERE evtname='ddl_guard') <> 'R' THEN RAISE EXCEPTION 'event drift mutation did not persist'; END IF; END $$;")
PY
for kind in owner event; do
  set +e
  DD154_CURRENT_BEFORE_DRAFT_SQL="$work/$kind.sql" "$runner" >"$work/$kind.out" 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]] || ! grep -q 'semantic pg_proc/event metadata drifted before owner-DDL lock' "$work/$kind.out"; then tail -80 "$work/$kind.out" >&2; exit 1; fi
done
"$runner" >"$work/positive.out" 2>&1
grep -q 'TOTAL    | 44    | failures | 0' "$work/positive.out"
echo 'PASS semantic drift: fixture function-owner and event-enabled mutations each refused before owner-DDL; fresh positive mapped guard passed 44/0'
