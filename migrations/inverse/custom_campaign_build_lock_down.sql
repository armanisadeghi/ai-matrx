-- chair-step: dropping campaign_watch.build_lock is the campaign's teardown, not an additive change; it runs with the campaign stopped and the chair awake
-- (RE-HEADED 2026-09-16, ATTACK-7 finding 2: this file used to carry `-- target: branch,production`
--  ABOVE the chair-step line. That header is judged by the ALLOW-LIST in both runners, and
--  `-- chair-step:` waives nothing there — it waived everything in one runner and nothing in
--  the other, so this file was ACCEPTED by `pnpm db:apply --target production` and REFUSED by
--  `uv run python db/apply_migrations.py`. A header-less chair step is the ONE route: it
--  rehearses on the branch with --target branch and reaches production only at a terminal,
--  from the same bytes. See migrations/JUDGMENT.md.)
--
-- THE INVERSE of `custom_campaign_build_lock.sql` (§4.13: every migration carries its own
-- down-migration in the same commit).
--
-- 🚨 IT REFUSES WHILE A LOCK IS HELD. Dropping the table out from under a lane that holds
-- `LOCK:custom` does not free the lock — it deletes the only record of who holds it, and
-- the next lane's TAKE then succeeds against an object that a live builder believes it
-- owns. So this file raises rather than drop a table with rows in it, and names them.
--
-- It does NOT drop schema `campaign_watch`: `campaign_watch.cron_pause` lives there too,
-- created by the cron guard, and the switch checklist still reads it. Dropping the schema
-- is the campaign's final teardown, not this file's job.
--
-- `-- additive: yes` is the header the runner requires of any file naming production; the
-- statement below is a DROP, so it also carries `-- migrate: skip:` and is never swept —
-- it is run by hand, by the chair, with the campaign stopped.

do $$
declare
  held text;
begin
  if to_regclass('campaign_watch.build_lock') is null then
    raise notice 'campaign_watch.build_lock is already absent — nothing to do.';
    return;
  end if;
  select string_agg(format('%s (held by %s since %s)', lock_name, held_by, taken_at), ', ')
    into held
    from campaign_watch.build_lock;
  if held is not null then
    raise exception
      'REFUSING to drop campaign_watch.build_lock: % lock(s) are still held — %. '
      'Dropping the table does not release them, it erases the only record of who holds '
      'them and lets the next TAKE succeed against a live builder. Have each holder run '
      'its RELEASE first (delete ... where lock_name = $1 and held_by = $2), or, if a lane '
      'is gone, record the override in the build log and delete that row by name.',
      (select count(*) from campaign_watch.build_lock), held
      using errcode = 'P0001';
  end if;
  drop table campaign_watch.build_lock;
  raise notice 'campaign_watch.build_lock dropped; schema campaign_watch kept (cron_pause lives there).';
end
$$;
