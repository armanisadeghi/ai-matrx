-- iam_class_lanes_interlock_dd137b3a_filter_precision — THE CLASS FILTER MUST CUT ORG ARMS, NOT THE
-- SHARING LANE. A defect this lane found in its own work, RED on the live database before anything
-- was regenerated with it.
--
-- DD-137b3 applied the lane set as a filter over the built arm array, matching `iam.my_orgs()` to
-- find the organization-member arm. But `iam.my_orgs()` ALSO appears deep inside the bounded
-- candidate arm — in the explicit-grant candidate,
--     p.granted_to_organization_id in (select iam.my_orgs())
-- — so on a `private` token the filter deleted the ENTIRE
--     (id in (…grants ∪ memberships ∪ reachability ∪ associations ∪ entity_grants…)
--      and iam.has_access(token, id, 'viewer'))
-- arm, and with it every lane the §3.1 table says EVERY class keeps: the owner's own grant, a
-- container membership, an association ticket, a library grant. Measured on
-- `users.user_bookmarks` in a rolled-back transaction: the regenerated std_select was
-- `is_platform_admin() or created_by = me` and nothing else.
--
-- That is over-tightening, and db-rules §6 is explicit that it is not the lesser sin: "a legitimate
-- user blocked from their own data is as serious a bug as a stranger let in". §3.6 says the same
-- thing from the other side — the class is a FLOOR, and ordinary sharing opens above it per item
-- and per person. A class that silently cancels sharing is not a floor, it is a wall.
--
-- THE REPAIR. Every organization arm this generator builds begins with the literal
-- `(organization_id is not null and` — that prefix is the generator's own totality guard and is on
-- all four of them. The filter now requires it, so it can only ever cut a top-level org arm and can
-- never reach inside the candidate union. And it counts: if the class forbids a lane and no arm
-- carrying that lane's prefix was found to cut, the arm shapes have moved and the function RAISES
-- rather than emitting a policy that quietly keeps the lane.
do $$
declare v_src text; v_new text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'entity_read_expr';
  if position('THE ORG-ARM PREFIX' in v_src) > 0 then
    raise notice 'dd137b3a: the mirror already carries the precise filter';
    return;
  end if;

  v_new := replace(v_src,
    '  if not coalesce(v_lanes.org_role_lane, true) then' || E'\n' ||
    '    v_arms := array(select a from unnest(v_arms) a' || E'\n' ||
    '                     where a not like ''%om.role in (''''owner'''',''''admin'''')%'');' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if not coalesce(v_lanes.org_member_lane, true) then' || E'\n' ||
    '    v_arms := array(select a from unnest(v_arms) a' || E'\n' ||
    '                     where a not like ''%iam.my_orgs()%''' || E'\n' ||
    '                       and not (a like ''%so.global_readable%'' and a not like ''%is_super_admin%''));' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if not coalesce(v_lanes.platform_admin_lane, true) then' || E'\n' ||
    '    v_arms := array(select a from unnest(v_arms) a where a not like ''%is_super_admin%'');' || E'\n' ||
    '  end if;',

    '  -- 🚨 THE ORG-ARM PREFIX IS THE ANCHOR, AND IT IS LOAD-BEARING (DD-137b3a). Every' || E'\n' ||
    '  -- organization arm this function builds opens with `(organization_id is not null and` —' || E'\n' ||
    '  -- the generator''''s own totality guard, on all four of them. Matching a lane''''s INNER text' || E'\n' ||
    '  -- alone is not enough: `iam.my_orgs()` also lives inside the bounded candidate arm, in the' || E'\n' ||
    '  -- explicit-grant candidate, so a bare match deleted the whole sharing lane from every' || E'\n' ||
    '  -- `private` token. The class is a FLOOR (§3.6) — ordinary sharing opens above it per item' || E'\n' ||
    '  -- and per person, and cancelling that is over-tightening, which db-rules §6 treats as the' || E'\n' ||
    '  -- same size of bug as a stranger let in.' || E'\n' ||
    '  if not coalesce(v_lanes.org_role_lane, true) then' || E'\n' ||
    '    if not exists (select 1 from unnest(v_arms) a where a like ''(organization_id is not null and%''' || E'\n' ||
    '                    and a like ''%om.role in (''''owner'''',''''admin'''')%'') and v_has_org and v_owner_col is not null then' || E'\n' ||
    '      raise exception ''iam.entity_read_expr: %.% (token %) is class %, which emits no ''' || E'\n' ||
    '        ''organization-role arm — but no arm carrying that lane was found to remove. The arm ''' || E'\n' ||
    '        ''shapes have moved and this filter is now silently keeping a lane it was written to ''' || E'\n' ||
    '        ''cut.'', p_schema, p_table, p_token, v_lanes.resolved_class;' || E'\n' ||
    '    end if;' || E'\n' ||
    '    v_arms := array(select a from unnest(v_arms) a' || E'\n' ||
    '                     where not (a like ''(organization_id is not null and%''' || E'\n' ||
    '                                and a like ''%om.role in (''''owner'''',''''admin'''')%''));' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if not coalesce(v_lanes.org_member_lane, true) then' || E'\n' ||
    '    v_arms := array(select a from unnest(v_arms) a' || E'\n' ||
    '                     where not (a like ''(organization_id is not null and%''' || E'\n' ||
    '                                and (a like ''%iam.my_orgs()%'' or a like ''%so.global_readable%'')' || E'\n' ||
    '                                and a not like ''%is_super_admin%''));' || E'\n' ||
    '  end if;' || E'\n' ||
    '  if not coalesce(v_lanes.platform_admin_lane, true) then' || E'\n' ||
    '    v_arms := array(select a from unnest(v_arms) a' || E'\n' ||
    '                     where not (a like ''(organization_id is not null and%'' and a like ''%is_super_admin%''));' || E'\n' ||
    '  end if;');

  if v_new = v_src then
    raise exception 'dd137b3a: could not find the DD-137b3 filter block in iam.entity_read_expr';
  end if;

  execute format(
    'create or replace function iam.entity_read_expr(p_schema text, p_table text, p_token text, '
    'p_variant text default ''entity'') returns text language plpgsql stable as %L', v_new);
