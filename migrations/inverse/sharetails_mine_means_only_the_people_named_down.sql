-- INVERSE of migrations/campaign/sharetails_mine_means_only_the_people_named.sql: puts every repaired
-- record's visibility back from custom._share_tails_mine_repair, then restores the three bodies verbatim.
-- lane: SHARE-TAILS
set local lock_timeout = '2s';
select set_config('app.actor_system', 'sharetails_mine_repair_inverse', true);

update custom.record r
   set visibility = k.visibility_before
  from custom._share_tails_mine_repair k
 where r.id = k.record_id;
drop table custom._share_tails_mine_repair;

CREATE OR REPLACE FUNCTION custom.share_lane_set(p_organization_id uuid, p_subject_id uuid, p_choice text, p_level permission_level DEFAULT NULL::permission_level)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_choice record;
  v_row    custom.record;
  v_word   text;
  v_level  public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'share_lane_set');
  perform custom.assert_client_may_change(p_organization_id, p_subject_id, 'share_lane_set',
                                          'admin'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  select * into v_choice from custom.share_lanes() l where l.choice = lower(btrim(coalesce(p_choice, '')));
  if not found then
    raise exception 'There is no lane called "%".', coalesce(p_choice, '<nothing>')
      using errcode = '22023',
            hint = 'The lanes are mine, organization, community and world — call custom.share_lanes() for what each one means.';
  end if;

  if v_choice.lane = 'world' then
    -- Delegated whole: the world lane has its own act, its own admission and its own switch,
    -- and this door does not get a second copy of any of them (VIS-N-5, VIS-N-7).
    perform iam.publish_to_world('record', p_subject_id, p_organization_id, v_choice.discoverable);
    return jsonb_build_object('lane', v_choice.choice, 'message', v_choice.label || '.');
  end if;

  if v_choice.choice = 'organization' then
    v_level := coalesce(p_level, iam.member_default_level(p_organization_id, v_row.table_id),
                        'viewer'::public.permission_level);
    -- SHARE-PEOPLE-ONLY (chair ruling 2026-09-25): the "Everyone in this organization" LANE is the
    -- owner's visibility choice for the thing's OWN organization — one of the four lanes (mine,
    -- organization, community, world) — not a share. It is written through the availability arm
    -- and stamped so, because custom.share_grant now refuses an organization by name.
    perform iam._org_availability_arm();
    insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                 permission_level, created_by, status, granted_via)
    values ('record', p_subject_id, p_organization_id, v_level, custom.query_principal(), 'active', 'availability')
    on conflict (resource_type, resource_id, granted_to_organization_id) do update
       set permission_level = excluded.permission_level, status = 'active', expires_at = null;
  else
    delete from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and (p.granted_to_organization_id = p_organization_id or p.is_public);
    v_level := null;
  end if;

  insert into iam.content_lane as c
        (resource_type, resource_id, organization_id, lane, discoverable, unlisted)
  values ('record', p_subject_id, p_organization_id, 'mine', false, true)
  on conflict (resource_type, resource_id) do update
     set lane = 'mine', discoverable = false, unlisted = true;

  return jsonb_build_object(
    'lane', v_choice.choice,
    'level', v_level::text,
    'message', case when v_choice.choice = 'organization'
                    then format('Everyone in this organization now reaches this %s at %s.',
                                v_word, lower(iam.level_label(v_word, v_level)))
                    else format('Only the people it is shared with reach this %s now.', v_word) end);
end;
$function$

;

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
$function$

;

