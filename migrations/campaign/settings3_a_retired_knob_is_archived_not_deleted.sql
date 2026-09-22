-- additive: yes
--
-- SETTINGS-3 — THE KNOB DOOR GAINS ITS ARCHIVE.
--
-- `check:settings-orphans` states the law in one sentence: a `platform.feature_knob` row
-- that NO code reads is a control that lies — a person turns it, the app says "saved", and
-- the system does exactly what it did before. It then offers exactly two fixes: wire a real
-- consumer, or DELETE the row. Today there is no third door, and the second one is shut:
-- `platform.knob_delete_refuses_a_live_reader` refuses a hard delete of any key a database
-- function still quotes (written after a `like 'punch_enabled_worker_class_%'` delete took
-- down the punch gate on 2026-09-19), and four rows in feature `custom` say so in their own
-- description — "the row is kept because deleting a knob row is not additive; it decides
-- nothing." So the registry accumulates rows that decide nothing and cannot be removed.
--
-- Arman's standing law is the answer: SOFT-DELETE EVERYTHING IMPORTANT — archive, never
-- delete. This file gives the knob registry the archive it was missing:
--
--   · three columns — WHEN it was archived, WHY in a sentence, and WHICH LANE said so.
--     A check constraint makes the reason and the lane compulsory: an archived row that
--     cannot say why it was archived is the same lie in a different place.
--   · `platform.knob_archive(feature, key, reason, lane)` — the door. It refuses a reason
--     shorter than a sentence, refuses a row that does not exist, refuses a row a database
--     function still reads (the SAME census the delete trigger runs — archiving a knob a
--     function reads would take that function's control away from the screen while the
--     function kept obeying it), and is idempotent on an already-archived row.
--   · `platform.knob_unarchive(feature, key)` — the way back. A soft delete that cannot be
--     undone is a hard delete with extra words.
--
-- Nothing resolves differently: `knob_resolve`, `knob_resolve_uncached` and `knob_snapshot`
-- are untouched, so an archived row still ANSWERS if some reader is found later. What
-- changes is that it stops being OFFERED — the settings index skips it (a separate file,
-- because that one replaces a live body) and the four settings guards stop grading it.
--
-- THE SIX ROWS ARCHIVED HERE were each investigated at their registration, not swept:
--   custom.associations_guard, custom.entity_custom_fields_guard, custom.field_index_guard,
--   custom.row_versions_guard — all four carry "Retired:" in their own label and say in
--     their description that the behaviour they named now follows the organization's
--     `custom/system_enabled` through `custom.store_is_open` (GUARD-SWITCH / DOOR-FIX,
--     2026-09-19). They decide nothing and are not going to.
--   custom.emergency_door_sweep_enabled — its own description says the timer that would
--     read it does not exist and that scheduling it is switch-checklist work (VIS-N-3),
--     not a lane's. A switch with no timer behind it is a control that lies today.
--   orm.write_retry.contention_retries — registered by 0663 to replace
--     `CONTENTION_RETRIES = 2` in matrx-orm `core/async_db_manager.py`. That constant no
--     longer exists: `core/write_retry.py` replaced the whole retry path and reads three
--     DIFFERENT keys (deadlock_max_retries / deadlock_backoff_base_ms /
--     deadlock_backoff_max_ms), each of which is live and read. The subject of this row
--     was deleted out from under it.
--
-- DEPENDS ON migrations/campaign/knobguard_a_key_is_a_pair_not_a_word.sql having already
-- run on the same target: this file's knob_archive door calls the shared
-- platform.knob_live_readers(feature, key) that migration defines, instead of carrying its
-- own copy of the readers query (2026-09-22, same lane that fixed the false-positive on the
-- bare-word key).
--
-- The inverse is migrations/inverse/settings3_a_retired_knob_is_archived_not_deleted_down.sql.

set lock_timeout = '4s';

alter table platform.feature_knob
  add column if not exists archived_at     timestamptz,
  add column if not exists archived_reason text,
  add column if not exists archived_by     text;

comment on column platform.feature_knob.archived_at is
  'When this registration was retired. NULL is a live knob. An archived knob still RESOLVES — nothing that reads it breaks — but it is no longer offered on any settings screen and the settings guards stop grading it. Set only through platform.knob_archive.';
comment on column platform.feature_knob.archived_reason is
  'Why this knob decides nothing any more, in a sentence a person can read. Compulsory: an archived row that cannot say why it was archived is the same lie in a different place.';
comment on column platform.feature_knob.archived_by is
  'The lane or person that archived it. Compulsory, so a retired registration always has somebody to ask.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'feature_knob_archived_says_why') then
    alter table platform.feature_knob
      add constraint feature_knob_archived_says_why check (
        archived_at is null
        or (archived_reason is not null and length(btrim(archived_reason)) >= 20
            and archived_by is not null and length(btrim(archived_by)) > 0)
      );
  end if;
