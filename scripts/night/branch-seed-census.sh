#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# branch-seed-census.sh — the DECLARED seed set of the rehearsal-branch refresh, and the guard
# that refuses a table nobody has ruled on.
#
# 🚨 THE DEFECT THIS CLOSES (chair ruling 2026-09-22, lane BRANCH-SEED). `branch-refresh.sh`
# DERIVED its seed set: "a `platform` table another table's foreign key points at, holding fewer
# than 2,000 rows", plus eight registries named by hand as suites raised on them one at a time. A
# register nothing holds an FK to — or one living outside `platform` — was invisible to that
# derivation and arrived EMPTY on the branch. Measured: `platform.client_callable_door` 0 of 1,744,
# `tool.definition` 0 of 696, and until that morning `platform.deprecated_relations`,
# `platform.shareable_resource_registry`, `custom.carrying_rule` and the `custom.record` kernel
# Tables. Every one of them made suites fail on the branch for a reason that was NOT a defect,
# while the copied ledger told each campaign file it was "already applied".
#
# A hand-list rots and a derivation cannot see what nothing points at. So the set is DECLARED: this
# script MEASURES every table in the census schemas on the nightly dev clone, writes the verdict and
# its reason into `branch-seed-tables.json` (checked in, read by the refresh), and REFUSES when a
# table exists in those schemas that the file has not ruled on.
#
#   --write        re-measure the clone and rewrite branch-seed-tables.json
#   --check        (default) refuse if the checked-in file does not rule on every table
#   --self-test    prove the guard RED then GREEN, without touching the tracked file
#   --file <path>  check a different copy (the self-test uses this; nothing else should)
#   --census-schemas <csv>  measure a different schema set (the self-test's RED-3; nothing else)
#
# It reads the CLONE and writes NOTHING to any database, in every mode.
# ─────────────────────────────────────────────────────────────────────────────
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

HERE=/Users/armanisadeghi/code/matrx-frontend/scripts/night
JSON="$HERE/branch-seed-tables.json"
CENSUS_SQL="$HERE/branch-seed-census.sql"

# The census schemas. Every reference/registry table the platform ships lives in one of these.
# 🚨 `ui` JOINED 2026-09-23 (lane BRANCH-REFRESH-3). `tool.ui` and `tool.surface_defaults` key on
# `ui.ui_surface(name)`, and `tool.ui_version` / `tool.ui_incident` key on `tool.ui`. With `ui`
# outside the census the parent was never seeded, and all four arrived EMPTY or nearly so (30, 40,
# 5 and 411 rows refused on `*_surface_name_fkey` / `*_component_id_fkey`). The guard below — a
# seeded table whose foreign key reaches a table the census never rules on is a REFUSAL — is what
# names the next such schema instead of letting its children arrive empty.
# `ai` JOINED the same day: the AI catalogue (ai.model_definition, provider, offering, …) is platform
# reference data that argsruled_green reads by id ("allam-2-7b"), and it was absent on the branch
# with no foreign key to make the guard see it.
CENSUS_SCHEMAS='platform,tool,iam,custom,content_ir,history,ui,ai'
# A row ceiling, because a table this large is data, not a register.
CENSUS_CEILING=50000
# A SIZE ceiling too (2026-09-23). `iam.access_delta_probe` has 22,514 rows — under the row
# ceiling — and weighs 423 MB on the clone (943 MB as TSV): the access-delta harness's own OUTPUT,
# one wide row per probe per run. The per-row seed load of it hit the branch's statement timeout
# and landed nothing. Rows alone do not tell a register from a log; bytes do.
CENSUS_BYTE_CEILING=134217728   # 128 MB, pg_total_relation_size on the source
# An `auth.users` foreign key on one of these columns is AUTHORSHIP, not an identity the row is
# about: the loader re-points them at the branch's own admin. Any OTHER auth.users key means the
# row names a person, and the table does not cross.
CENSUS_AUTHORSHIP='created_by,updated_by,deleted_by,archived_by,restored_by,published_by,approved_by,last_modified_by'

# ── DECLARED EXCLUSIONS ──────────────────────────────────────────────────────
# A table no measurement can classify, ruled on here by name, with the reason that goes into the
# file. Keep this list SHORT and keep the reason honest — "it is inconvenient" is not one.
CENSUS_DECLARED='{
  "iam.organizations": "identities and organizations are SYNTHESIZED on the branch, never copied (the owner'"'"'s no-real-people law); the single is_system organization the reference tables key on is seeded by the refresh'"'"'s own step, and one organization per registered REAL-DATA use case is created there",
  "ui.ui_surface_agent_role": "every row keys on agent.definition, and the agent schema is not seeded by this refresh (agents are organization-owned records, not platform reference data), so each row would be refused on its foreign key; declared 2026-09-23 by lane BRANCH-REFRESH-3 rather than widening the census to a schema of customer agents",
  "ai.voices": "its rows key on files.files (the voice samples are stored file records), and the files schema is not seeded by this refresh (a file row is organization-owned content, not reference data), so each row that names a sample would be refused; declared 2026-09-23 by lane BRANCH-REFRESH-3"
}'

