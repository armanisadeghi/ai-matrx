#!/usr/bin/env bash
# Refresh scripts/hr/hr-door-snapshot.json from the live database.
#
#   pnpm hr:door-snapshot
#
# The snapshot is what makes the HR RPC conformance guard (hrb026) offline, and
# offline is what makes it runnable on every push with no secrets. That trade is
# only honest if the snapshot can actually be refreshed, so this is the refresher.
#
# READ-ONLY: scripts/hr/hr_door_snapshot.sql reads pg_proc, platform.entity_types
# and hr._door_spec and writes nothing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL="$ROOT/scripts/hr/hr_door_snapshot.sql"
OUT="$ROOT/scripts/hr/hr-door-snapshot.json"

URL="${HR_DOOR_SNAPSHOT_DATABASE_URL:-${DATABASE_URL:-${SUPABASE_DB_URL:-}}}"

if [[ -z "$URL" ]] || ! command -v psql >/dev/null 2>&1; then
  cat >&2 <<EOF
[INFO] No direct Postgres connection available here.

  The frontend reaches the database through PostgREST only, and PostgREST cannot
  read pg_proc — so this refresh needs either psql with a connection string, or
  an agent session with the Supabase MCP.

  With psql:
    DATABASE_URL=... pnpm hr:door-snapshot

  Without it, run scripts/hr/hr_door_snapshot.sql through the Supabase MCP
  \`execute_sql\` tool against project brsgrqvjdzwihsvnfqkf (db.matrxserver.com)
  and save the single \`snapshot\` column to:
    $OUT
  formatted with:  python3 -m json.tool --sort-keys

  🚨 Never point this at txzxabzwovsujtloxrus — that project is retired.
EOF
  exit 3
fi

psql "$URL" --no-psqlrc --tuples-only --no-align --quiet -f "$SQL" \
  | python3 -m json.tool --sort-keys > "$OUT.tmp"

mv "$OUT.tmp" "$OUT"
echo "[ OK ] refreshed $(python3 -c "import json;d=json.load(open('$OUT'));print(len(d['doors']))") doors → scripts/hr/hr-door-snapshot.json"
