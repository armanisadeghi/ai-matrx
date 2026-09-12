-- iam_component_lanes_are_the_parents_dd137b10 — A COMPONENT'S LANES ARE ITS PARENT'S (DD-137b, fix round 1).
--
-- 🚨 THE DEFECT, FOUND BY V-40 AND IT IS MINE. B-41b's report wrote that §3.5's promise — "`private`
-- means no standing read for anyone, our own staff included" — was now true of our own staff. It was
-- true of the 157 private/confidential BASE tables. It was false of their COMPONENTS, and the
-- component is where the content lives. Measured live by V-40 with a platform admin
-- (`info@aimatrx.com`) it could not have been plainer:
--
--     chat.conversation      226 of 24,590 readable        (the door is shut)
--     chat.message       131,763 of 131,763 readable       (every message in the database)
--     users.credential_items 123 of 123                    users.user_secrets 307 of 307
--
-- The door was closed on the index and left open on the contents.
--
-- ROOT CAUSE, AND IT IS ONE LINE I WROTE ON PURPOSE. `iam.class_lanes` returns NULL lanes for a
-- component — correct, because a component has no class of its own (db-rules §6d-1). Both consumers
-- then read `coalesce(v_lanes.platform_admin_lane, true)`, with a comment saying the component
-- "keeps the behaviour it has always had". That reasoning was wrong in the one direction that
-- matters: a NULL lane is not "unknown, so allow", it is "ask the parent". 299 of 311 components and
-- 22 of 22 ledgers kept `platform_admin_all`, and 95 of them sit under a `private` or `confidential`
-- parent. This is exactly the bug DD-136b fixed for the ORGANIZATION-admin lane ("a component asks
-- its parent") and I did not make the same repair for the PLATFORM-admin lane.
--
-- AND THE GATE COULD NOT SEE IT. The access-delta cast was 144 tokens and contained ZERO components
-- and ZERO ledgers. The gate measured honestly; it was pointed at the wrong half of the model. That
-- is fixed in DD-137b11, which puts every component and ledger under a private/confidential parent
-- into the cast.
--
-- WHAT THIS FILE CHANGES
--   1. `iam.class_lanes` resolves a component through its COMPOSITION PARENTS, recursively, and
--      takes the STRICTEST class it reaches. No parent ⇒ `private`.
--   2. A LEDGER IS NOT A COMPONENT and this file says so out loud. All 22 active ledgers have no
--      composition edge at all, so "inherit the parent" has nothing to inherit from and
--      `class_lanes` would have to GUESS — which is the defect above, restated. §3.3 / F-20 forbade
--      `data_class` on a ledger, and its stated reason is about OWNER COLUMNS and where a list lands:
--      "a component has no owner column, so `mine` is not expressible there". That argument holds for
--      `default_list_scope` (still NULL on both) and does NOT hold for `data_class` on a table with
--      no parent. So the constraint is relaxed for ledgers only, all 22 are classified FROM REALITY
--      with a stored reason, and this amendment to F-20's limit is flagged for the chair rather than
--      smuggled in.
--   3. The kernel and the mirror stop writing `coalesce(lane, true)`. A NULL lane now emits NOTHING,
--      so even a future gap fails toward privacy instead of toward our staff.
--   4. `suppress_platform_admin_lane` is set on every component/ledger whose RESOLVED class is
--      private or confidential, so the privacy-wall machinery that already exists does the work.
--   5. `iam.verify_canonical` stops SKIPping components on `class_lanes_match_policy` — the SKIP is
--      what let this through — and `data_class_derivations` now checks components and ledgers too.
--
-- 🚨 THIS FILE REGENERATES NOTHING. DD-137b11 does that, behind the harness, with components in the
-- cast. Mechanism here; act there.

-- A constraint swap on platform.entity_types needs ACCESS EXCLUSIVE, and every session on this
-- database reads that table constantly, so the runner's 2s bound loses the race. 20s is still a
-- BOUND — ddl_lock_timeout_guard's rule is that waiting is bounded, never that it is short.
set local lock_timeout = '20s';

-- ═════════════════════════════════════════════ 1. the ledger constraint, amended and reasoned
do $$
begin
  if exists (select 1 from pg_constraint where conname='entity_types_class_scope_ck'
               and conrelid='platform.entity_types'::regclass) then
    alter table platform.entity_types drop constraint entity_types_class_scope_ck;
  end if;
  alter table platform.entity_types add constraint entity_types_class_scope_ck check (
    case
      -- A COMPONENT still carries NULL on both: its access IS its parent's, and iam.class_lanes
      -- resolves it upward. A second answer stored on the child is exactly the drift F-20 forbade.
      when rls_variant = 'component' then data_class is null and default_list_scope is null
      -- A LEDGER has no parent to ask. It may hold a class; it may never hold a list scope, because
      -- a ledger row has a position, not a "mine" (§3.3's actual argument).
      when rls_variant = 'ledger' then default_list_scope is null
      else true
    end);
end $$;

comment on column platform.entity_types.data_class is
  'DD-137b (VISIBILITY-BY-CLASS §3.1). The registry word that names a LANE SET: which access lanes '
  'are emitted for this token at all. NOT a comparison against the per-row visibility column — that '
  'column narrows a lane where it exists, it does not decide whether the lane exists. NULL on a '
  'COMPONENT, whose lanes are resolved from its composition parent by iam.class_lanes (db-rules '
  '§6d-1). SET on a LEDGER (DD-137b10): a ledger has no composition parent, so there is nothing to '
  'inherit and an unset class would have to be guessed — which is the defect V-40 found. NULL '
  'anywhere else is a REFUSAL, not a value: iam.apply_rls will not generate for it and '
  'iam.class_lanes resolves it to `private` (chair R3 — both directions fail toward privacy).';

-- ═════════════════════════════════════════════ 2. THE ONE SOURCE, resolving upward
create or replace function iam.class_lanes(p_token text)
returns platform.lane_set
language plpgsql
stable
security definer
set search_path to 'pg_catalog','platform','iam','public'
as $function$
declare
  v_class platform.data_class;
  v_variant text;
  v_found boolean;
  r platform.lane_set;
begin
  select et.data_class, et.rls_variant, true into v_class, v_variant, v_found
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
  r.anon_lane           := v_class = 'public';
  r.share_link_lane     := v_class in ('organization','public');
  r.owner_rewrite_lane  := v_class in ('organization','public');
  r.emergency_door      := case v_class
                             when 'private'      then 'owner_plus_approver'
                             when 'confidential' then 'one_admin'
                             else 'none' end;
  return r;
end
$function$;

comment on function iam.class_lanes(text) is
  'DD-137b / VISIBILITY-BY-CLASS §3.2 (chair R1). THE ONE SOURCE: which access lanes exist for a '
  'token at all. The kernel (iam.has_access_for_base) and the mirror (iam.entity_read_expr) both '
  'read it, so generation-time truth and runtime truth cannot drift. A COMPONENT resolves through '
  'its composition parents, strictest wins, and a parentless one resolves `private` (DD-137b10 — '
  'reading a component''s NULL lanes as "allow" left 131,763 of 131,763 chat.message rows readable '
  'by a platform admin while 226 of 24,590 conversations were). An unset or unregistered token '
  'resolves to `private`: the kernel cannot refuse, so it fails toward privacy, and iam.apply_rls '
  'refuses outright (chair R3).';

revoke all on function iam.class_lanes(text) from public, anon;
grant execute on function iam.class_lanes(text) to authenticated, service_role;

-- ═════════════════════════════════════════════ 3. the 22 ledgers, classified from reality
do $$
declare v_n integer;
begin
  -- (a) HR's ledgers are records ABOUT PEOPLE, and HR's own entity tokens already close the staff
  --     lane. Their ledgers keeping it open is the same inconsistency as chat.message.
  update platform.entity_types set data_class = 'confidential',
    data_class_reason = 'DD-137b10. A ledger has no composition parent, so its class is stated '
      'rather than inherited. This is an HR record ABOUT A PERSON, and HR''s own entity tokens '
      'already suppress the platform-staff lane — a ledger of the same facts keeping it open is the '
      'chat.message inconsistency, restated.'
   where is_active and rls_variant = 'ledger' and token in (
     'hr_approval_authority','hr_approval_delegation','hr_calculation_snapshot','hr_derived_grant',
     'hr_disposition_event','hr_role_assignment','hr_workflow_decision','hr_workflow_event',
     'esign_envelope_event','platform_continued_access');

  -- (b) the rest are the ORGANIZATION'S own operational record — batches, API calls, run logs,
  --     activity, short links. Our staff read these to repair the platform, and they hold no
  --     person's private content. `organization` on a ledger is the lane set it already had.
  update platform.entity_types set data_class = 'organization',
    data_class_reason = 'DD-137b10. A ledger has no composition parent, so its class is stated '
      'rather than inherited. This is the organization''s own operational record — no person''s '
      'private content — and it is one of the tables our own repair work reads. `organization` is '
      'the lane set it already had; this file changes nothing about it and says so.'
   where is_active and rls_variant = 'ledger' and data_class is null;

  select count(*) into v_n from platform.entity_types
   where is_active and rls_variant = 'ledger' and data_class is null;
  if v_n > 0 then raise exception 'dd137b10: % ledgers are still unclassified', v_n; end if;
end $$;

-- ═════════════════════════════════════════════ 4. the privacy wall follows the RESOLVED class
--
-- `iam._apply_rls_unchecked` and `iam.verify_canonical` both read the `suppress_platform_admin_lane`
-- COLUMN, not the lane set — that is the existing privacy-wall machinery and it works. So the column
-- is brought into agreement with the resolved class on components and ledgers, and section 5 adds
-- the check that keeps them in agreement forever.
do $$
declare v_n integer;
begin
  update platform.entity_types et set suppress_platform_admin_lane = true
   where et.is_active and et.rls_variant in ('component','ledger')
     and not et.suppress_platform_admin_lane
     and (iam.class_lanes(et.token)).resolved_class in ('private','confidential');
  get diagnostics v_n = row_count;
  raise notice 'dd137b10: % components/ledgers now DECLARE the platform-staff lane closed '
    '(the policies still carry it until DD-137b11 regenerates them, behind the harness)', v_n;
end $$;

-- ═════════════════════════════════════════════ 5. the mirror and the kernel stop guessing
do $$
declare v_src text; v_new text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='iam' and p.proname='entity_read_expr';
  if position('coalesce(v_lanes.' in v_src) = 0 then
    raise notice 'dd137b10: the mirror already reads the lane set directly';
  else
    -- 🚨 AND THE "no arm found to cut" GUARD MUST NOT FIRE ON A COMPONENT. DD-137b3a added it so a
    -- filter whose patterns stopped matching could not ship silently — right, and it assumed every
    -- org-scoped token HAS an org-role arm to remove. A parented COMPONENT does not: DD-136b took
    -- that arm away from all 281 of them on purpose, because a component asks its parent. Before
    -- this line the guard raised on chat.message the moment its class resolved to `private`, which
    -- would have made the table ungeneratable. The guard keeps its teeth for entity/system tokens,
    -- where the assumption is true.
    v_new := replace(v_src,
      'and v_has_org and v_owner_col is not null then',
      'and v_has_org and v_owner_col is not null and p_variant <> ''component'' then');
    if v_new = v_src then
      raise exception 'dd137b10: could not find the DD-137b3a no-arm-found guard in the mirror';
    end if;
    v_src := v_new;
    v_new := replace(v_src, 'coalesce(v_lanes.org_role_lane, true)', 'v_lanes.org_role_lane');
    v_new := replace(v_new, 'coalesce(v_lanes.org_member_lane, true)', 'v_lanes.org_member_lane');
    v_new := replace(v_new, 'coalesce(v_lanes.platform_admin_lane, true)', 'v_lanes.platform_admin_lane');
    if position('coalesce(v_lanes.' in v_new) > 0 then
      raise exception 'dd137b10: a coalesce(v_lanes.…, true) survives in the mirror';
    end if;
    execute format(
      'create or replace function iam.entity_read_expr(p_schema text, p_table text, p_token text, '
      'p_variant text default ''entity'') returns text language plpgsql stable as %L', v_new);
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='iam' and p.proname='has_access_for_base'
     and pg_get_function_identity_arguments(p.oid) =
         'p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean';
  if position('coalesce(v_lanes.' in v_src) = 0 then
    raise notice 'dd137b10: the kernel already reads the lane set directly';
  else
    v_new := replace(v_src, 'coalesce(v_lanes.org_role_lane, true)', 'v_lanes.org_role_lane');
    v_new := replace(v_new, 'coalesce(v_lanes.org_member_lane, true)', 'v_lanes.org_member_lane');
    v_new := replace(v_new, 'coalesce(v_lanes.platform_admin_lane, true)', 'v_lanes.platform_admin_lane');
    if position('coalesce(v_lanes.' in v_new) > 0 then
      raise exception 'dd137b10: a coalesce(v_lanes.…, true) survives in the kernel';
    end if;
    execute format(
      'create or replace function iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, '
      'p_required public.permission_level, p_include_public boolean) returns boolean '
      'language plpgsql stable security definer cost 10000 '
      'set search_path to ''public'',''platform'',''iam'',''rag'' as %L', v_new);
  end if;
end $$;

-- interlock six — the kernel body moved again, so the fingerprint moves with it (db-rules §6d).
do $$
declare v_fp text;
begin
  select iam.entity_read_kernel_fingerprint() into v_fp;
  execute format('create or replace function iam.entity_read_kernel_expected() returns text '
                 'language sql immutable as $f$ select %L::text $f$', v_fp);
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'dd137b10: the fingerprint did not re-baseline';
  end if;
end $$;

-- ═════════════════════════════════════════════ 6. the gate stops SKIPping the half that broke
--
-- V-40: `class_lanes_match_policy` answered 88 PASS / 230 WARN / 351 SKIP / 0 FAIL, and "the 351
-- SKIPs are what let §1a through". A check that excuses the tables where the bug lives is not a
-- check. Components and ledgers are now asked the same question every other token is asked.
do $$
declare v_src text; v_new text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='iam' and p.proname='verify_canonical';
  if position('DD-137b10' in v_src) > 0 then
    raise notice 'dd137b10: verify_canonical already covers components';
    return;
  end if;

  -- (a) the derivation check reaches components and ledgers through the RESOLVED class
  v_new := replace(v_src,
    '  ELSIF v_dc IN (''private'',''confidential'') AND NOT v_suppress_admin THEN',
    '  ELSIF v_variant IN (''component'',''ledger'')' || E'\n' ||
    '        AND (iam.class_lanes(p_token)).resolved_class IN (''private'',''confidential'')' || E'\n' ||
    '        AND NOT v_suppress_admin THEN' || E'\n' ||
    '    status:=''FAIL''; detail:=format(''DD-137b10: this %s resolves to class %s through its '' ||' || E'\n' ||
    '      ''parent, so the platform-staff lane is closed on it too — our own staff go through the '' ||' || E'\n' ||
    '      ''door like anyone. suppress_platform_admin_lane is false.'', v_variant,' || E'\n' ||
    '      (iam.class_lanes(p_token)).resolved_class);' || E'\n' ||
    '  ELSIF v_dc IN (''private'',''confidential'') AND NOT v_suppress_admin THEN');
  if v_new = v_src then
    raise exception 'dd137b10: could not find the data_class_derivations branch';
  end if;
  v_src := v_new;

  -- (b) the lane/policy comparison stops skipping component and ledger
  v_new := replace(v_src,
    '  IF v_variant IN (''component'',''ledger'',''personal'') OR v_sel IS NULL THEN' || E'\n' ||
    '    status:=''SKIP''; detail:=''std_select is not built by the class-aware mirror on this variant'';',
    '  -- DD-137b10: a component IS asked, through its resolved parent class. Skipping it here is' || E'\n' ||
    '  -- what let 299 of 311 components keep a platform-staff lane under a private parent.' || E'\n' ||
    '  IF v_variant = ''personal'' OR v_sel IS NULL THEN' || E'\n' ||
    '    status:=''SKIP''; detail:=''std_select is not built by the class-aware mirror on this variant'';');
  if v_new = v_src then
    raise exception 'dd137b10: could not find the class_lanes_match_policy skip';
  end if;
  v_src := v_new;

  -- (c) and it FAILs a platform_admin_all policy the class forbids, which is the exact instrument
  --     that was missing: the arm check read std_select only, and platform_admin_all is its own
  --     policy sitting beside it.
  v_new := replace(v_src,
    '    ELSIF NOT v_lanes.anon_lane AND ''pub_read''=ANY(COALESCE(v_polnames,''{}'')) AND v_variant<>''system'' AND NOT v_anon_component THEN',
    '    ELSIF NOT v_lanes.platform_admin_lane AND ''platform_admin_all''=ANY(COALESCE(v_polnames,''{}'')) THEN' || E'\n' ||
    '      status:=''FAIL''; detail:=format(''class %s closes the platform-admin lane, but a '' ||' || E'\n' ||
    '        ''platform_admin_all policy still sits beside std_select — that policy is permissive '' ||' || E'\n' ||
    '        ''and grants everything on its own. Re-run iam.apply_rls.'', v_lanes.resolved_class);' || E'\n' ||
    '    ELSIF NOT v_lanes.anon_lane AND ''pub_read''=ANY(COALESCE(v_polnames,''{}'')) AND v_variant<>''system'' AND NOT v_anon_component THEN');
  if v_new = v_src then
    raise exception 'dd137b10: could not find the anon-lane branch';
  end if;

  execute format(
    'create or replace function iam.verify_canonical(p_schema text, p_table text, p_token text, '
    'p_variant text default null) returns table(check_name text, status text, detail text) '
    'language plpgsql stable set search_path to ''pg_catalog'',''public'' as %L', v_new);
end $$;

-- ═════════════════════════════════════════════ 7. assertions
do $$
declare r platform.lane_set; v_n integer; v_expr text;
begin
  -- chat.message resolves through chat.conversation
  r := iam.class_lanes('message');
  if r.resolved_class <> 'private' or r.platform_admin_lane or r.org_role_lane or r.org_member_lane then
    raise exception 'dd137b10: chat.message does not resolve to its parent''s private lanes: %', r;
  end if;
  -- a component of an organization-class parent keeps everything
  r := iam.class_lanes('canvas_item_state');
  if r.resolved_class is null then
    raise exception 'dd137b10: a component resolved to NULL — the walk did not run';
  end if;
  -- no active token may answer NULL lanes any more: that is what `coalesce(…, true)` was hiding
  select count(*) into v_n from platform.entity_types et
   where et.is_active and (iam.class_lanes(et.token)).resolved_class is null;
  if v_n > 0 then
    raise exception 'dd137b10: % active tokens still resolve to NO class', v_n;
  end if;

  -- the mirror emits no platform-staff arm for a component under a private parent
  select iam.entity_read_expr('chat','message','message','component') into v_expr;
  if v_expr like '%is_super_admin%' or v_expr like '%is_platform_admin%' then
    raise exception 'dd137b10: chat.message''s generated read expression STILL carries a platform-staff arm';
  end if;
  -- and it keeps the parent-cascade lane that is its whole access contract
  if v_expr not like '%accessible_entity_ids(''conversation''%' then
    raise exception 'dd137b10: chat.message lost its parent-cascade lane — over-tightening is as '
      'serious a bug as a stranger let in (db-rules §6)';
  end if;
  -- a component of an ORGANIZATION-class parent is untouched
  select iam.entity_read_expr('canvas','canvas_item_state','canvas_item_state','component') into v_expr;
  if v_expr not like '%accessible_entity_ids(%' then
    raise exception 'dd137b10: an organization-class component lost its parent lane';
  end if;

  -- every ledger is classified, and none holds a list scope
  select count(*) into v_n from platform.entity_types
   where is_active and rls_variant='ledger' and (data_class is null or default_list_scope is not null);
  if v_n > 0 then raise exception 'dd137b10: % ledgers are wrong', v_n; end if;
  -- and no component holds a class of its own
  select count(*) into v_n from platform.entity_types
   where is_active and rls_variant='component' and (data_class is not null or default_list_scope is not null);
  if v_n > 0 then raise exception 'dd137b10: % components hold a class of their own', v_n; end if;

  raise notice 'dd137b10: the class resolves through the parent; DD-137b11 regenerates behind the harness';
end $$;
