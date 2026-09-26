#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# branch-carry-database-objects.sh — what a SCHEMA dump cannot carry, put back on the rehearsal
# branch: the platform's EVENT TRIGGERS and the ROLE SETTINGS (`ALTER ROLE … SET`).
#
# 🚨 THE DEFECT (lane BRANCH-REFRESH-3, 2026-09-23). The refresh's drift gate failed on 13
# production objects the branch lacked; TWELVE of them were event triggers — ddl_guard,
# provision_shape_guard, close_new_functions_to_anon, enforce_definer_client_grants,
# ddl_lock_timeout_guard, door_follows_its_function, … — the whole DDL enforcement chain. An event
# trigger is a DATABASE-level object: `DROP SCHEMA platform CASCADE` removes it with its function,
# and `pg_dump -n <schema> …` never emits one (event triggers are dumped only by a whole-database
# dump). So every refresh silently left the branch with NO DDL guards, and a lane rehearsing there
# was rehearsing against a database that refuses nothing production refuses.
# `doorsonly4_the_generator_emits_the_new_set.sql` measured it: provision's preflight refused with
# "the whole enforcement chain rests on 7 platform event triggers, and a database restore
# provably drops them".
#
# WHAT THIS DOES. Reads every event trigger on the CLONE (read only), and on the BRANCH creates each
# one the branch does not already have — same name, event, tag filter, function and enabled state.
# It runs AFTER the restore and the seed, so neither the 63-minute restore nor the seed's temp
# tables run under guards that would judge a half-built database. Idempotent: a trigger the branch
# has is left alone; a function the branch lacks is a NAMED failure, never a skip.
#
# ROLE SETTINGS, the same class (found the same morning). `ALTER ROLE postgres SET statement_timeout
# = '30s'` (migration 0919) lives in pg_db_role_setting, which is cluster-level: no schema dump
# carries it. The branch's `postgres` ran with the cluster's 2min, so provision's preflight refused
# every rehearsal ("statement_timeout … Legal values here: 1s … 60s"), and `authenticator`'s
# pgrst.db_schemas lacked `custom`, `media` and `graveyard`, so PostgREST on the branch did not
# expose three schemas production exposes. Mirrored: every role-wide (all-database) setting the
# clone holds for the API and owner roles below that the branch holds differently. Database-level
# settings (app.settings.jwt_exp) are per-project configuration and are NOT copied.
#
# DECLARED SKIPS — a clone event trigger that must never reach the branch, by name, with its reason.
# ─────────────────────────────────────────────────────────────────────────────
source /Users/armanisadeghi/code/matrx-frontend/scripts/night/lib-night.sh

# 🚨 RETIRED 2026-09-26 (lane DB-TOOLS-NO-BRANCH): the rehearsal branch this job carried objects onto was deleted
# at 00:30Z. There is no database for it to write. It refuses by name instead of reaching a stale
# SUPABASE_BRANCH_DATABASE_URL; rehearsals run on the quarantined clone
# (common-docs/operations/clone/CURRENT.md). Kept for its history; do not re-arm its plist.
say "RETIRED: branch-carry-database-objects.sh carried objects onto the rehearsal branch, which was deleted 2026-09-26. Nothing attempted."
say "  Rehearse on the clone: pnpm db:rehearse <file> --target clone (common-docs/operations/clone/CURRENT.md)."
exit 78


typeset -A SKIP
SKIP=(
  policylock_red_escalates "a RED-suite fixture left on the clone (policylock_red_probe.escalate takes ACCESS EXCLUSIVE on a bystander table on every CREATE/ALTER/DROP POLICY); production does not carry it"
)

night_resolve_psql >/dev/null || exit $?
BR="$(night_branch_dsn)"; CL="$(night_clone_dsn)"
[ -n "$BR" ] && [ -n "$CL" ] || { say "REFUSED: the branch or clone connection could not be assembled. Nothing attempted."; exit 78; }
night_assert_target branch "$BR" || exit $?
night_assert_target clone  "$CL" || exit $?

# ── anon_key_needs_a_class_lane: carried only when the branch's guard can live with the branch ──
# The branch carries Supabase's database-webhooks schema `supabase_functions` (since 2026-09-15;
# production and the clone do not), owned by supabase_admin, whose default ACL keys anon and which
# postgres can neither alter nor drop. A guard body that exempts Supabase's schemas by a HAND LIST
# (0896: storage, graphql, graphql_public) refuses EVERY GRANT there. STORE-SMALLS' campaign file
# `anonguard_a_supabase_owned_schema_keeps_its_default_privileges.sql` exempts them by OWNER instead,
# and a refresh restores production's body — so this is ASKED, not assumed: in a transaction that is
# rolled back, attach the guard and issue one ordinary grant to `authenticated`. Refused -> not
# carried, with the guard's own sentence; accepted -> carried like every other trigger.
ANON_PROBE="$("$PSQL" "$BR" -X -qAt -v ON_ERROR_STOP=1 -c "begin; set local lock_timeout = '10s';
  create event trigger anon_key_probe_carry on ddl_command_end when tag in ('GRANT','ALTER DEFAULT PRIVILEGES')
    execute function iam.anon_key_needs_a_class_lane();
  grant select on custom.carrying_rule to authenticated; rollback;" 2>&1)"
