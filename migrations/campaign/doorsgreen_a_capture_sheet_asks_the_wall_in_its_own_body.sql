-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.capture_sheet_declare(uuid, uuid, text, jsonb, jsonb, uuid, uuid) ae3802238e309b8834fc467208a41f163c0837f08bcca16fa15de53c5d713721
--
-- DOORS-GREEN — THE SENTENCE WAS WRITTEN. THE LINE WAS NOT.
--
-- `pnpm check:store-doors-decide` has been RED on exactly one door since 2026-09-19:
--
--   [FAIL] declared client doors whose body never goes through the one ladder - 1:
--          custom.capture_sheet_declare(...) - declared client-callable, is SECURITY
--          DEFINER, takes an id - and its body never reaches the one ladder
--
-- THE ROOT CAUSE, and it is not the one the door's own comment claims. On 2026-09-21 lane
-- LIMITS-FIX (`limitsfix_declaring_the_same_column_twice.sql`, commit 3df6b46534) diagnosed
-- this correctly and wrote ten lines of comment into the body announcing the fix — "THE
-- ORGANIZATION WALL, ASKED HERE AND NOT ONLY DOWNSTREAM", "this is the one missing line,
-- added where the guard asks for it" — and then never wrote the line. The live body on the
-- main database carries the paragraph and no `perform`. The guard was right to stay red:
-- it strips `--` comments before it reads a body precisely so that a sentence promising the
-- ladder can never be mistaken for the ladder. That is the class this file closes, and the
-- guard already owns the guard for it.
--
-- WHAT WAS ACTUALLY OPEN. The WRITE was never open — `custom.form_declare` below asks
-- `custom.assert_client_may_change` at `admin` on the subject Table. But the `published_at`
-- read happens BEFORE that delegation and runs as the DEFINER, so a signed-in caller who
-- belongs to no part of the named organization could pass a sheet id and learn, from which
-- of two answers came back, whether that id is a published form in somebody else's
-- organization. Borrowing a delegate's check leaves everything above the delegation
-- unguarded.
--
-- THE LEVEL, matched to its siblings rather than chosen. Declaring a capture sheet is a
-- structural act on a Table — it decides what a crew may write into it — so it asks the
-- same rungs the other structural doors ask:
--
--   custom.form_declare    assert_client_may_change(org, table, 'admin', 'table')
--   custom.field_declare   assert_store_door → assert_client_may_reach(org)
--                          → assert_client_may_change(org, table, 'admin', 'table')
--   custom.table_declare   assert_store_door → assert_client_may_reach(org)
--
-- `custom.field_declare` is the complete shape and this door now carries it exactly: the
-- organization's own off switch, then the organization wall, then the right to change the
-- shape of THIS Table. A crew member shared the Table at viewer or editor is refused here
-- by the same sentence `custom.form_declare` would have given them one line later; nothing
-- changes for a caller who belongs and holds admin. This file replaces a body and nothing
-- else: no table, column, grant, door row or kernel row is touched.

CREATE OR REPLACE FUNCTION custom.capture_sheet_declare(p_organization_id uuid, p_table_id uuid, p_title text, p_questions jsonb, p_presentation jsonb DEFAULT '{}'::jsonb, p_sheet_id uuid DEFAULT NULL::uuid, p_notify_rule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid;
  v_pub     timestamptz;
  v_present jsonb;
begin
  -- THE DECISION FIRST, BEFORE ANYTHING IS READ OR WRITTEN — the same three lines
  -- custom.field_declare asks, in the same order, for the same reason: this door takes an
  -- organization id and a table id and runs as the definer, so it asks the wall and the row
  -- in its OWN body. Everything below this point, including the published_at read, is
  -- inside a decision. (DOORS-GREEN 2026-09-21: LIMITS-FIX wrote this explanation and not
  -- the perform; check:store-doors-decide strips comments before reading a body, which is
  -- why it stayed red and why it was right to.)
  perform custom.assert_store_door(p_organization_id, 'custom.capture_sheet_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.capture_sheet_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.capture_sheet_declare',
                                          'admin'::public.permission_level, 'table');

  if p_sheet_id is not null then
    select published_at into v_pub from custom.anon_form
     where organization_id = p_organization_id and id = p_sheet_id and deleted_at is null;
    if v_pub is not null then
      raise exception 'That form is published to the public, so it cannot also be a crew capture sheet.'
        using errcode = '23514',
              hint = 'A public form takes answers from strangers with the link; a capture sheet takes them from members of this organization who hold editor on the table. Close the public form first, or make the capture sheet as a new one.';
    end if;
  end if;

  -- A capture sheet is filled standing up, in the rain, on a phone. One question at a time
  -- is the default because it is the only flow that fits, not because it is fashionable.
  v_present := jsonb_build_object('flow', 'one-at-a-time') || coalesce(p_presentation, '{}'::jsonb);

  v_id := custom.form_declare(p_organization_id, p_table_id, p_title, p_questions,
                              v_present, null, null, p_notify_rule_id, p_sheet_id, null);

  update custom.anon_form set audience = 'crew'
   where organization_id = p_organization_id and id = v_id;

  return v_id;
end;
$function$;

comment on function custom.capture_sheet_declare(uuid, uuid, text, jsonb, jsonb, uuid, uuid) is
  'CAPTURE / SCR-30: declare or re-state a crew capture sheet over a Table. Decides in its OWN body, before it reads anything — custom.assert_store_door, then custom.assert_client_may_reach for the organization wall, then custom.assert_client_may_change at admin on the subject Table, the same three rungs custom.field_declare asks. custom.form_declare then re-checks admin and refuses any question that does not name a Field of that Table by name. This function adds only the audience, and refuses to convert a PUBLISHED form into a crew sheet so the check constraint anon_form_crew_is_never_public is never reached by an ordinary act.';
