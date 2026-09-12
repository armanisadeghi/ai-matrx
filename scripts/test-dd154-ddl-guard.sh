#!/usr/bin/env bash
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FIXTURE="$REPO/scripts/fixtures/dd154-preapply-catalog.json"
MIGRATION="$REPO/migrations/dd154_org_assignment_ddl_prevention.sql"
EXPECTED_MIGRATION_SHA256=01d4323bbf7442160a67abbf2a1fc0dde2bf6e5086295c0f6d0e4f0a56fead5d
GUIDANCE_DRAFT="$REPO/scripts/migration-drafts/dd155_org_assignment_guidance.sql"
MODE=${DD154_PG_MODE:-native}
PG_BIN=${DD154_PG_BIN:-}
RUN_DIR=$(mktemp -d /tmp/dd154-pg17-review.XXXXXX)
DATA_DIR="$RUN_DIR/data"
LOG="$RUN_DIR/postgres.log"
RESULTS="$RUN_DIR/results.txt"
CONTAINER=

fail() {
  echo "FAIL fixture: $*" | tee -a "$RESULTS"
  exit 1
}

run_file() {
  local file=$1
  shift
  "${PSQL[@]}" "$@" < "$file"
}

cleanup() {
  if [[ $MODE == native && -n $PG_BIN ]]; then
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m fast stop >/dev/null 2>&1 || true
  fi
  if [[ -n $CONTAINER ]]; then
    docker logs "$CONTAINER" >"$LOG" 2>&1 || true
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  cp "$RESULTS" /tmp/dd154-review-results.txt 2>/dev/null || true
  cp "$LOG" /tmp/dd154-review-postgres.log 2>/dev/null || true
  cp "$RUN_DIR/mapped.out" /tmp/dd154-review-mapped.out 2>/dev/null || true
  cp "$RUN_DIR/original.out" /tmp/dd154-review-original.out 2>/dev/null || true
  cp "$RUN_DIR/dd155.out" /tmp/dd154-review-dd155.out 2>/dev/null || true
  rm -rf "$RUN_DIR"
}
trap cleanup EXIT

[[ -f $FIXTURE ]] || fail "checked-in pre-apply catalog fixture is missing: $FIXTURE"
[[ -f $MIGRATION ]] || fail "applied DD154 migration is missing: $MIGRATION"
[[ -f $GUIDANCE_DRAFT ]] || fail "DD155 guidance draft is missing: $GUIDANCE_DRAFT"
[[ $(shasum -a 256 "$MIGRATION" | awk '{print $1}') == "$EXPECTED_MIGRATION_SHA256" ]] || fail "applied DD154 migration checksum does not match the immutable ledger subject"

case "$MODE" in
  native)
    [[ -n $PG_BIN ]] || fail "native mode requires DD154_PG_BIN pointing to PostgreSQL 17 binaries"
    for bin in initdb pg_ctl psql; do [[ -x "$PG_BIN/$bin" ]] || fail "native PostgreSQL binary missing: $PG_BIN/$bin"; done
    PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
    "$PG_BIN/initdb" -D "$DATA_DIR" -A trust --no-locale -E UTF8 >/dev/null
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$LOG" -o "-h 127.0.0.1 -p $PORT -F" start >/dev/null
    PSQL=("$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -d postgres -X -v ON_ERROR_STOP=1)
    ;;
  docker)
    command -v docker >/dev/null 2>&1 || fail "Docker mode requires docker"
    CONTAINER="dd154-pg17-${RANDOM}-${RANDOM}"
    docker run -d --name "$CONTAINER" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null || fail "could not start the isolated postgres:17 container"
    PSQL=(docker exec -i "$CONTAINER" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1)
    ready=false
    for _ in $(seq 1 30); do
      if "${PSQL[@]}" -Atc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
      sleep 1
    done
    [[ $ready == true ]] || fail "isolated postgres:17 container did not become ready within 30 seconds"
    ;;
  *) fail "DD154_PG_MODE must be native or docker, got: $MODE" ;;
esac

[[ $("${PSQL[@]}" -Atc 'SHOW server_version_num') == 17* ]] || fail "acceptance runtime is not PostgreSQL 17"

if [[ $("${PSQL[@]}" -Atc 'SHOW server_encoding') != UTF8 ]]; then
  echo 'FAIL fixture: PostgreSQL 17 acceptance cluster is not UTF8' | tee -a "$RESULTS"; exit 1
fi
echo 'PASS fixture: PostgreSQL 17 acceptance cluster uses UTF8' | tee -a "$RESULTS"

