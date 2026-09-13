#!/usr/bin/env bash
# PostgreSQL 17 throwaway proof. Never contacts a live database.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CAPTURE="$ROOT/scripts/notes-n01-canonical-preflight-capture.sql"
DRAFT="$ROOT/migrations/notes_n01_note_folders_org_identity_indexes.sql"
AIDREAM_PY="$ROOT/../aidream/.venv/bin/python"
CID="notes-n01-pg17-${RANDOM}-${RANDOM}"
TMP=$(mktemp -d /tmp/n01-canonical.XXXXXX)
cleanup(){ docker rm -f "$CID" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
docker run -d --name "$CID" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null
for _ in $(seq 1 30); do docker exec "$CID" psql -U postgres -d postgres -Atc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
P=(docker exec -i "$CID" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1)
[[ $("${P[@]}" -Atc 'show server_version_num') == 17* ]]
seed(){
  "${P[@]}" <<'SQL' >/dev/null
DROP SCHEMA IF EXISTS workbench CASCADE;
DROP ROLE IF EXISTS n01_reader;
DROP ROLE IF EXISTS n01_owner;
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE SCHEMA workbench; CREATE ROLE n01_reader;
CREATE TABLE workbench.note_folders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, created_by uuid NOT NULL, name text NOT NULL, parent_id uuid);
CREATE TABLE workbench.notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, folder_id uuid REFERENCES workbench.note_folders(id) ON DELETE SET NULL);
ALTER TABLE workbench.note_folders ADD CONSTRAINT note_folders_parent_id_fkey FOREIGN KEY(parent_id) REFERENCES workbench.note_folders(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX note_folders_created_by_name_unique ON workbench.note_folders(created_by,name);
ALTER TABLE workbench.note_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY n01_select ON workbench.note_folders FOR SELECT TO n01_reader USING (true);
CREATE FUNCTION workbench.n01_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER n01_touch BEFORE INSERT ON workbench.note_folders FOR EACH ROW EXECUTE FUNCTION workbench.n01_touch();
GRANT SELECT ON workbench.note_folders TO n01_reader;
SQL
}
capture(){ { echo 'BEGIN TRANSACTION READ ONLY;'; sed '/^BEGIN TRANSACTION READ ONLY;/d;/^ROLLBACK;/d' "$CAPTURE"; echo 'ROLLBACK;'; } | "${P[@]}" -At | rg '^\{'; }
fixture(){
  local out; out=$(mktemp "$TMP/draft.XXXXXX")
  python3 - "$DRAFT" "$out" "$(capture)" <<'PY'
import json,re,sys
s=open(sys.argv[1]).read(); d=json.loads(sys.argv[3])
for key,val in {'relation_oid':d['table']['catalog_oid'],'acl':d['acl']['md5'],'columns':d['columns']['md5'],'triggers':d['triggers_and_helpers']['md5'],'policies':d['policies']['md5'],'fks':d['foreign_keys']['md5']}.items():
 p=r'v_'+key+r" constant (?:oid|text) := (?:\d+|'[0-9a-f]+')"
 s,n=re.subn(p,lambda m: f"v_{key} constant oid := {val}" if key=='relation_oid' else f"v_{key} constant text := '{val}'",s)
 assert n == 2, (key,n)
open(sys.argv[2],'w').write(s)
PY
  printf '%s' "$out"
}
split_draft(){
  local draft=$1 out_dir=$2
  "$AIDREAM_PY" - "$draft" "$out_dir" <<'PY'
import pathlib,sys
sys.path.insert(0, str(pathlib.Path(sys.argv[1]).resolve().parents[3] / 'aidream'))
from db.apply_migrations import split_sql_statements
parts=split_sql_statements(pathlib.Path(sys.argv[1]).read_text())
assert len(parts) == 6, len(parts)
for number,statement in enumerate(parts, 1): pathlib.Path(sys.argv[2], f'{number:02d}.sql').write_text(statement + '\n')
PY
}
# A fresh psql client executes each exact canonical-runner statement, modeling
# transaction-pool routing: session GUC state cannot cross these boundaries.
run_split(){
  local draft=$1 first=${2:-1} last=${3:-6} work="$TMP/split-${RANDOM}-${RANDOM}"
  mkdir "$work"; split_draft "$draft" "$work"
  local number path status=0
  for number in $(seq "$first" "$last"); do
    path=$(printf '%s/%02d.sql' "$work" "$number")
    "${P[@]}" < "$path" || { status=$?; break; }
  done
  rm -rf "$work"
  return "$status"
}
run_one_with_hostile_search_path(){
  local draft=$1 number=$2 work="$TMP/search-path-${RANDOM}-${RANDOM}"
  mkdir "$work"; split_draft "$draft" "$work"
  # The draft itself must reset this before deparsing helper definitions; the
  # caller's default path is deliberately hostile to the capture's empty path.
  { echo 'SET search_path TO workbench;'; cat "$(printf '%s/%02d.sql' "$work" "$number")"; } | "${P[@]}"
  rm -rf "$work"
}
must_fail(){ local expected=$1; shift; if "$@" > "$TMP/failure.out" 2>&1; then echo "expected failure" >&2; exit 1; fi; rg -q "$expected" "$TMP/failure.out"; }
postflight_rejects(){
  local name=$1 mutation=$2 expected=$3 draft
  seed; draft=$(fixture); run_split "$draft" 1 5 >/dev/null
  "${P[@]}" -c "$mutation" >/dev/null
  must_fail "$expected" run_split "$draft" 6 6
  printf 'PASS postflight mutation: %s\n' "$name"
}

