#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
work=$(mktemp -d /tmp/dd154-retained-planner.XXXXXX)
trap 'rm -rf "$work"' EXIT
cat > "$work/controls.sql" <<'SQL'
DO $controls$
DECLARE rejected boolean;
BEGIN
  rejected := false;
  BEGIN
    EXECUTE $ddl$CREATE FUNCTION iam.entity_read_expr(text, text, text) RETURNS text LANGUAGE plpgsql AS $body$ BEGIN RETURN 'unnest(iam.accessible_entity_ids())'; END $body$ $ddl$;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%RLS planner trap%' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'retained D266 unnest control was accepted'; END IF;
  rejected := false;
  BEGIN
    EXECUTE $ddl$CREATE FUNCTION iam._apply_rls_unchecked(text, text, text) RETURNS text LANGUAGE plpgsql AS $body$ BEGIN RETURN 'id = ANY (iam.accessible_entity_ids())'; END $body$ $ddl$;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%RLS planner trap%' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'retained D266 ANY control was accepted'; END IF;
  EXECUTE $ddl$CREATE FUNCTION iam.entity_read_expr(text, text, text) RETURNS text LANGUAGE plpgsql AS $body$ BEGIN RETURN 'id in (select iam.unnest_uuids(iam.accessible_entity_ids()))'; END $body$ $ddl$;
  EXECUTE 'ALTER FUNCTION iam.entity_read_expr(text, text, text) COST 100';
END $controls$;
SQL
DD154_CURRENT_BEFORE_CONTROLS_SQL="$work/controls.sql" "$repo/scripts/test-dd154-current-guard-controls.sh" > "$work/controls.out" 2>&1 || { tail -n 70 "$work/controls.out" >&2; exit 1; }
grep -q 'TOTAL    | 44    | failures | 0' "$work/controls.out"
echo 'PASS retained D266: both planner traps refused, safe generator and harmless ALTER accepted, current guard controls 44/0'