end $$;

-- ═══ the repair is proven, not asserted ═══
do $$
declare v_expr text;
begin
  -- a `private` token: no org-role arm, no platform-staff arm, and the SHARING LANE INTACT
  select iam.entity_read_expr('users','user_bookmarks','user_bookmark','entity') into v_expr;
  if v_expr like '%om.role = ANY%' or v_expr like '%om.role in (''owner'',''admin'')%' then
    raise exception 'dd137b3a: a private token still emits an organization-role arm';
  end if;
  if v_expr not like '%created_by = (select auth.uid())%' then
    raise exception 'dd137b3a: a private token lost its OWNER arm';
  end if;
  if v_expr not like '%iam.permissions p where p.resource_type%' then
    raise exception 'dd137b3a: a private token lost its EXPLICIT-GRANT lane — the class is a floor, '
      'not a wall (§3.6): ordinary sharing opens above it, per item and per person';
  end if;
  if v_expr not like '%platform.reachability r%' then
    raise exception 'dd137b3a: a private token lost its association/containment lane';
  end if;
  if v_expr not like '%iam.has_access(''user_bookmark'', id, ''viewer'')%' then
    raise exception 'dd137b3a: a private token lost its bounded has_access confirmation';
  end if;

  -- an `organization` token is untouched: every arm it had, it still has
  select iam.entity_read_expr('content_ir','kind_instance','content_ir_kind_instance','entity') into v_expr;
  if v_expr not like '%om.role in (''owner'',''admin'')%' or v_expr not like '%iam.my_orgs()%'
     or v_expr not like '%is_super_admin%' then
    raise exception 'dd137b3a: an ORGANIZATION token lost an arm — that class must be a no-op';
  end if;

  raise notice 'dd137b3a: the filter cuts org arms and nothing else';
end $$;
