#!/bin/zsh
# Clone-only, two-session proof that the real P1 producer waits on the
# organization+person cap lock before it can insert a queued SMS. No provider
# call is made. Both producer/holder transactions roll back.

set -e
set -o pipefail
repo_root="${0:A:h:h:h}"
cd "$repo_root"

# This live guard is mandatory even though the test never calls a provider.
(cd ../aidream && uv run python scripts/check_test_accounts_never_text_a_real_person.py --live)

source scripts/night/lib-night.sh
night_resolve_psql >/dev/null
clone_dsn=$(night_clone_dsn)
night_dsn_args "$clone_dsn"
unset clone_dsn
export PGPASSWORD="$NIGHT_DSN_PASSWORD"
unset NIGHT_DSN_PASSWORD
night_assert_target clone "${NIGHT_DSN_ARGS[@]}"

pref_sql="from communication.sms_notification_preferences p join auth.users u on u.id=p.user_id where u.email='admin@admin.com' and p.assistant_program_key='ai_matrx_owner_beta' and p.deleted_at is null"
original_state=$("$PSQL" "${NIGHT_DSN_ARGS[@]}" -X -At -v ON_ERROR_STOP=1 -c "select p.task_notifications $pref_sql")
if [[ "$original_state" != 't' && "$original_state" != 'f' ]]; then
  print -u2 'REFUSED: expected exactly one admin SMS enrollment on the clone.'
  exit 1
fi
"$PSQL" "${NIGHT_DSN_ARGS[@]}" -X -q -v ON_ERROR_STOP=1 -c "do \$\$ begin if (select count(*) $pref_sql) <> 1 or not exists (select 1 $pref_sql and p.phone_number in ('+19497027626','+19498072145','+19496662578')) then raise exception 'Admin enrollment is not bound to a guard-designated test handset'; end if; end \$\$;" >/dev/null

restore_pref=0
lock_pid=''
cleanup() {
  if [[ -n "$lock_pid" ]]; then wait "$lock_pid" 2>/dev/null || true; fi
  if [[ "$restore_pref" == 1 ]]; then
    "$PSQL" "${NIGHT_DSN_ARGS[@]}" -X -q -v ON_ERROR_STOP=1 -c "update communication.sms_notification_preferences p set task_notifications='$original_state'::boolean where p.user_id=(select id from auth.users where email='admin@admin.com') and p.assistant_program_key='ai_matrx_owner_beta' and p.deleted_at is null" >/dev/null
  fi
}
trap cleanup EXIT

if [[ "$original_state" == 'f' ]]; then
  "$PSQL" "${NIGHT_DSN_ARGS[@]}" -X -q -v ON_ERROR_STOP=1 -c "update communication.sms_notification_preferences p set task_notifications=true where p.user_id=(select id from auth.users where email='admin@admin.com') and p.assistant_program_key='ai_matrx_owner_beta' and p.deleted_at is null and p.task_notifications=false" >/dev/null
  restore_pref=1
fi

cat <<'SQL' | "$PSQL" "${NIGHT_DSN_ARGS[@]}" -X -q -v ON_ERROR_STOP=1 >/dev/null &
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  format('sms-person-cap:%s:%s', p.organization_id, p.phone_number), 0
)) from communication.sms_notification_preferences p
join auth.users u on u.id=p.user_id
where u.email='admin@admin.com' and p.assistant_program_key='ai_matrx_owner_beta'
  and p.deleted_at is null;
select pg_sleep(8);
rollback;
SQL
lock_pid=$!
sleep 1

proof_output=$(cat <<'SQL' | "$PSQL" "${NIGHT_DSN_ARGS[@]}" -X -q -v ON_ERROR_STOP=1 2>&1
begin;
set local lock_timeout='1500ms';
do $$
declare actor uuid; task_id uuid; pref communication.sms_notification_preferences%rowtype;
begin
  select id into strict actor from auth.users where email='admin@admin.com';
  select * into strict pref from communication.sms_notification_preferences p
    where p.user_id=actor and p.assistant_program_key='ai_matrx_owner_beta'
      and p.deleted_at is null;
  if pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
    format('sms-person-cap:%s:%s', pref.organization_id, pref.phone_number), 0)) then
    raise exception 'Holder did not own the person cap lock';
  end if;
  select t.id into strict task_id from workspace.tasks t
  where t.created_by=actor and t.deleted_at is null
    and t.recurrence_rule is null and t.status not in ('completed','cancelled','dismissed')
    and (t.title ilike '%test%' or t.title ilike '%rollback%' or t.title ilike '%clone%')
    and iam.has_access_for(actor,'task',t.id,'editor')
  order by t.created_at desc limit 1;
  perform * from communication.enqueue_task_sms_reminder_for_user(
    actor, task_id, 'ai_matrx_owner_beta',
    'notification:clone-cap-lock-proof:' || gen_random_uuid()::text
  );
  raise exception 'Producer did not wait on the person cap lock';
exception when lock_not_available then
  raise notice 'PERSON_CAP_LOCK_WAIT_CONFIRMED';
end $$;
rollback;
SQL
)
if [[ "$proof_output" != *PERSON_CAP_LOCK_WAIT_CONFIRMED* ]]; then
  print -u2 "$proof_output"
  exit 1
fi
wait "$lock_pid"
lock_pid=''

# Restore before reporting success, and prove no durable send intent escaped.
cleanup
restore_pref=0
trap - EXIT
post_state=$("$PSQL" "${NIGHT_DSN_ARGS[@]}" -X -At -v ON_ERROR_STOP=1 -c "select p.task_notifications $pref_sql")
residue=$("$PSQL" "${NIGHT_DSN_ARGS[@]}" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from communication.sms_notifications where idempotency_key like 'notification:clone-cap-lock-proof:%'")
if [[ "$post_state" != "$original_state" || "$residue" != '0' ]]; then
  print -u2 'FAIL: admin preference or test notification residue remained on clone.'
  unset PGPASSWORD
  exit 1
fi
unset PGPASSWORD
print 'PASS: real producer waited on person cap lock; both sessions rolled back; admin preference restored; no notification residue.'