node - "$FIXTURE" <<'NODE' | "${PSQL[@]}" >/dev/null
const fs = require('fs');
const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const crypto = require('crypto');
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex');
if (fixture.fixture_version !== 1 || fixture.ddl_guard_definitions?.length !== 2 || fixture.assignment_functions?.length !== 8 || fixture.organization_column_defaults?.length !== 9) throw new Error('incomplete DD154 pre-apply catalog fixture');
if (fixture.provenance?.captured_from !== 'common-docs/projects/no-db-assigned-org/census/live-2026-09-12-owner.json' || !/^[0-9a-f]{64}$/.test(fixture.provenance?.source_sha256 ?? '') || fixture.provenance?.migration_sha256 !== '01d4323bbf7442160a67abbf2a1fc0dde2bf6e5086295c0f6d0e4f0a56fead5d') throw new Error('fixture provenance is incomplete or mismatched');
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');
for (const entry of [...fixture.ddl_guard_definitions, ...fixture.assignment_functions]) {
  if (!entry.schema || !entry.name || typeof entry.definition !== 'string' || md5(entry.definition) !== entry.definition_md5) throw new Error(`fixture function hash mismatch: ${entry.schema}.${entry.name}`);
}
for (const entry of fixture.organization_column_defaults) {
  if (!entry.schema || !entry.table || !/^\d+$/.test(entry.oid ?? '') || typeof entry.expression !== 'string' || md5(entry.expression) !== entry.expression_md5) throw new Error(`fixture default hash mismatch: ${entry.schema}.${entry.table}`);
}
console.error(`PASS fixture: pre-apply catalog fixture ${sha256} has 2 definitions, 8 assigners, and 9 defaults`);
const defs = fixture.ddl_guard_definitions;
const attachments = fixture.assignment_functions.map(x => x.definition);
const defaults = fixture.organization_column_defaults.map(x => {
  const expr = x.expression;
  return `CREATE TABLE ${x.schema}.${x.table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT ${expr});`;
}).join('\n');
process.stdout.write(`
CREATE EXTENSION pgcrypto;
CREATE ROLE fixture_guard_owner SUPERUSER;
CREATE ROLE fixture_function_owner SUPERUSER;
CREATE ROLE fixture_exec;
CREATE SCHEMA admin; CREATE SCHEMA context; CREATE SCHEMA education; CREATE SCHEMA platform;
CREATE SCHEMA seo; CREATE SCHEMA ops; CREATE SCHEMA plan; CREATE SCHEMA users; CREATE SCHEMA iam; CREATE SCHEMA auth;
CREATE TYPE platform.visibility AS ENUM ('private','organization','public');
CREATE TABLE iam.organizations(id uuid PRIMARY KEY);
INSERT INTO iam.organizations(id) VALUES
 ('39c38960-d30c-4840-b0c1-c9960de95582'),
 ('11111111-1111-1111-1111-111111111111'),
 ('22222222-2222-2222-2222-222222222222');
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE platform.categories(id uuid PRIMARY KEY);
CREATE TABLE platform.entity_types(
 token text PRIMARY KEY, schema_name text, table_name text, label text,
 is_versioned boolean, has_soft_delete boolean, is_component boolean, is_listed boolean,
 default_visibility platform.visibility, rls_variant text, table_ref regclass, is_active boolean
);
CREATE TABLE platform.entity_relationships(child_type text, parent_type text, fk_column text, kind text);
CREATE TABLE platform.ddl_guard_log(severity text, rule text, object_ref text, command_tag text, detail text);
CREATE FUNCTION public.current_personal_org_id() RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT '39c38960-d30c-4840-b0c1-c9960de95582'::uuid $$;
${defaults}
${attachments.join(';\n')};
CREATE FUNCTION public.preexisting_direct_assign() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.organization_id := gen_random_uuid(); RETURN NEW; END $$;
CREATE FUNCTION platform._stamp_actor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION platform._touch_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION platform._version_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION platform._metadata_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION platform.sync_association_gc_triggers(text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
CREATE FUNCTION iam.apply_rls(text,text,text,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
CREATE FUNCTION iam.verify_canonical(text,text,text) RETURNS TABLE(status text, check_name text, detail text) LANGUAGE sql AS $$ SELECT NULL::text,NULL::text,NULL::text WHERE false $$;
${defs.find(x => x.name === '_ddl_guard').definition};
${defs.find(x => x.name === 'create_entity_table').definition};
ALTER FUNCTION platform._ddl_guard() OWNER TO fixture_function_owner;
ALTER FUNCTION platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[]) OWNER TO fixture_function_owner;
REVOKE ALL ON FUNCTION platform._ddl_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform._ddl_guard() TO fixture_exec;
GRANT EXECUTE ON FUNCTION platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[]) TO fixture_exec;
CREATE EVENT TRIGGER ddl_guard ON ddl_command_end WHEN TAG IN ('CREATE TABLE','ALTER TABLE','CREATE FUNCTION') EXECUTE FUNCTION platform._ddl_guard();
ALTER EVENT TRIGGER ddl_guard OWNER TO fixture_guard_owner;
`);
NODE

"${PSQL[@]}" -AtF '|' -c "
SELECT n.nspname||'.'||c.relname, d.oid, md5(pg_get_expr(d.adbin,d.adrelid))
FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
WHERE a.attname='organization_id' ORDER BY 1" > "$RUN_DIR/defaults.tsv"

node - "$RUN_DIR/defaults.tsv" "$FIXTURE" <<'NODE'
const fs=require('fs');
const rows=fs.readFileSync(process.argv[2],'utf8').trim().split('\n').map(x=>x.split('|'));
const fixture=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const expected=new Map(fixture.organization_column_defaults.map(x => [`${x.schema}.${x.table}`, x.expression_md5]));
if(rows.length!==9) throw new Error(`fixture default count ${rows.length}`);
for(const [ref,oid,hash] of rows){if(expected.get(ref)!==hash) throw new Error(`hash mismatch ${ref}: ${hash}`)}
console.log('PASS fixture: 9 default expression hashes exactly match production freeze');
NODE

