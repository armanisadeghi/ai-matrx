-- target: branch,production
-- additive: yes
-- guard: custom/row_versions_guard
--
-- W3-HIST — VIS-16's OTHER HALF: the grant capture, in its own file because it is DDL on a
--           table this lane's row does not hold the lock for.
--
-- WHY IT IS SEPARATE, SAID PLAINLY RATHER THAN BURIED
-- --------------------------------------------------
-- §4.3 puts `iam.has_access_for_base`, `iam.accessible_entity_ids`, `iam.emergency_door_request`
-- and "the grant surface" behind `LOCK:iam`, held by `W2-ACCESS` -> `W2-PRED` -> `W2-TRUST`
-- "and by nobody else". `W3-HIST`'s row names `LOCK:custom`. So this one statement is split
-- out of `w3_hist_undo_and_replay.sql`, applied while holding `LOCK:iam` and released in the
-- same minute, and the lane's report names the take rather than leaving it to be discovered.
--
-- WHAT IT DOES AND DOES NOT TOUCH
-- ------------------------------
-- It adds ONE `after insert or update or delete` trigger that writes to
-- `history.row_versions` and nothing else. It changes no grant, no evaluation, no policy and
-- no function `LOCK:iam` exists to serialise: `iam.permissions` already carries eight
-- triggers, two of them this campaign's own `_custom_record_grant_guard` pair. While
-- `custom/row_versions_guard` resolves false the body returns before it writes a byte, so the
-- OFF-path answer on a live table is identical — which is §6.6's requirement for touching a
-- shared object at all.
--
-- WITHOUT IT, VIS-16 IS UNPROVABLE
-- --------------------------------
-- Measured 2026-09-18: `iam.permissions` carried NO version capture of any kind, so
-- "who could see Record R on date D" had nothing to read for its grant half. VIS-16's law is
-- that the answer comes from replaying History and that no separate access-history store is
-- kept — this is what makes the first half true without building the second.

set lock_timeout = '5s';
set statement_timeout = '300s';

create or replace function history.grant_capture()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_row jsonb;
  v_op  text;
begin
  -- THE GUARD, through the one predicate. `iam.permissions` is a LIVE table with eight other
  -- triggers on it, so this body is inert — never raising — while the campaign's switch is
  -- off. custom/row_versions_guard is what turns it on.
  if not history.capture_is_open(null) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old); v_op := 'DELETE';
  else
    v_row := to_jsonb(new);
    v_op  := case when tg_op = 'INSERT' then 'INSERT' else 'UPDATE' end;
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier)
  values ('iam.permissions', (v_row ->> 'id')::uuid,
          nullif(v_row ->> 'granted_to_organization_id', '')::uuid,
          1, v_op, v_row,
          coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
          platform.actor_tier());

  insert into history.capture_window (entity_type, note)
  values ('iam.permissions', 'VIS-16: W3-HIST''s grant capture — "who could see R on date D" is replayed from these rows')
  on conflict (entity_type) do nothing;

  return coalesce(new, old);
end;
$fn$;

comment on function history.grant_capture() is
  'VIS-16: the grant half of the replay. iam.permissions carried no version capture at all before this, so "who could see R on date D" had nothing to read. Inert — never raising — while custom/row_versions_guard is off, and history.capture_window is what keeps that silence honest.';

create trigger zzz_history_grant_capture
  after insert or update or delete on iam.permissions
  for each row execute function history.grant_capture();
