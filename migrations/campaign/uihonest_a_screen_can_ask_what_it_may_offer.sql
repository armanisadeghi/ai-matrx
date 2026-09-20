-- UI-HONEST — A SCREEN CAN ASK WHAT IT MAY OFFER, BEFORE IT OFFERS IT.
--
-- WHAT A PERSON HIT (independent verdict, sixth pass, 19-20 September). A
-- colleague who was shared a table opened it, double-clicked a cell, got a live
-- editor, typed a value, pressed Enter — and only THEN was told she may not
-- write: "You do not have access to this record, so custom.record_update may
-- not write to it." The permission was right. The screen told her she could.
--
-- WHY NO SCREEN COULD DO BETTER. The store answers "what may this person do to
-- this thing?" in exactly one place, `custom.effective_level`, and that function
-- is SECURITY DEFINER with NO grant to `authenticated` and no decision of its
-- own in its body: it takes ANY user id and ANY subject id and answers. Granting
-- it to a client would let any signed-in person probe the visibility of any row
-- of any organization, so it is right that it is closed — and it left every
-- screen in the product with two choices, both dishonest: assume the person may
-- do everything and let the door refuse after the fact (which is what
-- `storeDecidesRights` did), or assume they may do nothing and hide controls
-- from the people who hold them.
--
-- The read door already answers the TABLE half for free: `custom.read_records`
-- returns `level`, the caller's level on the table, on every row, and the
-- client threw it away. That half needs no door and gets none.
--
-- The RECORD half has no answer a client can reach at all, which is why the
-- grid labelled a row "viewer" while the store let its owner write to it.
--
-- WHAT THIS FILE DOES. One new door, `custom.my_levels`, which answers the
-- question a screen actually asks and only that question:
--
--   "For these subjects of this organization, what level do *I* hold?"
--
--   1. It is about the CALLER and nobody else. There is no principal argument:
--      the caller is resolved from the session (`custom.query_principal()`), the
--      same way `custom.read_records` resolves its reader. A person can ask
--      about their own access and cannot ask about anybody else's, so it is not
--      the probe that granting `custom.effective_level` would be.
--   2. THE DECISION FIRST, IN THE BODY, BEFORE THE FIRST READ: the
--      organization's own off switch (`custom.assert_store_door`) and then the
--      organization wall (`custom.assert_client_may_reach`), which is the pair
--      every definer door of this store opens with and what
--      `platform.door_body_must_decide` requires of a declared definer row.
--   3. It answers for a LIST of subjects in one call, because the alternative is
--      a screen making one call per row of a page — the N+1 that turns an honest
--      grid into a slow one and gets reverted three weeks later.
--   4. A subject this caller holds nothing on answers `null`, which is an
--      answer. It never omits a row, because a missing row and "no access" would
--      be indistinguishable to the screen that asked.
--
-- It is an ORACLE ONLY OVER WHAT THE CALLER ALREADY REACHES: `null` for a row
-- that does not exist and `null` for a row in this organization the caller holds
-- nothing on are the same answer, so it cannot be used to discover that a record
-- exists.
--
-- ADDITIVE: it creates one function, inserts one registry row, and issues the
-- one EXECUTE grant that row implies. It drops nothing, revokes nothing, and
-- changes no existing object.
--
-- THE INVERSE: migrations/inverse/uihonest_a_screen_can_ask_what_it_may_offer_down.sql

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.my_levels(
  p_organization_id uuid,
  p_ids uuid[],
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
  -- The decision comes BEFORE the read, so a foreign organization id and an
  -- invented one answer identically.
  perform custom.assert_store_door(p_organization_id, 'custom.my_levels');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.my_levels');

  v_me := custom.query_principal();
  if v_me is null then
    raise exception 'Nobody is signed in, so there is no access to describe.'
      using errcode = '42501',
            hint = 'DOOR-1: this door resolves the person from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;

  -- Every id asked about gets a row. A subject this person holds nothing on
  -- answers null, because a missing row and "no access" would be the same thing
  -- to the screen that asked, and one of them is a silence.
  return query
  select a.asked,
         custom.effective_level(v_me, p_organization_id, a.asked, coalesce(nullif(btrim(p_type), ''), 'record'))
    from unnest(coalesce(p_ids, '{}'::uuid[])) as a(asked);
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values (
  'custom', 'my_levels', 'p_organization_id uuid, p_ids uuid[], p_type text',
  array['uuid'::regtype::oid, '_uuid'::regtype::oid, 'text'::regtype::oid],
  true, false,
  'migrations/campaign/uihonest_a_screen_can_ask_what_it_may_offer.sql (lane UI-HONEST)',
  'What level the CALLER holds on the subjects they name, so a screen can offer exactly the controls the person may use instead of offering everything and letting a door refuse after they have typed. The sixth-pass verdict watched a colleague shared a table at viewer get a live cell editor, type a value and be refused only on Enter; there was no way for any screen to know, because custom.effective_level is closed to clients (rightly - it takes any principal and any subject and would be a visibility probe) and the read door answers the caller''s level on the TABLE only. This door is about the caller and nobody else: no principal argument, the person resolved from the session, the organization''s off switch and the organization wall decided before the first read, and null - never a missing row - for a subject they hold nothing on, so it cannot tell anyone that a record exists.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- The grant follows from the declaration, and only from the declaration.
select custom.reopen_declared_doors();