end $$;

create index if not exists feature_knob_live_idx
  on platform.feature_knob (feature, key) where archived_at is null;

create or replace function platform.knob_archive(
  p_feature text,
  p_key     text,
  p_reason  text,
  p_lane    text
) returns jsonb
language plpgsql
security definer
set search_path to 'platform', 'public'
as $function$
declare
  v_readers text;
  v_row     platform.feature_knob%rowtype;
begin
  if not public.is_admin() then
    raise exception 'platform.knob_archive: retiring a registration is a platform-admin act'
      using errcode = '42501';
  end if;

  select * into v_row from platform.feature_knob where feature = p_feature and key = p_key;
  if v_row.feature is null then
    raise exception 'platform.knob_archive: %.% is not a registered knob', p_feature, p_key
      using errcode = 'P0002',
            hint = 'Check the address. Archiving a row that does not exist would report success for nothing.';
  end if;

  if v_row.archived_at is not null then
    return jsonb_build_object(
      'outcome', 'already_archived',
      'feature', p_feature, 'key', p_key,
      'archived_at', v_row.archived_at,
      'archived_reason', v_row.archived_reason,
      'archived_by', v_row.archived_by);
  end if;

  if p_reason is null or length(btrim(p_reason)) < 20 then
    raise exception 'platform.knob_archive: %.% needs a REASON, in a sentence', p_feature, p_key
      using errcode = '22023',
            hint = 'Say what decides this now instead, or why nothing does. A retired registration nobody can explain is the same lie in a different place.';
  end if;
  if p_lane is null or length(btrim(p_lane)) = 0 then
    raise exception 'platform.knob_archive: %.% needs the lane or person retiring it', p_feature, p_key
      using errcode = '22023',
            hint = 'So a retired registration always has somebody to ask.';
  end if;

  -- The SAME predicate platform.knob_delete_refuses_a_live_reader runs, through the
  -- ONE shared function platform.knob_live_readers(feature, key)
  -- (migrations/campaign/knobguard_a_key_is_a_pair_not_a_word.sql, 2026-09-22): a
  -- body counts as a reader only when it names BOTH the feature and the key
  -- together, not merely the bare key as a word. A knob a database function still
  -- reads is not orphaned: archiving it would take the control off every screen
  -- while the function went on obeying the stored value, which is the lie this
  -- whole system exists to prevent, pointing the other way.
  v_readers := platform.knob_live_readers(p_feature, p_key);

  if v_readers is not null then
    raise exception 'platform.knob_archive: %.% is still read by %', p_feature, p_key, v_readers
      using errcode = '23503',
            hint = 'An archived knob is not offered on any screen. Retiring one those functions read would leave them obeying a value nobody can see or change. Repoint or remove the readers first.';
  end if;

  update platform.feature_knob
     set archived_at     = now(),
         archived_reason = btrim(p_reason),
         archived_by     = btrim(p_lane),
         updated_at      = now()
   where feature = p_feature and key = p_key;

  return jsonb_build_object(
    'outcome', 'archived',
    'feature', p_feature, 'key', p_key,
    'archived_at', now(),
    'archived_reason', btrim(p_reason),
    'archived_by', btrim(p_lane));
end;
$function$;

comment on function platform.knob_archive(text, text, text, text) is
  'THE ARCHIVE DOOR for a knob registration. Soft, reversible (platform.knob_unarchive), and compulsory about its reason and its lane. Refuses a key any database function still reads — the same census the hard-delete trigger runs.';