# ── TABLES THAT RIDE THE RESTORE ─────────────────────────────────────────────
# A table whose OWN guard refuses every INSERT cannot be seeded row by row, and must not be: the
# guard is right. `platform.anon_function_birth_grandfather` is the snapshot of functions already
# anon-executable when DD-202 shipped; `anon_function_birth_grandfather_is_closed` refuses every
# new row ("CLOSED — it may only shrink"), so all 272 rows were refused and the branch's copy was
# EMPTY — which makes `close_new_functions_to_anon` revoke anon from those 272 functions the first
# time a lane replaces one, a behaviour production does not have. The refresh therefore loads it
# INSIDE THE RESTORE, immediately before the schema dump creates that closing trigger — exactly
# where pg_dump itself would put the table's data. The guard is never disabled; it simply does not
# exist yet, as on any restore. name -> the closing trigger the load must precede.
CENSUS_RESTORE_LOADED='{
  "platform.anon_function_birth_grandfather": "anon_function_birth_grandfather_is_closed"
}'

MODE=check
while [ $# -gt 0 ]; do
  case "$1" in
    --write) MODE=write ;;
    --check) MODE=check ;;
    --self-test) MODE=selftest ;;
    --file) shift; JSON="$1" ;;
    --census-schemas) shift; CENSUS_SCHEMAS="$1" ;;   # the self-test's RED-3 only
    *) print -r -- "unknown argument: $1"; exit 64 ;;
  esac
  shift
done

night_resolve_psql >/dev/null || exit $?

# The census reads the CLONE and nothing else. The assertion is the same one every night job makes:
# (system identifier, project ref) together, because a data clone answers with production's own
# system identifier and the number alone cannot tell them apart.
census_connect() {
  SRC_DSN="$(night_clone_dsn)" || true
  if [ -z "${SRC_DSN:-}" ]; then
    print -r -- "REFUSED: the dev clone's connection could not be assembled (CLONE_DATABASE_URL, or"
    print -r -- "  common-docs/operations/clone/CLONE-REF naming a readable password_file). This script"
    print -r -- "  has no other source and does not fall back to production. Nothing attempted."
    return 78
  fi
  night_assert_target clone "$SRC_DSN" >/dev/null || return $?
  return 0
}

census_measure() {  # -> the census JSON on stdout
  "$PSQL" "$SRC_DSN" -qAt \
    -v ceiling="$CENSUS_CEILING" \
    -v byteceiling="$CENSUS_BYTE_CEILING" \
    -v restoreloaded="$CENSUS_RESTORE_LOADED" \
    -v schemas="$CENSUS_SCHEMAS" \
    -v authorship="$CENSUS_AUTHORSHIP" \
    -v declared="$CENSUS_DECLARED" \
    -c 'begin transaction read only' -f "$CENSUS_SQL"
}

case "$MODE" in

write)
  census_connect || exit $?
  OUT="$(census_measure 2>&1)"
  if print -r -- "$OUT" | grep -qE '^(psql:)?.*(ERROR|FATAL):'; then
    print -r -- "REFUSED: the census did not run: $(print -r -- "$OUT" | grep -m1 -E 'ERROR|FATAL')"; exit 78
  fi
  print -r -- "$OUT" | tail -1 | python3 -c '
import json, sys, datetime
d = json.load(sys.stdin)
d = {"_": "GENERATED by scripts/night/branch-seed-census.sh --write. Measured on the nightly dev clone; "
          "read by scripts/night/branch-refresh.sh. Do not hand-edit a row: change the rule or the "
          "declared exclusions in the script and re-run --write.",
     "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
     "source": "the nightly dev clone (read only; production is never contacted)", **d}
json.dump(d, sys.stdout, indent=2); sys.stdout.write("\n")
' > "$JSON" || exit 78
  python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
n=len(d["tables"]); print("wrote %s: %d tables ruled on - %d seeded, %d excluded, ceiling %d" % (sys.argv[1], n, d["seeded"], d["excluded"], d["row_ceiling"]))
' "$JSON"
  ;;

check)
  if [ ! -r "$JSON" ]; then
    print -r -- "REFUSED: $JSON does not exist. The refresh has no declared seed set to read."
    print -r -- "  Fix: pnpm check:branch-seed-list:write"
    exit 1
  fi
  census_connect || exit $?
  LIVE="$(census_measure 2>&1)"
  if print -r -- "$LIVE" | grep -qE '^(psql:)?.*(ERROR|FATAL):'; then
    print -r -- "REFUSED: the census did not run against the clone: $(print -r -- "$LIVE" | grep -m1 -E 'ERROR|FATAL')"
    print -r -- "  An unreadable census is a REFUSAL, never a fallback."
    exit 1
  fi
  print -r -- "$LIVE" | tail -1 | python3 -c '
import json, sys
live = json.load(sys.stdin)
declared = json.load(open(sys.argv[1]))
live_names = {t["table"] for t in live["tables"]}
decl = {t["table"]: t for t in declared["tables"]}
bad = []
for n in sorted(live_names - set(decl)):
    row = next(t for t in live["tables"] if t["table"] == n)
    bad.append("  %s: in the census schemas on the clone (%s rows) and the declared seed list "
               "does not rule on it at all - it is in neither the seed set nor the exclusions. "
               "A registry nobody ruled on arrives EMPTY on the branch." % (n, row["rows"]))
