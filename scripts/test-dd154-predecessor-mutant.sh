#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
runner="$repo/scripts/test-dd154-current-guard-controls.sh"
work=$(mktemp -d /tmp/dd154-predecessor-mutant.XXXXXX)
trap 'rm -rf "$work"' EXIT
python3 - "$work/mutant.sql" <<'PY'
import pathlib,sys
path=pathlib.Path(sys.argv[1])
path.write_text("""DO $mutant$
DECLARE d text; h text; s text; changed text;
BEGIN
  SELECT pg_get_functiondef('platform._ddl_guard()'::regprocedure),prosrc INTO d,s FROM pg_proc WHERE oid='platform._ddl_guard()'::regprocedure;
  changed:=replace(s, '(v_scan_index = 1 OR v_scan_tokens[v_scan_index - 1] = ANY (ARRAY['';'',''begin'',''then'',''else'',''loop'']))', 'false');
  IF changed=s THEN RAISE EXCEPTION 'predecessor mutant anchor missing'; END IF;
  h:=split_part(d,'$function$',1); EXECUTE h||'$function$'||changed||'$function$';
END $mutant$;
""")
PY
set +e
DD154_CURRENT_BEFORE_CONTROLS_SQL="$work/mutant.sql" "$runner" >"$work/mutant.out" 2>&1
rc=$?
set -e
if [[ $rc -eq 0 ]] || ! grep -A1 'direct = assignment' "$work/mutant.out" | grep -q 'ALLOW'; then
  tail -80 "$work/mutant.out" >&2; exit 1
fi
"$runner" >"$work/restored.out" 2>&1
grep -q 'TOTAL    | 44    | failures | 0' "$work/restored.out"
echo 'PASS predecessor mutant: direct = assignment turned red; restored exact mapped guard passed 44/0'
