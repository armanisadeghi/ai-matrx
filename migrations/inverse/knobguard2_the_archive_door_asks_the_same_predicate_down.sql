-- additive: yes
-- based-on: platform.knob_archive(text, text, text, text) f8b49b740e1928f7593d293dfa7d70687bc0ff919aa501e0d4e5eae29c869e32
-- Inverse of migrations/campaign/knobguard2_the_archive_door_asks_the_same_predicate.sql.
-- Restores platform.knob_archive() to its pre-fix body (bare-key substring match,
-- inline query) exactly as ledgered on production 2026-09-22 10:08:11Z, checksum
-- 05decb8567a8... (of the whole settings3 file that first created it).
-- NOTE: restoring this reintroduces the defect (a common-word key can never be
-- archived); it exists only so rule 27 (up -> inverse -> up) can prove the fix
-- against its own prior state, not as a recommended end state.

set lock_timeout = '4s';

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

  -- The SAME census platform.knob_delete_refuses_a_live_reader runs. A knob a database
  -- function still reads is not orphaned: archiving it would take the control off every
  -- screen while the function went on obeying the stored value, which is the lie this
  -- whole system exists to prevent, pointing the other way.
  select string_agg(distinct n.nspname || '.' || p.proname, ', ' order by n.nspname || '.' || p.proname)
    into v_readers
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.prokind = 'f'
     and n.nspname not in ('pg_catalog', 'information_schema')
     and position('''' || p_key || '''' in pg_get_functiondef(p.oid)) > 0;

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