set +e
run_file "$MIGRATION" >"$RUN_DIR/original.out" 2>&1
ORIGINAL_RC=$?
set -e
if [[ $ORIGINAL_RC -eq 0 ]] || ! grep -q 'frozen organization-default debt changed (expected 9 exact attrdef rows, found 0)' "$RUN_DIR/original.out"; then
  echo 'FAIL red control: original migration did not refuse local OIDs as expected' | tee -a "$RESULTS"
  sed -n '1,120p' "$RUN_DIR/original.out" | tee -a "$RESULTS"
  exit 1
fi
echo 'PASS red control: original production-OID migration refused the local clone (found 0)' | tee -a "$RESULTS"

# Adversarial drift inserted after the captured nine: a true exact-debt precondition
# should refuse it. The current migration only counts matching rows.
"${PSQL[@]}" -c "CREATE TABLE public.preexisting_tenth_default (organization_id uuid NOT NULL DEFAULT public.current_personal_org_id())" >/dev/null
echo 'ATTACK setup: added a tenth pre-existing organization default after the nine-row capture' | tee -a "$RESULTS"

node - "$MIGRATION" "$RUN_DIR/defaults.tsv" "$RUN_DIR/mapped.sql" <<'NODE'
const fs=require('fs'),crypto=require('crypto');
const [src,mapfile,out]=process.argv.slice(2);
const old=new Map([
['admin.feature_docs','1702067'],['context.system_context_item','3421071'],['education.learn_doc','1700870'],
['platform.output_feedback','1700228'],['seo.keyword','1709788'],['seo.keyword_edge','1709833'],
['seo.keyword_market','1709854'],['seo.keyword_topic','1709882'],['seo.topic','1710180']]);
const rows=fs.readFileSync(mapfile,'utf8').trim().split('\n').map(x=>x.split('|'));
if(rows.length!==9) throw new Error('strict map count != 9');
let sql=fs.readFileSync(src,'utf8');
const original=sql;
const lexicalEmitterProbes = [
  "IF ascii(substr(v_function_source, v_scan_pos, 1)) = 92 THEN",
  "v_scan_pos + length(v_scan_dollar_delimiter) + v_scan_next_pos - 1 + length(v_scan_dollar_delimiter)",
  "array_append(v_scan_tokens, replace(substr(v_function_source, v_scan_pos + 1, v_scan_next_pos - v_scan_pos - 2), '\"\"', '\"'))",
  "PostgreSQL Unicode-escaped quoted identifiers are identifiers, not",
  "v_scan_decoded_identifier := v_scan_decoded_identifier || chr",
  "Comments and whitespace are interchangeable lexical separators",
  "FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS settings(v_setting)",
  "v_scan_next_codepoint NOT BETWEEN 56320 AND 57343",
];
for (const probe of lexicalEmitterProbes) {
  if (!original.includes(probe)) throw new Error(`missing DD154 lexer emitter probe: ${probe}`);
}
console.log(`PASS lexer emitter probes: ${lexicalEmitterProbes.length} corrected lexical semantics present`);
for(const [ref,oid] of rows){
  const from=`${old.get(ref)}::oid`, to=`${oid}::oid`;
  const count=sql.split(from).length-1;
  if(count!==2) throw new Error(`${ref} production OID occurrence count ${count}, expected 2`);
  sql=sql.split(from).join(to);
}
let reversed=sql;
for(const [ref,oid] of rows) reversed=reversed.split(`${oid}::oid`).join(`${old.get(ref)}::oid`);
if(reversed!==original) throw new Error('mapped migration changed bytes beyond nine OID constants');
const probeMarker='-- dd154 rollback-only live probes.';
if (original.split(probeMarker).length !== 2) throw new Error('applied migration must contain exactly one rollback-probe section');
const probeSql=original.slice(original.indexOf(probeMarker));
const invertedProbeSql=probeSql.replace(') <> 1 THEN', ') = 1 THEN');
if (invertedProbeSql === probeSql) throw new Error('rollback positive-probe inversion control was not generated');
fs.writeFileSync(out,sql);
fs.writeFileSync(`${out}.with-probes.sql`, sql);
fs.writeFileSync(`${out}.inverted-probes.sql`, invertedProbeSql);
console.log(`PASS harness transform: only 9 OID constants changed, each in exactly 2 sites; reverse SHA ${crypto.createHash('sha256').update(reversed).digest('hex')}`);
NODE

"${PSQL[@]}" -AtF '|' -c "
SELECT 'guard',r.rolname,p.prosecdef,coalesce(array_to_string(p.proconfig,','),''),coalesce(array_to_string(p.proacl::text[],','),'') FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='platform._ddl_guard()'::regprocedure
UNION ALL
SELECT 'provisioner',r.rolname,p.prosecdef,coalesce(array_to_string(p.proconfig,','),''),coalesce(array_to_string(p.proacl::text[],','),'') FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[])'::regprocedure
UNION ALL
SELECT 'event',r.rolname,false,e.evtenabled::text,array_to_string(e.evttags,',') FROM pg_event_trigger e JOIN pg_roles r ON r.oid=e.evtowner WHERE e.evtname='ddl_guard'" > "$RUN_DIR/before.tsv"

