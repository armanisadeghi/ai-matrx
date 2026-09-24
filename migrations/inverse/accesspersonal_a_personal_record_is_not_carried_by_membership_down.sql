-- chair-step: this restores the live body of iam.member_lane_confers(uuid, uuid, text, uuid, uuid) that accesspersonal_a_personal_record_is_not_carried_by_membership.sql replaced, byte-for-byte as read from production and the clone on 2026-09-24 (sha256 aedba64d2c2b2bb42758f2482f693fbb875cf1574101c34dfb114460e7ecb6f7). Undoing it RE-OPENS the leak: a member of an organization whose default level is above none reaches every row marked personal in the record store.
-- lane: ACCESS-IS-PERSONAL
-- based-on: iam.member_lane_confers(uuid, uuid, text, uuid, uuid) 9417b0fe761748a87fa55b8eb5a964d59e985b49b4e29d0409a147789db6ea09

CREATE OR REPLACE FUNCTION iam.member_lane_confers(p_user_id uuid, p_organization_id uuid, p_type text DEFAULT 'record'::text, p_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table    uuid := p_table_id;
  v_store_on boolean;
begin
  if p_user_id is null or p_organization_id is null then
    return null;
  end if;

  -- Membership itself. Not a role check: `owner` and `admin` reach their own arms earlier and
  -- are not affected by anything here (VIS-20 is a different question from VIS-19).
  if not exists (select 1 from iam.organization_member om
                  where om.user_id = p_user_id and om.organization_id = p_organization_id) then
    return null;
  end if;

  -- THE CAMPAIGN'S OFF SWITCH, read the established way (`custom.store_is_open`'s own body,
  -- inlined so this file's guard is a line of code and not a sentence about one).
  begin
    v_store_on := custom.store_is_open(p_organization_id);
  exception when others then
    v_store_on := false;
  end;
  if not v_store_on then
    return null;
  end if;

  -- VIS-33. The organization may say that membership alone shows nothing at all.
  if not iam.member_lane_open(p_organization_id) then
    return null;
  end if;

  -- VIS-19, THE OVERRIDE. Somebody has decided about this person and this thing, so the role
  -- default is not the answer - the grant is, and it is admitted on its own arm.
  --
  -- IT IS THIS ROW AND NOT THE WHOLE SPECIFICITY LADDER, DELIBERATELY (LADDER-CAP). The Table
  -- and the homes are rungs too, and they are read by `custom.addressed_cap`, which
  -- `custom.reaches_directly` asks ONCE per question. Asking them here put a containment walk
  -- inside the access kernel's per-node loop and cost the page-read path 61%.
  if p_id is not null
     and iam.grant_addressed_level(p_user_id, p_type, p_id) is not null then
    return null;
  end if;

  -- AGT-5. The default is held PER REGISTERED TABLE, so the Table is read off the row rather
  -- than guessed. `to_regclass` keeps this callable before the store exists.
  if v_table is null and p_type = 'record' and p_id is not null
     and to_regclass('custom.record') is not null then
    select r.table_id into v_table
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id;
  end if;

  return iam.member_default_level(p_organization_id, v_table);
end;
$function$;