create or replace function platform.knob_unarchive(p_feature text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'platform', 'public'
as $function$
declare
  v_row platform.feature_knob%rowtype;
begin
  if not public.is_admin() then
    raise exception 'platform.knob_unarchive: bringing a registration back is a platform-admin act'
      using errcode = '42501';
  end if;

  select * into v_row from platform.feature_knob where feature = p_feature and key = p_key;
  if v_row.feature is null then
    raise exception 'platform.knob_unarchive: %.% is not a registered knob', p_feature, p_key
      using errcode = 'P0002';
  end if;
  if v_row.archived_at is null then
    return jsonb_build_object('outcome', 'already_live', 'feature', p_feature, 'key', p_key);
  end if;

  update platform.feature_knob
     set archived_at = null, archived_reason = null, archived_by = null, updated_at = now()
   where feature = p_feature and key = p_key;

  return jsonb_build_object('outcome', 'live_again', 'feature', p_feature, 'key', p_key);
end;
$function$;

comment on function platform.knob_unarchive(text, text) is
  'The way back from platform.knob_archive. A soft delete that cannot be undone is a hard delete with extra words.';

-- §6d-4 / DD-223: the door is declared IN DATA, before the grant, or the grant does not stick.
-- Both doors are SIGNED-IN admin doors: the admin settings surface is where a platform admin
-- retires a registration, and the function re-checks public.is_admin() itself on every call.
-- Neither takes an entity id: the two arguments are the knob's own (feature, key) address, a
-- text pair whose only authorisation question is "is the caller a platform admin", which the
-- body asks first and answers with 42501.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'knob_archive', 'p_feature text, p_key text, p_reason text, p_lane text',
   array['text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
   'No entity-id argument: (p_feature, p_key) is a registry address, not a tenant row, and p_reason/p_lane are the words recorded on the archive. Authorisation is public.is_admin(), checked as the function''s first statement and raised as 42501 — a member, an org admin and an anonymous caller all get nothing. NULL feature/key raises P0002 (no such registration); NULL reason or lane raises 22023 rather than archiving without an explanation.',
   'settings3_a_retired_knob_is_archived_not_deleted.sql', null, true, false),
  ('platform', 'knob_unarchive', 'p_feature text, p_key text',
   array['text'::regtype, 'text'::regtype]::oid[],
   'No entity-id argument: (p_feature, p_key) is a registry address, not a tenant row. Authorisation is public.is_admin(), checked as the function''s first statement and raised as 42501. NULL feature/key raises P0002 (no such registration) rather than bringing an unspecified row back.',
   'settings3_a_retired_knob_is_archived_not_deleted.sql', null, true, false)
on conflict do nothing;

grant execute on function platform.knob_archive(text, text, text, text) to authenticated;
grant execute on function platform.knob_unarchive(text, text) to authenticated;

-- ── the six registrations that decide nothing ────────────────────────────────
-- Written straight into the columns rather than through the door because the door is
-- admin-gated on auth.uid() and a migration has no signed-in caller. The door's refusals
-- were each checked by hand first: every one of these six is reported an orphan by
-- check:settings-orphans, which reads pg_proc itself, so none has a database reader.
update platform.feature_knob set
  archived_at = now(), updated_at = now(), archived_by = 'SETTINGS-3 (2026-09-22)',
  archived_reason = 'Retired by its own description: the relation contract on platform.associations, including the organization wall, follows the organization''s custom/system_enabled through custom.store_is_open (GUARD-SWITCH, 2026-09-19). This row decided nothing.'
 where feature = 'custom' and key = 'associations_guard' and archived_at is null;

update platform.feature_knob set
  archived_at = now(), updated_at = now(), archived_by = 'SETTINGS-3 (2026-09-22)',
  archived_reason = 'Retired by its own description: validating a custom_fields document and the doctrine shape rules on a field declaration follow the organization''s custom/system_enabled through custom.store_is_open (GUARD-SWITCH, 2026-09-19). This row decided nothing.'
 where feature = 'custom' and key = 'entity_custom_fields_guard' and archived_at is null;

update platform.feature_knob set
  archived_at = now(), updated_at = now(), archived_by = 'SETTINGS-3 (2026-09-22)',
  archived_reason = 'Retired by its own description: promoting a field, its index DDL, the cap on promoted fields and work slots all follow the organization''s custom/system_enabled through custom.store_is_open (DOOR-FIX, 2026-09-19, defect B1). This row decided nothing.'
 where feature = 'custom' and key = 'field_index_guard' and archived_at is null;

update platform.feature_knob set
  archived_at = now(), updated_at = now(), archived_by = 'SETTINGS-3 (2026-09-22)',
  archived_reason = 'Retired by its own description: recording a change, pruning value history and replaying who could see a record follow custom.store_is_open and history.capture_is_open (GUARD-SWITCH, 2026-09-19). This row decided nothing.'
 where feature = 'custom' and key = 'row_versions_guard' and archived_at is null;

update platform.feature_knob set
  archived_at = now(), updated_at = now(), archived_by = 'SETTINGS-3 (2026-09-22)',
  archived_reason = 'A switch with nothing behind it: iam.emergency_door_sweep() is callable by hand and NO timer reads this row, and scheduling it is switch-checklist work (VIS-N-3), not a lane''s. Re-register it through platform.knob_unarchive on the day the schedule exists.'
 where feature = 'custom' and key = 'emergency_door_sweep_enabled' and archived_at is null;

update platform.feature_knob set
  archived_at = now(), updated_at = now(), archived_by = 'SETTINGS-3 (2026-09-22)',
  archived_reason = 'Its subject was deleted: 0663 registered this to replace CONTENTION_RETRIES = 2 in matrx-orm core/async_db_manager.py, and core/write_retry.py has since replaced that whole retry path with three DIFFERENT keys (deadlock_max_retries, deadlock_backoff_base_ms, deadlock_backoff_max_ms), all live and all read.'
 where feature = 'orm.write_retry' and key = 'contention_retries' and archived_at is null;
