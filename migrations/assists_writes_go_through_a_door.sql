-- chair-step: it grants EXECUTE on the new door to `authenticated` and revokes the PUBLIC default, which the additive allow-list refuses by name. Nothing existing is replaced: one NEW function, its two privilege statements, and one row in platform.client_callable_door.
-- FIX-10A-ASSISTS, 2026-09-22.
--
-- THE DEFECT, as VERIFIER-10 F14 recorded it: every `/data-v2/*` page load, from any seat,
-- logged `403` + `[assists] resolve failed: permission denied for table assists` into the
-- browser console and swallowed it. The capture ladder calls
-- `resolveAssistsByDedupeKeys()` on mount; that function UPDATEs `platform.assists` directly
-- over PostgREST, and the doors-only closure on schema `platform` withdrew every write grant
-- from `authenticated` (it holds SELECT and nothing else). Ten more writes in the same
-- service — snooze, restore, decide, star, viewed, bulk dismiss, bulk snooze, the source
-- quiet and its rollback — are the same defect, unpressed.
--
-- THE FIX IS NOT A GRANT. `platform` is doors-only: reads stay under RLS, writes go through a
-- SECURITY DEFINER door. This is that door — ONE door for the whole assist mutation surface,
-- because every one of those eleven calls is the same sentence: *act on an assist addressed
-- to me*. The door derives the addressee from `auth.uid()` and every arm carries
-- `a.user_id = v_user` in its own WHERE, so a caller can never touch a row addressed to
-- somebody else — the client code it replaces relied on the table's restrictive
-- `assists_user_id_is_addressable_update` policy for exactly that and each call site was
-- already reading its own rows only.
--
-- It returns the ids it changed, because four of the callers report a count a person reads.

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
  v_note text := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_note, '')), '');
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
             decision_note = pg_catalog.coalesce(v_note, a.decision_note)
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
         set is_starred = pg_catalog.coalesce(p_flag, false)
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

revoke all on function platform.act_on_my_assists(
  text, uuid[], text[], text, timestamptz, text, boolean, jsonb, jsonb
) from public;
grant execute on function platform.act_on_my_assists(
  text, uuid[], text[], text, timestamptz, text, boolean, jsonb, jsonb
) to authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   gate_predicate, signed_in_callers, anonymous_callers)
values
  ('platform', 'act_on_my_assists',
   'p_verb text, p_ids uuid[], p_dedupe_keys text[], p_source_key text, p_until timestamptz, p_note text, p_flag boolean, p_result jsonb, p_metadata jsonb',
   array['text'::regtype, 'uuid[]'::regtype, 'text[]'::regtype, 'text'::regtype,
         'timestamptz'::regtype, 'text'::regtype, 'boolean'::regtype, 'jsonb'::regtype,
         'jsonb'::regtype]::oid[],
   'Schema platform is doors-only and authenticated holds SELECT on platform.assists and nothing else, so every browser assist mutation - snooze, restore, accept, dismiss, star, viewed, resolve, and the producer quiet with its note and its rollback - answered 42501 into the console. This is the one door for that whole surface. It takes no addressee: the row must satisfy a.user_id = v_user, where v_user is auth.uid(), in every arm, so a caller can only act on an assist addressed to itself.',
   'migrations/assists_writes_go_through_a_door.sql',
   'a.user_id = v_user',
   true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
