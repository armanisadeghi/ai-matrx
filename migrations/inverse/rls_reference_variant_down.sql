-- lane: RLS-REFERENCE
-- chair-step: an inverse is non-additive by construction. This one un-teaches the `reference`
-- variant: it reverse-patches nine live function bodies (removing, among other things, the REVOKE
-- and the `create policy ... using (true)` the reference lane emits), DROPs and re-ADDs five
-- platform.entity_types CHECK constraints one word narrower, and DROPs the constraint that
-- refuses a private reference catalogue. It restores the definitions this database held at
-- 2026-09-21 22:08 UTC and refuses to run while any token still carries rls_variant='reference'.
-- INVERSE of migrations/campaign/rls_reference_variant.sql — it removes the `reference` RLS
-- variant from the four generators, the three derivations and the verifier, and restores the five
-- platform.entity_types CHECKs to the definitions this campaign found live on 2026-09-21.
--
-- IT REVERSE-PATCHES FROM THE CATALOG, exactly as the up-migration patches from it: each block
-- reads the LIVE body, asserts the text the up-migration INSERTED is present exactly as many times
-- as it inserted it, and removes it. So a body another lane has since edited elsewhere keeps that
-- edit, and a body whose reference lane has already been removed stops with a NOTICE instead of
-- corrupting anything.
--
-- 🚨 RUN THE CONVERSION INVERSE FIRST. Any table still registered rls_variant='reference' when
-- this runs would be left with a variant the CHECK no longer admits and a generator that no longer
-- knows the word. migrations/inverse/rls_reference_convert_catalogues_down.sql puts every
-- converted table back first; this block refuses if one is left.
do $guard$
declare v_left text;
begin
  select string_agg(token, ', ' order by token) into v_left
    from platform.entity_types where rls_variant = 'reference';
  if v_left is not null then
    raise exception 'rls-reference inverse: these tokens are still registered rls_variant=''reference'': %. Run migrations/inverse/rls_reference_convert_catalogues_down.sql first — removing the variant underneath a live table would leave it with a word nothing understands.', v_left;
  end if;
