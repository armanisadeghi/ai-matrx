#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
base="$repo/scripts/test-dd154-ddl-guard.sh"
current="$repo/../common-docs/projects/no-db-assigned-org/census/guard-performance/live-guard.sql"
draft="$repo/scripts/migration-drafts/dd154_lexer_character_array.sql"
current_sha=02035098f9091d7ffae24bd7dfe150e098db3eb518f66fec6a0b94c4e3d7b3d0
draft_sha=2e07e76cd406e52a63727b2a035f094ae45ebc9d2adf377396d3aa53e0befad0
[[ $(shasum -a 256 "$current" | awk '{print $1}') == "$current_sha" ]] || { echo 'current guard file hash changed; refresh captured fixture'; exit 2; }
[[ $(shasum -a 256 "$draft" | awk '{print $1}') == "$draft_sha" ]] || { echo 'DD154 lexer draft hash changed; refresh captured fixture'; exit 2; }
work=$(mktemp -d /tmp/dd154-current-controls.XXXXXX)
trap 'rm -rf "$work"' EXIT
patched="$work/current-controls.sh"
python3 - "$base" "$patched" "$current" "$draft" "$current_sha" "$draft_sha" <<'PY'
import sys
source=open(sys.argv[1]).read()
source=source.replace('REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)', 'REPO=%r' % __import__('shlex').quote(__import__('pathlib').Path(sys.argv[1]).resolve().parent.parent.as_posix()), 1)
source=source.replace('EXCEPTION WHEN OTHERS THEN allowed := false; END;', "EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'CURRENT_CONTROL_ERROR state=% message=%', SQLSTATE, SQLERRM; allowed := false; END;", 1)
needle='"${PSQL[@]}" <<\'SQL\' | tee -a "$RESULTS"\nCREATE TEMP TABLE review_results'
inject=r'''CURRENT_GUARD=%r
CAPTURED_DRAFT=%r
CURRENT_GUARD_SHA=%r
DRAFT_SHA=%r
DRAFT=${DD154_CURRENT_DRAFT_OVERRIDE:-$CAPTURED_DRAFT}
DRAFT_SHA=${DD154_CURRENT_DRAFT_SHA:-$DRAFT_SHA}
[[ $(shasum -a 256 "$DRAFT" | awk '{print $1}') == "$DRAFT_SHA" ]] || fail "fixture draft hash mismatch: $DRAFT"
echo "PASS current source proof: live guard sha256=$CURRENT_GUARD_SHA; DD154 draft sha256=$DRAFT_SHA" | tee -a "$RESULTS"
"${PSQL[@]}" -AtF '|' -c "SELECT evtevent,evtenabled,array_to_string(evttags,',') FROM pg_event_trigger WHERE evtname='ddl_guard'" > "$RUN_DIR/ddl-guard-event.tsv"
[[ $(wc -l < "$RUN_DIR/ddl-guard-event.tsv" | tr -d ' ') == 1 ]] || fail 'fixture must have exactly one ddl_guard event before supported rebuild'
IFS='|' read -r event_kind event_enabled event_tags < "$RUN_DIR/ddl-guard-event.tsv"
[[ $event_kind == ddl_command_end && $event_enabled == O && $event_tags == 'CREATE TABLE,ALTER TABLE,CREATE FUNCTION,CREATE TRIGGER' ]] || fail 'fixture ddl_guard event metadata differs before supported rebuild'
"${PSQL[@]}" -c "DROP EVENT TRIGGER ddl_guard; DROP FUNCTION platform._ddl_guard()" >/dev/null
"${PSQL[@]}" -f "$CURRENT_GUARD" >/dev/null
"${PSQL[@]}" -c "ALTER FUNCTION platform._ddl_guard() OWNER TO fixture_function_owner; CREATE EVENT TRIGGER ddl_guard ON ddl_command_end WHEN TAG IN ('CREATE TABLE','ALTER TABLE','CREATE FUNCTION','CREATE TRIGGER') EXECUTE FUNCTION platform._ddl_guard(); ALTER EVENT TRIGGER ddl_guard OWNER TO fixture_guard_owner" >/dev/null
"${PSQL[@]}" -Atc "SELECT jsonb_build_object('proc',to_jsonb(p)-'prosrc'-'oid','event',to_jsonb(e)-'oid') FROM pg_proc p JOIN pg_event_trigger e ON e.evtname='ddl_guard' WHERE p.oid='platform._ddl_guard()'::regprocedure" > "$RUN_DIR/local-semantic.json"
node - "$DRAFT" "$RUN_DIR/local-semantic.json" "$RUN_DIR/mapped-draft.sql" <<'NODE'
const fs=require('fs'); const [draftPath,localPath,out]=process.argv.slice(2);
const draft=fs.readFileSync(draftPath,'utf8'); const local=JSON.parse(fs.readFileSync(localPath,'utf8'));
const matches=[...draft.matchAll(/v_expected_(meta|event) constant jsonb := '([^']+)'::jsonb;/g)];
if(matches.length!==2) throw new Error('expected exactly two production semantic JSON literals');
const production=Object.fromEntries(matches.map(m=>[m[1]==='meta'?'proc':'event',JSON.parse(m[2])]));
const mapKeys={proc:['pronamespace','proowner','prolang','prorettype'],event:['evtfoid','evtowner']};
for(const kind of ['proc','event']) { for(const [key,value] of Object.entries(production[kind])) if(!mapKeys[kind].includes(key)&&JSON.stringify(value)!==JSON.stringify(local[kind][key])) throw new Error(`fixture ${kind}.${key} differs outside explicit map: production=${JSON.stringify(value)} local=${JSON.stringify(local[kind][key])}`); }
for(const key of mapKeys.proc) if(local.proc[key]===undefined) throw new Error(`missing fixture proc ${key}`);
for(const key of mapKeys.event) if(local.event[key]===undefined) throw new Error(`missing fixture event ${key}`);
const mapped={proc:{...production.proc},event:{...production.event}}; for(const k of mapKeys.proc)mapped.proc[k]=local.proc[k]; for(const k of mapKeys.event)mapped.event[k]=local.event[k];
let output=draft; for(const m of matches){const kind=m[1]==='meta'?'proc':'event'; output=output.replace(m[2],JSON.stringify(mapped[kind]));}
let reversed=output; for(const m of matches){const kind=m[1]==='meta'?'proc':'event'; reversed=reversed.replace(JSON.stringify(mapped[kind]),m[2]);}
if(reversed!==draft) throw new Error('semantic fixture mapping changed draft bytes beyond two JSON literals'); fs.writeFileSync(out,output); console.log('PASS semantic fixture mapping: only 6 explicit production identifiers mapped');
NODE
DRAFT="$RUN_DIR/mapped-draft.sql"
DRAFT_SHA=$(shasum -a 256 "$DRAFT" | awk '{print $1}')
if [[ -n ${DD154_CURRENT_BEFORE_DRAFT_SQL:-} ]]; then
  [[ -f $DD154_CURRENT_BEFORE_DRAFT_SQL ]] || fail "DD154_CURRENT_BEFORE_DRAFT_SQL is not a file: $DD154_CURRENT_BEFORE_DRAFT_SQL"
  "${PSQL[@]}" -f "$DD154_CURRENT_BEFORE_DRAFT_SQL" >/dev/null
fi
if [[ ${DD154_CURRENT_SKIP_DRAFT:-0} != 1 ]]; then
  if [[ ${DD154_CURRENT_A_FIRST:-0} == 1 ]]; then
    { printf "BEGIN; SET statement_timeout TO 20000;\n"; cat "$DRAFT"; printf "\\! touch \"$RUN_DIR/a-first-ready\"\n\\! while [ ! -f \"$RUN_DIR/a-first-release\" ]; do sleep 0.02; done\nCOMMIT;\n"; } | "${PSQL[@]}" >"$RUN_DIR/a-first.out" 2>&1 &
    a_first_pid=$!
    for _ in $(seq 1 200); do [[ -f "$RUN_DIR/a-first-ready" ]] && break; sleep 0.02; done
    [[ -f "$RUN_DIR/a-first-ready" ]] || fail 'A-first exact mapped DO did not reach held postimage state'
    set +e
    "${PSQL[@]}" -v VERBOSITY=verbose -c "SET lock_timeout='2s'; ALTER FUNCTION platform._ddl_guard() COST 100" >"$RUN_DIR/a-first-b.out" 2>&1
    a_first_rc=$?
    set -e
    touch "$RUN_DIR/a-first-release"
    wait "$a_first_pid"
    [[ $a_first_rc -ne 0 ]] && grep -q '55P03' "$RUN_DIR/a-first-b.out" || fail 'A-first exact mapped DO did not block competing ALTER with 55P03'
    echo 'PASS A-first exact mapped DO: competing same-owner ALTER refused with 55P03' | tee -a "$RESULTS"
  elif [[ ${DD154_CURRENT_COMMITTED_B:-0} == 1 ]]; then
    # Commit a real supported CREATE OR REPLACE source change first.  The
    # definition header is taken from the fixture itself, so this preserves its
    # complete semantic pg_proc/event metadata while making the source unknown.
    "${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DO $b$
DECLARE d text; h text; s text;
BEGIN
  SELECT pg_get_functiondef('platform._ddl_guard()'::regprocedure), prosrc
    INTO STRICT d, s
    FROM pg_proc WHERE oid = 'platform._ddl_guard()'::regprocedure;
  h := split_part(d, '$function$', 1);
  EXECUTE h || '$function$' || s || E'\n-- committed-B competing source change' || '$function$';
END
$b$;
SQL
    "${PSQL[@]}" -Atc "SELECT jsonb_build_object('proc', to_jsonb(p), 'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_event_trigger e), '[]'::jsonb))::text FROM pg_proc p WHERE p.oid='platform._ddl_guard()'::regprocedure" >"$RUN_DIR/committed-b-before.json"
    "${PSQL[@]}" -Atc "SELECT prosrc LIKE '%%committed-B competing source change%%' FROM pg_proc WHERE oid='platform._ddl_guard()'::regprocedure" | grep -qx t || fail 'Committed-B source mutation was not installed'
    set +e
    { printf "SET statement_timeout TO 20000;\n"; cat "$DRAFT"; } | "${PSQL[@]}" -v VERBOSITY=verbose >"$RUN_DIR/committed-b-a.out" 2>&1
    committed_b_rc=$?
    set -e
    [[ $committed_b_rc -ne 0 ]] && grep -q 'unknown _ddl_guard source' "$RUN_DIR/committed-b-a.out" || {
      cat "$RUN_DIR/committed-b-a.out" >&2
      fail 'Committed-B exact mapped DO did not refuse the unknown source'
    }
    "${PSQL[@]}" -Atc "SELECT jsonb_build_object('proc', to_jsonb(p), 'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_event_trigger e), '[]'::jsonb))::text FROM pg_proc p WHERE p.oid='platform._ddl_guard()'::regprocedure" >"$RUN_DIR/committed-b-after.json"
    cmp -s "$RUN_DIR/committed-b-before.json" "$RUN_DIR/committed-b-after.json" || fail 'Committed-B function/event tuple changed after A refusal'
    echo 'PASS committed-B exact mapped DO: unknown source refused and full B function/event tuple remained byte-identical' | tee -a "$RESULTS"
    exit 0
  elif [[ ${DD154_CURRENT_B_FIRST:-0} == 1 ]]; then
    cat > "$RUN_DIR/b-first.sql" <<SQL
BEGIN;
ALTER FUNCTION platform._ddl_guard() COST 100;
DO \$b\$ DECLARE d text; h text; s text; BEGIN SELECT pg_get_functiondef('platform._ddl_guard()'::regprocedure),prosrc INTO d,s FROM pg_proc WHERE oid='platform._ddl_guard()'::regprocedure; h:=split_part(d,'\$function\$',1); EXECUTE h||'\$function\$'||s||E'\\n-- B-first competing source change'||'\$function\$'; END \$b\$;
\\! touch "$RUN_DIR/b-first-ready"
\\! while [ ! -f "$RUN_DIR/b-first-release" ]; do sleep 0.02; done
COMMIT;
\\! touch "$RUN_DIR/b-first-committed"
SQL
    PGAPPNAME=dd154_b_first_b "${PSQL[@]}" -f "$RUN_DIR/b-first.sql" >"$RUN_DIR/b-first.out" 2>&1 & b_first_pid=$!
    for _ in $(seq 1 240); do [[ -f "$RUN_DIR/b-first-ready" ]] && break; sleep 0.05; done
    [[ -f "$RUN_DIR/b-first-ready" ]] || fail 'B-first did not acquire owner-DDL lock'
    # Keep the observer connected before A begins.  This avoids spending A's
    # intentional 2s lock budget on connection setup after it has reached ALTER.
    cat > "$RUN_DIR/b-first-observer.sql" <<SQL
\\! touch "$RUN_DIR/b-first-observer-ready"
\\! while [ ! -f "$RUN_DIR/b-first-observer-start" ]; do sleep 0.01; done
DO \$wait\$
DECLARE
  i integer;
  waiting boolean;
BEGIN
  FOR i IN 1..300 LOOP
    PERFORM pg_stat_clear_snapshot();
    SELECT EXISTS (
      SELECT 1
      FROM pg_stat_activity AS a
      JOIN pg_stat_activity AS b
       ON b.datname = a.datname
       AND b.application_name = 'dd154_b_first_b'
       AND b.pid <> a.pid
       AND b.pid = ANY(pg_blocking_pids(a.pid))
      WHERE a.datname = current_database()
        AND a.application_name = 'dd154_b_first_a'
        AND a.wait_event_type = 'Lock'
    ) INTO waiting;
    IF waiting THEN
      RAISE NOTICE 'DD154 B-first observed named A lock wait';
      RETURN;
    END IF;
    PERFORM pg_sleep(0.005);
  END LOOP;
  RAISE EXCEPTION 'DD154 B-first did not observe named A lock wait';
END
\$wait\$;
SQL
    PGAPPNAME=dd154_b_first_observer "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$RUN_DIR/b-first-observer.sql" >"$RUN_DIR/b-first-observer.out" 2>&1 &
    b_first_observer_pid=$!
    for _ in $(seq 1 100); do [[ -f "$RUN_DIR/b-first-observer-ready" ]] && break; sleep 0.01; done
    [[ -f "$RUN_DIR/b-first-observer-ready" ]] || fail 'B-first observer did not establish its database session'
    b_first_started_ns=$(date +%%s%%N)
    { printf "SET statement_timeout TO 20000;\n"; cat "$DRAFT"; } | PGAPPNAME=dd154_b_first_a "${PSQL[@]}" -v VERBOSITY=verbose >"$RUN_DIR/b-first-a.out" 2>&1 &
    b_first_a_pid=$!
    touch "$RUN_DIR/b-first-observer-start"
    set +e
    wait "$b_first_observer_pid"
    b_first_wait_rc=$?
    set -e
    [[ $b_first_wait_rc -eq 0 ]] && grep -q 'DD154 B-first observed named A lock wait' "$RUN_DIR/b-first-observer.out" || fail 'B-first did not observe A waiting on guard tuple lock'
    b_first_observed_ns=$(date +%%s%%N)
    echo "B-first named lock wait observed after $(( (b_first_observed_ns - b_first_started_ns) / 1000000 ))ms" | tee -a "$RESULTS"
    touch "$RUN_DIR/b-first-release"
    wait "$b_first_pid"
    [[ -f "$RUN_DIR/b-first-committed" ]] || fail 'B-first did not confirm competing transaction commit'
    set +e
    wait "$b_first_a_pid"; b_first_rc=$?
    set -e
    b_first_marker=$("${PSQL[@]}" -Atc "SELECT prosrc LIKE '%%B-first competing source change%%' FROM pg_proc WHERE oid='platform._ddl_guard()'::regprocedure")
    if [[ $b_first_rc -eq 0 ]] || ! grep -Eq 'tuple concurrently updated|changed while waiting for owner-DDL lock' "$RUN_DIR/b-first-a.out"; then
      echo "B-first competing source marker after B commit: $b_first_marker" >&2
      cat "$RUN_DIR/b-first.out" "$RUN_DIR/b-first-observer.out" "$RUN_DIR/b-first-a.out" >&2
      fail 'B-first exact mapped DO did not refuse competing source change'
    fi
    [[ $b_first_marker == t ]] || fail 'B-first competing source change was not preserved'
    echo 'PASS B-first exact mapped DO: competing source change was preserved and A refused after tuple lock' | tee -a "$RESULTS"
    exit 0
  else
    { printf "SET statement_timeout TO 20000;\n"; cat "$DRAFT"; } | "${PSQL[@]}" >/dev/null
  fi
  if [[ ${DD154_CURRENT_REPEAT_DRAFT:-0} == 1 ]]; then
    before_repeat=$("${PSQL[@]}" -Atc "SELECT md5((to_jsonb(p) - 'prosrc')::text || coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid)::text FROM pg_event_trigger e), '[]')) FROM pg_proc p WHERE p.oid='platform._ddl_guard()'::regprocedure")
    { printf "SET statement_timeout TO 20000;\n"; cat "$DRAFT"; } | "${PSQL[@]}" >/dev/null
    after_repeat=$("${PSQL[@]}" -Atc "SELECT md5((to_jsonb(p) - 'prosrc')::text || coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid)::text FROM pg_event_trigger e), '[]')) FROM pg_proc p WHERE p.oid='platform._ddl_guard()'::regprocedure")
    [[ $before_repeat == "$after_repeat" ]] || fail "repeated optimized draft changed _ddl_guard or event-trigger metadata"
    echo "PASS current idempotence: repeated optimized draft preserved function/event metadata md5=$after_repeat" | tee -a "$RESULTS"
  fi
  EXPECTED_POSTIMAGE_PROSRC_SHA=5a7457cbdc7aae16cbc720aeeaecfa038c999b67e4a5f5c0e09ad0d1c8a60e4d
  POSTIMAGE_MODE=optimized
else
  EXPECTED_POSTIMAGE_PROSRC_SHA=db595feedc5bcc3840345e16fb982c6bcebaa91a9c5b997140d69ed9106dd3a6
  POSTIMAGE_MODE=baseline
fi
POSTIMAGE_PROSRC_SHA=$("${PSQL[@]}" -Atc "SELECT encode(digest(convert_to(prosrc, 'UTF8'), 'sha256'), 'hex') FROM pg_proc WHERE oid='platform._ddl_guard()'::regprocedure")
[[ $POSTIMAGE_PROSRC_SHA == "$EXPECTED_POSTIMAGE_PROSRC_SHA" ]] || fail "current guard $POSTIMAGE_MODE postimage source hash mismatch: $POSTIMAGE_PROSRC_SHA"
echo "PASS current postimage proof: mode=$POSTIMAGE_MODE prosrc sha256=$POSTIMAGE_PROSRC_SHA" | tee -a "$RESULTS"
"${PSQL[@]}" -Atc "SELECT pg_get_functiondef('platform._ddl_guard()'::regprocedure)" > "$RUN_DIR/current-guard-postimage.sql"
node - "$RUN_DIR/defaults.tsv" "$RUN_DIR/current-guard-postimage.sql" "$RUN_DIR/current-guard-mapped.sql" <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const [defaultsPath, postimagePath, mappedPath] = process.argv.slice(2);
const captured = [
  ['1702067', 'admin.feature_docs', '74188ac5336e8d3bf1a14eee28fc6297'],
  ['3421071', 'context.system_context_item', '74188ac5336e8d3bf1a14eee28fc6297'],
  ['1700870', 'education.learn_doc', '74188ac5336e8d3bf1a14eee28fc6297'],
  ['1700228', 'platform.output_feedback', '4f5b09b52e1a7f210b4c0d8b8bfa8cb9'],
  ['1709788', 'seo.keyword', '74188ac5336e8d3bf1a14eee28fc6297'],
  ['1709833', 'seo.keyword_edge', '74188ac5336e8d3bf1a14eee28fc6297'],
  ['1709854', 'seo.keyword_market', '74188ac5336e8d3bf1a14eee28fc6297'],
  ['1709882', 'seo.keyword_topic', '74188ac5336e8d3bf1a14eee28fc6297'],
  ['1710180', 'seo.topic', '74188ac5336e8d3bf1a14eee28fc6297'],
];
const fixtureRows = fs.readFileSync(defaultsPath, 'utf8').trim().split('\n').map(line => line.split('|'));
if (fixtureRows.length !== 9 || fixtureRows.some(row => row.length !== 3)) throw new Error('fixture default map must contain exactly 9 triples');
const localByRef = new Map(fixtureRows.map(([ref, oid, hash]) => [ref, {oid, hash}]));
if (localByRef.size !== 9) throw new Error('fixture default map has duplicate relation names');
const source = fs.readFileSync(postimagePath, 'utf8');
const tuples = [...source.matchAll(/\((\d+)::oid,'([^']+?)','([0-9a-f]{32})'\)/g)].map(match => match.slice(1));
if (tuples.length !== 9 || new Set(tuples.map(tuple => tuple.join('|'))).size !== 9) throw new Error('postimage must contain exactly 9 unique frozen-debt triples');
const capturedByRef = new Map(captured.map(([oid, ref, hash]) => [ref, {oid, hash}]));
if (capturedByRef.size !== 9) throw new Error('captured production triples are not unique');
for (const [oid, ref, hash] of tuples) {
  const expected = capturedByRef.get(ref);
  const local = localByRef.get(ref);
  if (!expected || expected.oid !== oid || expected.hash !== hash) throw new Error(`postimage captured triple mismatch for ${ref}`);
  if (!local || local.hash !== hash || !/^\d+$/.test(local.oid)) throw new Error(`fixture triple mismatch for ${ref}`);
}
let mapped = source;
let replacements = 0;
for (const [productionOid, ref, hash] of captured) {
  const localOid = localByRef.get(ref).oid;
  const from = `(${productionOid}::oid,'${ref}','${hash}')`;
  const to = `(${localOid}::oid,'${ref}','${hash}')`;
  if (mapped.split(from).length - 1 !== 1) throw new Error(`expected one source tuple for ${ref}`);
  mapped = mapped.replace(from, to);
  replacements += 1;
}
let reversed = mapped;
for (const [productionOid, ref, hash] of captured) reversed = reversed.replace(`(${localByRef.get(ref).oid}::oid,'${ref}','${hash}')`, `(${productionOid}::oid,'${ref}','${hash}')`);
if (replacements !== 9 || reversed !== source) throw new Error('fixture mapping changed bytes beyond the nine OID replacements');
fs.writeFileSync(mappedPath, mapped);
console.log(`PASS current fixture mapping: 9 unique captured OID/relation/hash triples mapped; postimage sha256 ${crypto.createHash('sha256').update(source).digest('hex')}`);
NODE
"${PSQL[@]}" -f "$RUN_DIR/current-guard-mapped.sql" >/dev/null
echo "PASS current fixture: $POSTIMAGE_MODE exact postimage mapped only for local OIDs before immutable 44 controls" | tee -a "$RESULTS"
if [[ -n ${DD154_CURRENT_BEFORE_CONTROLS_SQL:-} ]]; then
  [[ -f $DD154_CURRENT_BEFORE_CONTROLS_SQL ]] || fail "DD154_CURRENT_BEFORE_CONTROLS_SQL is not a file: $DD154_CURRENT_BEFORE_CONTROLS_SQL"
  "${PSQL[@]}" -f "$DD154_CURRENT_BEFORE_CONTROLS_SQL" | tee -a "$RESULTS"
fi

"${PSQL[@]}" <<'SQL' | tee -a "$RESULTS"
CREATE TEMP TABLE review_results''' % (sys.argv[3],sys.argv[4],sys.argv[5],sys.argv[6])
if source.count(needle)!=1: raise SystemExit('immutable control section anchor changed')
open(sys.argv[2],'w').write(source.replace(needle,inject))
PY
chmod +x "$patched"
DD154_PG_MODE=native DD154_PG_BIN=/opt/homebrew/opt/postgresql@17/bin "$patched"