# The real splitter yields two SETs, preflight, two concurrent builds, postflight;
# every one runs on a separate PG17 client session.
seed; happy=$(fixture)
run_split "$happy" >/dev/null
run_split "$happy" >/dev/null
python3 - "$(capture)" <<'PY'
import json,sys
x={i['name']:i for i in json.loads(sys.argv[1])['indexes']}
for n in ('note_folders_created_by_name_unique','note_folders_organization_created_by_name_unique','note_folders_id_organization_unique'): assert x[n]['unique'] and x[n]['valid'] and x[n]['ready']
PY

# Both fingerprinting DO blocks must be invariant to a client path that differs
# from the capture's empty search_path. The statements reset it transaction-locally.
seed; hostile_path=$(fixture)
run_one_with_hostile_search_path "$hostile_path" 3 >/dev/null
run_split "$hostile_path" 4 5 >/dev/null
run_one_with_hostile_search_path "$hostile_path" 6 >/dev/null

seed; wrong=$(fixture)
"${P[@]}" -c 'CREATE UNIQUE INDEX note_folders_organization_created_by_name_unique ON workbench.note_folders(created_by,organization_id,name)' >/dev/null
must_fail 'N01 precondition failed' run_split "$wrong"
seed; invalid=$(fixture)
"${P[@]}" -c 'CREATE UNIQUE INDEX note_folders_organization_created_by_name_unique ON workbench.note_folders(organization_id,created_by,name)' >/dev/null
"${P[@]}" -c 'UPDATE pg_index SET indisvalid=false WHERE indexrelid=$$workbench.note_folders_organization_created_by_name_unique$$::regclass' >/dev/null
must_fail 'N01 precondition failed' run_split "$invalid"

seed; partial=$(fixture)
"${P[@]}" -c 'CREATE UNIQUE INDEX CONCURRENTLY note_folders_organization_created_by_name_unique ON workbench.note_folders(organization_id,created_by,name)' >/dev/null
run_split "$partial" >/dev/null

# Mutate after actual preflight and both actual concurrent statements. The isolated
# postflight must recheck every frozen canonical invariant directly.
postflight_rejects owner "CREATE ROLE n01_owner; ALTER TABLE workbench.note_folders OWNER TO n01_owner" 'N01 postflight failed: owner or RLS changed'
postflight_rejects rls "ALTER TABLE workbench.note_folders DISABLE ROW LEVEL SECURITY" 'N01 postflight failed: owner or RLS changed'
postflight_rejects columns "ALTER TABLE workbench.note_folders ALTER COLUMN name DROP NOT NULL" 'N01 postflight failed: identity columns changed'
postflight_rejects acl "GRANT INSERT ON workbench.note_folders TO n01_reader" 'N01 postflight failed: ACL changed'
postflight_rejects helpers "ALTER FUNCTION workbench.n01_touch() SET work_mem = '64kB'" 'N01 postflight failed: trigger/helper state changed'
postflight_rejects policies "DROP POLICY n01_select ON workbench.note_folders; CREATE POLICY n01_select ON workbench.note_folders FOR SELECT TO n01_reader USING (false)" 'N01 postflight failed: policy state changed'
postflight_rejects fks "ALTER TABLE workbench.notes DROP CONSTRAINT notes_folder_id_fkey" 'N01 postflight failed: Notes/folder FK state changed'
postflight_rejects oldindex "UPDATE pg_index SET indisvalid=false WHERE indexrelid='workbench.note_folders_created_by_name_unique'::regclass" 'N01 postflight failed: exact valid-ready index is absent'

! rg -q 'DROP INDEX|ALTER TABLE|INSERT INTO|UPDATE |DELETE ' "$DRAFT"
echo 'PASS N01 PostgreSQL 17 split-session draft: happy/rerun/partial retry; wrong/invalid indexes and postflight invariant matrix fail closed'
