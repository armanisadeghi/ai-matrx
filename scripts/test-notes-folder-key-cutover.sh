#!/usr/bin/env bash
# PostgreSQL 17 isolated proof for the Notes cross-organization folder-key cutover.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
STEP="$ROOT/migrations/inverse/chair_step_2026_09_18_note_folders_org_blind_name_key.sql"
CID="notes-folder-key-cutover-${RANDOM}-${RANDOM}"
cleanup() { docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$CID" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null
for _ in $(seq 1 30); do
  docker exec "$CID" psql -U postgres -d postgres -Atc 'select 1' >/dev/null 2>&1 && break
  sleep 1
done
P=(docker exec -i "$CID" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1)

"${P[@]}" <<'SQL' >/dev/null
CREATE SCHEMA workbench;
CREATE TABLE workbench.note_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL,
  name text NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX note_folders_created_by_name_unique
  ON workbench.note_folders (created_by, name);
CREATE FUNCTION workbench.note_folder_get_or_create(uuid, text)
RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
INSERT INTO workbench.note_folders (organization_id, created_by, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Draft');
SQL

if "${P[@]}" -c "INSERT INTO workbench.note_folders (organization_id, created_by, name) VALUES ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Draft')" >/dev/null 2>&1; then
  echo 'expected legacy org-blind key to reject cross-organization Draft' >&2
  exit 1
fi

{ echo 'BEGIN;'; cat "$STEP"; echo 'COMMIT;'; } | "${P[@]}" >/dev/null
"${P[@]}" <<'SQL' >/dev/null
INSERT INTO workbench.note_folders (organization_id, created_by, name)
VALUES ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Draft');
UPDATE workbench.note_folders SET deleted_at = now()
WHERE organization_id = '22222222-2222-4222-8222-222222222222';
INSERT INTO workbench.note_folders (organization_id, created_by, name)
VALUES ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Draft');
SQL

"${P[@]}" -Atc "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='workbench' AND c.relname='note_folders_created_by_name_unique') THEN 1 ELSE 0 END" | rg -qx '0'
"${P[@]}" -Atc "SELECT pg_get_expr(i.indpred, i.indrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='note_folders_organization_created_by_name_unique'" | rg -qi 'deleted_at is null'
echo 'PASS Notes folder cutover: legacy cross-org insert fails before; distinct-org and post-delete reuse pass after'
