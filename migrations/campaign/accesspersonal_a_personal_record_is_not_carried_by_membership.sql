-- chair-step: this REPLACES the body of one live access-kernel function outside schema `custom`, iam.member_lane_confers(uuid, uuid, text, uuid, uuid), adding ONE guard and nothing else — a custom.record row whose own visibility is below `internal` gets no level from membership. The replacement of a live kernel function is a person's read, not an allow-list shape, so it comes through this route. The store switch is unchanged: the body still returns null for an organization whose record store is off, through custom.store_is_open (custom/system_enabled). No table, column, trigger, policy or grant is touched; nothing is written. Inverse: migrations/inverse/accesspersonal_a_personal_record_is_not_carried_by_membership_down.sql restores the live body verbatim.
-- lane: ACCESS-IS-PERSONAL
-- based-on: iam.member_lane_confers(uuid, uuid, text, uuid, uuid) aedba64d2c2b2bb42758f2482f693fbb875cf1574101c34dfb114460e7ecb6f7
--
-- LANE ACCESS-IS-PERSONAL — A RECORD ITS OWNER MARKED PERSONAL IS NOT CARRIED BY MEMBERSHIP.
--
-- THE USE CASE. Cedar Ridge Veterinary Clinic's front desk edits the day sheet by membership (the
-- clinic's member_default_level is editor). The practice manager keeps her own dog's wellness
-- visit on it marked personal. Found by GRID-PRIMITIVES on the dev clone: the front desk saw it.
--
-- THE ADJUDICATION (against the doctrine, not taste). A leak in the ladder, not an intended
-- outranking. `personal` = the owner and grants addressed to the row (access STATE, Visibility:
-- "personal = owner+grants only"); the organization lanes honour the row's own visibility (DD-136,
-- the `v_vis >= 'internal'` guard in iam.has_access_for_base in front of this very function); the
-- Table edge carries no row below internal (custom.carrying_edges_of arm 3). No doctrine line says
-- an editor level outranks personal: a level is WHAT you may do to a thing you reach, visibility is
-- WHETHER membership reaches it (access STATE: "Visibility is discovery breadth; permission level
-- is what you can do"). Rule 9 (union only, no deny) is untouched — nothing a grant gave is taken.
--
-- RED on the clone before this file (AP-1 LEAK), GREEN after:
--   scripts/campaign-tests/accesspersonal_personal_record_green.sql

CREATE OR REPLACE FUNCTION iam.member_lane_confers(p_user_id uuid, p_organization_id uuid, p_type text DEFAULT 'record'::text, p_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table    uuid := p_table_id;
  v_store_on boolean;
  v_row_table      uuid;
  v_row_visibility platform.visibility;
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
  --
  -- 🚨 ACCESS-IS-PERSONAL (2026-09-24) — AND THE ROW'S OWN VISIBILITY BOUNDS THIS LANE (DD-136).
  -- Membership is the organization lane, addressed to nobody in particular, and the access
  -- kernel only ever asks this function behind `v_vis >= 'internal'` (iam.has_access_for_base).
  -- `custom.reaches_directly` arm 2 and every level read in the record store
  -- (`iam.effective_level`) asked it with no such guard, so a clinic whose members edit the day
  -- sheet by default handed the front desk the practice manager's PERSONAL appointment — while
  -- `iam.has_access_for` refused the same row and `custom.carrying_edges_of` arm 3 declined to
  -- carry it ("reached by a grant and by its creator and by nothing else"). A row below
  -- `internal` gets nothing from membership here; its owner and a grant addressed to it are
  -- admitted on their own arms, untouched. Rule 9 stands: this narrows the lane addressed to
  -- nobody, it denies nothing a grant gave. Proof: scripts/campaign-tests/accesspersonal_personal_record_green.sql.
  if p_type = 'record' and p_id is not null
     and to_regclass('custom.record') is not null then
    select r.table_id, r.visibility into v_row_table, v_row_visibility
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id;
    if v_row_visibility is not null and v_row_visibility < 'internal'::platform.visibility then
      return null;
    end if;
    if v_table is null then
      v_table := v_row_table;
    end if;
  end if;

  return iam.member_default_level(p_organization_id, v_table);
end;
$function$;
