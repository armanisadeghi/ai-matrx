-- chair-step: inverse of certify_close_helper_execute.sql — restores authenticated EXECUTE only, which was the measured live grant immediately before the forward repair; anon and PUBLIC were already denied

set local lock_timeout = '2s';

grant execute on function iam.is_doors_only_refusal(boolean, oid[], "char", text, text, text) to authenticated;
grant execute on function iam.doors_only_refusals(regclass) to authenticated;
