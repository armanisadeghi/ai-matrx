-- target: branch,production
-- additive: yes
--   It ADDS one knob row (`custom/scope_members_admitted`, default true) and one function
--   (`custom.scope_member_reaches`), and REPLACES three live bodies — `custom.portal_admits`,
--   `custom.reaches_directly` and `custom.assert_client_may_reach` — each with exactly its current body plus ONE new arm that
--   can only turn a refusal into an admission for a person who already holds a live scope
--   membership. Nothing is dropped, revoked or written; no table, column, trigger or policy
--   is touched. The inverse (`migrations/inverse/sc3_a_scope_member_reads_the_one_record_they_were_admitted_to_down.sql`)
--   puts both bodies back byte for byte and removes the knob and the helper.
-- guard: custom/system_enabled
--   Named because a production-headed file must name a real, seeded knob. The arm's OWN switch
--   is `custom/scope_members_admitted`, which this file seeds (default ON — the admission is
--   the organization's own act on that record) and which the arm reads for the RECORD's
--   organization; an organization that sets it false gets exactly the answers it got before
--   this file. Until SC-2' copies the scopes, the only Records a scope membership can name
--   are the ones the copy has landed, so nothing live reads differently.
-- based-on: custom.portal_admits(uuid, uuid) 190de340dd09f9674b4bb3fce01ca9c098e13b272fca51ceab960426070a0731
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) 303562455e6fb4cd1f7a0c1bf304d3293388195983dc2cb2ba694ba86d8c866c
-- based-on: custom.assert_client_may_reach(uuid, text) a8aa28d3bc152ae10d655e69a897c8f6875d760fe39617f4e94568523e0a8379
--
-- LANE SC-3' COMPARE — P7'S READ ARM: A CLASS STUDENT READS THE ONE CLASS SHE WAS ADMITTED TO.
--
-- THE USE CASE. Jordan Ellis takes Cedar Ridge Tutoring's AP Chemistry evening cohort. The
-- tutoring company admitted her to that ONE class — an `iam.memberships` row with
-- `container_type = 'scope'` on the class — and never made her a member of the company. On the
-- current scope system she reads the class (the old `iam.has_access_for(…, 'scope', …)` honours
-- the scope membership). On the record store the class is a Record with the same id, and every
-- store door refused her: `custom.assert_client_may_reach` admits organization members and the
-- outsiders an organization deliberately let in (a portal principal, a Table shared out), and
-- the ladder had no arm that reads a scope membership. So the one class on the platform would
-- have locked its paying students out at the switch (SCOPES-CONTEXT-TRANSITION rev 2, P7; the
-- attack's H4).
--
-- THE OWNER'S LAW (2026-09-23): "The permission is to the person, not the org. ALWAYS."
-- Champion: Google Drive — sharing one folder with someone outside your company opens that
-- folder and what is inside it, and nothing else of your company.
--
-- WHAT THIS ADDS — ONE ARM, IN TWO PLACES, ONE BODY:
--   custom.scope_member_reaches(user, record, level) — true when the person holds a LIVE scope
--     membership (`status = 'active'`, not deleted) on THIS record or on a record that carries
--     it (its containment ancestors, `custom.visibility_ancestors`), the level asked is `viewer`
--     or below, and the record's organization has `custom/scope_members_admitted` on. That is
--     the whole rule; read access only (writes and invitations are SC-8's).
--   custom.portal_admits — ARM 3: an organization admits to its doors a person holding a live
--     scope membership on one of its live records. Deliberately OUTSIDE the
--     `custom/external_principal_enabled` gate: that knob is the organization's answer about
--     sharing its data with strangers, and a class admission is the organization naming this
--     person on the record already. Its own knob (default ON, overridable by the organization)
--     is where an organization says no. Arms 1 and 2 are unchanged, byte for byte.
--   custom.reaches_directly — ARM 4, asked only after arms 1–3 said no: the scope membership.
--     It carries the record's subtree because `custom.scope_member_reaches` walks the record's
--     own carriers — a class and the records contained in it — and nothing beside it: the
--     class's Table is NOT reached (a Table is where the walk stops), so the student cannot
--     list the other classes.
--
-- WHAT IT DOES NOT DO. It confers no membership (`iam.people_lists_a_non_member_can_read` is
-- untouched), no level above viewer, and nothing in any other organization. A membership that
-- is revoked, deleted or pending admits nothing, in the same statement.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'scope_members_admitted', 'true'::jsonb, 'true'::jsonb, 'boolean',
   'A scope member reads the record they were admitted to',
   'P7''s read arm (SCOPES-CONTEXT-TRANSITION rev 2). A person holding a live scope membership '
   '— a student admitted to one class — reads that record and the records inside it through '
   'every record-store door, without becoming a member of the organization. On by default, '
   'because the admission is the organization''s own act on that record; an organization turns '
   'it off to make scope memberships open nothing in the record store.',
   'agent', 'Lane SC-3'' COMPARE, 2026-09-24: the one class on the platform admits its students through scope memberships (attack H4).',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

create function custom.scope_member_reaches(p_user_id uuid,
                                            p_record_id uuid,
                                            p_required public.permission_level default 'viewer')
returns boolean
language plpgsql
stable
-- SECURITY INVOKER ON PURPOSE. Its only callers are the two ladder bodies below, which are
-- SECURITY DEFINER and so already run as the store's owner; a client that called it directly
-- would read iam.memberships under its own row security and learn nothing it could not
-- already see. No door, no grant.
set search_path to ''
as $fn$
declare
  v_org uuid;
begin
  if p_user_id is null or p_record_id is null then return false; end if;
  -- READ ONLY. A scope membership admits a person to READ what they were admitted to; what
  -- they may change there is SC-8's, and no arm here may answer yes to editor or admin.
  if p_required > 'viewer'::public.permission_level then return false; end if;

  select r.organization_id into v_org
    from custom.record r
   where r.id = p_record_id and r.deleted_at is null
   limit 1;
  if v_org is null then return false; end if;

  if not coalesce((platform.knob_resolve('custom', 'scope_members_admitted', v_org) #>> '{}')::boolean, true) then
    return false;
  end if;

  return exists (
    select 1
      from iam.memberships m
     where m.container_type = 'scope'
       and m.user_id = p_user_id
       and m.status = 'active'
       and m.deleted_at is null
       and (m.container_id = p_record_id
            or m.container_id in (select a.container_id
                                    from custom.visibility_ancestors('record', p_record_id) a
                                   where a.container_type = 'record')));
end;
$fn$;

comment on function custom.scope_member_reaches(uuid, uuid, public.permission_level) is
  'P7 read arm (lane SC-3''). True when p_user_id holds a live scope membership (iam.memberships, '
  'container_type = scope, status active) on p_record_id or on a record that carries it, the level '
  'asked is viewer or below, and the record''s organization has custom/scope_members_admitted on. '
  'Called by custom.reaches_directly (arm 4) and custom.portal_admits (arm 3). Writes nothing.';

create or replace function custom.portal_admits(p_organization_id uuid, p_user_id uuid default null::uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
  select (coalesce(
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
     ))
    -- ARM 3 — A SCOPE MEMBERSHIP ON ONE OF THIS ORGANIZATION'S RECORDS (lane SC-3', P7's read
    -- arm, 2026-09-24). A student the tutoring company admitted to one class. Outside the
    -- external-principal gate on purpose: that knob is the organization's answer about sharing
    -- with strangers, and this person was named on the record by the organization itself.
    -- `custom/scope_members_admitted` is where an organization says no. Like arm 2 it ADMITS
    -- AND NOTHING MORE: the ladder's arm 4 decides which records, and only at viewer.
    or (coalesce((platform.knob_resolve('custom', 'scope_members_admitted', p_organization_id) #>> '{}')::boolean, true)
        and exists (
          select 1
            from iam.memberships m
            join custom.record r
              on r.id = m.container_id
             and r.organization_id = p_organization_id
             and r.deleted_at is null
           where m.container_type = 'scope'
             and m.user_id = coalesce(p_user_id, (select auth.uid()))
             and m.user_id is not null
             and m.status = 'active'
             and m.deleted_at is null))
  );
end
$function$;

create or replace function custom.reaches_directly(p_user_id uuid, p_type text, p_id uuid, p_required permission_level default 'viewer'::permission_level)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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

  -- ARM 4 — A SCOPE MEMBERSHIP (lane SC-3', P7's read arm, 2026-09-24). A person the
  -- organization admitted to ONE record — a student to one class — reads that record and the
  -- records it carries, at viewer and never above. Last, because it is the only arm that reads
  -- `iam.memberships`, and every cheaper reason has already answered no. It does not reach the
  -- record's Table: `custom.scope_member_reaches` walks the record's carriers and a Table is
  -- where that walk stops, so the other classes stay unlisted.
  if p_type = 'record' and custom.scope_member_reaches(p_user_id, p_id, p_required) then
    return true;
  end if;

  return false;
end;
$function$;

-- THE WALL ASKS portal_admits ALONE — its own two arms already read the external-principal knob.
create or replace function custom.assert_client_may_reach(p_organization_id uuid, p_door text)
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
  --
  -- ONE SENTENCE, ONE PLACE (lane SC-3', 2026-09-24). `custom.portal_admits` reads
  -- `custom/external_principal_enabled` itself for its portal and shared-table arms, so asking
  -- the knob here as well was a second copy of the same condition — and it is what kept a
  -- class student out: portal_admits' scope-membership arm is deliberately outside that knob.
  -- For every person the first two arms admit, this answer is unchanged.
  if custom.portal_admits(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $function$;
