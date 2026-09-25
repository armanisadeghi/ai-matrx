-- additive: yes
-- based-on: platform.knob_delete_refuses_a_live_reader() a06debf07f97a85257fa89fb6b4d25171a78ef769749c562a5a142150014e660
-- Inverse of migrations/campaign/knobguard_a_key_is_a_pair_not_a_word.sql.
-- Restores platform.knob_delete_refuses_a_live_reader() to its pre-fix body
-- (bare-key substring match, inline) and drops the shared predicate function.
-- NOTE: restoring this reintroduces the defect (a common-word key can never be
-- deleted); it exists only so rule 27 (up -> inverse -> up) can prove the fix
-- against its own prior state, not as a recommended end state.
--
-- platform.knob_live_readers(text, text) is left STANDING, not dropped: the
-- as-yet-unapplied platform.knob_archive door in
-- migrations/campaign/settings3_a_retired_knob_is_archived_not_deleted.sql calls
-- it, so dropping it here would break a body outside this lane the moment that
-- file lands. Restoring the old trigger body neuters its behaviour (nothing
-- calls it any more) without removing the object.

set lock_timeout = '2s';

create or replace function platform.knob_delete_refuses_a_live_reader()
returns trigger
language plpgsql
as $function$
declare
  v_readers text;
begin
  -- A register row is not a record of a decision, it IS the value the resolver
  -- returns, and knob_resolve RAISES on a key it cannot find. So deleting a row
  -- some function still reads does not degrade that function — it takes it down.
  --
  -- This exists because on 2026-09-19 a convergence migration deleted
  -- hr.time_and_attendance.punch_enabled_worker_classes with the pattern
  -- `like 'punch_enabled_worker_class_%'`: in LIKE, `_` matches any single
  -- character, so the pattern written to match four booleans also matched the
  -- composite the punch gate itself reads. The delete was correct about the
  -- booleans and catastrophic about the fifth row, and nothing stopped it.
  select string_agg(distinct n.nspname || '.' || p.proname, ', ' order by n.nspname || '.' || p.proname)
    into v_readers
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.prokind = 'f'
     and n.nspname not in ('pg_catalog', 'information_schema')
     and position('''' || old.key || '''' in pg_get_functiondef(p.oid)) > 0;

  if v_readers is not null then
    raise exception 'platform.feature_knob: %.% is still read by %',
      old.feature, old.key, v_readers
      using errcode = '23503',
            hint = 'knob_resolve RAISES on a missing key, so deleting this row breaks those functions. Repoint or delete the readers first. If the match is coincidental, remove the reader in the same transaction.';
  end if;

  return old;
end;
$function$;

comment on function platform.knob_delete_refuses_a_live_reader() is
  'BEFORE DELETE guard on platform.feature_knob. Refuses a hard delete of any key any database function still quotes anywhere in its body.';
