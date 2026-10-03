-- chair-step: undo chairdoors3a_c_the_add_rung_is_read_off_the_table_and_the_home.sql - restores the body of custom.table_add_rung(uuid, uuid) exactly as CHAIR-DOORS-2 g left it (viewer on a Table kept for agent outputs, editor on every other). Nothing else is touched.
-- lane: CHAIR-DOORS-3A
-- based-on: custom.table_add_rung(uuid, uuid) ad205a43c5702b382f8cad5caaa18a46a075dc9733479e9456655dc0c34652b9

CREATE OR REPLACE FUNCTION custom.table_add_rung(p_organization_id uuid, p_table_id uuid)
 RETURNS public.permission_level
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- The rung a caller must hold on a Table to ADD records to it. A Table the app keeps for agent
  -- outputs (its document stores kept_for = agent_output, the SC-1 placement custom.table_placement
  -- reads) takes additions from everyone who may see it; every other Table, editor, as always.
  select case when exists (select 1 from custom.record t
                            where t.organization_id = p_organization_id
                              and t.id = p_table_id
                              and t.table_id = custom.table_kernel_id()
                              and t.deleted_at is null
                              and t.data ->> 'kept_for' = 'agent_output')
              then 'viewer'::public.permission_level
              else 'editor'::public.permission_level end
$function$;
