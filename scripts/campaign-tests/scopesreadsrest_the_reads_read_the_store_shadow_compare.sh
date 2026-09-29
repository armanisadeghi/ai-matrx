#!/bin/zsh
# LANE SCOPES-READS-REST — THE SHADOW COMPARE (SCOPES-CUTOVER-PLAN Phase 2, "same shadow-compare proof").
#
# THE USE CASE. Castellano & Reyes files Matters, Clients and Practice Areas; Titanium files its work
# under 933 Tags; Harbor Dental Group keeps clinic locations. Every one of those is a scope on the
# older context tables AND a Record of a store Table since the press. The fourteen database readers
# this lane moved (the dictionary, Trash, the dashboard's scope count, create_tasks_bulk's scope check,
# id links, search's filed-tag words, table facts, the agent's scope references) and the five
# suggestion views must answer every member exactly what they answered from context.*.
#
# WHAT IT DOES, in ONE rolled-back REPEATABLE READ transaction on the dev clone (never production):
#   1. the older bodies, from this lane's inverse file, as pg_temp copies (l8o_<name>);
#   2. the store bodies (this lane's campaign files — a no-op replacement once they are live);
#   3. the fixture "the copy is exact" (scopesreadsrest_shadow_compare_fixture.sql): the store is made
#      to say what the older rows say in every column these bodies read, so a data difference can
#      neither pass for a body difference nor hide one — each class it carries is measured and named
#      in PROGRESS-SCOPES-READS-REST.md;
#   4. with `red`, a planted divergence (scopesreadsrest_shadow_compare_plant.sql): four store-only
#      edits — a filing Tag's name, a Castellano scope type's label, an archived scope's name, a scope
#      a suggestion targets — that the compare must catch;
#   5. the compare (scopesreadsrest_shadow_compare_body.sql): old and new, as every member of every
#      organization with a scope type, the non-admin test seat test@test.com and the server, over every
#      scope type, a sample of scopes (every one of five organizations, every archived one, 5% of the
#      rest), every context item, every filed item and every relation value; answers compared as JSON.
#
#   GREEN: `... green` prints no mismatch row.   RED: `... red` names dict_list_owners_for,
#   platform._search_item_filed_tags, _trash_kind_rows and the views as mismatched.
#
# usage: scripts/campaign-tests/scopesreadsrest_the_reads_read_the_store_shadow_compare.sh green|red
set -e
MODE=${1:?green or red}
HERE=${0:A:h}; FE=${HERE:h:h}
REF=$FE/../common-docs/operations/clone/CLONE-REF
clone_ref=$(awk -F' *= *' '$1=="clone_ref"{print $2}' $REF)
pw_file=$(awk -F' *= *' '$1=="password_file"{print $2}' $REF)
host=$(awk -F' *= *' '$1=="pooler_host"{print $2}' $REF); port=$(awk -F' *= *' '$1=="pooler_port"{print $2}' $REF)
[[ -n $clone_ref && -r $pw_file ]] || { echo "refused: CLONE-REF or its password file is unreadable — this runs on the dev clone only"; exit 1; }
OUT=$(mktemp -d)
python3 - "$FE" "$OUT/old.sql" <<'PY'
import re, sys
fe, out = sys.argv[1], sys.argv[2]
s = open(f"{fe}/migrations/inverse/scopesreadsrest_the_dictionary_trash_and_facts_read_the_store_down.sql").read()
s = s[:s.index("delete from platform.client_callable_door")]
s = re.sub(r"CREATE OR REPLACE FUNCTION [a-z_]+\.([a-z_]+)\(", r"CREATE OR REPLACE FUNCTION pg_temp.l8o_\1(", s)
open(out, "w").write(s)
PY
{
  echo "begin isolation level repeatable read;"
  echo "set local statement_timeout = '0'; set local lock_timeout = '60s';"
  cat $OUT/old.sql
  cat $FE/migrations/campaign/scopesreadsrest_the_dictionary_trash_and_facts_read_the_store.sql
  cat $FE/migrations/campaign/scopesreadsrest_the_five_suggestion_views_are_built_beside_from_the_store.sql
  cat $HERE/scopesreadsrest_shadow_compare_fixture.sql
  [[ $MODE == red ]] && cat $HERE/scopesreadsrest_shadow_compare_plant.sql
  cat $HERE/scopesreadsrest_shadow_compare_body.sql
  echo "rollback;"
} > $OUT/run.sql
PSQL=${PSQL:-$(command -v psql || echo /opt/homebrew/opt/postgresql@17/bin/psql)}
PGPASSWORD="$(cat $pw_file)" $PSQL -X -q -v ON_ERROR_STOP=1 -A -F' | ' \
  "host=$host port=$port user=postgres.$clone_ref dbname=postgres sslmode=require" -f $OUT/run.sql 2>&1 \
  | grep -v -E "NOTICE|WARNING|^\s*$"
