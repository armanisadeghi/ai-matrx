#!/usr/bin/env bash
# PostgreSQL 17 throwaway proof. Never contacts a live database.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CAPTURE="$ROOT/scripts/notes-n01-canonical-preflight-capture.sql"
DRAFT="$ROOT/scripts/migration-drafts/notes_n01_note_folders_org_identity_indexes.sql"
CID="notes-n01-pg17-${RANDOM}-${RANDOM}"
cleanup(){ docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$CID" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null
for _ in $(seq 1 30); do docker exec "$CID" psql -U postgres -d postgres -Atc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
P=(docker exec -i "$CID" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1)
[[ $("${P[@]}" -Atc 'show server_version_num') == 17* ]]
seed(){
  "${P[@]}" <<'SQL' >/dev/null
DROP SCHEMA IF EXISTS workbench CASCADE;
DROP ROLE IF EXISTS n01_reader;
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
  local out; out=$(mktemp /tmp/n01-draft.XXXXXX)
  python3 - "$DRAFT" "$out" "$(capture)" <<'PY'
import json,re,sys
s=open(sys.argv[1]).read(); d=json.loads(sys.argv[3])
for key,val in {'relation_oid':d['table']['catalog_oid'],'acl':d['acl']['md5'],'columns':d['columns']['md5'],'triggers':d['triggers_and_helpers']['md5'],'policies':d['policies']['md5'],'fks':d['foreign_keys']['md5']}.items():
 p=r'v_'+key+r" constant (?:oid|text) := (?:\d+|'[0-9a-f]+')"
 s,n=re.subn(p,lambda m: f"v_{key} constant oid := {val}" if key=='relation_oid' else f"v_{key} constant text := '{val}'",s)
 assert n
open(sys.argv[2],'w').write(s)
PY
  printf '%s' "$out"
}
must_fail(){ if "$@" > /tmp/n01-failure.out 2>&1; then echo "expected failure" >&2; exit 1; fi; rg -q 'N01 precondition failed' /tmp/n01-failure.out; }
run_draft(){ "${P[@]}" < "$1"; }

# Actual draft happy path and idempotent rerun, with a fixture-derived baseline.
seed; happy=$(fixture)
run_draft "$happy" >/dev/null
run_draft "$happy" >/dev/null
python3 - "$(capture)" <<'PY'
import json,sys
x={i['name']:i for i in json.loads(sys.argv[1])['indexes']}
for n in ('note_folders_created_by_name_unique','note_folders_organization_created_by_name_unique','note_folders_id_organization_unique'): assert x[n]['unique'] and x[n]['valid'] and x[n]['ready']
PY
# Wrong and invalid named indexes fail before CREATE IF NOT EXISTS can mask them.
seed; drift=$(fixture)
"${P[@]}" -c 'DROP POLICY n01_select ON workbench.note_folders; CREATE POLICY n01_select ON workbench.note_folders FOR SELECT TO n01_reader USING (false)' >/dev/null
must_fail run_draft "$drift"
seed; wrong=$(fixture)
"${P[@]}" -c 'CREATE UNIQUE INDEX note_folders_organization_created_by_name_unique ON workbench.note_folders(created_by,organization_id,name)' >/dev/null
must_fail run_draft "$wrong"
seed; invalid=$(fixture)
"${P[@]}" -c 'CREATE UNIQUE INDEX note_folders_organization_created_by_name_unique ON workbench.note_folders(organization_id,created_by,name)' >/dev/null
"${P[@]}" -c 'UPDATE pg_index SET indisvalid=false WHERE indexrelid=$$workbench.note_folders_organization_created_by_name_unique$$::regclass' >/dev/null
must_fail run_draft "$invalid"
# A partial autocommit run has one exact valid-ready index; actual draft rerun completes it.
seed; partial=$(fixture)
"${P[@]}" -c 'CREATE UNIQUE INDEX CONCURRENTLY note_folders_organization_created_by_name_unique ON workbench.note_folders(organization_id,created_by,name)' >/dev/null
run_draft "$partial" >/dev/null
! rg -q 'DROP INDEX|ALTER TABLE|INSERT INTO|UPDATE |DELETE ' "$DRAFT"
echo 'PASS N01 PostgreSQL 17 actual draft: happy/rerun/partial retry; malformed and invalid indexes fail closed'
