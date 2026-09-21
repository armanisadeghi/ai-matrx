-- chair-step: INVERSE — puts platform.unified_data_store_on back on the membership row alone.
CREATE OR REPLACE FUNCTION platform.unified_data_store_on(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_on boolean;
begin
  -- A person who has not picked an organization yet is not an error: they have
  -- no store to be on, and the sidebar asks this on every boot.
  if p_organization_id is null then
    return jsonb_build_object(
      'on', false,
      'organization_id', null,
      'why', 'No organization is picked yet, so there are no tables to show. Pick one and this answers for that organization.');
  end if;

  -- THE DECISION, BEFORE THE FIRST READ. Membership, not administration: this
  -- door tells you whether YOUR organization keeps its tables here, and every
  -- member of it may know that. Changing it is a different door with a
  -- different gate (platform.unified_data_store_set).
  if not iam.has_org_access(p_organization_id) then
    raise exception 'You are not in that organization, so there is nothing here to tell you about its data.'
      using errcode = '42501',
            hint = 'Switch to an organization you are a member of and ask again.';
  end if;

  v_on := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false);

  return jsonb_build_object(
    'on', v_on,
    'organization_id', p_organization_id,
    'why', case when v_on
                then 'This organization keeps its tables, fields and records in the unified record store, so its Records pages are open to everyone in it.'
                else 'This organization does not keep its data in the unified record store yet. An owner or an administrator of it turns that on once, for everybody, on the unified data ramp screen.' end);
end;
$function$

;