for n in sorted(set(decl) - live_names):
    bad.append("  %s: the declared seed list rules on it and it no longer exists on the clone." % n)
for n, t in sorted(decl.items()):
    if not (t.get("reason") or "").strip():
        bad.append("  %s: ruled %s with NO reason. Every entry says why, or the next reader "
                   "cannot tell a ruling from an oversight." % (n, "SEED" if t.get("seed") else "EXCLUDED"))
for t in sorted(live["tables"], key=lambda x: x["table"]):
    if not (decl.get(t["table"]) or {}).get("seed"):
        continue
    for parent in t.get("fk_parents") or []:
        if parent not in live_names:
            bad.append("  %s: SEEDED, and its foreign key reaches %s, which is outside the census "
                       "schemas - so the parent is never seeded and this table arrives empty on the "
                       "branch (the ui.ui_surface class, 2026-09-23). Add %s to CENSUS_SCHEMAS."
                       % (t["table"], parent, parent.split(".")[0]))
if bad:
    print("REFUSED: the declared branch seed set does not cover the census schemas (%s)."
          % ", ".join(live["schemas"]))
    print("\n".join(bad))
    print("  Fix: pnpm check:branch-seed-list:write, then read the diff before committing it.")
    sys.exit(1)
ns = sum(1 for t in decl.values() if t.get("seed"))
print("branch seed list OK: %d tables ruled on, all of the clone-side census covered "
      "(%d seeded, %d excluded, ceiling %d)." % (len(decl), ns, len(decl) - ns, declared["row_ceiling"]))
' "$JSON" || exit 1
  ;;

selftest)
  # RED then GREEN, against the live clone, on COPIES in a scratch directory. The tracked file is
  # never edited — a peer session's sweep can commit the working tree at any minute.
  T="$(mktemp -d)"
  print -r -- "self-test scratch: $T"
  rc=0
  # RED-1: a table the census sees that the file does not rule on.
  python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
drop=next(t["table"] for t in d["tables"] if t["table"]=="platform.client_callable_door")
d["tables"]=[t for t in d["tables"] if t["table"]!=drop]
json.dump(d,open(sys.argv[2],"w"),indent=2)
print("RED-1 removed",drop,"from the copy")
' "$JSON" "$T/red1.json" || exit 78
  O="$(zsh "$HERE/branch-seed-census.sh" --check --file "$T/red1.json" 2>&1)"; E=$?
  if [ $E -eq 0 ] || ! print -r -- "$O" | grep -q 'client_callable_door'; then
    print -r -- "RED-1 FAILED: the guard did not refuse a table it was not ruling on (exit $E)"; print -r -- "$O"; rc=1
  else
    print -r -- "RED-1 ok (exit $E): $(print -r -- "$O" | grep -m1 client_callable_door | cut -c1-140)"
  fi
  # RED-2: an entry with no reason.
  python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
for t in d["tables"]:
    if t["table"]=="platform.feature_knob": t["reason"]=""
json.dump(d,open(sys.argv[2],"w"),indent=2)
' "$JSON" "$T/red2.json" || exit 78
  O="$(zsh "$HERE/branch-seed-census.sh" --check --file "$T/red2.json" 2>&1)"; E=$?
  if [ $E -eq 0 ] || ! print -r -- "$O" | grep -q 'NO reason'; then
    print -r -- "RED-2 FAILED: the guard accepted a ruling with no reason (exit $E)"; print -r -- "$O"; rc=1
  else
    print -r -- "RED-2 ok (exit $E): $(print -r -- "$O" | grep -m1 'NO reason' | cut -c1-140)"
  fi
  # RED-3: a seeded table whose foreign key reaches a schema the census does not cover. Run the
  # census WITHOUT `ui` — the shape it had until 2026-09-23 — and tool.ui must be named.
  O="$(zsh "$HERE/branch-seed-census.sh" --check --census-schemas 'platform,tool,iam,custom,content_ir,history' 2>&1)"; E=$?
  if [ $E -eq 0 ] || ! print -r -- "$O" | grep -q 'reaches ui.ui_surface, which is outside the census'; then
    print -r -- "RED-3 FAILED: the guard did not name a seeded table whose parent is outside the census (exit $E)"; print -r -- "$O" | head -5; rc=1
  else
    print -r -- "RED-3 ok (exit $E): $(print -r -- "$O" | grep -m1 'outside the census' | cut -c1-140)"
  fi
  # GREEN: the tracked file itself.
  O="$(zsh "$HERE/branch-seed-census.sh" --check 2>&1)"; E=$?
  if [ $E -ne 0 ]; then print -r -- "GREEN FAILED (exit $E): $O"; rc=1
  else print -r -- "GREEN ok: $O"; fi
  [ $rc -eq 0 ] && print -r -- "branch-seed-census self-test PASSED" || print -r -- "branch-seed-census self-test FAILED"
  exit $rc
  ;;
esac
