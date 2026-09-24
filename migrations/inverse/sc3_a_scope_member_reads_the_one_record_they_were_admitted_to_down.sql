-- chair-step: this puts custom.portal_admits(uuid, uuid), custom.reaches_directly(uuid, text, uuid, permission_level) and custom.assert_client_may_reach(uuid, text) back to the exact bodies sc3_a_scope_member_reads_the_one_record_they_were_admitted_to.sql replaced, drops custom.scope_member_reaches(uuid, uuid, permission_level) and removes the custom/scope_members_admitted knob row and any organization overrides of it. After it, a person holding only a scope membership is refused by every record-store door again, exactly as before the file; nobody else's access changes.
-- lane: SC-3
-- based-on: custom.portal_admits(uuid, uuid) cd7dec7fc4ece14579b738735be7bddf04cf6a260318b2004e21c30d039dce07
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) 7d952bf7c5c5813f51fda6e834b8d8888774ef621046c7d52a37ad9a3a872503
-- based-on: custom.assert_client_may_reach(uuid, text) a8aa28d3bc152ae10d655e69a897c8f6875d760fe39617f4e94568523e0a8379

CREATE OR REPLACE FUNCTION custom.portal_admits(p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  return (
  -- ONE SENTENCE, ONE PLACE. VIS-31 says an external principal is a signed-in person with
  -- no membership of a non-personal organization and that Visibility alone decides what
  -- they see. This asks the narrower question the doors need: is this person an outsider
  -- THIS organization has deliberately let in, right now.
  --
  -- The knob is read here and not at each call site, so no surface can invent a second
  -- answer. While `custom/external_principal_enabled` resolves false for an organization
  -- this returns false for everybody in it and every door refuses by name, which is
  -- exactly the answer the platform gave before this file.
  select coalesce(
           (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean,
           false)
     and (
       -- ARM 1 — A PORTAL PRINCIPAL. The organization named this person, through a live
       -- portal, as somebody whose own records live here (PORTAL, 2026-09-20).
       exists (
         select 1
           from custom.portal_principal pp
           join custom.portal p on p.id = pp.portal_id and p.is_active
          where pp.organization_id = p_organization_id
            and pp.user_id = coalesce(p_user_id, (select auth.uid()))
            and pp.user_id is not null
            and pp.is_active)

       -- ARM 2 — A TABLE OF THIS ORGANIZATION IS SHARED WITH THIS PERSON (SHARE-OUT,
       -- 2026-09-21). The everyday case: a plumber gives one customer read-only access to
       -- the Jobs table; a lab shares one experiments table with a collaborator at another
       -- university. A grant addressed to this person, on a row that IS a Table of this
       -- organization, is that organization saying — explicitly, on the record — that this
       -- outsider may reach its doors.
       --
       -- 🚨 THE GRANT IS THE ADMISSION, AND THAT IS THE WHOLE POINT. There is no second
       -- row: revoking the grant revokes the admission in the same statement, so a revoke
       -- can never leave somebody standing in the doorway. It is deliberately NOT a new
       -- guest table — schema `custom` already has one guest system and a second would be
       -- two answers to one question.
       --
       -- IT ADMITS AND NOTHING MORE. The next line of every door is the ladder, and the
       -- ladder reads this person's grants: this arm cannot show them a single row the
       -- grant does not already carry. In particular it confers no membership, so
       -- `iam.people_lists_a_non_member_can_read` is untouched and the organization's
       -- member list stays shut to them.
       or exists (
         select 1
           from iam.permissions g
           join custom.record t
             on t.id = g.resource_id
            and t.organization_id = p_organization_id
            and t.table_id = custom.table_kernel_id()
            and t.deleted_at is null
          where g.resource_type = 'record'
            and g.granted_to_user_id = coalesce(p_user_id, (select auth.uid()))
            and g.granted_to_user_id is not null
            and g.status = 'active'
            and (g.expires_at is null or g.expires_at > now()))
     )
  );
end
$function$
;

CREATE OR REPLACE FUNCTION custom.reaches_directly(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- DOES SOMETHING REACH THIS ROW? Arms 1, 2 and 3 of the one ladder, and nothing else. This is
-- not a second ladder: `custom.has_visibility` has no copy of these arms any more, it calls
-- this. The split exists because a Table answers YES to a fourth question — "may this person
-- know it" — that must never be read as "it carries everything inside it".
declare
  rec         record;
  v_org       uuid;
  v_table     uuid;
  v_cap       public.permission_level;
  v_cap_asked boolean := false;
begin
  if p_user_id is null or p_id is null then return false; end if;

  if p_type = 'record' then
    select r.organization_id, r.table_id into v_org, v_table
      from custom.record r
     where r.id = p_id;
  end if;

  -- ARM 1 — THE PLATFORM'S OWN ACCESS KERNEL, asked and not reimplemented. Ownership, grant
  -- rows, the organization lanes (which honour the row's own `visibility`, DD-136), the
  -- containment walk, the public and global-readable system-organization arms.
  --
  -- IT IS GOVERNED BY THE CAP TOO (LADDER-CAP). One of the lanes inside it IS the organization
  -- default — the least specific rung there is — and leaving arm 1 alone let that lane overrule
  -- a grant somebody addressed to this person on the record's TABLE or on a home of it. The cap
  -- carries the lanes addressed to nobody (ownership, the admin lanes, public grants) at the top
  -- level, so nothing arm 1 exists for is taken away.
  if iam.has_access_for(p_user_id, p_type, p_id, p_required) then
    if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19), under the same
  -- cap. It is a VETO and never turns a no into a yes, so it is asked where an arm would say
  -- yes and not on a walk that ends in no. A refusal ENDS the walk: arm 3 is less specific still
  -- and is governed by the same cap, so it could only be refused as well.
  if iam.effective_level(p_user_id, p_type, p_id, v_org, v_table) >= p_required then
    if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING, including (since SHARED-ONLY) the Table a record lives
  -- in. An ancestor conveys at most `conveys_max`, and the first ancestor that conveys enough
  -- AND that this principal reaches at that level answers true — subject to the same cap.
  for rec in
    select a.container_type, a.container_id
      from custom.visibility_ancestors(p_type, p_id) a
     where a.max_level >= p_required
     order by a.depth
  loop
    -- THE TERMINAL TABLE HAS ITS OWN NAMED FORM (LEAK-T10). It is the one ancestor the
    -- set-based door also has to ask about, on its own, for a whole page at once — so the
    -- question lives in one body that both callers run, and neither can drift from the other.
    if (rec.container_type = 'record' and rec.container_id = v_table
        and custom.table_carries_its_rows(p_user_id, rec.container_id, p_required))
       or (not (rec.container_type = 'record' and rec.container_id = v_table)
           and iam.has_access_for(p_user_id, rec.container_type, rec.container_id, p_required))
    then
      if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
    end if;
  end loop;

  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.assert_client_may_reach(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:r:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  if coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
     and custom.portal_admits(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $function$

;

drop function if exists custom.scope_member_reaches(uuid, uuid, public.permission_level);

delete from platform.knob_override where feature = 'custom' and key = 'scope_members_admitted';
delete from platform.feature_knob where feature = 'custom' and key = 'scope_members_admitted';
