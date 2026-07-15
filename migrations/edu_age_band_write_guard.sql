-- edu_age_band_write_guard.sql
--
-- COPPA hardening (FOUND_DEFECTS D57, 2026-07-15 adversarial review): `age_band`
-- was self-writable via TWO paths — the `edu_set_age_band` RPC AND a direct
-- PostgREST `update users.profiles set age_band=...` (the `std_update` RLS
-- policy allows any editor, including the row owner, to update the whole row).
-- Either path let a minor silently, unauditably flip to 'adult' and bypass both
-- COPPA gates (`edu_coppa_gate` here + aidream's `enforce_education_coppa`).
--
-- THIS MIGRATION closes the CODE-doable part of the gap:
--   1. ONE audited write path: a BEFORE UPDATE trigger on users.profiles blocks
--      any change to `age_band` unless it goes through `edu_set_age_band()` (the
--      RPC sets a transaction-local GUC flag the trigger checks) or a genuine
--      service_role caller (`auth.role() = 'service_role'`, e.g. a backend job).
--      Only `age_band` is guarded — every other profile column (display_name,
--      avatar_url, ...) is untouched by this trigger.
--   2. AUDIT every age_band change to `education.data_rights_event` (reused, not
--      a new table) — (user, old_band, new_band, at, via) — so a
--      downgrade-then-upgrade or any change is detectable after the fact.
--   3. Does NOT decide policy. Whether to hard-block a self-declared
--      under_13 -> adult transition (vs allow-with-audit) is Arman/legal's call
--      (COPPA verifiable-age vs neutral age screening + audited changes). For
--      now: the change is ALLOWED, AUDITED, and — specifically for
--      under_13 -> adult — flagged loudly (`RAISE WARNING` + `review_signal:true`
--      on the audit row) as a review signal. See FOUND_DEFECTS.md D57 and
--      docs/proposals/education-projects/COPPA_VERIFIABLE_CONSENT_RUNBOOK.md for
--      the open legal decision.
--
-- Idempotent: CREATE OR REPLACE / DROP ... IF EXISTS + CREATE / constraint
-- drop-then-add guarded by existence check.

-- ─── Widen the reused audit ledger's action vocabulary ────────────────────────
-- education.data_rights_event already exists (edu_data_rights_export_delete.sql)
-- with action in ('export','delete','restore'). Add 'age_band_change' so we
-- reuse the same FERPA/COPPA ledger instead of standing up a parallel table.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'data_rights_event_action_check'
      and conrelid = 'education.data_rights_event'::regclass
  ) then
    alter table education.data_rights_event
      drop constraint data_rights_event_action_check;
  end if;
  alter table education.data_rights_event
    add constraint data_rights_event_action_check
    check (action in ('export', 'delete', 'restore', 'age_band_change'));
end $$;

-- ─── The guard: age_band changes only via edu_set_age_band() or service_role ──
-- The RPC sets a transaction-local GUC (`app.age_band_rpc_guard = 'on'`) right
-- before its UPDATE; this trigger requires that flag (or a real service_role
-- caller) whenever `age_band` is actually changing. Any other column change on
-- the same row is untouched (the WHEN clause only fires the check on age_band).
create or replace function users._guard_age_band_change()
returns trigger
language plpgsql
security definer
set search_path = users, public, pg_temp
as $$
begin
  if new.age_band is distinct from old.age_band then
    if coalesce(current_setting('app.age_band_rpc_guard', true), '') <> 'on'
       and coalesce(auth.role(), '') <> 'service_role'
    then
      raise exception
        'age_band can only be changed via public.edu_set_age_band() (COPPA audit trail; direct writes are blocked — see FOUND_DEFECTS D57)'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists _guard_age_band on users.profiles;
create trigger _guard_age_band
  before update on users.profiles
  for each row
  execute function users._guard_age_band_change();

comment on function users._guard_age_band_change() is
  'COPPA age-band write guard (D57): blocks direct UPDATE of users.profiles.age_band from anything but the audited edu_set_age_band() RPC or a genuine service_role caller. Does not affect any other profile column.';

-- ─── edu_set_age_band: mark the audited path + write the audit row ────────────
create or replace function public.edu_set_age_band(p_band text)
returns text
language plpgsql
security definer
set search_path = users, education, public, pg_temp
as $$
declare
  v_old_band text;
  v_is_review_signal boolean;
begin
  if p_band is null or p_band not in ('under_13', '13_17', 'adult') then
    raise exception 'Invalid age band: %', coalesce(p_band, '(null)') using errcode = '22023';
  end if;

  select age_band into v_old_band from users.profiles where id = auth.uid();

  -- Transaction-local flag: tells the BEFORE UPDATE guard trigger this write is
  -- coming through the one audited path. Resets automatically at transaction end
  -- (set_config(..., is_local => true)) — never leaks to other statements.
  perform set_config('app.age_band_rpc_guard', 'on', true);

  update users.profiles
    set age_band = p_band, updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'No profile for the current user' using errcode = 'P0002';
  end if;

  v_is_review_signal := (v_old_band = 'under_13' and p_band = 'adult');

  insert into education.data_rights_event (user_id, action, detail)
  values (
    auth.uid(),
    'age_band_change',
    jsonb_build_object(
      'old_band', v_old_band,
      'new_band', p_band,
      'via', 'edu_set_age_band',
      -- POLICY NOT DECIDED HERE (Arman/legal, FOUND_DEFECTS D57): a self-declared
      -- under_13 -> adult transition is ALLOWED, not blocked. This flag is a
      -- detectability signal for review, not an enforcement decision.
      'review_signal', v_is_review_signal
    )
  );

  if v_is_review_signal then
    raise warning
      'COPPA REVIEW SIGNAL: user % self-declared age_band under_13 -> adult (self-attested, no verifiable-age check). See FOUND_DEFECTS.md D57.',
      auth.uid();
  end if;

  return p_band;
end;
$$;

revoke execute on function public.edu_set_age_band(text) from public, anon;
grant  execute on function public.edu_set_age_band(text) to authenticated;
