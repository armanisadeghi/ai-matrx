-- target: branch,production
-- chair-step: the down-migration for rule 30's go-signal capture table; it DROPs, which is irreversible, and it refuses while any capture row exists because the capture is this campaign's only evidence of what production looked like at the go signal.
--
-- The inverse of migrations/campaign/custom_campaign_go_signal_capture.sql.
--
-- It refuses rather than erasing: every OFF-path diff in §6b.4 and `V8-PROD` fact ④ is a
-- comparison against these rows, so dropping the table while a capture exists destroys the
-- only fixed point the campaign has. Delete the rows deliberately first if that is really
-- what is meant.

set local lock_timeout = '3s';

do $$
declare n bigint;
begin
  if to_regclass('campaign_watch.go_signal_capture') is null then
    raise notice 'campaign_watch.go_signal_capture does not exist — nothing to undo';
    return;
  end if;
  select count(*) into n from campaign_watch.go_signal_capture;
  if n > 0 then
    raise exception
      'REFUSING: campaign_watch.go_signal_capture holds % row(s). That is the go-signal capture every OFF-path diff runs against (rule 30). Delete the rows deliberately first if the campaign is really being abandoned.', n;
  end if;
  drop table campaign_watch.go_signal_capture;
end $$;