end
$guard$;
do $igpn$
declare
  v_def text; v_from text; v_to text; v_n int; i int;
  v_pairs text[][]; v_want int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'iam.generated_policy_names()'::regprocedure;
  if v_def is null then raise exception 'rls-reference inverse: iam.generated_policy_names() not found'; end if;
  if position($mgpn$ref_all_members_read$mgpn$ in v_def) = 0 then
    raise notice 'rls-reference inverse: iam.generated_policy_names() no longer teaches the reference variant -- left alone'; return;
  end if;
  v_pairs := array[
    [$agpn0$    'pub_read',           -- anon lane: entity/system/restricted with visibility, flagged components
    'ref_all_members_read' -- reference: the one read lane of a global catalogue, open to every member
  ]::text[]$agpn0$, $bgpn0$    'pub_read'            -- anon lane: entity/system/restricted with visibility, flagged components
  ]::text[]$bgpn0$]
  ];
  v_want := array[1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want[i] then
      raise exception 'rls-reference inverse: iam.generated_policy_names() patch % -- the inserted text was found % time(s), expected %. Head: %', i, v_n, v_want[i], left(v_from,140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'rls-reference inverse: reverted iam.generated_policy_names()';
end
$igpn$;
do $iaru$
declare
  v_def text; v_from text; v_to text; v_n int; i int;
  v_pairs text[][]; v_want int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'iam._apply_rls_unchecked(text,text,text,text)'::regprocedure;
  if v_def is null then raise exception 'rls-reference inverse: iam._apply_rls_unchecked(text,text,text,text) not found'; end if;
  if position($maru$REFERENCE =======================$maru$ in v_def) = 0 then
    raise notice 'rls-reference inverse: iam._apply_rls_unchecked(text,text,text,text) no longer teaches the reference variant -- left alone'; return;
  end if;
  v_pairs := array[
    [$aaru0$      'create policy std_delete on %s for delete to authenticated using (user_id = (select auth.uid()))',
      v_tbl);
    end if;
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;

  -- ======================= REFERENCE =======================
  -- A global CATALOGUE. Rows that belong to no organization and no person, that every signed-in
  -- member reads and that only a DOOR writes. There is nothing to filter a read on -- that is the
  -- definition of the class, not a shortcut -- so this lane is the one place in the platform where
  -- `using (true)` is the CORRECT generated predicate, and it is generated rather than hand-written
  -- precisely so iam.verify_canonical can certify it (db-rules §6d: never hand-write policies).
  if p_variant = 'reference' then
    -- THE THREE REFUSALS. A column the reference read lane never reads is a SECOND, COMPETING
    -- ACCESS AUTHORITY -- the exact shape THE COMPONENT OWNERSHIP LAW (§6d-1) was written about,
    -- one variant over. The generator refuses rather than ignoring them, because ignoring is how a
    -- table ends up with a tenancy column that nothing enforces.
    if v_has_org then
      raise exception
        'apply_rls: reference variant on %.% carries organization_id -- a reference catalogue belongs to NO organization, and its read lane never looks at the column, so the column and the policy would disagree about who may read a row. If these rows really belong to an organization this is not reference data: register it as entity (or system, with a visibility column).',
        p_schema, p_table using errcode = '22023';
    end if;
    if v_has_user then
      raise exception
        'apply_rls: reference variant on %.% carries user_id -- a reference catalogue belongs to NO person. A table whose rows have an owner is `personal` (the owner is the whole boundary) or `entity`, never `reference`.',
        p_schema, p_table using errcode = '22023';
    end if;
    if v_has_created then
      raise exception
        'apply_rls: reference variant on %.% carries created_by -- on the entity family that column IS the access key (§6d-1), and this lane never reads it. Leaving it here means two authorities disagree about who may read a row. Drop the column, rename it to a real domain-authorship column, or register the table as `entity`.',
        p_schema, p_table using errcode = '22023';
    end if;
    -- THE ONE READ LANE, AND ITS NAME SAYS WHAT IT IS.
    execute format(
      'create policy ref_all_members_read on %s for select to authenticated using (true)', v_tbl);
    -- THE ANON LANE IS THE CLASS'S, NOT THE VARIANT'S (DD-249). `public` is the one class whose
    -- lane set includes anon. On any other class the key is WITHDRAWN here, so clearing the class
    -- and re-running removes the lane completely -- the symmetry the component anon lane has.
    v_pub_lanes := iam.class_lanes(p_token);
    if v_pub_lanes.anon_lane then
      -- The policy is the access RULE; the grant is the access. A schema declared CLOSED in
      -- `platform.schema_client_exposure` gets the rule and never the key.
      if platform.schema_is_client_exposed(p_schema) then
        execute format('create policy pub_read on %s for select to anon using (true)', v_tbl);
        execute format('grant select on %s to anon', v_tbl);
      else
        execute format('revoke all on %s from anon', v_tbl);
        raise notice
          'apply_rls: %.% is data_class=public but schema % is declared CLOSED to client roles in platform.schema_client_exposure -- no pub_read policy and no anon grant were issued, so the anonymous lane is inert until the schema is opened.',
          p_schema, p_table, p_schema;
      end if;
    else
      execute format('revoke select on %s from anon', v_tbl);
    end if;
    -- READ-ONLY CLIENT GRANT: iam.apply_table_grants gives this variant the `v_client_read_only`
    -- path, so there is no INSERT/UPDATE/DELETE privilege behind any policy anybody could write.
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- Nothing to govern: no owner, no organization, no visibility, and no client write lane at all.
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;$aaru0$, $baru0$      'create policy std_delete on %s for delete to authenticated using (user_id = (select auth.uid()))',
      v_tbl);
    end if;
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;$baru0$],
    [$aaru1$not in ('entity','system','restricted','personal','component','ledger','reference') then$aaru1$, $baru1$not in ('entity','system','restricted','personal','component','ledger') then$baru1$]
  ];
  v_want := array[1,1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want[i] then
      raise exception 'rls-reference inverse: iam._apply_rls_unchecked(text,text,text,text) patch % -- the inserted text was found % time(s), expected %. Head: %', i, v_n, v_want[i], left(v_from,140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'rls-reference inverse: reverted iam._apply_rls_unchecked(text,text,text,text)';
end
$iaru$;
do $iatg$
declare
  v_def text; v_from text; v_to text; v_n int; i int;
  v_pairs text[][]; v_want int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'iam.apply_table_grants(text,text,text)'::regprocedure;
  if v_def is null then raise exception 'rls-reference inverse: iam.apply_table_grants(text,text,text) not found'; end if;
  if position($matg$'ledger','reference'$matg$ in v_def) = 0 then
    raise notice 'rls-reference inverse: iam.apply_table_grants(text,text,text) no longer teaches the reference variant -- left alone'; return;
  end if;
  v_pairs := array[
    [$aatg0$not in ('entity','system','restricted','personal','component','ledger','reference') then$aatg0$, $batg0$not in ('entity','system','restricted','personal','component','ledger') then$batg0$],
    [$aatg1$  -- `reference` joins the read-only client lane for the same reason the ledger is on it: the
  -- rows are written by a door, never by a client. A catalogue whose client grant carried
  -- INSERT/UPDATE/DELETE would make every generated write policy optional -- the privilege would
  -- be there whatever the policy said, and correcting it by hand would last exactly until the next
  -- regeneration (DD-248's lesson).
  if p_variant in ('ledger','reference') or v_stamped or v_client_read_only then
    -- Append-only org log: reads only; writes belong to a SECURITY DEFINER writer.$aatg1$, $batg1$  if p_variant = 'ledger' or v_stamped or v_client_read_only then
    -- Append-only org log: reads only; writes belong to a SECURITY DEFINER writer.$batg1$]
  ];
  v_want := array[1,1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want[i] then
      raise exception 'rls-reference inverse: iam.apply_table_grants(text,text,text) patch % -- the inserted text was found % time(s), expected %. Head: %', i, v_n, v_want[i], left(v_from,140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'rls-reference inverse: reverted iam.apply_table_grants(text,text,text)';
end
$iatg$;
do $iddc$
declare
  v_def text; v_from text; v_to text; v_n int; i int;
  v_pairs text[][]; v_want int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'platform.derive_data_class(text,text)'::regprocedure;
  if v_def is null then raise exception 'rls-reference inverse: platform.derive_data_class(text,text) not found'; end if;
  if position($mddc$p_variant = 'reference'$mddc$ in v_def) = 0 then
    raise notice 'rls-reference inverse: platform.derive_data_class(text,text) no longer teaches the reference variant -- left alone'; return;
  end if;
  v_pairs := array[
    [$addc0$    when p_variant = 'restricted' then 'confidential'::platform.data_class
    -- A REFERENCE CATALOGUE IS NEVER PRIVATE. Its read lane is `true` for every signed-in member,
    -- so `private` or `confidential` would be a claim the policy contradicts on its face. The only
    -- open question a reference table's class answers is whether a SIGNED-OUT reader is welcome,
    -- and `public` is the one class whose lane set includes anon.
    when p_variant = 'reference' then
      case when p_visibility = 'public' then 'public'::platform.data_class
           else 'organization'::platform.data_class end$addc0$, $bddc0$    when p_variant = 'restricted' then 'confidential'::platform.data_class$bddc0$]
  ];
  v_want := array[1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want[i] then
      raise exception 'rls-reference inverse: platform.derive_data_class(text,text) patch % -- the inserted text was found % time(s), expected %. Head: %', i, v_n, v_want[i], left(v_from,140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'rls-reference inverse: reverted platform.derive_data_class(text,text)';
end
$iddc$;
do $idls$
declare
  v_def text; v_from text; v_to text; v_n int; i int;
  v_pairs text[][]; v_want int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'platform.derive_list_scope(text,platform.data_class)'::regprocedure;
  if v_def is null then raise exception 'rls-reference inverse: platform.derive_list_scope(text,platform.data_class) not found'; end if;
  if position($mdls$p_variant = 'reference'$mdls$ in v_def) = 0 then
    raise notice 'rls-reference inverse: platform.derive_list_scope(text,platform.data_class) no longer teaches the reference variant -- left alone'; return;
  end if;
  v_pairs := array[
    [$adls0$    when p_variant in ('component','ledger') then null
    -- A reference catalogue has no owner and no organization: "mine" is not expressible and
    -- "organization" would be a lie. The whole catalogue IS the list.
    when p_variant = 'reference' then null$adls0$, $bdls0$    when p_variant in ('component','ledger') then null$bdls0$]
  ];
  v_want := array[1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want[i] then
      raise exception 'rls-reference inverse: platform.derive_list_scope(text,platform.data_class) patch % -- the inserted text was found % time(s), expected %. Head: %', i, v_n, v_want[i], left(v_from,140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'rls-reference inverse: reverted platform.derive_list_scope(text,platform.data_class)';
end
$idls$;
do $ietcd$
declare
  v_def text; v_from text; v_to text; v_n int; i int;
  v_pairs text[][]; v_want int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'platform._entity_types_classify_default()'::regprocedure;
  if v_def is null then raise exception 'rls-reference inverse: platform._entity_types_classify_default() not found'; end if;
  if position($metcd$rls_variant = 'reference'$metcd$ in v_def) = 0 then
    raise notice 'rls-reference inverse: platform._entity_types_classify_default() no longer teaches the reference variant -- left alone'; return;
  end if;
  v_pairs := array[
    [$aetcd0$  if new.rls_variant = 'reference' then
    -- A reference catalogue has no owner and no organization, so it has no default list scope --
    -- the whole catalogue is the list. And it MUST hold a class, because there is no composition
    -- parent to resolve one from (the ledger's reason, one variant over).
    new.default_list_scope := null;
    if new.data_class is null then
      new.data_class := platform.derive_data_class(new.rls_variant, new.default_visibility::text);
      new.data_class_reason := coalesce(new.data_class_reason,
        'Born unclassified and derived by platform.derive_data_class for rls_variant=reference: a '
        'catalogue every signed-in member reads is at least `organization`, and `public` only when '
        'a signed-out reader is welcome. Reclassify deliberately.');
    end if;
    return new;
  end if;
  if new.rls_variant = 'component' then
    -- A component's access IS its parent's (db-rules §6d-1); it holds no class of its own.$aetcd0$, $betcd0$  if new.rls_variant = 'component' then
    -- A component's access IS its parent's (db-rules §6d-1); it holds no class of its own.$betcd0$]
  ];
  v_want := array[1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want[i] then
      raise exception 'rls-reference inverse: platform._entity_types_classify_default() patch % -- the inserted text was found % time(s), expected %. Head: %', i, v_n, v_want[i], left(v_from,140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'rls-reference inverse: reverted platform._entity_types_classify_default()';
end
$ietcd$;
do $irfe$
declare
  v_def text; v_from text; v_to text; v_n int; i int;
  v_pairs text[][]; v_want int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text)'::regprocedure;
  if v_def is null then raise exception 'rls-reference inverse: platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text) not found'; end if;
  if position($mrfe$'ledger','reference'$mrfe$ in v_def) = 0 then
    raise notice 'rls-reference inverse: platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text) no longer teaches the reference variant -- left alone'; return;
  end if;
  v_pairs := array[
    [$arfe0$  if v_variant not in ('entity','system','restricted','personal','component','ledger','reference') then$arfe0$, $brfe0$  if v_variant not in ('entity','system','restricted','personal','component','ledger') then$brfe0$],
    [$arfe1$  if p_visibility_expr is not null and v_variant in ('component','ledger','reference') then$arfe1$, $brfe1$  if p_visibility_expr is not null and v_variant in ('component','ledger') then$brfe1$]
  ];
  v_want := array[1,1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want[i] then
      raise exception 'rls-reference inverse: platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text) patch % -- the inserted text was found % time(s), expected %. Head: %', i, v_n, v_want[i], left(v_from,140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'rls-reference inverse: reverted platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text)';
end
$irfe$;
do $ipv$
declare
  v_def text; v_from text; v_to text; v_n int; i int;
  v_pairs text[][]; v_want int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'platform.provision_validate(jsonb,text,uuid)'::regprocedure;
  if v_def is null then raise exception 'rls-reference inverse: platform.provision_validate(jsonb,text,uuid) not found'; end if;
  if position($mpv$'system','reference'$mpv$ in v_def) = 0 then
    raise notice 'rls-reference inverse: platform.provision_validate(jsonb,text,uuid) no longer teaches the reference variant -- left alone'; return;
  end if;
  v_pairs := array[
    [$apv0$e.rls_variant not in ('system','reference')$apv0$, $bpv0$e.rls_variant <> 'system'$bpv0$]
  ];
  v_want := array[2];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want[i] then
      raise exception 'rls-reference inverse: platform.provision_validate(jsonb,text,uuid) patch % -- the inserted text was found % time(s), expected %. Head: %', i, v_n, v_want[i], left(v_from,140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'rls-reference inverse: reverted platform.provision_validate(jsonb,text,uuid)';
end
$ipv$;
do $ivc$
declare
  v_def text; v_from text; v_to text; v_n int; i int;
  v_pairs text[][]; v_want int[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = 'iam.verify_canonical(text,text,text,text)'::regprocedure;
  if v_def is null then raise exception 'rls-reference inverse: iam.verify_canonical(text,text,text,text) not found'; end if;
  if position($mvc$reference_has_no_scope_columns$mvc$ in v_def) = 0 then
    raise notice 'rls-reference inverse: iam.verify_canonical(text,text,text,text) no longer teaches the reference variant -- left alone'; return;
  end if;
  v_pairs := array[
    [$avc0$  SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy WHERE polrelid=v_tbl AND polname='std_select';
  -- THE REFERENCE VARIANT NAMES ITS READ LANE FOR WHAT IT IS, AND THE CLASS-AWARE CHECKS BELOW
  -- MUST STILL SEE IT. `ref_all_members_read` is the one SELECT policy iam._apply_rls_unchecked
  -- emits for rls_variant='reference'; reading it into the SAME variable means
  -- class_lanes_match_policy, system_org_arm_respects_class and the pub_read arbitration JUDGE a
  -- reference table instead of silently SKIPping it on a NULL std_select -- a half-taught verifier
  -- across a 700-table registry being exactly the defect class this variant was built inside.
  -- No other variant emits this name, so this lookup is a no-op everywhere else.
  IF v_sel IS NULL THEN
    SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy
     WHERE polrelid=v_tbl AND polname='ref_all_members_read';
  END IF;$avc0$, $bvc0$  SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy WHERE polrelid=v_tbl AND polname='std_select';$bvc0$],
    [$avc1$  -- 🚨 WITH ONE NAMED EXCEPTION, AND IT IS A CLASS DEFINITION, NOT A WAIVER. `reference` is a
  -- global CATALOGUE: rows that belong to no organization and no person. The NO-NULL-ORG ruling is
  -- about a row that belongs to SOMEBODY; a reference row belongs to nobody, which is why
  -- iam.apply_rls REFUSES this variant outright (22023) when organization_id exists. The skip is
  -- therefore backed by a generator refusal AND by the positive assertion
  -- `reference_has_no_scope_columns` below -- never by this gate looking away.
  IF v_variant='reference' THEN
    check_name:='base_organization_id'; status:='SKIP'; detail:='a reference catalogue belongs to no organization; iam.apply_rls refuses the variant if organization_id exists, and reference_has_no_scope_columns asserts it'; RETURN NEXT;
    check_name:='base_org_not_null'; status:='SKIP'; detail:='no organization_id on a reference catalogue, so nothing to require NOT NULL'; RETURN NEXT;
    check_name:='base_org_fk'; status:='SKIP'; detail:='no organization_id on a reference catalogue, so nothing to key to iam.organizations'; RETURN NEXT;
  ELSE
  check_name:='base_organization_id'; status:=CASE WHEN f_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_org THEN NULL ELSE 'missing organization_id' END; RETURN NEXT;
  check_name:='base_org_not_null'; status:=CASE WHEN NOT f_org THEN 'SKIP' WHEN f_org_nn THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN f_org AND NOT f_org_nn THEN 'organization_id must be NOT NULL' END; RETURN NEXT;
  check_name:='base_org_fk'; status:=CASE WHEN fk_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN fk_org THEN NULL ELSE 'organization_id missing FK -> iam.organizations' END; RETURN NEXT;
  END IF;$avc1$, $bvc1$  check_name:='base_organization_id'; status:=CASE WHEN f_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_org THEN NULL ELSE 'missing organization_id' END; RETURN NEXT;
  check_name:='base_org_not_null'; status:=CASE WHEN NOT f_org THEN 'SKIP' WHEN f_org_nn THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN f_org AND NOT f_org_nn THEN 'organization_id must be NOT NULL' END; RETURN NEXT;
  check_name:='base_org_fk'; status:=CASE WHEN fk_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN fk_org THEN NULL ELSE 'organization_id missing FK -> iam.organizations' END; RETURN NEXT;$bvc1$],
    [$avc2$  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference row has no creator to name -- the catalogue belongs to the platform, its writes are a door''s, and iam.apply_rls refuses the variant if created_by exists';
  ELSE status:='SKIP'; detail:='ledger actor is a named domain column (e.g. actor_id), never an access key'; END IF; RETURN NEXT;$avc2$, $bvc2$  ELSE status:='SKIP'; detail:='ledger actor is a named domain column (e.g. actor_id), never an access key'; END IF; RETURN NEXT;$bvc2$],
    [$avc3$  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference catalogue has no actor columns -- every write goes through a door and the actor is stamped into history.row_versions';
  ELSE status:='SKIP'; detail:='append-only ledger row is never updated'; END IF; RETURN NEXT;$avc3$, $bvc3$  ELSE status:='SKIP'; detail:='append-only ledger row is never updated'; END IF; RETURN NEXT;$bvc3$],
    [$avc4$  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='a reference catalogue has no client write lane at all (read-only client grant) -- nothing a client does maintains the stamp';
  ELSE status:='SKIP'; detail:='non-versioned ledger — no user-write lane (SELECT-only grants, §6d-2) and nothing maintains the stamp'; END IF; RETURN NEXT;$avc4$, $bvc4$  ELSE status:='SKIP'; detail:='non-versioned ledger — no user-write lane (SELECT-only grants, §6d-2) and nothing maintains the stamp'; END IF; RETURN NEXT;$bvc4$],
    [$avc5$  ELSIF v_variant='reference' THEN status:='SKIP'; detail:='non-versioned reference catalogue — nothing reads version (§7: version matters iff is_versioned)';
  ELSE status:='SKIP'; detail:='non-versioned ledger — nothing reads version (§7: version matters iff is_versioned)'; END IF; RETURN NEXT;$avc5$, $bvc5$  ELSE status:='SKIP'; detail:='non-versioned ledger — nothing reads version (§7: version matters iff is_versioned)'; END IF; RETURN NEXT;$bvc5$],
    [$avc6$  ELSIF v_variant='reference' THEN status:='WARN'; detail:='no deleted_at — a retired catalogue row should be archived, not deleted; the reference read lane emits no deleted_at prefix, so the door and the reader must filter';
  ELSE status:='WARN'; detail:='no deleted_at (has_soft_delete=false)'; END IF; RETURN NEXT;$avc6$, $bvc6$  ELSE status:='WARN'; detail:='no deleted_at (has_soft_delete=false)'; END IF; RETURN NEXT;$bvc6$],
    [$avc7$  IF f_vis AND v_variant IN ('component','ledger','reference') THEN$avc7$, $bvc7$  IF f_vis AND v_variant IN ('component','ledger') THEN$bvc7$],
    [$avc8$  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='ledger access is org-scoped; the ledger RLS lane never reads visibility';
  ELSIF v_variant='reference' THEN status:='PASS'; detail:='a reference catalogue has no per-row visibility — every signed-in member reads every row, and whether a SIGNED-OUT reader may is the CLASS''s call (data_class=public), never a column''s';$avc8$, $bvc8$  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='ledger access is org-scoped; the ledger RLS lane never reads visibility';$bvc8$],
    [$avc9$  IF v_variant='reference' THEN
       -- THE WHOLE POLICY SET OF A CATALOGUE: the service lane, and one read lane whose name says
       -- it belongs to every signed-in member. NO platform_admin_all (a staff READ lane adds
       -- nothing where every member already reads every row, and a staff WRITE lane is exactly the
       -- door this variant exists to force) and NO std_insert/std_update/std_delete at all.
       v_expected:=ARRAY['svc_all','ref_all_members_read'];
       -- The anon lane is the CLASS's, not the variant's (DD-249).
       IF (iam.class_lanes(p_token)).anon_lane THEN v_expected:=array_append(v_expected,'pub_read'); END IF;
  ELSIF v_variant='restricted' AND NOT f_vis THEN v_expected:=ARRAY['svc_all'];$avc9$, $bvc9$  IF v_variant='restricted' AND NOT f_vis THEN v_expected:=ARRAY['svc_all'];$bvc9$],
    [$avc10$  IF v_suppress_admin AND v_variant NOT IN ('personal','reference') THEN$avc10$, $bvc10$  IF v_suppress_admin AND v_variant<>'personal' THEN$bvc10$],
    [$avc11$     AND v_variant NOT IN ('system','personal','reference')$avc11$, $bvc11$     AND v_variant NOT IN ('system','personal')$bvc11$],
    [$avc12$    IF v_variant IN ('personal','reference') THEN status:='PASS'; detail:=format('the %s variant never had a platform-admin lane',v_variant);$avc12$, $bvc12$    IF v_variant='personal' THEN status:='PASS'; detail:='personal variant never had a platform-admin lane';$bvc12$],
    [$avc13$  ELSIF v_variant='reference' THEN
    -- ── 1. THE ONE READ LANE, AND IT IS OPEN TO EVERY MEMBER ON PURPOSE ──────────────────────
    check_name:='reference_open_read';
    DECLARE r_open record;
    BEGIN
      SELECT p.polname,
             COALESCE(btrim(regexp_replace(COALESCE(pg_get_expr(p.polqual,p.polrelid),'true'),'\s+',' ','g')),'') AS q,
             (SELECT bool_and(ro.rolname='authenticated')
                FROM unnest(p.polroles) rr JOIN pg_roles ro ON ro.oid=rr) AS only_auth
        INTO r_open
        FROM pg_policy p WHERE p.polrelid=v_tbl AND p.polname='ref_all_members_read';
      IF r_open.polname IS NULL THEN
        status:='FAIL'; detail:='the reference read lane ref_all_members_read is missing — a catalogue with no read policy shows nothing and explains nothing. Re-run iam.apply_rls(...,''reference'').';
      ELSIF r_open.q NOT IN ('true','') THEN
        status:='FAIL'; detail:=format('ref_all_members_read carries a predicate (%s). A reference catalogue has nothing to filter a read on — if these rows need filtering they are not reference data and the table is registered as the wrong variant. Re-run iam.apply_rls.', left(r_open.q,120));
      ELSIF NOT COALESCE(r_open.only_auth,false) THEN
        status:='FAIL'; detail:='ref_all_members_read is not TO authenticated alone — whether a SIGNED-OUT reader is welcome is the class''s call (data_class=public emits pub_read), never this lane''s. Re-run iam.apply_rls.';
      ELSE status:='PASS'; detail:='every signed-in member reads the whole catalogue';
      END IF;
    END; RETURN NEXT;

    -- ── 2. WRITES ARE A DOOR'S, AND NO PRIVILEGE SITS BEHIND ONE ─────────────────────────────
    check_name:='reference_no_client_write';
    DECLARE v_w text := NULL; v_polw text := NULL; v_colw text := NULL;
    BEGIN
      SELECT string_agg(DISTINCT r.role_name||':'||pv.priv, ', ') INTO v_w
        FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
        CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS pv(priv)
       WHERE has_table_privilege(r.role_name, v_tbl, pv.priv);
      SELECT string_agg(DISTINCT r.role_name, ', ') INTO v_colw
        FROM unnest(ARRAY['public','anon','authenticated']) AS r(role_name)
       WHERE has_any_column_privilege(r.role_name, v_tbl, 'INSERT,UPDATE,REFERENCES');
      SELECT string_agg(DISTINCT p.polname, ', ') INTO v_polw
        FROM pg_policy p CROSS JOIN LATERAL unnest(p.polroles) AS pr(role_oid)
       WHERE p.polrelid=v_tbl AND p.polcmd IN ('*','a','w','d')
         AND (pr.role_oid=0 OR pg_has_role('anon',pr.role_oid,'USAGE') OR pg_has_role('authenticated',pr.role_oid,'USAGE'));
      IF v_w IS NULL AND v_colw IS NULL AND v_polw IS NULL THEN
        status:='PASS'; detail:='no client write privilege and no client write policy — the catalogue''s writes are a door''s';
      ELSE status:='FAIL';
        detail:=format('a reference catalogue is written by a DOOR, never by a client:%s%s%s. iam.apply_table_grants issues the read-only client grant for this variant, so re-running iam.apply_rls(...,''reference'') withdraws it; a hand-fixed grant lasts exactly until the next regeneration (DD-248).',
                       COALESCE(' table privileges '||v_w,''), COALESCE(' column privileges for '||v_colw,''), COALESCE(' write policies '||v_polw,''));
      END IF;
    END; RETURN NEXT;

    -- ── 3. NOTHING TO SCOPE A READ ON, ASSERTED RATHER THAN ASSUMED ──────────────────────────
    check_name:='reference_has_no_scope_columns';
    IF f_org OR l_owner OR f_cb OR f_ub THEN
      status:='FAIL';
      detail:=format('a reference catalogue belongs to no organization and no person, but this table carries %s. Two authorities then disagree about who may read a row: the column says one thing and ref_all_members_read says everyone (§6d-1''s lesson, one variant over). Drop the column, rename it to real domain authorship, or register the table as entity/system/personal.',
        btrim(CASE WHEN f_org THEN 'organization_id ' ELSE '' END
           || CASE WHEN l_owner THEN 'user_id/owner_id/author_id/creator_id ' ELSE '' END
           || CASE WHEN f_cb THEN 'created_by ' ELSE '' END
           || CASE WHEN f_ub THEN 'updated_by' ELSE '' END));
    ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

    -- ── 4. THE ANON LANE IS THE CLASS'S (DD-249) ─────────────────────────────────────────────
    check_name:='pub_read_anon';
    IF (iam.class_lanes(p_token)).anon_lane THEN
      IF NOT ('pub_read'=ANY(COALESCE(v_polnames,'{}'))) THEN
        status:='FAIL'; detail:='data_class=public but pub_read is missing — re-run iam.apply_rls';
      ELSIF NOT has_any_column_privilege('anon', v_tbl, 'SELECT') THEN
        status:='FAIL'; detail:='pub_read exists but anon holds no SELECT key — a door with no key, which reads as an anonymous lane to everyone auditing the table. Re-run iam.apply_rls.';
      ELSE status:='PASS'; detail:='data_class=public: the catalogue is served to signed-out readers'; END IF;
    ELSIF has_any_column_privilege('anon', v_tbl, 'SELECT') THEN
      status:='FAIL'; detail:=format('class %s emits NO anonymous lane, but anon holds a SELECT key to this catalogue. Either declare it (data_class=public with a written reason) or re-run iam.apply_rls, which withdraws the key.', (iam.class_lanes(p_token)).resolved_class);
    ELSE status:='SKIP'; detail:=format('class %s emits no anonymous lane, so no pub_read is expected (DD-249)', (iam.class_lanes(p_token)).resolved_class);
    END IF; RETURN NEXT;
  ELSIF v_variant='component' THEN
    SELECT parent_type,fk_column INTO v_parent_type,v_parent_col FROM platform.entity_relationships WHERE child_type=p_token AND kind='composition' LIMIT 1;$avc13$, $bvc13$  ELSIF v_variant='component' THEN
    SELECT parent_type,fk_column INTO v_parent_type,v_parent_col FROM platform.entity_relationships WHERE child_type=p_token AND kind='composition' LIMIT 1;$bvc13$],
    [$avc14$  ELSIF v_variant = 'reference' THEN
    status:=CASE WHEN v_dc IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NOT NULL THEN v_dc::text
                 ELSE 'a reference catalogue has no composition parent, so it must STATE its class — and the only question its class answers is whether a SIGNED-OUT reader is welcome (public) or only signed-in members (organization)' END;
  ELSIF v_variant = 'ledger' THEN
    status:=CASE WHEN v_dc IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;$avc14$, $bvc14$  ELSIF v_variant = 'ledger' THEN
    status:=CASE WHEN v_dc IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;$bvc14$],
    [$avc15$  ELSIF v_variant = 'reference' AND v_dc IN ('private','confidential') THEN
    status:='FAIL'; detail:=format('a reference catalogue is read by EVERY signed-in member by construction — ref_all_members_read is `true` — so class %s is a declaration the live policy contradicts on its face. Its class is `organization` (members only) or `public` (signed-out readers too).', v_dc);
  ELSIF v_dc IN ('private','confidential') AND NOT v_suppress_admin THEN$avc15$, $bvc15$  ELSIF v_dc IN ('private','confidential') AND NOT v_suppress_admin THEN$bvc15$],
    [$avc16$  IF v_variant IN ('component','ledger','reference') THEN
    status:=CASE WHEN v_ls IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_ls IS NOT NULL THEN format('%s may not hold a default_list_scope',v_variant)
                 WHEN v_variant='reference' THEN 'a reference catalogue has no owner and no organization: "mine" is not expressible and "organization" would be a lie — the whole catalogue IS the list (§3.3)'
                 ELSE 'a component has no owner column, so "mine" is not expressible (§3.3)' END;$avc16$, $bvc16$  IF v_variant IN ('component','ledger') THEN
    status:=CASE WHEN v_ls IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_ls IS NULL THEN 'a component has no owner column, so "mine" is not expressible (§3.3)' ELSE 'component/ledger may not hold a default_list_scope' END;$bvc16$]
  ];
  v_want := array[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1];
  for i in 1 .. array_length(v_pairs,1) loop
    v_from := v_pairs[i][1]; v_to := v_pairs[i][2];
    v_n := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
    if v_n <> v_want[i] then
      raise exception 'rls-reference inverse: iam.verify_canonical(text,text,text,text) patch % -- the inserted text was found % time(s), expected %. Head: %', i, v_n, v_want[i], left(v_from,140);
    end if;
    v_def := replace(v_def, v_from, v_to);
  end loop;
  execute v_def;
  raise notice 'rls-reference inverse: reverted iam.verify_canonical(text,text,text,text)';
end
$ivc$;

-- ══ THE REGISTRY CHECKS, RESTORED TO THE LIVE 2026-09-21 DEFINITIONS ══════════════════════════
alter table platform.entity_types drop constraint if exists entity_types_reference_is_not_private_ck;

alter table platform.entity_types drop constraint entity_types_class_scope_ck;
alter table platform.entity_types add constraint entity_types_class_scope_ck
  check (case
           when rls_variant = 'component' then (data_class is null and default_list_scope is null)
           when rls_variant = 'ledger' then default_list_scope is null
           else true
         end);

alter table platform.entity_types drop constraint entity_types_type_is_derived_or_explained;
alter table platform.entity_types add constraint entity_types_type_is_derived_or_explained
  check (type is null or type_reason is not null or type = case
    when is_active is false then 'deprecated'
    when audit_class = 'machinery' then 'system'
    when rls_variant = any (array['component','detail']) then 'detail'
    when rls_variant = 'system' then 'reference'
    when rls_variant = 'restricted' then 'restricted'
    when rls_variant = 'ledger' then 'ledger'
    else 'entity'
  end) not valid;

alter table platform.entity_types drop constraint entity_types_rls_variant_valid;
alter table platform.entity_types add constraint entity_types_rls_variant_valid
  check (rls_variant = any (array['entity','component','system','restricted','ledger','personal','detail']));

alter table platform.entity_types drop constraint entity_types_rls_variant_check;
alter table platform.entity_types add constraint entity_types_rls_variant_check
  check (rls_variant is null or rls_variant = any (array['entity','component','ledger','system','restricted','personal','detail']));

-- The door declaration this migration had to settle is LEFT IN PLACE on purpose: it records a
-- true, pre-existing fact about platform.retrofit_entity (SECURITY DEFINER, server-only, no client
-- grant) that had nothing to do with the reference variant. Removing it would re-open a latent
-- debt that has already bitten one transaction. Delete it only if the function itself goes away.
