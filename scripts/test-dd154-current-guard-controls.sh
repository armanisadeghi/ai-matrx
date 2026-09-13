#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
base="$repo/scripts/test-dd154-ddl-guard.sh"
current="$repo/../common-docs/projects/no-db-assigned-org/census/guard-performance/live-guard.sql"
draft="$repo/scripts/migration-drafts/dd154_lexer_character_array.sql"
current_sha=02035098f9091d7ffae24bd7dfe150e098db3eb518f66fec6a0b94c4e3d7b3d0
draft_sha=fd778f6535f8a1c75353a4980b0daa59e1678a35cb75fe2db0fbe27bbec11547
[[ $(shasum -a 256 "$current" | awk '{print $1}') == "$current_sha" ]] || { echo 'current guard file hash changed; refresh captured fixture'; exit 2; }
[[ $(shasum -a 256 "$draft" | awk '{print $1}') == "$draft_sha" ]] || { echo 'DD154 lexer draft hash changed; refresh captured fixture'; exit 2; }
work=$(mktemp -d "$repo/scripts/dd154-current-controls.XXXXXX")
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
"${PSQL[@]}" -f "$CURRENT_GUARD" >/dev/null
if [[ -n ${DD154_CURRENT_BEFORE_DRAFT_SQL:-} ]]; then
  [[ -f $DD154_CURRENT_BEFORE_DRAFT_SQL ]] || fail "DD154_CURRENT_BEFORE_DRAFT_SQL is not a file: $DD154_CURRENT_BEFORE_DRAFT_SQL"
  "${PSQL[@]}" -f "$DD154_CURRENT_BEFORE_DRAFT_SQL" >/dev/null
fi
if [[ ${DD154_CURRENT_SKIP_DRAFT:-0} != 1 ]]; then
  { printf "SET statement_timeout TO 20000;\n"; cat "$DRAFT"; } | "${PSQL[@]}" >/dev/null
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
