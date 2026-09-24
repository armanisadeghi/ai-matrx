-- chair-step: the owner-issued share link is opened on every data class (Arman's ruling,
--   2026-09-23). Three function bodies replaced (iam.class_allows, iam.class_lanes,
--   platform.entity_link_shareable), eight registry rows flipped back to link-shareable, and one
--   key removed from two door-register rules. Nothing dropped, no grant, no row of anybody's data
--   touched. Inverse: migrations/inverse/argsruled2_an_owner_may_share_anything_they_own_by_link_down.sql.
-- lock: iam,platform
-- lane: ARGS-RULED-2
-- based-on: iam.class_allows(text, text, uuid) 2423d005779e5565eae09e9c882a939d70dd1401fd2942f84aee538afa9024ff
-- based-on: platform.entity_link_shareable(text) 5a04d0cf0e561223353c751037e8a9f370a194bea4878eec76e62fe23dcaec4d
-- based-on: iam.class_lanes(text) e6480c9ed4904b53e20e38a96b0e5452d3f137ccb8ca5cb2947c5d2197a5b6ff
--
-- ARGS-RULED-2 — AN OWNER MAY SHARE ANYTHING THEY OWN BY LINK.
--
-- THE RULING (Arman, 2026-09-23, on this lane's escalation): link sharing on conversations and
-- quizzes is YES, without reservation — "the user can do whatever they want with their data; our
-- permissions already cover that." It amends VISIBILITY-BY-CLASS §3.4, whose rule "a private or
-- confidential token cannot be link-shared" was enforced in three readers and one trigger.
--
-- WHAT BROKE, AND WHEN. matrx-frontend 02d22fa809 (2026-09-12, "doctrine: the class gate, the
-- definer census, and share links (DD-137c, §3.4 chokepoints 3+4)",
-- migrations/iam_class_gate_and_share_links_dd137c5.sql) turned link sharing OFF on eight tokens
-- — conversation, dataset, structured_list, udt_document, workbook (private) and
-- interview_session, quiz_session, working_document (confidential) — and made the class gate
-- refuse `share_link` on both classes. Measured on the dev clone 2026-09-23 from test@test.com's
-- seat: `create_share_link('conversation', <her own conversation>)` answered "Public link
-- sharing is not enabled for this item type", and a colleague she had shared the conversation
-- with by organization could not copy it ("not_available") because the fork door asks the same
-- registry flag.
--
-- THE FIX: the link stays OWNER-ISSUED (public.create_share_link's is_resource_owner check is
-- unchanged); the class no longer refuses it — in iam.class_allows('share_link'),
-- iam.class_lanes().share_link_lane and platform.entity_link_shareable() alike, so the three
-- readers cannot disagree (scripts/check-class-gate-agreement.ts, updated in the same commit).
-- The eight registry rows 02d22fa809 flipped are flipped back. The fork doors' contract token
-- `owner_refused_too` (the "door is shut pending the ruling" declaration) comes off, so the
-- generated contract now demands the owner succeed.
--
-- Seat suite: scripts/campaign-tests/argsruled2_share_link_green.sql (+ red twin).

set lock_timeout = '4s';

-- THE TWO GATES THIS FILE REPLACES DECLARE WHO CALLS THEM. Both are SECURITY DEFINER, both predate
-- the provision shape guard, and neither had a platform.client_callable_door row — so replacing
-- their bodies must say, in data, that no client calls them (the guard refuses the COMMIT
-- otherwise, measured on the clone 2026-09-23). No client holds EXECUTE on either (measured on the
-- MAIN database 2026-09-23: postgres only).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/argsruled2_an_owner_may_share_anything_they_own_by_link.sql (lane ARGS-RULED-2)',
       v.reason, false, false, v.lane
  from (values
    ('iam.class_allows(text,text,uuid)'::regprocedure,
     'p_token is a REGISTRY TOKEN and p_action a verb (read, rewrite_owner, reparent, share_link, bulk_export); p_row_org only labels the audit row a refusal writes. It reads platform.entity_types through iam.class_gate_class and decides what a CLASS admits, never anything about an individual record, so there is no entity-id argument to bind to a caller.',
     'server_only: iam.class_allows is the class gate the definer doors ask from INSIDE their own bodies (public.create_share_link today), so it always runs with the calling door''s borrowed rights and never on a client''s own. No client holds EXECUTE on it (measured on the MAIN database 2026-09-23), and none should: it is the platform''s access contract, not a door.'),
    ('platform.entity_link_shareable(text)'::regprocedure,
     'p_token is a REGISTRY TOKEN, not an entity id: the function returns whether that token''s class admits an owner-issued share link (NULL for a component, which inherits its parent''s). It reads platform.entity_types only and decides nothing about any row.',
     'server_only: platform.entity_link_shareable is read by platform._share_registry_class_interlock, the BEFORE trigger on platform.shareable_resource_registry, which runs as the table owner. No client holds EXECUTE on it (measured on the MAIN database 2026-09-23), and none needs to.')
  ) as v(fn, reason, lane)
  join pg_proc p on p.oid = v.fn
  join pg_namespace n on n.oid = p.pronamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = n.nspname and d.function_name = p.proname
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

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
    -- ARMAN, 2026-09-23 (amends VISIBILITY-BY-CLASS §3.4): an owner may share ANY row they own by
    -- link — "the user can do whatever they want with their data; our permissions already cover
    -- that." The one caller, public.create_share_link, refuses anybody who is not the row's owner
    -- before a token is minted, so this verb no longer refuses by class.
    when 'share_link' then
      v_ok := true;
      v_why := null;
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
  -- ARMAN, 2026-09-23 (amends VISIBILITY-BY-CLASS §3.4): an owner may share ANY row they own by
  -- link, whatever its class — "the user can do whatever they want with their data; our
  -- permissions already cover that." The link is owner-issued (public.create_share_link refuses
  -- anybody who is not the row's owner), so this lane is open on every class.
  r.share_link_lane     := true;
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
  -- THE RULE (Arman, 2026-09-23 — amends VISIBILITY-BY-CLASS §3.4): EVERY classed row may be
  -- link-shared, because the link is issued by its OWNER (public.create_share_link refuses anybody
  -- who is not public.is_resource_owner) — "the user can do whatever they want with their data;
  -- our permissions already cover that." Until this ruling only `organization` and `public`
  -- answered true, so a person could not share their own private conversation or confidential
  -- quiz by link at all. A token with no class of its own (a component: db-rules §6d-1 says its
  -- access IS its parent's) still returns NULL — "this function has no opinion" — and the caller
  -- keeps what the registry says, because inventing an answer for a component is how a component
  -- gets a second owner.
  select case
           when et.data_class is null then null
           else true
         end
    from platform.entity_types et
   where et.token = p_token and et.is_active;
$function$
;

update platform.shareable_resource_registry
   set is_link_shareable = true, updated_at = now()
 where resource_type in ('conversation','dataset','structured_list','udt_document','workbook','interview_session','quiz_session','working_document')
   and is_link_shareable is not true;

update platform.client_callable_door
   set argument_rules = argument_rules #- '{arguments,p_conversation_id,foreign,owner_refused_too}'
 where schema_name = 'public' and function_name = 'fork_shared_conversation'
   and identity_args = 'p_conversation_id uuid, p_organization_id uuid, p_token text';

update platform.client_callable_door
   set argument_rules = argument_rules #- '{arguments,p_quiz_id,foreign,owner_refused_too}'
 where schema_name = 'public' and function_name = 'fork_shared_quiz'
   and identity_args = 'p_quiz_id uuid, p_organization_id uuid, p_token text';
