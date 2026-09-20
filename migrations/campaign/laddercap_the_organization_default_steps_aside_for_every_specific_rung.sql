-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: iam.member_lane_confers(uuid, uuid, text, uuid, uuid) 94d3fe04ee1b5a72557211ff597c0d3cf6539023d798ddfd5d6a7abf5ff824ac
-- based-on: custom.addressed_cap(uuid, text, uuid, uuid, uuid) ff59a9e22a014513fcedd6659dfd4bc569e8e1da67f9d03b5dd8db138e85d06b
--
-- LADDER-CAP — VIS-19 IS ABOUT SPECIFICITY, NOT ABOUT "THIS ROW".
--
-- FOUND BY THIS LANE'S OWN GREEN SUITE, which asks all four content levels against all four
-- addressed rungs instead of the one the reproduction happened to use:
--
--     1 FAILED — rung "table" addressed to her at viewer, every less specific rung at admin:
--     the store answered admin on 1ef1ca00-...-c31. A less specific rung RAISED her level.
--
-- The cap landed governing arms 2 and 3 and deliberately NOT arm 1, the platform kernel. That
-- was right about ownership and the admin and public lanes and WRONG about one lane inside it:
-- the kernel's own ORGANIZATION-MEMBER arm IS rung 5, the organization default, and it is the
-- least specific rung there is. With the grant addressed to her on the TABLE (rung 2) and no
-- grant on the record, `iam.member_lane_confers` saw nothing addressed "on this thing", handed
-- the kernel the organization's `admin` default, and the kernel returned true before the cap was
-- ever consulted. Same for a grant on a HOME (rung 3). Only rung 1 was protected, because VIS-19
-- was written as "a grant addressed to this person and THIS THING" when the rule it implements
-- is "the MOST SPECIFIC grant addressed to this person".
--
-- SO THE RULE MOVES TO ONE PLACE AND BOTH READERS ASK IT. `custom.addressed_cap_specific` is
-- "is a rung MORE SPECIFIC than the organization default addressed to this person, and at what
-- level" — the record, its Table, its homes, and ownership of any of them. The kernel's
-- organization-member lane steps aside when it answers (VIS-19, generalised from one rung to
-- all three), and `custom.addressed_cap` is that answer or, when there is none, the
-- organization's own word. Neither can drift from the other because there is only one body.
--
-- IT STILL CANNOT LOWER ANYBODY WHOSE REACH IS ADDRESSED TO NOBODY. Ownership, the organization-
-- admin and platform-admin lanes, the public and library lanes and the global-readable system
-- organization are all untouched inside the kernel, and the grant a person actually holds is
-- admitted on its own arm at its own level — stepping the role default aside never removes it.
--
-- THE COST IS GATED. The walk over a subject's homes is the expensive rung, so it runs only when
-- it could answer: a person who holds no live grant addressed to her anywhere and owns no record
-- in this organization has no rung 1, 2 or 3 at all, and that is two indexed probes.

create function custom.addressed_cap_specific(p_user_id uuid, p_type text, p_id uuid,
                                              p_organization_id uuid default null,
                                              p_table_id uuid default null)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_lvl public.permission_level;
  a     record;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- RUNG 1 — THE ROW ITSELF. Ownership is the strongest address there is (VIS-25).
  if iam.owner_of(p_type, p_id) = p_user_id then return iam.top_content_level(); end if;
  v_lvl := iam.grant_addressed_level(p_user_id, p_type, p_id);
  if v_lvl is not null then return v_lvl; end if;

  -- RUNG 2 — THE TABLE THE ROW LIVES IN. A Table is a record (REC-25), asked exactly as rung 1.
  if p_table_id is not null and p_table_id is distinct from p_id then
    if iam.owner_of('record', p_table_id) = p_user_id then return iam.top_content_level(); end if;
    v_lvl := iam.grant_addressed_level(p_user_id, 'record', p_table_id);
    if v_lvl is not null then return v_lvl; end if;
  end if;

  -- THE GATE. Rung 3 is a graph walk and it is the only expensive thing here, so it runs only
  -- when it could possibly answer: somebody must have addressed a live grant to this person
  -- somewhere, or she must own a record in this organization. Two indexed probes against a walk.
  if not exists (select 1 from iam.permissions p
                  where p.status <> 'rejected'
                    and (p.expires_at is null or p.expires_at > now())
                    and not coalesce(p.is_public, false)
                    and (p.granted_to_user_id = p_user_id
                         or p.granted_to_organization_id in (select om.organization_id
                                                               from iam.organization_member om
                                                              where om.user_id = p_user_id)))
     and not exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id
                        and r.created_by = p_user_id
                        and r.deleted_at is null)
  then
    return null;
  end if;

  -- RUNG 3 — THE HOMES, SHALLOWEST FIRST, because a nearer container is the more specific word.
  -- An ancestor can never address more than it conveys, so `conveys_max` bounds it here exactly
  -- as it bounds the carry in arm 3 of the ladder.
  for a in
    select c.container_type, c.container_id, c.max_level, c.depth
      from custom.visibility_ancestors(p_type, p_id) c
     where c.container_id is distinct from p_table_id
     order by c.depth
  loop
    if iam.owner_of(a.container_type, a.container_id) = p_user_id then
      return least(a.max_level, iam.top_content_level());
    end if;
    v_lvl := iam.grant_addressed_level(p_user_id, a.container_type, a.container_id);
    if v_lvl is not null then return least(a.max_level, v_lvl); end if;
  end loop;

  return null;
