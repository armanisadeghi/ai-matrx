-- chair-step: dropping the lease columns, the four lock functions and the status view is a
--   DROP, which is not additive by any reading and is therefore header-less on the allow-list
--   in BOTH runners (migrations/JUDGMENT.md — a `-- target:` line above a `-- chair-step:` line
--   is what made `custom_campaign_build_lock_down.sql` accepted by one runner and refused by the
--   other). It rehearses on the clone and the branch with `--target clone|branch` and reaches
--   the main database only at a terminal, from these same bytes.
--
-- THE INVERSE of `migrations/campaign/lockhyg_a_lock_row_carries_a_lease.sql` (§4.13: every
-- migration carries its own down-migration in the same commit).
--
-- 🚨 IT REFUSES WHILE A LIVE LEASE IS HELD, and it judges "live" by the very rule it is about
-- to remove. Dropping `expires_at` out from under a holder does not release anything — it turns
-- every row in the table back into a lock that is held forever, including the rows of lanes that
-- are mid-apply right now. An EXPIRED row is not an obstacle: it already blocks nobody, and this
-- file deletes it on the way past rather than refusing over a corpse.
--
-- It leaves `campaign_watch.build_lock` itself, its rows, and schema `campaign_watch` alone.
-- Undoing THIS file means "the lease never existed", not "the campaign is over"; the table's own
-- teardown is `custom_campaign_build_lock_down.sql`.
--
-- After it runs, `take` is an `on conflict do nothing` insert with no eviction and `release` is
-- a holder-scoped delete — precisely the behaviour every caller had before, which is why each
-- caller keeps a named refusal for the case where these functions are absent rather than
-- silently falling back to raw SQL.

do $$
declare
  live text;
begin
  if to_regclass('campaign_watch.build_lock') is null then
    raise notice 'campaign_watch.build_lock is absent — nothing to undo.';
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'campaign_watch' and table_name = 'build_lock' and column_name = 'expires_at'
  ) then
    select string_agg(format('%s (held by %s since %s, lease left %s)',
                             lock_name, held_by, taken_at, expires_at - now()), ', ')
      into live
      from campaign_watch.build_lock
     where expires_at > now();

    if live is not null then
      raise exception
        'REFUSING to remove the lease while % LIVE lock(s) are held — %. Dropping expires_at '
        'does not release them; it turns every row back into a lock held forever, including the '
        'rows of lanes that are mid-apply right now. Wait for the leases to lapse (15 minutes at '
        'most), or have each holder run campaign_watch.lock_release(lock_name, held_by) first.',
        (select count(*) from campaign_watch.build_lock where expires_at > now()), live
        using errcode = 'P0001';
    end if;

    -- Expired rows block nobody, so they are not grounds for a refusal — but they must not
    -- survive into a world with no lease, where they WOULD block forever.
    delete from campaign_watch.build_lock where expires_at <= now();
  end if;

  drop view if exists campaign_watch.build_lock_status;
  drop function if exists campaign_watch.lock_take(text, text, text);
  drop function if exists campaign_watch.lock_renew(text, text);
  drop function if exists campaign_watch.lock_release(text, text);
  drop function if exists campaign_watch.lock_lease();

  alter table campaign_watch.build_lock drop column if exists expires_at;
  alter table campaign_watch.build_lock drop column if exists heartbeat_at;

  raise notice 'the build_lock lease is removed: columns, four functions and the status view are gone; '
               'the table, its rows and schema campaign_watch are untouched.';
end
$$;
