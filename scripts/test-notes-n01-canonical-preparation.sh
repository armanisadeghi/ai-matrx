#!/usr/bin/env bash
# PostgreSQL 17 throwaway proof for the N01 capture contract.  No live database.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CAPTURE="$ROOT/scripts/notes-n01-canonical-preflight-capture.sql"
DRAFT="$ROOT/scripts/migration-drafts/notes_n01_note_folders_org_identity_indexes.sql"
CID="notes-n01-pg17-${RANDOM}-${RANDOM}"
cleanup(){ docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$CID" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null
for _ in $(seq 1 30); do docker exec "$CID" psql -U postgres -d postgres -Atc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
P=(docker exec -i "$CID" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -At)
[[ $("${P[@]}" -c 'show server_version_num') == 17* ]]
"${P[@]}" <<'SQL' >/dev/null
CREATE EXTENSION pgcrypto;
CREATE SCHEMA workbench;
CREATE ROLE n01_reader;
CREATE TABLE workbench.note_folders (id uuid primary key default gen_random_uuid(), organization_id uuid not null, created_by uuid not null, name text not null, parent_id uuid);
CREATE TABLE workbench.notes (id uuid primary key default gen_random_uuid(), organization_id uuid not null, folder_id uuid);
CREATE UNIQUE INDEX note_folders_created_by_name_unique ON workbench.note_folders(created_by,name);
ALTER TABLE workbench.note_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY n01_select ON workbench.note_folders FOR SELECT TO n01_reader USING (true);
CREATE FUNCTION workbench.n01_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER n01_touch BEFORE INSERT ON workbench.note_folders FOR EACH ROW EXECUTE FUNCTION workbench.n01_touch();
GRANT SELECT ON workbench.note_folders TO n01_reader;
SQL
capture(){ { echo 'BEGIN TRANSACTION READ ONLY;'; sed '/^BEGIN TRANSACTION READ ONLY;/d;/^ROLLBACK;/d'; echo 'ROLLBACK;'; } < "$CAPTURE" | "${P[@]}" | rg '^\{'; }
baseline=$(capture)
python3 - "$baseline" <<'PY'
import json,sys
d=json.loads(sys.argv[1]); assert d['contract']['search_path'] == '' and d['contract']['transaction_read_only']; assert len(d['indexes']) == 1
PY
# Recreating a policy/function changes catalog OIDs but preserves canonical semantic hashes.
"${P[@]}" <<'SQL' >/dev/null
DROP TRIGGER n01_touch ON workbench.note_folders; DROP FUNCTION workbench.n01_touch();
CREATE FUNCTION workbench.n01_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER n01_touch BEFORE INSERT ON workbench.note_folders FOR EACH ROW EXECUTE FUNCTION workbench.n01_touch();
DROP POLICY n01_select ON workbench.note_folders; CREATE POLICY n01_select ON workbench.note_folders FOR SELECT TO n01_reader USING (true);
SQL
equivalent=$(capture)
python3 - "$baseline" "$equivalent" <<'PY'
import json,sys
a,b=map(json.loads,sys.argv[1:]);
for k in ('acl','policies','triggers_and_helpers'): assert a[k]['md5']==b[k]['md5'], k
assert a['table']['catalog_oid']==b['table']['catalog_oid']
PY
# Each semantic deviation must turn the corresponding capture hash red.
"${P[@]}" -c 'GRANT INSERT ON workbench.note_folders TO n01_reader' >/dev/null
acl_red=$(capture)
"${P[@]}" -c 'REVOKE INSERT ON workbench.note_folders FROM n01_reader; ALTER FUNCTION workbench.n01_touch() SET statement_timeout TO 1' >/dev/null
helper_red=$(capture)
"${P[@]}" -c 'ALTER FUNCTION workbench.n01_touch() RESET statement_timeout; DROP POLICY n01_select ON workbench.note_folders; CREATE POLICY n01_select ON workbench.note_folders FOR SELECT TO n01_reader USING (false)' >/dev/null
policy_red=$(capture)
"${P[@]}" -c 'CREATE UNIQUE INDEX note_folders_organization_created_by_name_unique ON workbench.note_folders(organization_id,created_by,name)' >/dev/null
index_red=$(capture)
python3 - "$baseline" "$acl_red" "$helper_red" "$policy_red" "$index_red" <<'PY'
import json,sys
a,acl,helper,policy,index=map(json.loads,sys.argv[1:])
assert a['acl']['md5'] != acl['acl']['md5']
assert a['triggers_and_helpers']['md5'] != helper['triggers_and_helpers']['md5']
assert a['policies']['md5'] != policy['policies']['md5']
assert len(index['indexes']) == 2 and any(i['name']=='note_folders_organization_created_by_name_unique' and i['valid'] and i['ready'] for i in index['indexes'])
PY
rg -q 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS note_folders_organization_created_by_name_unique' "$DRAFT"
rg -q 'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS note_folders_id_organization_unique' "$DRAFT"
! rg -q 'DROP INDEX|ALTER TABLE|INSERT INTO|UPDATE |DELETE ' "$DRAFT"
echo 'PASS N01 PostgreSQL 17 canonical capture: equivalent recreation stable; ACL/helper/policy/index deviations red'