CREATE OR REPLACE FUNCTION custom.share_access(p_organization_id uuid, p_subject_id uuid)
 RETURNS TABLE(principal_kind text, principal_id uuid, principal_label text, level permission_level, reason text, reason_detail text, via_type text, via_id uuid, revocable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := custom.query_principal();
  v_row      custom.record;
  v_manage   boolean;
  v_default  public.permission_level;
  v_lane     text;
  v_org_name text;
begin
  -- Seeing the list needs only the level that opens the thing; CHANGING it needs admin, and
  -- that is what `revocable` says per row rather than emptying the list (which is what the
  -- platform's generic RPC does today, and why an admin saw nothing at all).
  perform custom.assert_client_may_open(p_organization_id, p_subject_id, 'share_access', 'viewer', 'record');

  select r.* into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'That record is not in this organization, so there is nobody to list.'
      using errcode = '02000';
  end if;

  v_manage := v_me is not null
              and custom.has_visibility(v_me, 'record', p_subject_id, 'admin'::public.permission_level);
  select o.name into v_org_name from iam.organizations o where o.id = p_organization_id;

  -- ── 1. THE OWNER. VIS-25: the top rung, held as `created_by` and not as a grant row, so it
  -- is never revocable here — ownership transfers, it is not taken away in a share dialog.
  if v_row.created_by is not null then
    return query
    select 'person'::text,
           v_row.created_by,
           coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                    nullif(u.raw_user_meta_data ->> 'full_name', ''),
                    u.email::text, v_row.created_by::text),
           iam.top_content_level(),
           'owner'::text,
           'Created it. The Owner rung sits above Admin and is held on the record itself, so it '
             || 'is transferred rather than revoked.',
           null::text, null::uuid, false
      from auth.users u where u.id = v_row.created_by;
  end if;

  -- ── 2. DIRECT GRANTS on this very thing — the rows this dialog writes and takes back.
  return query
  select case when p.is_public then 'everyone'
              when p.granted_to_organization_id is not null then 'organization'
              else 'person' end::text,
         coalesce(p.granted_to_organization_id, p.granted_to_user_id),
         case when p.is_public then 'Anyone with access to the link'
              when p.granted_to_organization_id is not null
                then coalesce(o.name, p.granted_to_organization_id::text)
              else coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            u.email::text, p.granted_to_user_id::text) end::text,
         p.permission_level,
         'direct'::text,
         case when p.granted_to_organization_id is not null and p.granted_to_organization_id <> p_organization_id
                then 'Shared with another organization (VIS-23: a cross-organization share is a grant whose principal is that organization).'
              when p.granted_to_organization_id is not null
                then 'Shared with everyone in ' || coalesce(o.name, 'this organization') || '.'
              when p.is_public then 'Open to anyone who reaches it.'
              else 'Shared with this person directly.' end
           || case when p.expires_at is not null then ' Expires ' || to_char(p.expires_at, 'YYYY-MM-DD') || '.' else '' end,
         null::text, null::uuid,
         v_manage
    from iam.permissions p
    left join auth.users        u on u.id = p.granted_to_user_id
    left join iam.organizations o on o.id = p.granted_to_organization_id
   where p.resource_type = 'record'
     and p.resource_id   = p_subject_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
   order by p.created_at;

  -- ── 3. THE ORGANIZATION'S OWN MEMBER DEFAULT (VIS-19 / VIS-33). Not a grant row and not
  -- revocable from here: it is the organization's setting, and the remedy is the setting.
  if iam.member_lane_open(p_organization_id) then
    v_default := iam.member_default_level(p_organization_id, v_row.table_id);
    if v_default is not null then
      return query
      select 'organization'::text, p_organization_id,
             coalesce(v_org_name, 'this organization'),
             v_default,
             'organization default'::text,
             'Every member of ' || coalesce(v_org_name, 'this organization') || ' reaches this without '
               || 'anybody sharing it, because the organization''s member default says so. Change it in '
               || 'the organization''s settings (custom/member_default_visibility, custom/member_default_level) '
               || '— there is no grant here to revoke.',
             null::text, null::uuid, false;
    end if;
  end if;

  -- ── 4. CONTAINMENT (VIS-1 / VIS-5 / VIS-3): whatever carries this thing carries access to it,
  -- at no more than the carrying link conveys. The remedy is on the container, so each row names
  -- the container and is not revocable here.
  return query
  select 'via'::text,
         a.container_id,
         custom.share_subject_name(p_organization_id, a.container_type, a.container_id),
         a.max_level,
         'containment'::text,
         'Anyone who reaches ' || custom.share_subject_name(p_organization_id, a.container_type, a.container_id)
           || ' reaches this too, at up to ' || lower(iam.level_label('record', a.max_level))
           || '. Take it out of there, or change what that link conveys — there is no grant here to revoke.',
         a.container_type, a.container_id, false
    from custom.visibility_ancestors('record', p_subject_id) a
   order by a.depth, 3;

  -- ── 5. THE LANE (VIS-N-4). Only said out loud when it is not the closed default.
  v_lane := iam.lane_of('record', p_subject_id);
  if v_lane is distinct from 'mine' then
    return query
    select 'everyone'::text, null::uuid,
           case when c.discoverable then 'Anyone, and listed' else 'Anyone with the link' end,
           'viewer'::public.permission_level,
           'world lane'::text,
           case when c.discoverable
                then 'Published to the world and discoverable: it may be listed and searched.'
                else 'Published to the world but unlisted: reachable by its link and by nothing else.' end,
           null::text, null::uuid, v_manage
      from iam.content_lane c
     where c.resource_type = 'record' and c.resource_id = p_subject_id;
  end if;
end;
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
$function$

;
