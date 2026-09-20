-- chair-step: it DROPS custom.my_levels(uuid, uuid[], text) and DELETES that signature's client-door row. Both are one hour old, landed by this same lane earlier in this session, named in no application code, no package and no other migration, and reachable only from PostgREST's array coercion - so leaving them beside the jsonb signature would make which door a caller reaches depend on how its transport encoded an array, which is the defect this file removes. Nothing else in the store refers to either object.
-- UI-HONEST — THE LEVEL DOOR TAKES THE LIST THE WAY A CLIENT ACTUALLY SENDS IT.
--
-- `custom.my_levels(uuid, uuid[], text)` landed an hour before this file and was
-- immediately wrong in one way that only a real caller could find: a client
-- sends its arguments as JSON, and a JSON array reaches a Postgres function as
-- `jsonb`. The harness that carries this package's calls said so exactly —
-- "function custom.my_levels(p_organization_id => unknown, p_ids => jsonb,
-- p_type => unknown) does not exist" — and PostgREST's own coercion of a JSON
-- array into `uuid[]` is a convenience of ONE transport, not a property of the
-- door. A door whose signature only works from one of the two ways this
-- platform reaches the store is a door with a trapdoor in it.
--
-- So the door takes `jsonb` and reads the ids out of it. Every transport sends
-- the same bytes, and a list of ids that is not a list of ids is refused by
-- name rather than by a 42883 nobody can act on.
--
-- WHAT THIS DOES, in order:
--   1. Creates `custom.my_levels(uuid, jsonb, text)` — the same body, the same
--      two decisions before the first read, the same "every id asked about gets
--      a row, null included".
--   2. Deletes the `uuid[]` declaration row and drops that function. It is one
--      hour old, it is named in no application code and in no other migration,
--      and leaving two signatures of one name behind would make which one a
--      caller reaches depend on how its transport happened to encode an array
--      — which is the defect this file exists to remove, not to duplicate.
--
-- THE INVERSE: migrations/inverse/uihonest_the_level_door_takes_a_json_list_down.sql

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.my_levels(
  p_organization_id uuid,
  p_ids jsonb,
  p_type text DEFAULT 'record'::text
)
 RETURNS TABLE(id uuid, level public.permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.my_levels');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.my_levels');

  v_me := custom.query_principal();
  if v_me is null then
    raise exception 'Nobody is signed in, so there is no access to describe.'
      using errcode = '42501',
            hint = 'DOOR-1: this door resolves the person from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;

  if p_ids is not null and jsonb_typeof(p_ids) <> 'array' then
    raise exception 'This door was asked about a list of things and was not given a list.'
      using errcode = '22023',
            hint = 'p_ids is a JSON array of record ids, for example ["11111111-1111-4111-8111-111111111111"].';
  end if;

  -- Every id asked about gets a row. A subject this person holds nothing on
  -- answers null, because a missing row and "no access" would be the same thing
  -- to the screen that asked, and one of them is a silence.
  return query
  select a.asked::uuid,
         custom.effective_level(v_me, p_organization_id, a.asked::uuid,
                                coalesce(nullif(btrim(p_type), ''), 'record'))
    from jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) as a(asked);
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values (
  'custom', 'my_levels', 'p_organization_id uuid, p_ids jsonb, p_type text',
  array['uuid'::regtype::oid, 'jsonb'::regtype::oid, 'text'::regtype::oid],
  true, false,
  'migrations/campaign/uihonest_the_level_door_takes_a_json_list.sql (lane UI-HONEST)',
  'What level the CALLER holds on the subjects they name, so a screen can offer exactly the controls the person may use instead of offering everything and letting a door refuse after they have typed. The sixth-pass verdict watched a colleague shared a table at viewer get a live cell editor, type a value and be refused only on Enter; there was no way for any screen to know, because custom.effective_level is closed to clients (rightly - it takes any principal and any subject and would be a visibility probe) and the read door answers the caller''s level on the TABLE only. This door is about the caller and nobody else: no principal argument, the person resolved from the session, the organization''s off switch and the organization wall decided before the first read, and null - never a missing row - for a subject they hold nothing on, so it cannot tell anyone that a record exists. It takes the ids as a JSON array because that is what every client transport sends.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- The one-hour-old uuid[] signature goes, declaration first so nothing re-grants it.
delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'my_levels'
   and identity_argtypes = array['uuid'::regtype::oid, '_uuid'::regtype::oid, 'text'::regtype::oid];

drop function if exists custom.my_levels(uuid, uuid[], text);

-- The grant follows from the declaration, and only from the declaration.
select custom.reopen_declared_doors();
