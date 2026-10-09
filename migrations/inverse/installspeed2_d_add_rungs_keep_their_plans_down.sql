-- chair-step: puts custom.table_add_rung and custom.field_add_rung back to the LANGUAGE sql bodies they held before installspeed2_d_add_rungs_keep_their_plans.sql (read from the catalogue with pg_get_functiondef).

CREATE OR REPLACE FUNCTION custom.table_add_rung(p_organization_id uuid, p_table_id uuid)
 RETURNS permission_level
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- The rung a caller must hold on a Table to ADD records to it - and on a Home to land a Table in it.
  -- Editor, as always, except where the Table's (or the Home's) own document opens adding to everyone
  -- who may see it (viewer). ONE setting decides it on a Table: `members_add_rows` (CHAIR-ACCESS a):
  --   * stored true or false   - the organization's own word for this Table, either way;
  --   * absent                 - the default: ON for every Table (Arman 2026-10-05: data in the structures is by anyone). Was: ON for kept_for = agent_output (a Table the app keeps
  --                              for agent outputs, N-C6 / CHAIR-DOORS-2 g) and kept_for = context
  --                              (a scope type's Table: a member creates a scope, CA1 / CHAIR-DOORS-3A),
  --                              OFF for every other Table;
  --   * a Home (a row of the home kernel) whose document says kept_for = agent_output - the shared
  --     outputs Home: every member who may see it may land an output Table in it (lane 4 / lane 12).
  -- ADDING only. Changing a row already there is still decided on that row (custom.record_update asks
  -- the editor rung on the ROW), so a member edits only her own; and what she sees is still the
  -- ladder's answer and the row's "Shown to". On a Table kept for agent outputs a FIELD add asks this
  -- rung too (custom.field_add_rung).
  select case when exists (select 1 from custom.record t
                            where t.organization_id = p_organization_id
                              and t.id = p_table_id
                              and t.deleted_at is null
                              and (   (t.table_id = custom.table_kernel_id()
                                       and coalesce(case when jsonb_typeof(t.data -> 'members_add_rows') = 'boolean'
                                                         then (t.data ->> 'members_add_rows')::boolean end,
                                                    true))
                                   or (t.table_id = custom.person_kernel_id()
                                       and t.data ->> 'kept_for' = 'agent_output')))
              then 'viewer'::public.permission_level
              else 'editor'::public.permission_level end
$function$
;

CREATE OR REPLACE FUNCTION custom.field_add_rung(p_organization_id uuid, p_table_id uuid)
 RETURNS permission_level
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- The rung a caller must hold on a Table to ADD a column to it. Admin - the Table's shape is an
  -- admin's right - except on a Table the app keeps for agent outputs (kept_for = agent_output),
  -- where a column is born the way a row is: at the Table's own add rung (custom.table_add_rung).
  -- NC-12 (CHAIR-ACCESS a). Never for members_add_rows or context Tables: those widen rows only.
  select case when exists (select 1 from custom.record t
                            where t.organization_id = p_organization_id
                              and t.id = p_table_id
                              and t.table_id = custom.table_kernel_id()
                              and t.deleted_at is null
                              and t.data ->> 'kept_for' = 'agent_output')
              then custom.table_add_rung(p_organization_id, p_table_id)
              else 'admin'::public.permission_level end
$function$
;
