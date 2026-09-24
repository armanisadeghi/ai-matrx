-- chair-step: this CREATES one SECURITY DEFINER read door, users.credential_item_holdings(uuid[]), declares it in platform.client_callable_door (signed-in callers only, with its argument rule) and then GRANTs EXECUTE on it to authenticated. A GRANT is refused by the additive allow-list by name, so it comes through this route. It writes nothing: for each credential id the CALLER may read under users.credential_items' own read rule, it answers how many live fields and files that credential holds — counts, never a value. No table, column, policy, trigger or existing function is touched. Inverse: migrations/inverse/errorshonest_s8_a_credential_says_how_much_it_holds_down.sql revokes, closes the door row with its reason, and drops the function.
-- lane: ERRORS-HONEST
--
-- LANE ERRORS-HONEST — AN EMPTY CREDENTIAL IS A FACT, NOT A FAILURE.
--
-- THE USE CASE. Pinecrest Records keeps one credential in its organization vault, "Pinecrest
-- Records — Bandcamp label login", made before anyone had typed the label's username and password
-- into it. Alex Hart (test@test.com), a member, opens the vault on Pinecrest Records: the whole list
-- is replaced by "Your vault has 1 item but none of their fields or files could be read … report
-- it", and the one credential she has is not shown at all.
--
-- WHY THE LIST COULD NOT TELL. The alarm (DD-160) exists because RLS refuses a row by returning
-- nothing: from 2026-07 to 2026-09-12 a restrictive policy on users.user_secrets hid every field
-- from its own owner and the screen reported success. Seen from the client, "the read was filtered"
-- and "there is nothing to read" are the same empty array, so the list guessed — and guessed wrong
-- for every credential that is simply empty.
--
-- THIS DOOR IS THE TRUTH THE CLIENT CANNOT SEE. For each id the caller may read — decided by
-- users.credential_items' OWN read rule, read from its live policies and evaluated as the caller
-- (auth.uid()), so the door can never grow a second, drifting idea of who may open a credential —
-- it counts the live rows in users.user_secrets and users.credential_attachments. An id the caller
-- may not read, or one that does not exist, gets no row: the same answer for both, and never a
-- count of someone else's credential. The list then raises its alarm ONLY for a credential that
-- holds something the read did not return, and shows an empty one as what it is.

create or replace function users.credential_item_holdings(p_item_ids uuid[])
 returns table(credential_item_id uuid, field_count integer, file_count integer)
 language plpgsql
 stable
 security definer
 set search_path = ''
as $function$
declare
  v_rule    text;
  v_visible uuid[];
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to read your vault.' using errcode = '42501';
  end if;
  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    return;
  end if;
  if cardinality(p_item_ids) > 1000 then
    raise exception 'users.credential_item_holdings takes at most 1000 credential ids at once (got %).', cardinality(p_item_ids)
      using errcode = '22023',
            hint = 'Ask for the credentials of one vault list at a time.';
  end if;

  -- The table's own read rule, as written today: its permissive SELECT policies ORed, its
  -- restrictive ones ANDed. pg_policies deparses under this function's empty search_path, so
  -- every name in the rule comes back schema-qualified.
  select coalesce('(' || string_agg('(' || p.qual || ')', ' or ') filter (where p.permissive = 'PERMISSIVE') || ')', 'false')
         || coalesce(' and ' || string_agg('(' || p.qual || ')', ' and ') filter (where p.permissive = 'RESTRICTIVE'), '')
    into v_rule
    from pg_catalog.pg_policies p
   where p.schemaname = 'users'
     and p.tablename = 'credential_items'
     and p.cmd in ('SELECT', 'ALL')
     and p.qual is not null
     and p.roles && array['authenticated', 'public']::name[];

  execute format(
    'select coalesce(array_agg(id), ''{}''::uuid[]) from users.credential_items
      where id = any($1) and deleted_at is null and (%s)', coalesce(v_rule, 'false'))
    into v_visible
    using p_item_ids;

  return query
    select v.id,
           (select count(*)::integer from users.user_secrets s
             where s.credential_item_id = v.id and s.deleted_at is null),
           (select count(*)::integer from users.credential_attachments a
             where a.credential_item_id = v.id and a.deleted_at is null)
      from unnest(v_visible) as v(id);
end;
$function$;

comment on function users.credential_item_holdings(uuid[]) is
  'ERRORS-HONEST: how many live fields and files each credential the caller may read holds (counts only, never a value). An unreadable or invented id gets no row. The vault list asks it before calling an empty read a failure.';

-- No REVOKE: the definer's birth already clears PUBLIC's default EXECUTE (ddl_guard
-- definer_default_public_execute_cleared_at_birth), and anon is never granted.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason, argument_rules)
select 'users', 'credential_item_holdings', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/errorshonest_s8_a_credential_says_how_much_it_holds.sql (lane ERRORS-HONEST)',
       'Signed-in read door for the vault list. SECURITY DEFINER only so it can COUNT the field and file rows of a credential whose field read came back empty; which credentials it answers for is decided by users.credential_items'' own live read rule evaluated as auth.uid(). Returns counts, never a value; an unreadable id answers exactly like an invented one (no row).',
       jsonb_build_object(
         'version', 1,
         'declared_by', 'errorshonest_s8_a_credential_says_how_much_it_holds.sql',
         'declared_at', '2026-09-24 lane ERRORS-HONEST',
         'arguments', jsonb_build_object(
           'p_item_ids', jsonb_build_object(
             'type', 'uuid[]',
             'position', 1,
             'entity', 'credential_item',
             'check', 'every id is kept only if users.credential_items'' own read rule (its live policies, evaluated as auth.uid()) admits it; the rest are dropped before anything is counted.',
             'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true,
                                           'note', 'an unreadable id and an invented id both answer no row'),
             'null_rule', jsonb_build_object('means', 'no credentials, so no rows'),
             'verified', '2026-09-24 lane ERRORS-HONEST — written with this body')))
  from pg_proc p
 where p.proname = 'credential_item_holdings' and p.pronamespace = 'users'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'users' and d.function_name = 'credential_item_holdings'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function users.credential_item_holdings(uuid[]) to authenticated;
