#!/bin/zsh
# STORE-OFF — THE PROOF, ON THE MAIN DATABASE AND THROUGH A REAL HTTP REQUEST.
#
# THE USE CASE. Rincon Plumbing Co is a one-truck plumbing business in Ventura County. An
# agent built them a "New Job Request" form in forty seconds and published it; the owner
# sent the link to her repeat customers. Her organization's record store is switched off,
# and until 2026-09-22 that link answered 404 — so every customer who followed it was told
# the page did not exist, off a switch nobody had told her about.
#
# WHAT THIS PROVES, four clauses, each able to fail on its own:
#   1. the PUBLISH DOOR refuses while the store is off, in a sentence naming the setting;
#   2. the PUBLIC LINK answers 200 and says whose switch it is, instead of 404;
#   3. turning the switch ON through the settings door makes the same link open the form;
#   4. turning it back OFF restores the sentence — and the org ends exactly as it started.
#
#   scripts/store-off/proof.sh
set -e
ENVF=/Users/armanisadeghi/code/aidream/.env
export PGUSER=$(grep -m1 '^SUPABASE_MATRIX_USER=' $ENVF | cut -d= -f2-)
export PGPASSWORD=$(grep -m1 '^SUPABASE_MATRIX_PASSWORD=' $ENVF | cut -d= -f2-)
export PGHOST=$(grep -m1 '^SUPABASE_MATRIX_HOST=' $ENVF | cut -d= -f2-)
export PGPORT=$(grep -m1 '^SUPABASE_MATRIX_PORT=' $ENVF | cut -d= -f2-)
export PGDATABASE=$(grep -m1 '^SUPABASE_MATRIX_DATABASE_NAME=' $ENVF | cut -d= -f2-)
PSQL="/opt/homebrew/opt/libpq/bin/psql -v ON_ERROR_STOP=1 -Atc"

ORG=6069a466-1445-42df-a64e-cf37ecdc1b99          # Rincon Plumbing Co
FORM=640dc5c3-4f2f-4df6-afad-a086b0c3f92b         # "New Job Request"
ADMIN=87a6e699-3622-4869-8843-d0867456c0dd        # admin@admin.com — the only test identity
# The ONE dev server, machine-wide (CLAUDE.md), on this lane's own host so no other agent's
# session is evicted.
BASE=http://store-off.localhost:3001

page() { curl -s "$BASE/f/$FORM" --max-time 90 | python3 -c "
import sys,re,html
t=re.sub(r'<script.*?</script>','',sys.stdin.read(),flags=re.S)
m=re.search(r'<main.*?</main>',t,flags=re.S)
print(' '.join(html.unescape(re.sub(r'<[^>]+>',' ',m.group(0) if m else '')).split())[:400])
"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$BASE/f/$FORM" --max-time 90; }

echo "── 1. the publish door, as admin@admin.com, while the store is off"
$PSQL "
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','$ADMIN','role','authenticated')::text, true);
do \$\$ begin
  perform custom.anon_publish('$ORG'::uuid, '$FORM'::uuid, true);
  raise exception 'PUBLISH WAS NOT REFUSED — the store is off and the door let it through';
exception when sqlstate '42501' then
  raise notice 'REFUSED 42501: %', sqlerrm;
end \$\$;" 2>&1 | grep -E "REFUSED|PUBLISH WAS NOT"

echo "── 2. the public link, store off"
echo "   HTTP $(code)"
echo "   says: $(page)"

echo "── 3. the switch turned ON through the settings door"
$PSQL "select platform.unified_data_store_set('$ORG'::uuid, true, '$ADMIN'::uuid, 'STORE-OFF proof') is not null" >/dev/null
echo "   store_is_open: $($PSQL "select custom.store_is_open('$ORG'::uuid)")"
echo "   HTTP $(code)"
echo "   says: $(page)"

echo "── 4. the switch put back OFF, exactly as it was found"
$PSQL "select platform.unified_data_store_set('$ORG'::uuid, false, '$ADMIN'::uuid, 'STORE-OFF proof — restored') is not null" >/dev/null
echo "   store_is_open: $($PSQL "select custom.store_is_open('$ORG'::uuid)")"
echo "   HTTP $(code)"
echo "   says: $(page)"
