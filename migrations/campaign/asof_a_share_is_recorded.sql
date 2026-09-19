-- NO `-- target:` HEADER, deliberately, for the same reason as
-- `guardswitch_a_knob_change_is_recorded.sql`: this file's whole point is that grant changes
-- reach `history.row_versions`, and the production allow-list refuses history tables by name.
-- It drops nothing anybody else's code owns, revokes nothing, and rewrites only bodies this
-- campaign wrote.
--
-- STORE-ASOF (3a of 4) — A SHARE IS RECORDED (T15, rules 9 and 14).
--
-- THE DEFECT, READ OUT OF THE BODY. The fourth pass shared a record with the test member,
-- revoked it, asked `custom.visibility_as_of` for a moment in between, and she was not in the
-- answer. Not because the replay is wrong — because there was nothing to replay. The capture
-- trigger `history.grant_capture` on `iam.permissions` asks `history.capture_is_open(NULL)`.
-- Since GUARD-SWITCH (2026-09-19) that predicate follows the ORGANIZATION'S OWN store switch,
-- and `NULL` means "the platform value", which is false and stays false. So the only grants
-- that ever reached history were the ones written by the role that OWNS the store — the
-- campaign's own suites. Measured on the main database, 2026-09-19: 51 `iam.permissions`
-- history rows for `resource_type = 'record'`, every one of them written at 14:26-14:27Z by
-- lane VIS-2's own green suite, and none by anybody else, ever. A share made by a real person
-- in an organization whose store is ON was recorded nowhere.
--
-- AND THE SECOND HALF: even with the rows there, the answer said WHO but never FOR HOW LONG.
-- T15 asks for "principals who have since lost access", and a principal who lost access is
-- only recognisable as one if the answer says when their reach began and when it ended.
--
-- WHAT THIS FILE LANDS
--
--   · `history.grant_capture()` resolves THE GRANT'S OWN ORGANIZATION before it asks whether
--     to record: for a record share, the organization of `custom.record` that the grant points
--     at; otherwise the organization the grant was made to. That organization is then both the
--     question put to `history.capture_is_open` and the `organization_id` written on the
--     history row — which it never was for a record share, so even the rows that did land were
--     filed under no organization. AFTER-trigger discipline is unchanged: it never raises, and
--     a store that is off still records nothing and says so by the window rather than by a row.
--
-- ITS OTHER HALF IS `asof_the_audit_says_how_long.sql`, which is a separate file because it
-- changes a function's return type and so must be a named chair step. There:
--   · `custom.visibility_as_of` gains `held_from` and `held_to` — the interval this principal
--     held that reach around the moment asked about, `held_to` null meaning "and still holds
--     it, as far as the moment asked about knows". Both are replayed out of the same
--     `history.row_versions` chain the answer itself is replayed from: `held_from` is when the
--     version in force at `p_at` was written, `held_to` is the first later version that ENDS
--     it (a DELETE, a status that is no longer active, or the grant's own expiry). The four
--     arms are otherwise untouched, line for line.
--
-- ADDITIVE: one CREATE OR REPLACE of a trigger function. Nothing is dropped or revoked, and
-- with no grant ever written again every existing reader answers exactly as it does today.
--
-- INVERSE: migrations/inverse/asof_a_share_is_recorded_down.sql

-- based-on: history.grant_capture() 1c2eedccc3b1d3211e9a0778795dbee4e9ae09d173d1f156740c633286ac80c6

set lock_timeout = '5s';
set statement_timeout = '180s';

-- ══════════════════════════════════ 1. A SHARE REACHES HISTORY, IN THE SAME TRANSACTION
create or replace function history.grant_capture()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_row jsonb;
  v_op  text;
  v_org uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old); v_op := 'DELETE';
  else
    v_row := to_jsonb(new);
    v_op  := case when tg_op = 'INSERT' then 'INSERT' else 'UPDATE' end;
  end if;

  -- THE GRANT'S OWN ORGANIZATION. A record share names a record, and a record belongs to
  -- exactly one organization — asking the platform value instead (which is what passing NULL
  -- did) meant no organization's store switch could ever open this capture, so a real
  -- person's share was recorded nowhere. The lookup is by the store's own primary key prefix
  -- and costs one probe.
  if v_row ->> 'resource_type' = 'record' then
    select r.organization_id into v_org
      from custom.record r
     where r.id = nullif(v_row ->> 'resource_id', '')::uuid;
  end if;
  v_org := coalesce(v_org, nullif(v_row ->> 'granted_to_organization_id', '')::uuid);

  -- THE GUARD, through the one predicate, now asked about the right organization. An AFTER
  -- trigger on a write the BEFORE triggers already admitted must never raise, so the refusal
  -- is read as a boolean and the capture window is what keeps the silence honest.
  if not history.capture_is_open(v_org) then
    return coalesce(new, old);
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier)
  values ('iam.permissions', (v_row ->> 'id')::uuid,
          v_org,
          1, v_op, v_row,
          coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
          platform.actor_tier());

  insert into history.capture_window (entity_type, note)
  values ('iam.permissions', 'VIS-16: W3-HIST''s grant capture — "who could see R on date D" is replayed from these rows')
  on conflict (entity_type) do nothing;

  return coalesce(new, old);
end;
$fn$;
