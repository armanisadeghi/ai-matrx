-- lock: iam,platform
-- lane: ARGS-RULED-2
-- based-on: iam.class_allows(text, text, uuid) 92583b984249e07cd9c3048b959a7f948c9ca72cb2a296743e41b3db31dc12f8
-- based-on: iam.class_lanes(text) 5de91cffe7172b7381a8d74c4b6532bec18e9edc407314958cb986d92faf5606
-- based-on: platform.entity_link_shareable(text) 35817df280a258404c3931d295df80aabd606e036f141eada485cd86dfcdf14f
--
-- INVERSE of migrations/campaign/argsruled2_an_owner_may_share_anything_they_own_by_link.sql: the three bodies back as they were
-- (MAIN, 2026-09-23), the eight registry rows back to not link-shareable, and the two fork-door
-- owner_refused_too tokens back. Rule 27 only — it re-closes link sharing Arman opened.

set lock_timeout = '4s';

create or replace function iam.class_allows(p_token text, p_action text, p_row_org uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_class text;
  v_ok    boolean;
  v_why   text;
  v_org   uuid;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'assert_class_allows: no token. A gate asked about nothing answers nothing.'
      using errcode = '22023';
  end if;

  -- 🚨 DD-216: ONE RESOLVER. This used to read `platform.entity_types.data_class` and
  -- `coalesce(..., 'private')`. On a COMPONENT that column is NULL BY DESIGN (db-rules §6d-1,
  -- DD-137b14: a component's access IS its parent's), so the coalesce meant for an unregistered
  -- token fired on all 319 live components and answered `private` on every one — while
  -- `iam.class_lanes` answered `organization` for 170 of them and `public` for 14. Two readers,
  -- two answers, on the same token. `iam.class_lanes` carries chair R3 in BOTH directions
  -- (unregistered token -> private; parentless component -> private), so asking it is strictly
  -- more correct than the copy, never looser than the rule.
  v_class := iam.class_gate_class(p_token);

  case p_action
    -- A blanket read with borrowed rights. Allowed only where a standing read is what the class
    -- MEANS; on private/confidential the caller must ask the kernel per row instead.
    when 'read' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'a definer function may not hand out '|| v_class ||' rows without a per-row '
               'iam.has_access check';
    -- Changing who owns a row, or which organization it belongs to, is how F-1 defeats a class:
    -- rewrite the owner and every lane follows. Never allowed on private or confidential.
    when 'rewrite_owner', 'reparent' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'the owner or home of a '|| v_class ||' row cannot be rewritten through a definer '
               'function — a class that survives only until somebody changes the owner is not a class';
    -- An anonymous read by URL.
    when 'share_link' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'a '|| v_class ||' row cannot be shared by public link';
    -- Handing out many rows at once, with borrowed rights, is the same question at scale.
    when 'bulk_export' then
      v_ok := v_class in ('organization', 'public');
      v_why := 'a '|| v_class ||' token cannot be exported in bulk through a definer function';
    else
      -- NOT a silent pass. An action this gate has never heard of is refused by name, because a
      -- gate that shrugs at an unknown verb is a gate anybody can walk through by inventing one.
      v_ok := false;
      v_why := format('%L is not an action this gate knows (read, rewrite_owner, reparent, '
                      'share_link, bulk_export)', p_action);
  end case;

  if v_ok then return true; end if;

  -- THE AUDIT IS THE GUARANTEE (§3.5's sentence, and it applies to every refusal, not just doors).
  -- DD-216: `data_class` here is now the RESOLVED class, so a component's refusal no longer
  -- records `private` about a token whose registry row never said it.
  v_org := coalesce(p_row_org,
                    (select so.organization_id from iam.system_orgs so where so.key = 'system'));
  begin
    insert into iam.access_audit(
      action, target_token, data_class, purpose, basis, is_emergency_door, granted,
      denial_reason, actor_user_id, organization_id, request_context)
    values (
      p_action, p_token, v_class, 'class_gate', 'definer_function', false, false,
      v_why, auth.uid(), v_org,
      jsonb_build_object('gate', 'iam.assert_class_allows', 'row_organization_id', p_row_org));
  exception when others then
    -- A refusal that cannot be recorded is still a refusal. It is never downgraded to a pass, and
    -- the failure to record says so in the same breath as the refusal itself.
    v_why := v_why || format(' [the refusal could not be audited: %s]', sqlerrm);
  end;

  -- The reason travels out in a place a caught exception cannot erase.
  perform set_config('iam.class_gate_last_reason', v_why, true);
  return false;
end
$function$

;

create or replace function iam.class_lanes(p_token text)
 RETURNS platform.lane_set
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'platform', 'iam', 'public'
AS $function$
declare
  v_class platform.data_class;
  v_variant text;
  v_found boolean;
  v_anon_optin boolean;
  r platform.lane_set;
begin
  select et.data_class, et.rls_variant, true, coalesce(et.client_anonymous_public_read, false) into v_class, v_variant, v_found, v_anon_optin
    from platform.entity_types et where et.token = p_token and et.is_active;

  -- 🚨 CHAIR R3, BOTH DIRECTIONS. `iam.apply_rls` REFUSES an unclassified token outright (it can
  -- refuse — nothing is denied a user by a generation that does not run). The KERNEL cannot refuse,
  -- because refusing at runtime is denying a person their own data, so it resolves unset to the
  -- STRICTEST class. Neither direction silently widens a live table.
  if not coalesce(v_found, false) then
    v_class := 'private';                       -- unregistered token: strictest
  elsif v_variant = 'component' then
    -- 🚨 A COMPONENT'S LANES ARE ITS PARENT'S (db-rules §6d-1), AND THE STRICTEST PARENT WINS.
    -- Walk the composition edges upward. A component under two parents gets the tighter of the two,
    -- because access is a union and the CLASS is a floor: the looser parent's own lanes still admit
    -- whoever they always admitted, through that parent's own policy. Depth is bounded because a
    -- cycle in the registry must not be able to hang every policy evaluation on the platform, and
    -- the bound resolves `private` rather than giving up.
    with recursive up as (
      select p_token as tok, 0 as depth
      union all
      select er.parent_type, u.depth + 1
        from up u
        join platform.entity_types cet on cet.token = u.tok and cet.is_active
                                      and cet.rls_variant = 'component'
        join platform.entity_relationships er on er.child_type = u.tok and er.kind = 'composition'
       where u.depth < 12
    )
    select min(et.data_class) into v_class
      from up u join platform.entity_types et on et.token = u.tok and et.is_active
     where u.depth > 0 and et.data_class is not null;
    -- A component with NO composition parent is a registry defect (db-rules §6d-1 requires one).
    -- It resolves `private`: the strictest answer is the only safe one for a table whose access
    -- contract nobody has written down.
    v_class := coalesce(v_class, 'private');
  else
    v_class := coalesce(v_class, 'private');
  end if;

  r.resolved_class := v_class;

  -- The §3.1 lane table, row for row. `organization` is the class whose lane set is exactly what an
  -- org-scoped entity table carries TODAY, which is why classifying a table `organization` changes
  -- nothing about it.
  r.owner_lane          := true;                                   -- every class
  r.owner_grant_lane    := true;                                   -- ordinary sharing, every class
  r.org_member_lane     := v_class in ('confidential','organization','public');
  r.org_role_lane       := v_class in ('organization','public');
  r.platform_admin_lane := v_class in ('organization','public');
  -- 🚨 THE OPT-IN ANONYMOUS LANE (chair ruling 2026-09-22, DD-249 / R12). `public` is still
  -- the one class whose lane set includes anon BY DEFAULT. What changed is that a row marked
  -- `visibility = 'public'` IS an anonymous read lane by definition -- that is what the word
  -- means to the person who set it -- so a table serving such rows on an `organization` class
  -- can DECLARE the lane instead of being reclassified, emptied, or kept off the canonical
  -- route. It is per table, it is explicit, it defaults false, and it is asked HERE because
  -- this is the one place the lane is decided: iam.apply_rls's R12 guard, the pub_read
  -- emitter in iam._apply_rls_unchecked, and iam.verify_canonical's class_lanes_match_policy
  -- all read this answer, so teaching it once teaches all three and they cannot disagree.
  -- The lane still admits ONLY public, non-deleted rows: the emitter's predicate is
  -- unchanged, and it is gated on the table having a `visibility` column at all.
  r.anon_lane           := v_class = 'public' or coalesce(v_anon_optin, false);
  r.share_link_lane     := v_class in ('organization','public');
  r.owner_rewrite_lane  := v_class in ('organization','public');
  r.emergency_door      := case v_class
                             when 'private'      then 'owner_plus_approver'
                             when 'confidential' then 'one_admin'
                             else 'none' end;
  return r;
end
$function$

;

create or replace function platform.entity_link_shareable(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- THE RULE: a row can be link-shared only if its token is classed `organization` or `public`.
  -- A token with no class of its own (a component: db-rules §6d-1 says its access IS its parent's)
  -- returns NULL — "this function has no opinion" — and the caller keeps what the registry says,
  -- because inventing an answer for a component is how a component gets a second owner.
  select case
           when et.data_class is null then null
           when et.data_class::text in ('organization', 'public') then true
           else false
         end
    from platform.entity_types et
   where et.token = p_token and et.is_active;
$function$

;

update platform.shareable_resource_registry set is_link_shareable = false, updated_at = now() where resource_type in ('conversation','dataset','structured_list','udt_document','workbook','interview_session','quiz_session','working_document');

update platform.client_callable_door
   set argument_rules = jsonb_set(argument_rules, '{arguments,p_conversation_id,foreign,owner_refused_too}', '"DD-137b, PENDING ARMAN''S RULING (2026-09-23): conversation is classed private, and platform.entity_link_shareable refuses link sharing for a private class, so platform.shareable_resource_registry cannot mark it link-shareable and this door refuses EVERY caller, the owner included, with the same not_available answer a stranger gets. Recommended ruling: an owner-issued share link on private types (ChatGPT''s shared conversation link). When he rules, remove this token and the contract demands the owner succeed."'::jsonb, true)
 where schema_name = 'public' and function_name = 'fork_shared_conversation' and identity_args = 'p_conversation_id uuid, p_organization_id uuid, p_token text'
   and argument_rules #> '{arguments,p_conversation_id,foreign}' is not null;
update platform.client_callable_door
   set argument_rules = jsonb_set(argument_rules, '{arguments,p_quiz_id,foreign,owner_refused_too}', '"DD-137b, PENDING ARMAN''S RULING (2026-09-23): quiz_session is classed confidential, and platform.entity_link_shareable refuses link sharing for a confidential class, so platform.shareable_resource_registry cannot mark it link-shareable and this door refuses EVERY caller, the owner included, with the same not_available answer a stranger gets. Recommended ruling: an owner-issued share link on private types (ChatGPT''s shared conversation link). When he rules, remove this token and the contract demands the owner succeed."'::jsonb, true)
 where schema_name = 'public' and function_name = 'fork_shared_quiz' and identity_args = 'p_quiz_id uuid, p_organization_id uuid, p_token text'
   and argument_rules #> '{arguments,p_quiz_id,foreign}' is not null;

-- the two declarations the up added (the bodies are back, and the guard accepts them as they were
-- because the inverse replaces them in a transaction that also removes nothing else).
delete from platform.client_callable_door
 where declared_by = 'migrations/campaign/argsruled2_an_owner_may_share_anything_they_own_by_link.sql (lane ARGS-RULED-2)'
   and ((schema_name = 'iam' and function_name = 'class_allows')
        or (schema_name = 'platform' and function_name = 'entity_link_shareable'));
