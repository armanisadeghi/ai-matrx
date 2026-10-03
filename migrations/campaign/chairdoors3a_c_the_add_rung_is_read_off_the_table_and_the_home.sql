-- chair-step: this REPLACES the body of one helper, custom.table_add_rung(uuid, uuid) (same signature, STABLE, SECURITY INVOKER, EXECUTE held by nobody but the store's owner - only the store's own SECURITY DEFINER add doors call it). It widens WHO MAY ADD in three named cases and nothing else: a member who may see a scope type's Table (kept_for = context) may add a scope to it; a member who may see an ordinary Table whose document says members_add_rows = true may add a row to it; and the same function now answers viewer for a Home whose document says kept_for = agent_output, so a door that lands a Table in a Home can ask it. No door body, table, column, index, policy, grant or data row is touched.
-- lane: CHAIR-DOORS-3A (CA1 for v6 lane 9 SCOPES-ON-THE-STORE; add-own-rows and the outputs Home for lanes 12 and 4)
-- based-on: custom.table_add_rung(uuid, uuid) 9e455cc4b270cacfa1822d64564408dd5b886e6048557f6b117cb1aee3f4a090
--
-- THE ADD RUNG IS READ OFF THE TABLE, AND OFF THE HOME.
-- CA1 (chair ruling): members may create scopes as the old scope doors allowed (is_platform_admin or
--   iam.has_org_access - any member); the store must not narrow them. Before this file custom.record_write
--   refused a member on a scope type's Table: "You hold the viewer level on this table, and
--   custom.record_write needs the editor level." Editing a scope still follows the row and the type's rules.
-- ADD-OWN-ROWS (lane 12, HR proof two gap 2): an ordinary Table whose document says members_add_rows = true
--   takes rows from every member who may see it; each member edits only her own (the row decides). Set it
--   in the Table's document (custom.table_ensure / custom.table_declare carry it from the spec). What she
--   SEES of other people's rows is the ladder's answer plus the rows' "Shown to" (give the Table
--   row_defaults shown_to = only_me so lists show her own); a row nobody else may open by id is the
--   Confidential level, which stays behind Arman's door.
-- THE OUTPUTS HOME (lane 4 via lane 12): a Home that says kept_for = agent_output answers viewer here, so
--   custom.table_ensure can ask custom.table_add_rung(org, home_id) in place of its fixed 'editor'.
--
-- Guard (dev clone): scripts/campaign-tests/chairdoors3a_the_add_rung_red_green.ts
-- Inverse: migrations/inverse/chairdoors3a_c_the_add_rung_is_read_off_the_table_and_the_home_down.sql

CREATE OR REPLACE FUNCTION custom.table_add_rung(p_organization_id uuid, p_table_id uuid)
 RETURNS public.permission_level
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- The rung a caller must hold on a Table to ADD records to it - and on a Home to land a Table in it.
  -- Editor, as always, except where the Table's (or the Home's) own document opens adding to everyone
  -- who may see it (viewer):
  --   * kept_for = agent_output  - a Table the app keeps for agent outputs (N-C6, CHAIR-DOORS-2 g);
  --   * kept_for = context       - a scope type's Table: a member creates a scope, as the old scope
  --                                doors allowed (CA1, chair ruling 2026-10-03, CHAIR-DOORS-3A);
  --   * members_add_rows = true  - the per-Table setting "members add their own rows" on an ordinary
  --                                Table (lane 12 HR proof two, CHAIR-DOORS-3A);
  --   * a Home (a row of the home kernel) whose document says kept_for = agent_output - the shared
  --     outputs Home: every member who may see it may land an output Table in it (lane 4 / lane 12).
  -- ADDING only. Changing a row already there is still decided on that row (custom.record_update
  -- asks the editor rung on the ROW), so a member edits only her own; and what she sees is still the
  -- ladder's answer and the row's "Shown to".
  select case when exists (select 1 from custom.record t
                            where t.organization_id = p_organization_id
                              and t.id = p_table_id
                              and t.deleted_at is null
                              and (   (t.table_id = custom.table_kernel_id()
                                       and (t.data ->> 'kept_for' in ('agent_output', 'context')
                                            or t.data -> 'members_add_rows' = 'true'::jsonb))
                                   or (t.table_id = custom.person_kernel_id()
                                       and t.data ->> 'kept_for' = 'agent_output')))
              then 'viewer'::public.permission_level
              else 'editor'::public.permission_level end
$function$;