if [ $? -ne 0 ]; then
  SKIP[anon_key_needs_a_class_lane]="on this branch the guard refuses an ordinary grant to authenticated ($(print -r -- "$ANON_PROBE" | grep -m1 -E 'ERROR' | cut -c1-200)) - the branch's body still exempts Supabase's schemas by a hand list that lacks supabase_functions; it is carried once the body is anonguard_a_supabase_owned_schema_keeps_its_default_privileges.sql's"
fi

HAVE="$("$PSQL" "$BR" -X -qAt -c 'select evtname from pg_event_trigger' 2>&1)" || { say "REFUSED: could not read the branch's event triggers: $HAVE"; exit 78; }
SRCROWS="$("$PSQL" "$CL" -X -qAt -F $'\x1f' -c "begin transaction read only;
  select e.evtname, e.evtevent, e.evtfoid::regproc::text, e.evtenabled,
         coalesce((select string_agg(quote_literal(t), ', ' order by t) from unnest(e.evttags) t), '')
    from pg_event_trigger e order by 1" 2>&1)" || { say "REFUSED: could not read the clone's event triggers: $SRCROWS"; exit 78; }

made=0 kept=0 skipped=0 failed=0
while IFS=$'\x1f' read -r name event fn enabled tags; do
  [ -n "$name" ] || continue
  if [[ $'\n'"$HAVE"$'\n' == *$'\n'"$name"$'\n'* ]]; then kept=$((kept+1)); continue; fi
  if [ -n "${SKIP[$name]:-}" ]; then say "  $name: NOT carried — ${SKIP[$name]}"; skipped=$((skipped+1)); continue; fi
  sql="create event trigger \"$name\" on $event"
  [ -n "$tags" ] && sql="$sql when tag in ($tags)"
  sql="$sql execute function $fn();"
  case "$enabled" in
    D) sql="$sql alter event trigger \"$name\" disable;" ;;
    R) sql="$sql alter event trigger \"$name\" enable replica;" ;;
    A) sql="$sql alter event trigger \"$name\" enable always;" ;;
  esac
  out="$("$PSQL" "$BR" -X -qAt -v ON_ERROR_STOP=1 -c "set lock_timeout = '10s'; $sql" 2>&1)"
  if [ $? -eq 0 ]; then say "  $name: created on the branch ($event → $fn${tags:+, tags $tags}, enabled=$enabled)"; made=$((made+1))
  else say "  $name: FAILED — $(print -r -- "$out" | grep -m1 -E 'ERROR|FATAL')"; failed=$((failed+1)); fi
done <<< "$SRCROWS"

say "event triggers: $made created, $kept already present, $skipped declared skip(s), $failed failed"

# ── role settings ────────────────────────────────────────────────────────────
ROLES="'postgres','authenticator','authenticated','anon','service_role'"
RQ="select r.rolname, x.kv from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
     cross join lateral unnest(s.setconfig) x(kv)
    where s.setdatabase = 0 and r.rolname in ($ROLES) order by 1, 2"
SRC_SET="$("$PSQL" "$CL" -X -qAt -F $'\x1f' -c "begin transaction read only; $RQ" 2>&1)" || { say "REFUSED: could not read the clone's role settings"; exit 78; }
BR_SET="$("$PSQL" "$BR" -X -qAt -F $'\x1f' -c "$RQ" 2>&1)" || { say "REFUSED: could not read the branch's role settings"; exit 78; }
rset=0 rkept=0 rfailed=0 reload=0
while IFS=$'\x1f' read -r role kv; do
  [ -n "$role" ] || continue
  if [[ $'\n'"$BR_SET"$'\n' == *$'\n'"$role"$'\x1f'"$kv"$'\n'* ]]; then rkept=$((rkept+1)); continue; fi
  key="${kv%%=*}"; val="${kv#*=}"
  out="$("$PSQL" "$BR" -X -qAt -v ON_ERROR_STOP=1 -c "alter role \"$role\" set \"$key\" = $(print -r -- "$val" | sed "s/'/''/g; s/^/'/; s/\$/'/")" 2>&1)"
  if [ $? -eq 0 ]; then say "  role $role: $key set to the clone's value"; rset=$((rset+1)); [[ "$key" == pgrst.* ]] && reload=1
  else say "  role $role: $key NOT set — $(print -r -- "$out" | grep -m1 -E 'ERROR|FATAL')"; rfailed=$((rfailed+1)); fi
done <<< "$SRC_SET"
[ $reload = 1 ] && "$PSQL" "$BR" -X -qAt -c "notify pgrst, 'reload config'" >/dev/null 2>&1 && say "  PostgREST told to reload its config"
say "role settings: $rset set, $rkept already equal, $rfailed failed"
[ $failed -eq 0 ] && [ $rfailed -eq 0 ] || exit 1
exit 0
