-- based-on: platform.act_on_my_assists(text, uuid[], text[], text, timestamp with time zone, text, boolean, jsonb, jsonb) 3cefb0f2eab1f9ce0bb7201e7ca7a70e5a15bed386c998658eed0c7df1c3e592
-- FIX-10A-ASSISTS, 2026-09-22. THE DOOR 404'd ON ITS FIRST REAL CALLER, FOR THE REASON
-- `check:door-names-resolve` exists to catch: plpgsql resolves a name LAZILY, at first
-- execution, so `coalesce` and `nullif` written as `pg_catalog.coalesce(...)` compiled,
-- applied and ledgered, and then answered every signed-in caller
-- `function pg_catalog.coalesce(text, unknown) does not exist` (PostgREST: 404). COALESCE and
-- NULLIF are SQL CONSTRUCTS, not functions in a schema — they must be written bare, and they
-- resolve under any search_path because they are not looked up at all. Measured from the
-- admin@admin.com and test@test.com seats on /data-v2, not predicted.
--
-- Only those three names change. Every arm, every WHERE and the `a.user_id = v_user` gate are
-- byte-identical to the declared door.

create or replace function platform.act_on_my_assists(
  p_verb text,
  p_ids uuid[] default null,
  p_dedupe_keys text[] default null,
  p_source_key text default null,
  p_until timestamptz default null,
  p_note text default null,
  p_flag boolean default null,
  p_result jsonb default null,
  p_metadata jsonb default null
)
returns setof uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.now();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null then
    raise exception 'act_on_my_assists: there is no signed-in caller to address'
      using errcode = '42501';
  end if;

  if p_verb = 'accept' or p_verb = 'dismiss' then
    return query
      update platform.assists a
         set status = case when p_verb = 'accept' then 'accepted' else 'dismissed' end,
             decided_at = v_now,
             result = p_result,
             decision_note = coalesce(v_note, a.decision_note)
       where a.id = any(p_ids) and a.user_id = v_user
      returning a.id;

  elsif p_verb = 'snooze' then
    return query
      update platform.assists a
         set suppressed_until = p_until
       where a.id = any(p_ids) and a.user_id = v_user
      returning a.id;

  elsif p_verb = 'restore' then
    -- `assists_resolution_valid` makes status and resolved_at inseparable, so a restore
    -- that left the timestamp behind would be refused by the table itself.
    return query
      update platform.assists a
         set status = 'pending',
             decided_at = null,
             result = null,
             suppressed_until = null,
             resolved_at = null
       where a.id = any(p_ids) and a.user_id = v_user
      returning a.id;

  elsif p_verb = 'star' then
    return query
      update platform.assists a
         set is_starred = coalesce(p_flag, false)
       where a.id = any(p_ids) and a.user_id = v_user
      returning a.id;

  elsif p_verb = 'viewed' then
    return query
      update platform.assists a
         set viewed_at = v_now
       where a.id = any(p_ids) and a.user_id = v_user and a.viewed_at is null
      returning a.id;

  elsif p_verb = 'resolve' then
    -- THE CONDITION WENT AWAY: nobody decided, so no `decided_at`.
    return query
      update platform.assists a
         set status = 'resolved', resolved_at = v_now
       where a.dedupe_key = any(p_dedupe_keys) and a.user_id = v_user
         and a.status = 'pending' and a.deleted_at is null
      returning a.id;

  elsif p_verb = 'set_metadata' then
    return query
      update platform.assists a
         set metadata = p_metadata
       where a.id = any(p_ids) and a.user_id = v_user
      returning a.id;

  elsif p_verb = 'suppress_source' then
    return query
      update platform.assists a
         set suppressed_until = p_until
       where a.user_id = v_user and a.source_key = p_source_key
         and a.status = 'pending' and a.deleted_at is null
      returning a.id;

  elsif p_verb = 'unsuppress_source' then
    -- Scoped by the exact `until` the group carries, so an ordinary per-assist snooze on a
    -- row of the same source is never swept up with the class.
    return query
      update platform.assists a
         set suppressed_until = null
       where a.user_id = v_user and a.source_key = p_source_key
         and a.suppressed_until is not distinct from p_until
      returning a.id;

  else
    raise exception 'act_on_my_assists: unknown verb %', p_verb using errcode = '22023';
  end if;
end;
$$;
