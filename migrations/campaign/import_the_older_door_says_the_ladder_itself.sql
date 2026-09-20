-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_import_open(uuid, uuid, text, text, jsonb) 3e5f2d308894f1ed73dbd8e76e977f0c1f9382d644ad5b6745a3cac6b43180d6
--
-- LANE IMPORT — A DOOR DECIDES FOR ITSELF, EVEN WHEN IT DELEGATES.
--
-- `import_a_file_lands_once.sql` rewrote `custom.io_import_open` as one line over
-- `custom.io_import_begin`, so that there would be ONE implementation of "open an import"
-- rather than two that could drift. The delegation is right and it stays. What was wrong is
-- that the access decision went with it: `io_import_open` is itself a declared, granted,
-- SECURITY DEFINER client door taking an organization id, and its own body named no rung at
-- all. `pnpm check:store-doors-decide` turned red on it within minutes of the apply, on two
-- censuses at once:
--
--   client doors taking an organization id that never decide the caller - 1
--   declared client doors whose body never goes through the one ladder - 1
--
-- AND THE CENSUS IS RIGHT, not merely strict. A reader auditing who may open an import reads
-- THIS function; a decision made one call further in is a decision they cannot see, and the
-- next person to change `io_import_begin` — or to point this door at something else — removes
-- it without ever reading a line about access. The rule is exactly as the census states it: a
-- door into `custom` that a signed-in caller may execute decides the organization and the row
-- FIRST, in its own body. There is no door that decides nothing, and "the door I call decides"
-- is a door that decides nothing.
--
-- THE RUNG IS THE ONE THE CONTRACT INTENDS AND THE ONE W4-IO ALWAYS ASKED: EDITOR on the
-- target Table. Opening an import is a change to that Table's CONTENTS. The admin rung belongs
-- to the two places this lane creates COLUMNS — `custom.io_import_begin` with
-- `unmapped = 'create'`, and `custom.io_import_finish` with the same — and both already ask it
-- there, by name, with a refusal that points the caller at "propose" instead of stopping them.
--
-- ASKING TWICE COSTS NOTHING AND IS NOT A SECOND LADDER. `io_import_begin` asks the same three
-- questions again when this door calls it; they are the same three functions with the same
-- answers, and a door that trusted its caller to have asked would be the hole this file closes.

CREATE OR REPLACE FUNCTION custom.io_import_open(
  p_organization_id uuid,
  p_table_id        uuid,
  p_format          text  DEFAULT 'csv'::text,
  p_source_name     text  DEFAULT NULL::text,
  p_source_columns  jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v jsonb;
begin
  -- THE SWITCH, THE WALL, THE RUNG — in this door's own body, by name, before anything else,
  -- because this door is the one a reader audits and the one the census reads.
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_open');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_open');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.io_import_open',
                                          'editor'::public.permission_level, 'table');

  -- ONE IMPLEMENTATION OF "OPEN AN IMPORT". This door is the older, narrower way in — no file
  -- identity, no duplicate key, no policy — and it stays exactly that so nothing that already
  -- calls it has to change. It asks the same three questions again inside, which is correct:
  -- a door decides for itself.
  v := custom.io_import_begin(p_organization_id, p_table_id, p_format, p_source_name,
                              p_source_columns, null, '{}'::jsonb, null, null, false);
  return (v ->> 'import_id')::uuid;
end;
$function$;