end;
$function$;

comment on function custom.addressed_cap_specific(uuid, text, uuid, uuid, uuid) is
  'LADDER-CAP: the level of the most specific rung addressed to this person that is MORE SPECIFIC than the organization default - the row, its Table, its homes, and ownership of any of them. NULL when none is. This is the one body VIS-19 and the cap both ask.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'addressed_cap_specific',
   'p_user_id uuid, p_type text, p_id uuid, p_organization_id uuid, p_table_id uuid',
   array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'p_user_id is the person being ASKED ABOUT, never the caller. p_id is matched only against '
   'iam.permissions rows and custom.visibility_ancestors for p_type; p_table_id is the row''s own '
   'Table and p_organization_id bounds the ownership probe only. A null user or id answers null; '
   'a null table or organization simply removes a rung, which can only LOWER the answer.',
   'laddercap_the_organization_default_steps_aside_for_every_specific_rung.sql',
   'server_only: the specificity rung of the one access ladder. It is read by '
   'iam.member_lane_confers inside the access kernel and by custom.addressed_cap. It answers '
   'about ANY person, so a client calling it could enumerate what other people have been shared.',
   false, false)
on conflict do nothing;

-- The cap is that answer, or — when no rung more specific than the organization speaks — the
-- organization's own word for what membership confers.
create or replace function custom.addressed_cap(p_user_id uuid, p_type text, p_id uuid,
                                                p_organization_id uuid default null,
                                                p_table_id uuid default null)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_lvl public.permission_level;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- RUNGS 1, 2 and 3 — the record, its Table, its homes, and ownership of any of them.
  v_lvl := custom.addressed_cap_specific(p_user_id, p_type, p_id, p_organization_id, p_table_id);
  if v_lvl is not null then return v_lvl; end if;

  -- RUNG 4 — CONTAINMENT CARRY. Nothing there is addressed to her, so it sets no level.

  -- RUNG 5 — THE ORGANIZATION'S OWN WORD FOR WHAT MEMBERSHIP CONFERS.
  return iam.member_lane_confers(p_user_id, p_organization_id, p_type, p_id, p_table_id);
end;
$function$;

-- VIS-19, GENERALISED. The organization's role default steps aside for the most specific rung
-- addressed to this person — on the row, on its Table, or on a home of it — instead of only for
-- one written on the row itself.
create or replace function iam.member_lane_confers(p_user_id uuid, p_organization_id uuid, p_type text DEFAULT 'record'::text, p_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
  -- inlined so this file's guard is a line of code and not a sentence about one). An
  -- organization that has not turned the unified record store on keeps the arm the access
  -- kernel always had, so applying this file changes nothing anywhere until the switch. A knob
  -- this reader cannot read is CLOSED, never open - the same trap `custom.store_is_open`
  -- documents: `platform.knob_resolve` is SECURITY INVOKER and raises P0001 for a role that
  -- merely cannot see the row.
  begin
    v_store_on := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean,
                           false);
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

  -- AGT-5. The default is held PER REGISTERED TABLE, so the Table is read off the row rather
  -- than guessed. `to_regclass` keeps this callable before the store exists. It is read BEFORE
  -- the override below, because the override asks about the Table as a rung of its own.
  if v_table is null and p_type = 'record' and p_id is not null
     and to_regclass('custom.record') is not null then
    select r.table_id into v_table
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id;
  end if;

  -- VIS-19, THE OVERRIDE — AND IT IS ABOUT SPECIFICITY, NOT ABOUT "THIS ROW" (LADDER-CAP).
  -- Somebody has decided about this person and this thing, or the Table it lives in, or a home
  -- of it: the role default is not the answer, the more specific grant is, and it is admitted on
  -- its own arm at its own level. Written as "this row" it let a Table grant at viewer be
  -- overruled by the organization's editor default on every record in that Table.
  if p_id is not null
     and custom.addressed_cap_specific(p_user_id, p_type, p_id, p_organization_id, v_table) is not null then
    return null;
  end if;

  return iam.member_default_level(p_organization_id, v_table);
end;
$function$;