set +e
run_file "$RUN_DIR/mapped.sql" >"$RUN_DIR/mapped.out" 2>&1
MAPPED_RC=$?
set -e
if [[ $MAPPED_RC -eq 0 ]] || ! grep -q 'frozen organization-default debt changed (expected 9 exact attrdef rows, found 9)' "$RUN_DIR/mapped.out"; then
  echo 'FAIL freeze control: mapped migration accepted a tenth organization default' | tee -a "$RESULTS"; exit 1
fi
echo 'PASS freeze control: mapped migration refused the tenth organization default' | tee -a "$RESULTS"

"${PSQL[@]}" -c 'DROP TABLE public.preexisting_tenth_default' >/dev/null
run_file "$RUN_DIR/mapped.sql.with-probes.sql" --single-transaction >"$RUN_DIR/mapped.out" 2>&1
echo 'PASS execution: production-OID-only mapped migration and rollback probes ran in one transaction' | tee -a "$RESULTS"

if [[ $("${PSQL[@]}" -Atc "
  SELECT count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT LIKE 'pg_temp_%' AND c.relname LIKE 'dd154_probe_%'") != 0 ]] ||
   [[ $("${PSQL[@]}" -Atc "
  SELECT count(*)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT LIKE 'pg_temp_%' AND p.proname LIKE 'dd154_probe_%'") != 0 ]]; then
  echo 'FAIL rollback probes: persistent probe object survived' | tee -a "$RESULTS"; exit 1
fi
echo 'PASS rollback probes: no persistent probe relation or function remains after the appended transaction' | tee -a "$RESULTS"

set +e
run_file "$RUN_DIR/mapped.sql.inverted-probes.sql" >"$RUN_DIR/inverted-probes.out" 2>&1
INVERTED_PROBES_RC=$?
set -e
if [[ $INVERTED_PROBES_RC -eq 0 ]] || ! grep -q 'explicit writer was not persisted in its temporary relation' "$RUN_DIR/inverted-probes.out"; then
  echo 'FAIL rollback forcing control: inverted positive row-count assertion did not fail closed' | tee -a "$RESULTS"; exit 1
fi
echo 'PASS rollback forcing control: inverted positive row-count assertion escaped the unique rollback sentinel' | tee -a "$RESULTS"

"${PSQL[@]}" -AtF '|' -c "
SELECT 'guard',r.rolname,p.prosecdef,coalesce(array_to_string(p.proconfig,','),''),coalesce(array_to_string(p.proacl::text[],','),'') FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='platform._ddl_guard()'::regprocedure
UNION ALL
SELECT 'provisioner',r.rolname,p.prosecdef,coalesce(array_to_string(p.proconfig,','),''),coalesce(array_to_string(p.proacl::text[],','),'') FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[])'::regprocedure
UNION ALL
SELECT 'event',r.rolname,false,e.evtenabled::text,array_to_string(e.evttags,',') FROM pg_event_trigger e JOIN pg_roles r ON r.oid=e.evtowner WHERE e.evtname='ddl_guard'" > "$RUN_DIR/after.tsv"

if ! diff -u <(grep -v '^event|' "$RUN_DIR/before.tsv") <(grep -v '^event|' "$RUN_DIR/after.tsv") >> "$RESULTS"; then
  echo 'FAIL metadata: function owner/security/config/ACL changed' | tee -a "$RESULTS"; exit 1
fi
if ! grep -q '^event|fixture_guard_owner|f|O|CREATE TABLE,ALTER TABLE,CREATE FUNCTION,CREATE TRIGGER$' "$RUN_DIR/after.tsv"; then
  echo 'FAIL metadata: event binding not preserved/extended exactly' | tee -a "$RESULTS"; cat "$RUN_DIR/after.tsv" | tee -a "$RESULTS"; exit 1
fi
echo 'PASS metadata: both function owners/security/config/ACL preserved; event owner/enabled preserved and CREATE TRIGGER added' | tee -a "$RESULTS"

# DD155 is intentionally a separate prepared migration. It must run against the
# DD154 result, retain guard metadata, remove both stale recommendations, and
# leave the existing enforcement matrix below untouched.
"${PSQL[@]}" -AtF '|' -c "
SELECT r.rolname,p.prosecdef,coalesce(array_to_string(p.proconfig,','),''),coalesce(array_to_string(p.proacl::text[],','),'')
FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
WHERE p.oid='platform._ddl_guard()'::regprocedure" > "$RUN_DIR/dd155-before.tsv"
"${PSQL[@]}" -Atc "SELECT encode(digest(convert_to(pg_get_functiondef('platform._ddl_guard()'::regprocedure), 'UTF8'), 'sha256'), 'hex')" > "$RUN_DIR/dd155-fixture-source.sha256"
echo "DD155 fixture input source hash: $(cat "$RUN_DIR/dd155-fixture-source.sha256")" | tee -a "$RESULTS"
run_file "$GUIDANCE_DRAFT" >"$RUN_DIR/dd155.out" 2>&1
"${PSQL[@]}" -AtF '|' -c "
SELECT r.rolname,p.prosecdef,coalesce(array_to_string(p.proconfig,','),''),coalesce(array_to_string(p.proacl::text[],','),'')
FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
WHERE p.oid='platform._ddl_guard()'::regprocedure" > "$RUN_DIR/dd155-after.tsv"
if ! diff -u "$RUN_DIR/dd155-before.tsv" "$RUN_DIR/dd155-after.tsv" >> "$RESULTS"; then
  echo 'FAIL DD155 metadata: ddl_guard owner/security/config/ACL changed' | tee -a "$RESULTS"; exit 1
fi

"${PSQL[@]}" <<'SQL' | tee -a "$RESULTS"
DO $dd155_hint$
DECLARE
  v_hint text;
  v_old_hint constant text := $old_hint$NO NULL ORG (owner ruling 2026-08-21, db-rules §2/§6e). NULL is not a scope: system/global content belongs to the system org (matrx-system, 39c38960-d30c-4840-b0c1-c9960de95582, iam.system_orgs.global_readable), and user content falls back to the creator's personal org. Declare organization_id uuid NOT NULL REFERENCES iam.organizations(id) and attach the backstop (public._stamp_org_default or platform.inherit_org_from_parent) in this same migration.$old_hint$;
  v_new_hint constant text := $new_hint$Declare organization_id uuid NOT NULL REFERENCES iam.organizations(id). The initiating operation must provide its organization_id explicitly; no resolver, default, trigger, backstop, or assignment may choose it.$new_hint$;
BEGIN
  BEGIN
    CREATE TABLE public.dd155_null_at_birth (
      organization_id uuid,
      created_by uuid,
      created_at timestamptz,
      updated_at timestamptz
    );
    RAISE EXCEPTION 'DD155 hint probe unexpectedly allowed nullable organization_id at birth';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF v_hint IS DISTINCT FROM v_new_hint OR position(v_old_hint IN coalesce(v_hint, '')) > 0 THEN
      RAISE EXCEPTION 'DD155 hint retained stale guidance: %', v_hint;
    END IF;
  END;
END
$dd155_hint$;

CREATE TABLE public.dd155_nullable_log_probe (
  organization_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
);
ALTER TABLE public.dd155_nullable_log_probe ALTER COLUMN organization_id DROP NOT NULL;
DO $dd155_log$
DECLARE
  v_detail text;
  v_old_detail constant text := $old_detail$NO NULL ORG (owner ruling 2026-08-21): this entity-looking table still allows organization_id IS NULL. NULL is not a scope -- system/global content belongs to the system org (matrx-system 39c38960-d30c-4840-b0c1-c9960de95582), user content to the creator's personal org. Flip it NOT NULL and attach the backstop in ONE migration. (db-rules §2/§6e.)$old_detail$;
  v_new_detail constant text := $new_detail$NO NULL ORG (owner ruling 2026-08-21): this entity-looking table still allows organization_id IS NULL. Declare organization_id NOT NULL. The initiating operation must provide its organization_id explicitly; no resolver, default, trigger, backstop, or assignment may choose it. (db-rules §2/§6e.)$new_detail$;
BEGIN
  SELECT detail INTO v_detail
  FROM platform.ddl_guard_log
  WHERE rule = 'nullable_org' AND object_ref = 'public.dd155_nullable_log_probe'
  ORDER BY ctid DESC LIMIT 1;
  IF v_detail IS DISTINCT FROM v_new_detail OR position(v_old_detail IN coalesce(v_detail, '')) > 0 THEN
    RAISE EXCEPTION 'DD155 nullable_org log retained stale guidance: %', v_detail;
  END IF;
END
$dd155_log$;
DROP TABLE public.dd155_nullable_log_probe;
SQL
echo 'PASS DD155 guidance: stale NULL-at-birth hint and nullable_org detail fail exact assertions; repaired initiating-operation guidance passes' | tee -a "$RESULTS"

"${PSQL[@]}" <<'SQL' | tee -a "$RESULTS"
CREATE TEMP TABLE review_results(label text PRIMARY KEY, expected text NOT NULL, observed text NOT NULL, pass boolean NOT NULL);
CREATE TEMP TABLE expected_cases(label text PRIMARY KEY, expected text NOT NULL);
INSERT INTO expected_cases(label, expected) VALUES
  ('known named assignment attachment','REJECT'),
  ('pre-existing direct assigner attachment','REJECT'),
  ('renamed existing known function attachment','REJECT'),
  ('direct := assignment','REJECT'),
  ('direct = assignment','REJECT'),
  ('quoted direct assignment','REJECT'),
  ('comment-separated direct assignment','REJECT'),
  ('Unicode identifier default escape direct assignment','REJECT'),
  ('Unicode identifier 4-hex escape direct assignment','REJECT'),
  ('Unicode identifier 6-hex escape direct assignment','REJECT'),
  ('Unicode identifier custom escape direct assignment','REJECT'),
  ('Unicode identifier custom block-comment before UESCAPE','REJECT'),
  ('Unicode identifier custom nested-comment after UESCAPE','REJECT'),
  ('Unicode identifier custom line-comment after UESCAPE','REJECT'),
  ('Unicode identifier comment-separated direct assignment','REJECT'),
  ('Unicode identifier distinct quoted field','ALLOW'),
  ('Unicode surrogate-pair distinct quoted field','ALLOW'),
  ('single-quoted assignment text','ALLOW'),
  ('dollar-quoted assignment text','ALLOW'),
  ('nested-comment assignment text','ALLOW'),
  ('assignment after dollar string','REJECT'),
  ('assignment after escape string','REJECT'),
  ('assignment after standard string backslash','REJECT'),
  ('function SET off assignment after escaped quote','REJECT'),
  ('function SET off escaped-quote literal','ALLOW'),
  ('function SET on assignment after standard backslash','REJECT'),
  ('function SET on standard-backslash literal','ALLOW'),
  ('assignment after Unicode string literal','REJECT'),
  ('assignment after line comment','REJECT'),
  ('assignment to distinct quoted field','ALLOW'),
  ('validation equality comparison','ALLOW'),
  ('validation function','ALLOW'),
  ('validation with explanatory assignment comment','ALLOW'),
  ('ALTER adds org default','REJECT'),
  ('CREATE TABLE with org default','REJECT'),
  ('unrelated frozen-table ALTER','ALLOW'),
  ('drop frozen default','ALLOW'),
  ('recreate frozen default','REJECT'),
  ('preserved RLS planner guard','REJECT'),
  ('provisioner true refuses before relation side effect','REJECT'),
  ('provisioner false creates explicit-writer table','ALLOW'),
  ('explicit organization insert','ALLOW'),
  ('attach validation trigger','ALLOW'),
  ('validation trigger explicit insert','ALLOW');
CREATE FUNCTION pg_temp.record_reject(label text, statement text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE rejected boolean := false;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN check_violation THEN rejected := true; END;
  INSERT INTO review_results VALUES(label,'REJECT',CASE WHEN rejected THEN 'REJECT' ELSE 'ALLOW' END,rejected);
END $f$;
CREATE FUNCTION pg_temp.record_allow(label text, statement text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE allowed boolean := true;
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN allowed := false; END;
  INSERT INTO review_results VALUES(label,'ALLOW',CASE WHEN allowed THEN 'ALLOW' ELSE 'REJECT' END,allowed);
END $f$;

CREATE TABLE public.dd154_probe (organization_id uuid NOT NULL);
SELECT pg_temp.record_reject('known named assignment attachment', 'CREATE TRIGGER t_known BEFORE INSERT ON public.dd154_probe FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default()');
SELECT pg_temp.record_reject('pre-existing direct assigner attachment', 'CREATE TRIGGER t_existing_direct BEFORE INSERT ON public.dd154_probe FOR EACH ROW EXECUTE FUNCTION public.preexisting_direct_assign()');

DO $f$ DECLARE rejected boolean:=false; BEGIN
  BEGIN
    ALTER FUNCTION public._stamp_org_default() RENAME TO renamed_stamp_org_default;
    EXECUTE 'CREATE TRIGGER t_renamed_known BEFORE INSERT ON public.dd154_probe FOR EACH ROW EXECUTE FUNCTION public.renamed_stamp_org_default()';
  EXCEPTION WHEN check_violation THEN rejected:=true;
  END;
  INSERT INTO review_results VALUES('renamed existing known function attachment','REJECT',CASE WHEN rejected THEN 'REJECT' ELSE 'ALLOW' END,rejected);
END $f$;

SELECT pg_temp.record_reject('direct := assignment', 'CREATE FUNCTION public.dd154_direct_colon() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.organization_id := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('direct = assignment', 'CREATE FUNCTION public.dd154_direct_equals() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.organization_id = gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('quoted direct assignment', 'CREATE FUNCTION public.dd154_direct_quoted() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW."organization_id" := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('comment-separated direct assignment', 'CREATE FUNCTION public.dd154_direct_comment_gap() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.organization_id /* gap */ := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('Unicode identifier default escape direct assignment', 'CREATE FUNCTION public.dd154_direct_unicode_default() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.U&"organization_id" := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('Unicode identifier 4-hex escape direct assignment', 'CREATE FUNCTION public.dd154_direct_unicode_4hex() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.U&"organizat\0069on_id" := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('Unicode identifier 6-hex escape direct assignment', 'CREATE FUNCTION public.dd154_direct_unicode_6hex() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.U&"organizat\+000069on_id" := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('Unicode identifier custom escape direct assignment', 'CREATE FUNCTION public.dd154_direct_unicode_custom() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.U&"organizat!0069on_id" UESCAPE ''!'' := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('Unicode identifier custom block-comment before UESCAPE', 'CREATE FUNCTION public.dd154_direct_unicode_custom_before_comment() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.U&"organizat!0069on_id" /* separator */ UESCAPE ''!'' := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('Unicode identifier custom nested-comment after UESCAPE', 'CREATE FUNCTION public.dd154_direct_unicode_custom_after_comment() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.U&"organizat!0069on_id" UESCAPE /* outer /* separator */ outer */ ''!'' := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_reject('Unicode identifier custom line-comment after UESCAPE', $case$CREATE FUNCTION public.dd154_direct_unicode_custom_line_comment() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.U&"organizat!0069on_id" UESCAPE -- separator
'!' := gen_random_uuid(); RETURN NEW; END $b$$case$);
SELECT pg_temp.record_reject('Unicode identifier comment-separated direct assignment', 'CREATE FUNCTION public.dd154_direct_unicode_comments() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW /* record */ . /* field */ U&"organizat\0069on_id" /* assignment */ := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_allow('Unicode identifier distinct quoted field', 'CREATE FUNCTION public.dd154_unicode_distinct_quoted() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.U&"organizat\0069on_Id" := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_allow('Unicode surrogate-pair distinct quoted field', 'CREATE FUNCTION public.dd154_unicode_surrogate_distinct() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW.U&"distinct_\D83D\DE00" := gen_random_uuid(); RETURN NEW; END $b$');
SELECT pg_temp.record_allow('single-quoted assignment text', 'CREATE FUNCTION public.dd154_single_quote_text() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN PERFORM ''NEW.organization_id := gen_random_uuid()''; RETURN NEW; END $b$');
SELECT pg_temp.record_allow('dollar-quoted assignment text', 'CREATE FUNCTION public.dd154_dollar_quote_text() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN PERFORM $q$NEW.organization_id := gen_random_uuid()$q$; RETURN NEW; END $b$');
SELECT pg_temp.record_allow('nested-comment assignment text', 'CREATE FUNCTION public.dd154_nested_comment_text() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN /* outer /* NEW.organization_id := gen_random_uuid() */ outer */ RETURN NEW; END $b$');
SELECT pg_temp.record_reject('assignment after dollar string', $case$CREATE FUNCTION public.dd154_after_dollar() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN PERFORM $q$ordinary text$q$; NEW.organization_id := gen_random_uuid(); RETURN NEW; END $b$$case$);
SELECT pg_temp.record_reject('assignment after escape string', $case$CREATE FUNCTION public.dd154_after_escape() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN PERFORM E'it\'s text'; NEW.organization_id := gen_random_uuid(); RETURN NEW; END $b$$case$);
SELECT pg_temp.record_reject('assignment after standard string backslash', $case$CREATE FUNCTION public.dd154_after_standard_backslash() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN PERFORM '\'; NEW.organization_id := gen_random_uuid(); RETURN NEW; END $b$$case$);
SELECT pg_temp.record_reject('function SET off assignment after escaped quote', $case$CREATE FUNCTION public.dd154_set_off_escape() RETURNS trigger LANGUAGE plpgsql SET standard_conforming_strings TO off AS $b$ BEGIN PERFORM 'it\'s'; NEW.organization_id := gen_random_uuid(); RETURN NEW; END $b$$case$);
SELECT pg_temp.record_allow('function SET off escaped-quote literal', $case$CREATE FUNCTION public.dd154_set_off_literal() RETURNS trigger LANGUAGE plpgsql SET standard_conforming_strings TO off AS $b$ BEGIN PERFORM 'it\'s'; RETURN NEW; END $b$$case$);
SET standard_conforming_strings = off;
SELECT pg_temp.record_reject('function SET on assignment after standard backslash', $case$CREATE FUNCTION public.dd154_set_on_standard() RETURNS trigger LANGUAGE plpgsql SET standard_conforming_strings TO on AS $b$ BEGIN PERFORM '\'; NEW.organization_id := gen_random_uuid(); RETURN NEW; END $b$$case$);
SELECT pg_temp.record_allow('function SET on standard-backslash literal', $case$CREATE FUNCTION public.dd154_set_on_literal() RETURNS trigger LANGUAGE plpgsql SET standard_conforming_strings TO on AS $b$ BEGIN PERFORM '\'; RETURN NEW; END $b$$case$);
SET standard_conforming_strings = on;
SELECT pg_temp.record_reject('assignment after Unicode string literal', $case$CREATE FUNCTION public.dd154_after_unicode_literal() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN PERFORM U&'ordinary \0069 text'; NEW.U&"organizat\0069on_id" := gen_random_uuid(); RETURN NEW; END $b$$case$);
SELECT pg_temp.record_reject('assignment after line comment', $case$CREATE FUNCTION public.dd154_after_line_comment() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN -- an ordinary comment
NEW.organization_id := gen_random_uuid(); RETURN NEW; END $b$$case$);
SELECT pg_temp.record_allow('assignment to distinct quoted field', $case$CREATE FUNCTION public.dd154_distinct_quoted() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN NEW."Organization_Id" := gen_random_uuid(); RETURN NEW; END $b$$case$);
SELECT pg_temp.record_allow('validation equality comparison', $case$CREATE FUNCTION public.dd154_validate_equality() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN IF NEW.organization_id = OLD.organization_id THEN RETURN NEW; END IF; RAISE EXCEPTION 'organization changed'; END $b$$case$);
SELECT pg_temp.record_allow('validation function', 'CREATE FUNCTION public.dd154_validate() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN IF NEW.organization_id IS NULL THEN RAISE EXCEPTION ''organization required''; END IF; RETURN NEW; END $b$');
SELECT pg_temp.record_allow('validation with explanatory assignment comment', 'CREATE FUNCTION public.dd154_validate_comment() RETURNS trigger LANGUAGE plpgsql AS $b$ BEGIN -- Never do NEW.organization_id := gen_random_uuid();
IF NEW.organization_id IS NULL THEN RAISE EXCEPTION ''organization required''; END IF; RETURN NEW; END $b$');
SELECT pg_temp.record_reject('ALTER adds org default', 'ALTER TABLE public.dd154_probe ALTER COLUMN organization_id SET DEFAULT public.current_personal_org_id()');
SELECT pg_temp.record_reject('CREATE TABLE with org default', 'CREATE TABLE public.dd154_default_birth (organization_id uuid NOT NULL DEFAULT public.current_personal_org_id())');
SELECT pg_temp.record_allow('unrelated frozen-table ALTER', 'ALTER TABLE platform.output_feedback ADD COLUMN unrelated integer');

DO $f$ DECLARE drop_ok boolean:=true; recreated_rejected boolean:=false; BEGIN
  BEGIN ALTER TABLE platform.output_feedback ALTER COLUMN organization_id DROP DEFAULT; EXCEPTION WHEN OTHERS THEN drop_ok:=false; END;
  BEGIN ALTER TABLE platform.output_feedback ALTER COLUMN organization_id SET DEFAULT current_personal_org_id(); EXCEPTION WHEN check_violation THEN recreated_rejected:=true; END;
  INSERT INTO review_results VALUES('drop frozen default','ALLOW',CASE WHEN drop_ok THEN 'ALLOW' ELSE 'REJECT' END,drop_ok);
  INSERT INTO review_results VALUES('recreate frozen default','REJECT',CASE WHEN recreated_rejected THEN 'REJECT' ELSE 'ALLOW' END,recreated_rejected);
END $f$;

SELECT pg_temp.record_reject('preserved RLS planner guard', 'CREATE FUNCTION iam.entity_read_expr() RETURNS text LANGUAGE plpgsql AS $b$ BEGIN PERFORM unnest(iam.accessible_entity_ids()); RETURN ''''; END $b$');

DO $f$ DECLARE refused boolean:=false; before_count bigint; after_count bigint; BEGIN
  SELECT count(*) INTO before_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='provisioner_true_probe';
  BEGIN PERFORM platform.create_entity_table('public','provisioner_true_probe','probe_true','Probe',ARRAY[]::text[],'entity',false,false,'none',false,false,true,false,NULL);
  EXCEPTION WHEN OTHERS THEN refused := SQLERRM LIKE '%p_org_default=true is forbidden%'; END;
  SELECT count(*) INTO after_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='provisioner_true_probe';
  INSERT INTO review_results VALUES('provisioner true refuses before relation side effect','REJECT',CASE WHEN refused AND before_count=after_count THEN 'REJECT/no relation' ELSE 'WRONG' END,refused AND before_count=after_count);
END $f$;

SELECT pg_temp.record_allow('provisioner false creates explicit-writer table', $$SELECT platform.create_entity_table('public','provisioner_false_probe','probe_false','Probe',ARRAY[]::text[],'entity',false,false,'none',false,false,false,false,NULL)$$);
SELECT pg_temp.record_allow('explicit organization insert', $$INSERT INTO public.provisioner_false_probe(organization_id) VALUES ('11111111-1111-1111-1111-111111111111')$$);
SELECT pg_temp.record_allow('attach validation trigger', 'CREATE TRIGGER t_validate BEFORE INSERT ON public.dd154_probe FOR EACH ROW EXECUTE FUNCTION public.dd154_validate()');
SELECT pg_temp.record_allow('validation trigger explicit insert', $$INSERT INTO public.dd154_probe(organization_id) VALUES ('22222222-2222-2222-2222-222222222222')$$);

TABLE review_results;
SELECT 'TOTAL',count(*)::text,'failures',count(*) FILTER (WHERE NOT pass)::text FROM review_results;
DO $verify$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM expected_cases e FULL JOIN review_results r USING (label)
       WHERE e.label IS NULL OR r.label IS NULL
          OR e.expected <> r.expected OR r.pass IS NOT TRUE
     ) THEN
    RAISE EXCEPTION 'DD154 executable matrix labels, expectations, or outcomes differ from the exact manifest';
  END IF;
END $verify$;

DO $forcing$
DECLARE
  v_duplicate_rejected boolean := false;
  v_missing_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO review_results VALUES ('direct := assignment','REJECT','REJECT',true);
  EXCEPTION WHEN unique_violation THEN
    v_duplicate_rejected := true;
  END;
  BEGIN
    DELETE FROM review_results WHERE label = 'direct = assignment';
    IF EXISTS (
      SELECT 1 FROM expected_cases e FULL JOIN review_results r USING (label)
      WHERE e.label IS NULL OR r.label IS NULL OR e.expected <> r.expected OR r.pass IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'DD154 expected manifest rejected a missing case' USING ERRCODE = 'PDD56';
    END IF;
  EXCEPTION WHEN SQLSTATE 'PDD56' THEN
    v_missing_rejected := true;
  END;
  IF NOT v_duplicate_rejected OR NOT v_missing_rejected THEN
    RAISE EXCEPTION 'DD154 matrix forcing controls did not reject duplicate or missing case IDs';
  END IF;
END $forcing$;
SQL

echo "ARTIFACT_RESULTS=/tmp/dd154-review-results.txt"
echo "ARTIFACT_LOG=/tmp/dd154-review-postgres.log"
