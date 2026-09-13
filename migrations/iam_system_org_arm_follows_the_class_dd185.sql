-- iam_system_org_arm_follows_the_class_dd185 — THE §6e SYSTEM-ORGANIZATION ARM HONOURS THE CLASS
-- (DD-185, lane B-77. SECURITY.)
--
-- THE DEFECT, IN ONE SENTENCE. db-rules §6e gives a row owned by a `global_readable` system
-- organization a read arm that asks about NOTHING ELSE — not membership, not a role, not a grant,
-- not a share. It is an EVERY-SIGNED-IN-USER arm. Until this file it was emitted unconditionally
-- on the entity/system/component family, so a `confidential` table's rows, parked in the system
-- organization because no customer owns them, were readable by every signed-in account on the
-- platform, non-members included.
--
-- MEASURED, NOT ASSUMED:
--   * B-65 (2026-09-13, rolled-back rehearsal, real identities): generating four DD-173 tokens as
--     `system`/`confidential` handed test@test.com — a member of NEITHER organization — 8 rows of
--     `meta.audit_exemption` and 4 of `admin.admin_markdown_samples`. 0 -> 8 and 0 -> 4.
--   * LIVE TODAY, on this database, before this file: 63 active tokens resolve to class
--     `confidential` AND carry the arm in their `std_select`, and two of them hold rows it
--     actually exposes — `hr.earning_code` (24 rows) and `hr.auto_close_rule` (2) — both owned by
--     the global-readable system org at `visibility >= internal`. 26 rows of a CONFIDENTIAL HR
--     table, readable by anyone with an account. No `private`-class token carries it: DD-137b's
--     `org_member_lane` filter already removes it there, which is exactly why nobody saw the
--     `confidential` half — `org_member_lane` is TRUE for `confidential`, and the filter was
--     written as if that one flag governed both arms.
--
-- THE RULE THIS FILE INSTALLS IS DD-174's, CHARACTER FOR CHARACTER. B-57 fixed precisely this
-- blindness in the LEDGER branch three weeks' worth of migrations ago: "the system-org arm only
-- for the two classes whose lane set is wider than one organization (`organization` and
-- `public`)". The entity/system/component branch never got it. Now it has it, in every place that
-- decides the read:
--
--   1. iam.entity_read_expr      — THE MIRROR. The policy TEXT a real HTTP read runs against.
--   2. iam.has_access_for_base   — THE KERNEL. What the generated policy's bounded
--                                  `iam.has_access(...)` arm asks, and what every server-side
--                                  access question resolves through.
--   3. iam.accessible_entity_ids — THE ID PRODUCER. The candidate set behind that bounded arm,
--                                  and the function server-side list endpoints call directly.
--   4. iam.is_discoverable_base  — the discovery resolver.
--   5. iam.discoverable_ids      — the discovery id producer.
--
-- 🚨 WHY ALL FIVE AND NOT JUST THE GENERATOR. Narrowing the mirror alone closes nothing: the
-- generated policy ends in `(id in (<candidates>) and iam.has_access(token, id, 'viewer'))`, and
-- both the candidate set and the kernel would still have admitted the same row. A safe path
-- beside an unsafe one is not a fix. DD-170 learned this from the other side ("the kernel got
-- this wall first; mirroring it here is the other half").
--
-- 🚨 WHAT THIS FILE DOES NOT FIX, NAMED RATHER THAN SWEPT.
--   * `iam.is_discoverable_base` and `iam.discoverable_ids` are class-blind in their OTHER arms
--     too — the org-admin lane and the org-access lane there never received DD-137b at all. Only
--     the §6e arm is closed here. That is a finding of its own and it is reported, not half-fixed
--     in silence.
--   * `iam.org_readable(uuid)` answers "is this organization readable" with a global-readable
--     system org always true, and it takes no token, so it cannot consult a class. It appears in
--     NO policy (checked: zero policies on this database reference it) — only in four association
--     helper functions. Reported, untouched.
--
-- 🚨 THE 361 ORGANIZATION/PUBLIC TOKENS MUST NOT MOVE, and the forcing test asserts that by
-- comparing the emitted expression character for character rather than by reading it.
--
-- Nothing here changes a schema, a grant or a live policy. It changes what the resolvers ANSWER
-- and what the generator EMITS. The 63 affected tokens are regenerated in their own batch files,
-- each under the access-delta gate.
set local lock_timeout = '10s';

-- ═════════════════════════════════ SECTION 0 — THE PREREQUISITE NOBODY COULD HAVE MET WITHOUT IT
-- DD-185's forcing test has to BUILD a confidential entity table to reproduce the leak on, and the
-- one builder platform._ddl_guard admits — platform.create_entity_table — raises 42710 for every
-- `entity` and `system` variant call: it attaches `_stamp_actor_tier` a second time after
-- `platform._admit_entity_type_attaches_carrier` has already attached it on the entity_types
-- INSERT. Measured here, RED, against the deployed function, before anything is changed. `ledger`
-- is unaffected (the admission trigger returns early for it), which is why the DD-174 forcing test
-- and every recent ledger migration never saw it.
do $b77cet_red$
declare
  s text := 'zz_b77_cet_red_' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint);
  v_caught text;
begin
  execute format('create schema %I', s);
  begin
    perform platform.create_entity_table(
      s, 'probe', s || '_token', 'B-77 create_entity_table RED probe',
      array['note text'], 'entity', false, false, 'internal', false, false, false, false,
      null::text[], 'organization'::platform.data_class, 'organization'::platform.list_scope);
    raise exception 'B-77: platform.create_entity_table BUILT an entity table, so the double-attach this file fixes is not present and the fix below would be a change nobody needs. Nothing was changed.';
  exception when others then
    v_caught := sqlerrm;
    if v_caught like 'B-77:%' then raise; end if;
    if v_caught not like '%_stamp_actor_tier%already exists%' then
      raise exception 'B-77: platform.create_entity_table failed for a DIFFERENT reason than the double-attach: %', v_caught;
    end if;
  end;
  raise notice 'B-77 RED   — platform.create_entity_table cannot build an `entity` table: %', v_caught;
end
$b77cet_red$;

-- The fix: attach the carrier only if no trigger on that relation already runs it, BY FUNCTION.
CREATE OR REPLACE FUNCTION platform.create_entity_table(p_schema text, p_table text, p_token text, p_label text, p_fields text[], p_variant text, p_versioned boolean, p_soft_delete boolean, p_visibility text, p_category boolean, p_listed boolean, p_org_default boolean, p_gin_jsonb boolean, p_parents text[] DEFAULT NULL::text[], p_data_class platform.data_class DEFAULT NULL::platform.data_class, p_default_list_scope platform.list_scope DEFAULT NULL::platform.list_scope)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_cols text; v_f text; v_colname text; v_fails text; v_has_vis boolean;
  v_parent text; v_parent_token text; v_fk_column text;
BEGIN
  IF p_org_default THEN
    RAISE EXCEPTION 'create_entity_table: p_org_default=true is forbidden'
      USING HINT = 'Supply organization_id explicitly in every writer; migrate this caller to p_org_default => false before provisioning the table.';
  END IF;

  PERFORM set_config('matrx.provisioner', '1', true);

  IF to_regclass(format('%I.%I',p_schema,p_table)) IS NOT NULL THEN
    RAISE EXCEPTION 'create_entity_table: %.% already exists', p_schema, p_table; END IF;
  IF p_variant NOT IN ('entity','component','ledger','system','restricted') THEN
    RAISE EXCEPTION 'create_entity_table: invalid variant %', p_variant; END IF;

  IF (p_data_class IS NULL) <> (p_default_list_scope IS NULL) THEN RAISE EXCEPTION 'create_entity_table: p_data_class and p_default_list_scope must be supplied together'; END IF;
  IF p_variant='restricted' AND (p_data_class IS NULL OR p_default_list_scope IS NULL) THEN RAISE EXCEPTION 'create_entity_table: restricted variant requires explicit p_data_class and p_default_list_scope'; END IF;
  v_has_vis := (p_visibility <> 'none');
  IF v_has_vis THEN PERFORM p_visibility::platform.visibility; END IF;   -- validates the value
  IF p_variant='restricted' AND p_visibility IS DISTINCT FROM 'none' THEN RAISE EXCEPTION 'create_entity_table: restricted variant requires p_visibility => ''none'''; END IF;
  IF p_variant='system' AND NOT v_has_vis THEN
    RAISE EXCEPTION 'create_entity_table: system variant requires a visibility value (not ''none'')'; END IF;
  IF p_variant='component' AND v_has_vis THEN
    RAISE EXCEPTION 'create_entity_table: component % must not have visibility (pass p_visibility => ''none''); a component''s access is its parent''s', p_token;
  END IF;

  IF p_variant='component' AND COALESCE(array_length(p_parents,1),0) = 0 THEN
    RAISE EXCEPTION 'create_entity_table: component % requires p_parents (entries shaped ''parent_token:fk_column'')', p_token;
  END IF;
  IF p_variant<>'component' AND COALESCE(array_length(p_parents,1),0) > 0 THEN
    RAISE EXCEPTION 'create_entity_table: p_parents declares composition parents and is only valid for p_variant=''component'' (got %)', p_variant;
  END IF;

  FOREACH v_f IN ARRAY COALESCE(p_fields,'{}') LOOP
    v_colname := lower(split_part(btrim(v_f),' ',1));
    IF v_colname IN ('id','organization_id','created_by','updated_by','created_at','updated_at',
                     'deleted_at','version','metadata','visibility','category_id') THEN
      RAISE EXCEPTION 'create_entity_table: custom field "%" collides with a base column', v_colname; END IF;
  END LOOP;

  v_cols := 'id uuid PRIMARY KEY DEFAULT gen_random_uuid()';
  FOREACH v_f IN ARRAY COALESCE(p_fields,'{}') LOOP v_cols := v_cols || ', ' || v_f; END LOOP;
  v_cols := v_cols || ', organization_id uuid NOT NULL REFERENCES iam.organizations(id)';
  v_cols := v_cols || ', created_by uuid REFERENCES auth.users(id)';
  v_cols := v_cols || ', updated_by uuid REFERENCES auth.users(id)';
  v_cols := v_cols || ', created_at timestamptz NOT NULL DEFAULT now()';
  v_cols := v_cols || ', updated_at timestamptz NOT NULL DEFAULT now()';
  IF p_soft_delete THEN v_cols := v_cols || ', deleted_at timestamptz'; END IF;
  v_cols := v_cols || ', version integer NOT NULL DEFAULT 1';
  v_cols := v_cols || ', metadata jsonb NOT NULL DEFAULT ''{}''::jsonb';
  IF v_has_vis THEN
    v_cols := v_cols || format(', visibility platform.visibility NOT NULL DEFAULT %L::platform.visibility', p_visibility);
  END IF;
  IF p_category THEN v_cols := v_cols || ', category_id uuid REFERENCES platform.categories(id)'; END IF;

  EXECUTE format('CREATE TABLE %I.%I (%s)', p_schema, p_table, v_cols);

  EXECUTE format('CREATE INDEX ON %I.%I (organization_id)', p_schema, p_table);
  EXECUTE format('CREATE INDEX ON %I.%I (created_by)', p_schema, p_table);
  IF p_category THEN EXECUTE format('CREATE INDEX ON %I.%I (category_id)', p_schema, p_table); END IF;
  IF p_gin_jsonb THEN
    FOREACH v_f IN ARRAY COALESCE(p_fields,'{}') LOOP
      IF v_f ~* '\yjsonb\y' THEN
        v_colname := split_part(btrim(v_f),' ',1);
        EXECUTE format('CREATE INDEX ON %I.%I USING gin (%I)', p_schema, p_table, v_colname);
      END IF;
    END LOOP;
  END IF;

  -- 2026-09-12 (qd_000): a `private` class closes the platform-admin lane by definition
  -- (verify_canonical §3.1 derivation two), so the row is born with the lane suppressed —
  -- previously only `restricted` was, and every private ENTITY failed its own certification.
  INSERT INTO platform.entity_types(
    token,schema_name,table_name,label,is_versioned,has_soft_delete,is_component,is_listed,
    default_visibility,rls_variant,table_ref,is_active,data_class,default_list_scope,suppress_platform_admin_lane)
  VALUES (p_token,p_schema,p_table,p_label,p_versioned,p_soft_delete,(p_variant='component'),p_listed,
    CASE WHEN v_has_vis THEN p_visibility::platform.visibility ELSE NULL END,
    p_variant, format('%I.%I',p_schema,p_table)::regclass, true,p_data_class,p_default_list_scope,
    (p_variant='restricted' OR p_data_class = 'private'));

  IF COALESCE(array_length(p_parents,1),0) > 0 THEN
    FOREACH v_parent IN ARRAY p_parents LOOP
      v_parent_token := btrim(split_part(v_parent, ':', 1));
      v_fk_column    := btrim(split_part(v_parent, ':', 2));
      IF v_parent_token = '' OR v_fk_column = '' OR strpos(v_parent, ':') = 0 THEN
        RAISE EXCEPTION 'create_entity_table: p_parents entry "%" is not shaped ''parent_token:fk_column''', v_parent;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM platform.entity_types et WHERE et.token = v_parent_token) THEN
        RAISE EXCEPTION 'create_entity_table: p_parents entry "%" names unknown parent token %', v_parent, v_parent_token;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema = p_schema AND c.table_name = p_table AND c.column_name = v_fk_column
      ) THEN
        RAISE EXCEPTION 'create_entity_table: p_parents entry "%" names column % which %.% does not have',
          v_parent, v_fk_column, p_schema, p_table;
      END IF;
      INSERT INTO platform.entity_relationships(child_type,parent_type,fk_column,kind)
      VALUES (p_token, v_parent_token, v_fk_column, 'composition');
    END LOOP;
  END IF;

  EXECUTE format('CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor()', p_schema,p_table);
  -- 🚨 B-77 (2026-09-13) — THE ONE SANCTIONED BUILDER COULD NOT BUILD AN ENTITY TABLE.
  -- `platform._admit_entity_type_attaches_carrier` fires on the INSERT into platform.entity_types
  -- eleven lines above and attaches _stamp_actor_tier itself for the entity and component
  -- variants. This line then created it a SECOND time and Postgres answered 42710 — so every
  -- `entity`/`system` call to this function raised, and the only path platform._ddl_guard admits
  -- for a new canonical table was closed. Found by DD-185's forcing test, which could not build
  -- its probe. (`ledger` was unaffected, which is why nothing noticed: the admission trigger
  -- returns early for that variant.)
  -- The test is BY FUNCTION, never by name — the same lesson DD-173 paid for when a by-name drop
  -- missed platform.change_type_default carrying _touch_row() under the name _touch.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = format('%I.%I', p_schema, p_table)::regclass AND NOT t.tgisinternal
       AND t.tgfoid = 'platform._stamp_actor_tier()'::regprocedure
  ) THEN
    EXECUTE format('CREATE TRIGGER _stamp_actor_tier BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor_tier()', p_schema,p_table);
  END IF;
  EXECUTE format('CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._touch_row()', p_schema,p_table);
  IF p_versioned THEN
    EXECUTE format('CREATE TRIGGER _version_capture AFTER INSERT OR DELETE OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._version_capture(%L)', p_schema,p_table,p_token);
  END IF;

  EXECUTE format('CREATE TRIGGER _metadata_guard BEFORE INSERT OR UPDATE OF metadata ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._metadata_guard(%L)', p_schema,p_table,p_token);

  PERFORM platform.sync_association_gc_triggers(p_token);

  PERFORM iam.apply_rls(p_schema,p_table,p_token,p_variant);

  SELECT string_agg(check_name||COALESCE(': '||detail,''), '; ')
    INTO v_fails FROM iam.verify_canonical(p_schema,p_table,p_token) WHERE status='FAIL';
  IF v_fails IS NOT NULL THEN
    RAISE EXCEPTION 'create_entity_table: %.% failed canonical verify: %', p_schema,p_table,v_fails; END IF;

  PERFORM set_config('matrx.provisioner', '0', true);
  RETURN format('%s.%s created + canonical (variant=%s versioned=%s soft_delete=%s visibility=%s category=%s listed=%s parents=%s)',
                p_schema,p_table,p_variant,p_versioned,p_soft_delete,p_visibility,p_category,p_listed,
                COALESCE(array_to_string(p_parents,','),'none'));
END; $function$;

do $b77cet_green$
declare
  s text := 'zz_b77_cet_green_' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint);
  t text;
begin
  t := s || '_token';
  execute format('create schema %I', s);
  perform platform.create_entity_table(
    s, 'probe', t, 'B-77 create_entity_table GREEN probe',
    array['note text'], 'entity', false, false, 'internal', false, false, false, false,
    null::text[], 'organization'::platform.data_class, 'organization'::platform.list_scope);
  -- exactly ONE carrier trigger, and it is there
  if (select count(*) from pg_trigger tg
       where tg.tgrelid = format('%I.probe', s)::regclass and not tg.tgisinternal
         and tg.tgfoid = 'platform._stamp_actor_tier()'::regprocedure) <> 1 then
    raise exception 'B-77: after the fix the probe carries % _stamp_actor_tier trigger(s); exactly one is the contract.',
      (select count(*) from pg_trigger tg where tg.tgrelid = format('%I.probe', s)::regclass and not tg.tgisinternal and tg.tgfoid = 'platform._stamp_actor_tier()'::regprocedure);
  end if;
  raise notice 'B-77 GREEN — platform.create_entity_table builds an `entity` table again, with exactly one _stamp_actor_tier trigger.';
  delete from iam.superseded_policy where schema_name = s;
  delete from platform.entity_types where token = t;
  execute format('drop schema %I cascade', s);
end
$b77cet_green$;

-- ══════════════════════════════════════════ THE FORCING TEST, PART 1 OF 2: RED, BEFORE THE FIX
-- Against THIS live database with REAL identities, in a scratch schema created and dropped inside
-- this migration's own transaction. The RED is produced by the CODE THAT IS DEPLOYED RIGHT NOW —
-- this block runs before the CREATE OR REPLACEs below — so it is a reproduction, not an imitation
-- of one. The real functions in the shared working tree are never weakened to produce it
-- (_COMMON_BUILD §3). Every arm raises; a forcing test that prints is a wish. Any failure aborts
-- the migration, and the scratch schema goes with the transaction.
create temp table _b77_ft (k text primary key, v text) on commit drop;

do $b77red$
declare
  v_schema   text := 'zz_dd185_forcing_' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint);
  v_token    text;
  v_sysorg   constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System, global_readable, ZERO members
  v_realorg  constant uuid := 'f9cb3e35-2a65-4f2a-8525-088d6551071c';  -- arman@titaniumsuccess.com is a member
  v_member   constant uuid := '34ed4fc3-c527-4819-99bf-15c26603b261';  -- arman@titaniumsuccess.com
  v_stranger constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, in neither organization
  v_author  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com: the AUTHOR of both probe rows, so neither identity below reads by owner
  v_sysrow   uuid;
  n bigint;
begin
  v_token := v_schema || '_token';
  execute format('create schema %I', v_schema);
  -- the probe is READ by real identities below, so the scratch schema needs the same USAGE any
  -- real schema has; without it every impersonated count dies 42501 instead of measuring a lane.
  execute format('grant usage on schema %I to authenticated', v_schema);
  -- The canonical builder, not hand-rolled DDL: platform._ddl_guard refuses an entity-shaped
  -- table created any other way, and it is right to. Built `organization` first because
  -- create_entity_table certifies what it builds and a `confidential` token cannot certify until
  -- suppress_platform_admin_lane is declared — DD-137b working as intended.
  perform platform.create_entity_table(
    v_schema, 'probe', v_token, 'DD-185 forcing probe',
    array['note text'], 'entity', false, false, 'internal', false, false, false, false,
    null::text[], 'organization'::platform.data_class, 'organization'::platform.list_scope);
  update platform.entity_types
     set data_class_reason = 'DD-185 forcing test; this row and its schema are dropped before this migration commits'
   where token = v_token;
  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L, %L, ''internal'', ''system-org row'') returning id', v_schema, v_sysorg, v_author) into v_sysrow;
  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L, %L, ''internal'', ''real-org row'')', v_schema, v_realorg, v_author);

  insert into _b77_ft values ('schema', v_schema), ('token', v_token), ('sysrow', v_sysrow::text);

  -- ── the `organization`-class expression, recorded from the DEPLOYED generator ───────────────
  -- 361 live tokens (283 `organization`, 78 `public`) are generated through this same branch and
  -- none of them may move a byte. Part 2 regenerates this very probe as `organization` after the
  -- fix and compares against what is recorded here, character for character.
  insert into _b77_ft
  select 'org_class_expr', pg_get_expr(polqual, polrelid)
    from pg_policy where polrelid = format('%I.probe', v_schema)::regclass and polname = 'std_select';

  -- ── RED ────────────────────────────────────────────────────────────────────────────────────
  -- The probe becomes what hr.earning_code is: a CONFIDENTIAL entity holding a row owned by the
  -- global-readable system organization, generated by the code that is live right now.
  update platform.entity_types
     set data_class = 'confidential', suppress_platform_admin_lane = true
   where token = v_token;
  perform iam.apply_rls(v_schema, 'probe', v_token, 'entity');

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from %I.probe', v_schema) into n;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if n <> 1 then
    raise exception 'DD-185 forcing test: RED did not reproduce — test@test.com, a member of NEITHER organization, read % row(s) of the CONFIDENTIAL probe under the code deployed today, expected exactly the 1 system-org row. The test is not testing anything.', n;
  end if;
  raise notice 'DD-185 RED (policy)  — under the code deployed today test@test.com, a member of neither organization, reads the CONFIDENTIAL probe''s system-org row: % row. That is the hr.earning_code defect, reproduced on this database.', n;

  -- THE SAME ROW, ASKED OF THE KERNEL AND OF THE ID PRODUCER, so the RED covers all three doors
  -- and not only the policy text. If either of these were already closed, narrowing the mirror
  -- alone would have looked like a fix while the other door stayed open.
  if not iam.has_access_for_base(v_stranger, v_token, v_sysrow, 'viewer'::public.permission_level, true) then
    raise exception 'DD-185 forcing test: RED did not reproduce in the KERNEL — iam.has_access_for_base already refuses test@test.com the confidential system-org row, so the kernel arm this file closes is not the one that is open.';
  end if;
  raise notice 'DD-185 RED (kernel)  — iam.has_access_for_base admits test@test.com to the confidential system-org row.';

  -- AND THE OTHER DIRECTION, PINNED BEFORE THE FIX so the GREEN half is a comparison and not an
  -- assertion about a number nobody measured: a member of the REAL organization reads both rows
  -- today — their own organization's row through the class's org-member lane, and the system-org
  -- row through the arm this file removes. Neither row is theirs by ownership (admin@admin.com
  -- wrote both), which is what makes the two lanes separable at all.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from %I.probe', v_schema) into n;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if n <> 2 then
    raise exception 'DD-185 forcing test: RED baseline is not what this test assumes — arman@titaniumsuccess.com reads % row(s) of the probe, expected 2 (their organization''s row and the system-org row).', n;
  end if;
  raise notice 'DD-185 RED (member)  — a member of the real organization reads both rows (2): their own organization''s, and the system org''s.';
end
$b77red$;

-- ══════════════════════ SECTION 2 — 1. THE MIRROR, 2. THE KERNEL, 3. THE ID PRODUCER,
-- 4/5. THE DISCOVERY FAMILY. One predicate, added in the same words to each.
CREATE OR REPLACE FUNCTION iam.entity_read_expr(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
-- DD-171: containment never carries a personal row — the emitted parent-FK arm stops at internal.
declare
  v_has_org boolean;
  v_has_vis boolean;
  v_arms text[] := '{}';
  v_cands text[] := '{}';
  v_bespoke boolean := false;
  v_owner_col text;
  v_cand text;
  v_expr text;
  v_selfref text;
  v_stale boolean := false;
  -- THE PRIVACY WALL (SPEC-ACCESS §3.5, D14.1/D19). This mirror builds the
  -- `std_select` body for the entity, system AND component lanes, so it owns the
  -- ONE remaining platform-staff arm those three variants carry: the system-org
  -- global-readable lane gated on `public.is_super_admin()`. `restricted`,
  -- `ledger` and `personal` build their own std_select inside
  -- `iam._apply_rls_unchecked` and are already walled there. Omitting the arm is
  -- exactly what §3.5 directs ("omit the v_admin prefix and the is_super_admin()
  -- arm when true"), and it costs a flagged customer table nothing: the arm can
  -- only ever match a row owned by a global_readable SYSTEM org, which a
  -- customer's HR row never is.
  v_suppress_admin boolean := false;
  -- DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE ONE SOURCE. Which org lanes exist at
  -- all is a REGISTRY fact, true on every token whether or not it has a visibility column.
  -- iam.has_access_for_base reads the SAME function at runtime, so generation-time truth and
  -- runtime truth cannot drift by a single statement (db-rules §6d).
  v_lanes platform.lane_set;
  rec record;
begin
  select coalesce(et.suppress_platform_admin_lane, false) into v_suppress_admin
  from platform.entity_types et where et.token = p_token;
  v_suppress_admin := coalesce(v_suppress_admin, false);
  v_lanes := iam.class_lanes(p_token);
  -- 🚨 IS THE THING THIS MIRRORS STILL WHAT IT WAS? Between the sweep that
  -- certified 203 tables and the rollout an hour later, another lane rewrote
  -- `iam.has_access_for_base`: the `data_store`-only early lane became a general
  -- library-grant lane, "THE OPEN LIBRARY" appeared, and two curator lanes with
  -- it. Two tables' proofs flipped to `lost` and the gate refused them — the
  -- system working, but only because someone was running the gate. On a
  -- fingerprint mismatch this function DROPS THE BOUND and emits an unbounded
  -- iam.has_access call: exactly as correct as the pre-D249 policy, merely
  -- slower. Correct-and-slow is the only direction a read policy may fail in.
  v_stale := iam.entity_read_kernel_fingerprint()
             is distinct from iam.entity_read_kernel_expected();
  if v_stale then
    raise warning 'entity_read_expr: the access kernel has CHANGED since this '
      'expression was last proved against it (fingerprint % vs expected %). '
      'Emitting an UNBOUNDED iam.has_access lane for %.% — correct but slow. '
      'Re-read the kernel, update iam.entity_read_expr, re-run '
      'scripts/_verify_entity_read_equivalence.py --apply, then bump '
      'iam.entity_read_kernel_expected().',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected(),
      p_schema, p_table;
  end if;
  select exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='organization_id')
    into v_has_org;
  select exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='visibility'
                    and udt_schema='platform' and udt_name='visibility')
    into v_has_vis;

  -- ── SUFFICIENT ATTRIBUTE LANES ────────────────────────────────────────────
  -- Each is lifted from iam.has_access_for_base and each is a SUFFICIENT
  -- condition for it to return true, so a row admitted here was always visible.
  -- All read the row's own columns plus UNCORRELATED set subqueries, so every
  -- one is indexable.
  --
  -- array_append, never `||`: `text[] || <unknown literal>` resolves to
  -- array||array and tries to CAST the literal to text[] ("malformed array
  -- literal"), which is how this function failed on its first run.

  -- owner — `if v_owner = v_uid then return true`. CONDITIONAL, because a
  -- COMPONENT has no owner column at all (§6d-1: its access is its parent's),
  -- and this builder serves both variants. platform.entity_row_access_attrs
  -- falls back through created_by -> owner_id -> none, so the arm follows
  -- whichever exists and is simply absent when neither does.
  select case
           when exists (select 1 from information_schema.columns
                         where table_schema=p_schema and table_name=p_table
                           and column_name='created_by') then 'created_by'
           when exists (select 1 from information_schema.columns
                         where table_schema=p_schema and table_name=p_table
                           and column_name='owner_id') then 'owner_id'
         end
    into v_owner_col;
  if v_owner_col is not null and p_variant <> 'component' then
    v_arms := array_append(v_arms, format('%I = (select auth.uid())', v_owner_col));
  end if;

  if v_has_vis then
    -- public lane — `p_include_public and v_vis = 'public'`
    v_arms := array_append(v_arms, 'visibility = ''public''');
  end if;

  -- 🚨 THE ORG ARMS ARE ONLY VALID WHEN THE KERNEL CAN SEE AN ORG.
  -- has_access_for_base reads o_org from platform.entity_row_access_attrs, whose
  -- first four branches all need an OWNER column (created_by or owner_id)
  -- alongside organization_id. A table with organization_id and NO owner column
  -- falls through to the fifth branch, which returns o_owner=NULL AND
  -- o_org=NULL — so the kernel's org-admin and system-org lanes CANNOT fire
  -- there, and emitting them would GRANT rows the kernel denies. 13 of the 195
  -- live component tables are exactly that shape (organization_id, no owner).
  if v_has_org and v_owner_col is not null then
    -- Every org arm is guarded `organization_id is not null` so the expression
    -- is TOTAL. `x in (select …)` yields NULL, not false, when x is NULL, and
    -- while a USING clause treats NULL as deny — so this is not an access
    -- change — a policy that evaluates to NULL is the kind of thing that reads
    -- as a bug forever after. has_access_for_base guards the same lanes with
    -- `v_org is not null` for the same reason.

    -- org-admin at viewer — `is_org_admin_for(v_uid, v_org)`
    --
    -- 🚨 DD-136 (2026-09-12) — THIS ARM USED TO CARRY NO VISIBILITY GUARD while
    -- the two org arms directly below it both do, so `visibility='personal'`
    -- hid a row from a plain member and from nobody else. Measured live before
    -- the fix: a plain member read 0 of other people's personal conversations,
    -- an org admin who is NOT a platform admin read 10,817 of them plus 74,485
    -- messages, and nothing anywhere recorded that it happened. Arman,
    -- 2026-09-12: the organization reaches a person's private data only through
    -- an audited emergency door, never by an admin browsing (the door is a
    -- grant — DD-137 — and the grant lanes are already below).
    --
    -- The kernel guards the same lane with `v_vis >= 'internal' or not
    -- iam.table_has_visibility(...)`. The second half is why this is an if/else
    -- rather than one string: `platform.entity_row_access_attrs` HARD-CODES
    -- 'personal' for a table with no visibility column, so a table that never
    -- declared a visibility contract must keep the arm it has always had — it
    -- cannot hold a row marked `personal` in the first place. Mirror and kernel
    -- ask the same predicate so they cannot drift (db-rules §6d).
    if v_has_vis then
      v_arms := array_append(v_arms,
        '(organization_id is not null and visibility >= ''internal''::platform.visibility and organization_id in'
        ' (select om.organization_id from iam.organization_member om'
        ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))');
    elsif not iam.token_is_parented_component(p_token) then
      -- 🚨 DD-136b (2026-09-12) — A COMPONENT ASKS ITS PARENT, SO IT GETS NO
      -- ROLE ARM. DD-136 spared every table with no visibility column; 281 of
      -- them are components, which have no visibility column precisely BECAUSE
      -- their access is their parent's (db-rules §6d-1). Leaving the arm there
      -- meant an organization's admins kept reading every chat.message inside a
      -- `personal` conversation whose envelope DD-136 had just closed — 71,424
      -- rows for one real admin. The lane they lose here is one they never
      -- needed: the parent-cascade arm below resolves
      -- `iam.accessible_entity_ids('<parent>', 'viewer')`, so an admin who may
      -- read the parent still reads all of its components. Measured before
      -- changing anything: all 281 have a registered parent whose FK column
      -- exists, so not one is left with no lane at all.
      v_arms := array_append(v_arms,
        '(organization_id is not null and organization_id in'
        ' (select om.organization_id from iam.organization_member om'
        ' where om.user_id = (select auth.uid()) and om.role in (''owner'',''admin'')))');
    end if;

    if v_has_vis then
      -- global-readable system org at >= internal (db-rules §6e)
      v_arms := array_append(v_arms,
        '(organization_id is not null and visibility >= ''internal''::platform.visibility'
        ' and organization_id in'
        ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      -- org members at >= internal — the `iam.has_org_access_for` lane
      v_arms := array_append(v_arms,
        '(organization_id is not null and visibility >= ''internal''::platform.visibility'
        ' and organization_id in (select iam.my_orgs()))');
    end if;

    -- system org + super admin — THE LAST STAFF ARM on the entity/system/component
    -- lanes. DD-170 (2026-09-13): walled the same way as the org-admin arm above — the
    -- kernel (iam.has_access_for_base) got this wall first; mirroring it here is the other
    -- half, because the policy TEXT is what a real HTTP read runs against, not the kernel
    -- alone. v_suppress_admin still removes the arm entirely (the privacy wall).
    if not v_suppress_admin then
      if v_has_vis then
        v_arms := array_append(v_arms,
          '(organization_id is not null and visibility >= ''internal''::platform.visibility'
          ' and (select public.is_super_admin())'
          ' and organization_id in'
          ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      elsif not iam.token_is_parented_component(p_token) then
        v_arms := array_append(v_arms,
          '(organization_id is not null and (select public.is_super_admin())'
          ' and organization_id in'
          ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      end if;
    end if;
  end if;

  -- The old `data_store`-only early lane (public.user_can_read_data_store_via_grant)
  -- was GENERALISED by the kernel on 2026-08-23 into
  -- `user_can_read_via_library_grant` for EVERY token, so it needs no special
  -- case any more — the platform.entity_grants candidate above covers it. Left
  -- as a note rather than deleted silently: an earlier version of this function
  -- carried a per-row arm here, and the kernel moving underneath it is exactly
  -- what the fingerprint guard exists to catch.

  -- composition / containment parents. A child's own id appears in no id-set,
  -- so the FK is the lane.
  --
  -- 🚨 THE CHILD'S OWN VISIBILITY IS A BOUNDARY, and dropping that guard is a
  -- LEAK. has_access_for_base walks the parent with
  --     v_parent_include_public := p_include_public
  --                                and (v_vis is null or v_vis = 'public')
  -- so an `internal` child does NOT inherit access from a parent that is merely
  -- PUBLIC. Passing the default p_include_public = true instead made
  -- plan.node GAIN 24 rows and web.site GAIN 2 — rows whose own visibility is
  -- `internal` under a public parent. The prover caught it; nothing else would
  -- have.
  --
  -- The flag is per-ROW, so it is emitted as two arms rather than one. A table
  -- with NO visibility column takes the include_public = false arm alone:
  -- platform.entity_row_access_attrs returns 'personal' for such a table, and
  -- 'personal' is neither NULL nor 'public'.
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_token and er.kind in ('composition','containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    if exists (select 1 from information_schema.columns
                where table_schema=p_schema and table_name=p_table and column_name=rec.fk_column) then
      -- `%I is not null` is not decoration: has_access_for_base guards the walk
      -- with `if v_parent_id is not null`, and without it a NULL FK makes
      -- `NULL in (…)` evaluate to NULL rather than false. 10 of web.site's 45
      -- rows have a NULL brand_id, and they were the last thing standing
      -- between this expression and a total one.
      if p_variant = 'component' then
        -- 🚨 MIRROR THE DEPLOYED LANE HERE, NOT THE KERNEL, and the difference is
        -- not academic. The generated component policy calls the 2-arg
        -- `accessible_entity_ids(parent,'viewer')` — include_public => TRUE —
        -- while has_access_for_base computes
        --   v_parent_include_public := p_include_public and (v_vis is null or v_vis='public')
        -- and a component's v_vis resolves to 'personal', so the KERNEL walks
        -- with FALSE. The deployed lane is therefore MORE PERMISSIVE than the
        -- resolver it is supposed to express.
        --
        -- Measured: mirroring the kernel would have REMOVED 4,784 rows from
        -- runtime.global_execution_event and 4,734 from runtime.global_execution
        -- — live access, for children of public parents. D254 is a PERFORMANCE
        -- defect; re-scoping who can read what inside a performance fix is not
        -- this migration's business and would be indistinguishable, in the
        -- change log, from a bug. The disagreement is filed as its own finding.
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
          rec.fk_column, rec.parent_type));
      elsif v_has_vis then
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and (visibility is null or visibility = ''public'') and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
          rec.fk_column, rec.parent_type));
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and visibility >= ''internal''::platform.visibility and visibility <> ''public'' and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      else
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      end if;
    end if;
  end loop;

  -- ── CANDIDATE SETS — every remaining lane, all of them id-PRODUCING ────────

  -- SECURITY DEFINER candidate superset. The raw candidates below remain for
  -- their cheap indexed paths, but protected reachability/entity-grant rows
  -- are intentionally invisible to ordinary users. accessible_entity_ids
  -- reads them inside the canonical boundary and this policy still confirms
  -- every returned id through iam.has_access() below.
  -- D266 (2026-09-12): NEVER on a component. §6d — "Component SELECT resolves
  -- its composition PARENT IDs and filters on the child FKs — never call
  -- accessible_entity_ids on the child token" (the 12.9M-UUID
  -- seo.search_performance_daily class, 2026-08-13). A component's candidate
  -- set is exactly what was proven on 2026-08-26.
  if p_variant <> 'component' then
    v_cands := array_append(v_cands, format(
      'select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level, 0, true))',
      p_token));
  end if;

  -- explicit grants (public.has_permission_for)
  v_cands := array_append(v_cands, format(
    'select p.resource_id from iam.permissions p where p.resource_type = %L'
    ' and (p.granted_to_user_id = (select auth.uid())'
    ' or p.granted_to_organization_id in (select iam.my_orgs()))'
    ' and p.status <> ''rejected'' and (p.expires_at is null or p.expires_at > now())', p_token));

  -- container membership + membership_grant
  v_cands := array_append(v_cands, format(
    'select m.container_id from iam.memberships m where m.container_type = %L'
    ' and m.user_id = (select auth.uid()) and m.deleted_at is null', p_token));

  -- association conveyance (platform.reachability). One has_access call per
  -- CONTAINER, not per row; the whole table is 4,501 rows across every type.
  v_cands := array_append(v_cands, format(
    'select r.item_id from platform.reachability r where r.item_type = %L'
    ' and r.max_level >= ''viewer''::public.permission_level'
    ' and iam.has_access(r.container_type, r.container_id, ''viewer'')', p_token));

  -- education assignment (public._edu_can_read_via_assignment), both arms
  v_cands := array_append(v_cands, format(
    'select a.source_id from platform.associations_live a where a.source_type = %L'
    ' and a.target_type = ''scope'' and a.role = ''assignment''', p_token));
  if p_token = 'fc_card' then
    v_cands := array_append(v_cands,
      'select link.source_id from platform.associations_live link'
      ' where link.source_type = ''fc_card'' and link.target_type = ''fc_set'''
      ' and link.role = ''member''');
  end if;

  -- ── THE LIBRARY LANES (kernel, 2026-08-23) — apply to EVERY token ─────────
  -- has_access_for_base now opens with TWO token-agnostic viewer lanes:
  --   public.user_can_read_via_library_grant(uid, type, id)
  --   public.library_is_open(type, id)            -- "THE OPEN LIBRARY"
  -- Both read `platform.entity_grants` keyed on (entity_type, entity_id), so a
  -- single id-set is a superset of both — the audience/industry/membership
  -- filtering inside them only ever NARROWS it, and a candidate set is allowed
  -- to be wide. Missing this is what made platform.rulebook lose 10 rows and
  -- rag.data_stores lose 5 on the rollout's own proof.
  v_cands := array_append(v_cands, format(
    'select g.entity_id from platform.entity_grants g where g.entity_type = %L', p_token));

  -- ── THE CURATOR LANES ─────────────────────────────────────────────────────
  -- 🚨 A CANDIDATE SET MAY NEVER READ THE POLICY'S OWN TABLE. These two lanes
  -- used to be emitted as `select rb.id from platform.rulebook rb join
  -- iam.industry_curators ...`, i.e. a SELECT policy on platform.rulebook whose
  -- USING clause selects from platform.rulebook. Postgres answers that with
  -- `42P17 infinite recursion detected in policy for relation "rulebook"` and
  -- the table becomes unreadable for every non-superuser role — measured live
  -- 2026-09-12, every signed-in GET 500 from 11:10:40Z, the moment DD-136's
  -- step 7 first regenerated the table through this generator.
  --
  -- The kernel's own curator lane is a SECURITY DEFINER door:
  --     if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
  --       if p_required = 'viewer' then return true; end if; ...
  --     if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id)
  --       then return true; end if;
  -- so the arm below is that same viewer lane, evaluated the same way, outside
  -- RLS and therefore outside the recursion. It is a SUFFICIENT arm rather than
  -- a candidate set because a boolean door cannot produce an id set, and it
  -- needs no `iam.has_access` confirmation: the kernel grants exactly this.
  if p_token = 'rulebook' then
    v_arms := array_append(v_arms,
      'public.is_rulebook_curator((select auth.uid()), id)');
  end if;
  if p_token = 'seo_starter_pack' then
    v_arms := array_append(v_arms,
      'public.is_pack_curator((select auth.uid()), id)');
  end if;

  -- ── 🚨 BESPOKE RESOLVERS — the ladder is not always has_access_for_base ────
  -- `iam.has_access` -> `iam.has_access_for`, which DISPATCHES BY TOKEN:
  --     when p_type = 'file' then files.has_access_for(...)
  --     else iam.has_access_for_base(...)
  -- A token routed away from the base kernel has lanes this expression knows
  -- nothing about, so bounding its has_access call by base's candidate sets
  -- would DENY rows. That is not hypothetical: it cost `files.files` 7 rows in
  -- the 4,000-row proof, invisible at 60 rows, because a crawl artifact
  -- resolves through `files.crawl_site_conveys` and through nothing in base.
  --
  -- So the dispatch list is read from the live function body and any token this
  -- function does not explicitly understand keeps an UNBOUNDED has_access arm:
  -- slower, and exactly as correct as today. A new bespoke resolver added later
  -- degrades safely instead of silently denying rows.
  select coalesce(bool_or(true), false) into v_bespoke
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'iam' and p.proname = 'has_access_for'
    and p.prosrc ~ ('p_type\s*=\s*''' || p_token || '''');

  if v_bespoke and p_token <> 'file' then
    v_cands := '{}';   -- unknown bespoke resolver: refuse to bound it
  elsif p_token = 'file' then
    -- files.has_access_for = has_access_for_base OR
    --   (files.is_crawl_artifact(f) AND files.crawl_site_conveys(user, f)) at viewer.
    --
    -- ALL THREE branches of crawl_site_conveys become SUFFICIENT ARMS, because a
    -- candidate set here is not small: the file ids reachable through snapshots
    -- and screenshots are 6,971 + 5,945 + 8,655 ids, so bounding the definer
    -- call by them still meant ~22,000 per-row calls and files.files still timed
    -- out. Each branch is org-scoped AND pins the file, so each is a
    -- row-constructor IN against an UNCORRELATED set — evaluated once per query.
    --
    -- The parent-token sets come from `iam.accessible_entity_ids`, NOT from
    -- has_access per row, and the difference is not marginal (measured live as a
    -- real non-admin):
    --     has_access over all 7,014 web.snapshot rows      34.3s
    --     accessible_entity_ids('web_snapshot')             0.26s -> 1 id
    --     has_access over all 8,655 web.screenshot rows    70.9s
    --     accessible_entity_ids('web_screenshot')           0.31s -> 0 ids
    -- Same function family the kernel resolves through, asked set-wise.
    --
    -- `include_public => true` matches the kernel: crawl_site_conveys calls
    -- `iam.has_access_for(...)`, whose 4-arg base wrapper defaults it to true.

    -- Branch 1 — metadata-only site artifact. `ws.id::text` rather than casting
    -- the metadata value: the kernel guards that cast with a uuid regex because
    -- the field is free-form jsonb, and a policy that can raise
    -- `invalid input syntax for type uuid` is a table nobody can read at all.
    -- The metadata predicate also makes `is_crawl_artifact` true, so the arm
    -- implies BOTH halves of the kernel's crawl branch and cannot over-grant.
    v_arms := array_append(v_arms,
      '(metadata @> ''{"system_artifact": true, "artifact_domain": "web_crawl"}''::jsonb'
      ' and (organization_id, metadata->>''web_site_id'') in'
      ' (select ws.organization_id, ws.id::text from web.site ws'
      '   where ws.deleted_at is null'
      '     and ws.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_site'', ''viewer''::public.permission_level, 0, true)))))');

    -- Branch 2 — snapshot body / markdown. The snapshot reference is itself what
    -- makes is_crawl_artifact true, so no metadata predicate is needed here.
    v_arms := array_append(v_arms,
      '((organization_id, id) in'
      ' (select s.organization_id, s.body_file_id from web.snapshot s'
      '   where s.deleted_at is null and s.body_file_id is not null'
      '     and s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true)))))');
    v_arms := array_append(v_arms,
      '((organization_id, id) in'
      ' (select s.organization_id, s.markdown_file_id from web.snapshot s'
      '   where s.deleted_at is null and s.markdown_file_id is not null'
      '     and s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true)))))');

    -- Branch 3 — screenshot image.
    v_arms := array_append(v_arms,
      '((organization_id, id) in'
      ' (select s.organization_id, s.file_id from web.screenshot s'
      '   where s.deleted_at is null and s.file_id is not null'
      '     and s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_screenshot'', ''viewer''::public.permission_level, 0, true)))))');
  end if;

  -- ── the bounded definer call ──────────────────────────────────────────────
  -- Everything the attribute lanes do not decide is decided exactly as before,
  -- by the same function — but only ever ASKED about ids a non-attribute lane
  -- could admit. A row outside both cannot be visible by any lane.
  if v_stale then
    v_cands := '{}';   -- stale mirror: never bound the definer call
  end if;

  -- 🚨 NO CANDIDATE SET MAY READ THE POLICY'S OWN TABLE (2026-09-12).
  -- A SELECT policy whose USING clause selects from its own relation raises
  -- `42P17 infinite recursion detected in policy for relation "..."` and the
  -- table becomes unreadable for every non-superuser role — not slow, not
  -- subtly wrong: 500 on every read. The industry-curator lane was exactly that
  -- for 14 days and went live the moment DD-136 regenerated the table.
  -- `iam.memberships` carries the same latent shape through the membership
  -- candidate (`select m.container_id from iam.memberships m ...`, token
  -- `membership`), so this is a CLASS, not two tokens.
  --
  -- The safe direction is the one this function already takes for a stale
  -- kernel fingerprint and for an unknown bespoke resolver: DROP THE BOUND and
  -- emit the unbounded `iam.has_access` lane. Correct, slower, and it can never
  -- deny a row — the opposite of silently omitting the offending lane, which
  -- WOULD deny rows. It screams so the lane gets a SECURITY DEFINER door of its
  -- own (see the curator lanes above) rather than living on as a slow path.
  v_selfref := '(from|join)[[:space:]]*\(?[[:space:]]*(' || p_schema || '\.)?'
               || p_table || '([^a-z0-9_]|$)';
  if cardinality(v_cands) > 0 then
    foreach v_cand in array v_cands loop
      if v_cand ~* v_selfref then
        raise warning 'entity_read_expr: a candidate lane for %.% READS THAT TABLE '
          'ITSELF (the 42P17 class). Dropping the bound and emitting an unbounded '
          'iam.has_access lane for %.% — correct but slow. Give the lane a SECURITY '
          'DEFINER door instead. Lane: %', p_schema, p_table, p_schema, p_table, v_cand;
        v_cands := '{}';
        exit;
      end if;
    end loop;
  end if;

  if cardinality(v_cands) = 0 then
    v_arms := array_append(v_arms, format('iam.has_access(%L, id, ''viewer'')', p_token));
  else
    v_arms := array_append(v_arms, format(
      '(id in (%s) and iam.has_access(%L, id, ''viewer''))',
      array_to_string(v_cands, ' union '), p_token));
  end if;

  -- ══ DD-137b — THE CLASS DECIDES WHICH LANES EXIST AT ALL (§3.1, F-5) ═══════════════
  -- DD-136 decided how WIDE the organization lanes are on the tables that HAVE a visibility
  -- column. On the 371 active tokens that do not, its guard could not be written at all, so
  -- the org-role arm was emitted unguarded and an organization admin read every member''s
  -- rows there (66 users.user_feedback rows and 96 transcripts.studio_runs for one real
  -- admin, measured 2026-09-12). The class answers that question the same way on all 672
  -- tokens, column or no column: a `private` or `confidential` token emits NO
  -- organization-role arm, a `private` token emits no organization-member arm either, and
  -- both close the platform-staff arm — our own staff go through the door too.
  --
  -- coalesce(..., true) is the component/ledger case spelled out: those tokens have NO class
  -- of their own (db-rules §6d-1) and keep exactly the behaviour they have always had; the
  -- parent they resolve through is gated on ITS class.
  -- 🚨 THE ORG-ARM PREFIX IS THE ANCHOR, AND IT IS LOAD-BEARING (DD-137b3a). Every
  -- organization arm this function builds opens with `(organization_id is not null and` —
  -- the generator''s own totality guard, on all four of them. Matching a lane''s INNER text
  -- alone is not enough: `iam.my_orgs()` also lives inside the bounded candidate arm, in the
  -- explicit-grant candidate, so a bare match deleted the whole sharing lane from every
  -- `private` token. The class is a FLOOR (§3.6) — ordinary sharing opens above it per item
  -- and per person, and cancelling that is over-tightening, which db-rules §6 treats as the
  -- same size of bug as a stranger let in.
  if not v_lanes.org_role_lane then
    if not exists (select 1 from unnest(v_arms) a where a like '(organization_id is not null and%'
                    and a like '%om.role in (''owner'',''admin'')%') and v_has_org and v_owner_col is not null and p_variant <> 'component' then
      raise exception 'iam.entity_read_expr: %.% (token %) is class %, which emits no '
        'organization-role arm — but no arm carrying that lane was found to remove. The arm '
        'shapes have moved and this filter is now silently keeping a lane it was written to '
        'cut.', p_schema, p_table, p_token, v_lanes.resolved_class;
    end if;
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and a like '%om.role in (''owner'',''admin'')%'));
  end if;
  -- 🚨 DD-185 (2026-09-13) — THE §6e SYSTEM-ORGANIZATION ARM IS AN EVERY-SIGNED-IN-USER ARM,
  -- SO IT BELONGS TO THE TWO CLASSES WHOSE LANE SET IS WIDER THAN ONE ORGANIZATION.
  -- `org_member_lane` was doing double duty: it is TRUE for `confidential`, so the filter below
  -- kept the global-readable arm on every confidential token — and that arm asks nothing about
  -- membership at all. Measured on this database (B-65, rolled-back rehearsal): a NON-MEMBER read
  -- 8 rows of a confidential `audit_exemption` and 4 of `admin_markdown_sample` through it, and
  -- live today hr.earning_code (24 rows) and hr.auto_close_rule (2) sit behind it.
  -- This is DD-174's ledger-branch rule, character for character: the system-org arm exists only
  -- for `organization` and `public`. `private` loses it here too and then loses the member arm
  -- below; the two filters are independent because the lanes are.
  if not (v_lanes.resolved_class in ('organization','public')) then
    if v_lanes.org_member_lane and v_has_org and v_has_vis and v_owner_col is not null
       and p_variant <> 'component'
       and not exists (select 1 from unnest(v_arms) a
                        where a like '(organization_id is not null and%'
                          and a like '%so.global_readable%'
                          and a not like '%is_super_admin%') then
      raise exception 'iam.entity_read_expr: %.% (token %) is class %, which emits no '
        'global-readable system-organization read arm — but no arm carrying that lane was found '
        'to remove. The arm shapes have moved and this filter is now silently keeping a lane it '
        'was written to cut.', p_schema, p_table, p_token, v_lanes.resolved_class;
    end if;
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and a like '%so.global_readable%'
                                and a not like '%is_super_admin%'));
  end if;
  if not v_lanes.org_member_lane then
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and (a like '%iam.my_orgs()%' or a like '%so.global_readable%')
                                and a not like '%is_super_admin%'));
  end if;
  if not v_lanes.platform_admin_lane then
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%' and a like '%is_super_admin%'));
  end if;
  -- The OWNER arm is never filtered. Over-tightening is a defect too: db-rules §6 — "a
  -- legitimate user blocked from their own data is as serious a bug as a stranger let in".
  if p_variant <> 'component' and v_owner_col is not null
     and not (format('%I = (select auth.uid())', v_owner_col) = any(v_arms)) then
    raise exception 'iam.entity_read_expr: the class filter removed the OWNER arm from %.% '
      '(token %). No class has ever excluded the owner and none may.', p_schema, p_table, p_token;
  end if;

  v_expr := array_to_string(v_arms, ' or ');

  -- 🚨 THE LAST WALL. The candidate filter above degrades safely, so anything
  -- still reading the table here is an ARM — hand-written, with no safe
  -- degradation available and no way to bound it. That is a coding error in
  -- this function, and a coding error that ships makes the table unreadable
  -- (42P17) for everyone. It dies here, at generation time, naming the table,
  -- instead of at 11:10 on a Saturday in every user's browser.
  -- Repo guard: pnpm check:rls-self-reference.
  if v_expr ~* v_selfref then
    raise exception
      'iam.entity_read_expr: an ARM built for %.% (token %, variant %) reads '
      '%.% ITSELF — a policy that selects from its own relation raises 42P17 '
      'and makes the table unreadable. Route the lane through a SECURITY '
      'DEFINER door (see the curator lanes) instead of a join on the entity.',
      p_schema, p_table, p_token, p_variant, p_schema, p_table;
  end if;

  return v_expr;
end;
$function$;


CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 10000
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_id uuid; v_parent_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;
  -- 🚨 DD-171 (2026-09-12) — CONTAINMENT NEVER CARRIES A PERSONAL ROW.
  -- True when this row may be reached THROUGH a container at all. See the header: the
  -- table_has_visibility half keeps every COMPONENT inheriting from its parent, because
  -- entity_row_access_attrs hard-codes o_vis := 'personal' for a table with no
  -- visibility column and a component has none BY CONTRACT (db-rules §6d-1).
  v_containment_carries boolean;
  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE SAME SOURCE THE MIRROR READS.
  -- iam.entity_read_expr decides which arms to EMIT from this function; this function
  -- decides the same lanes at runtime. One answer, one place. An unset or unregistered token
  -- resolves to `private` here rather than raising: the kernel cannot refuse, because
  -- refusing at runtime is denying a person their own data — so it fails toward privacy
  -- while iam.apply_rls refuses outright (chair R3, both directions).
  v_lanes platform.lane_set;
begin
  if v_uid is null then return false; end if;
  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et where et.token = p_type and et.is_active;
  if v_schema is null then return false; end if;
  v_lanes := iam.class_lanes(p_type);

  if p_required = 'viewer'::public.permission_level
     and public.user_can_read_via_library_grant(v_uid, p_type, p_id)
  then return true; end if;
  -- THE OPEN LIBRARY (2026-08-23): a resource GIVEN to an industry or to
  -- everyone is readable by anyone signed in. The opt-in decides what you are
  -- SHOWN by default, never what you are ALLOWED to see. Organization-audience
  -- grants (pilots, subscriptions) are excluded and stay targeted.
  if p_required = 'viewer'::public.permission_level
     and public.library_is_open(p_type, p_id)
  then return true; end if;
  if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id) then return true; end if;
  if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
    if p_required = 'viewer'::public.permission_level then return true; end if;
    if exists (select 1 from platform.rulebook rb
                where rb.id = p_id and rb.status = 'draft' and rb.deleted_at is null)
    then return true; end if;
  end if;

  v_attrs := platform.entity_row_access_attrs(v_schema, v_table, p_id);
  v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner; v_org := v_attrs.o_org; v_found := v_attrs.o_found;
  if not coalesce(v_found, false) then return false; end if;
  v_containment_carries := (v_vis is null
                            or v_vis >= 'internal'::platform.visibility
                            or not iam.table_has_visibility(v_schema, v_table));
  if v_owner = v_uid then return true; end if;
  -- 🚨 DD-136 (2026-09-12) — THE ORG-ADMIN LANE HONOURS `personal` VISIBILITY.
  -- This lane used to `return true` for any org owner/admin at viewer, with no
  -- visibility condition, while the two org lanes below are both guarded
  -- `v_vis >= 'internal'`. That single asymmetry meant `visibility='personal'`
  -- hid a row from a plain member and from nobody else: measured live, a plain
  -- member read 0 of other people's personal conversations and an org admin who
  -- is not a platform admin read 10,817 of them plus 74,485 messages, with no
  -- audit anywhere. Arman, 2026-09-12: the organization reaches a person's
  -- private data only through an audited emergency door, never by an admin
  -- browsing. The door is a GRANT (DD-137 generalises `public.hr_break_glass`),
  -- and a grant is already a first-class lane below — so the door needs no arm
  -- of its own and this guard leaves no bypass.
  --
  -- The `table_has_visibility` half is not a loophole: entity_row_access_attrs
  -- HARD-CODES o_vis := 'personal' for a table with no visibility column, so a
  -- bare `v_vis >= 'internal'` would strip this lane from 305 org-scoped tables
  -- that never declared a visibility contract and cannot hold a `personal` row
  -- at all. iam.entity_read_expr asks the SAME predicate, so the mirror and the
  -- kernel cannot drift on it (db-rules §6d).
  if p_required = 'viewer'::public.permission_level and v_org is not null then
    if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
    -- 🚨 DD-136b (2026-09-12) — AND A COMPONENT ASKS ITS PARENT.
    -- `not iam.table_has_visibility(...)` alone was too generous: 281 of the
    -- 305 tables it spared are COMPONENTS, and a component has no visibility
    -- column precisely BECAUSE its access is its parent's (db-rules §6d-1), not
    -- because it holds nothing private. It left every chat.message inside a
    -- `personal` conversation readable by the organization's admins after
    -- DD-136 had closed the conversation itself — 71,424 of them for one real
    -- admin. A component with a registered parent needs no role arm: its
    -- generated lane resolves the parent's accessible ids, so an admin who may
    -- read the parent still reads all of it, and an admin who may not, does not.
    -- DD-137b: and the CLASS decides whether this lane exists at all. coalesce(...,true)
    -- keeps a component/ledger token (NULL lanes — its access IS its parent's) exactly as
    -- it is; the parent it walks to is gated on its own class.
    if v_lanes.org_role_lane
       and v_is_org_admin
       and (v_vis >= 'internal'::platform.visibility
            or (not iam.table_has_visibility(v_schema, v_table)
                and not iam.token_is_parented_component(p_type)))
    then return true; end if;
  end if;
  if p_include_public and v_vis = 'public'::platform.visibility and p_required = 'viewer'::public.permission_level then return true; end if;
  -- 🚨 DD-185 (2026-09-13) — AND THE CLASS DECIDES WHETHER THIS ARM EXISTS AT ALL.
  -- This is the §6e global-readable system-organization lane, and it admits EVERY SIGNED-IN
  -- ACCOUNT — it asks about no membership, no role and no grant. Until this line it was
  -- unconditional, so a `confidential` row owned by the global-readable system org was readable
  -- by every signed-in user including a non-member (measured 0 -> 8, B-65). DD-174 fixed exactly
  -- this in the ledger branch; this is the same rule, in the resolver every other variant asks.
  -- The mirror (iam.entity_read_expr) drops the same arm in the same breath — the policy TEXT is
  -- what a real HTTP read runs against, the kernel is what the bounded has_access arm asks, and
  -- closing one without the other closes nothing (DD-170's lesson, the other way round).
  if p_include_public and p_required = 'viewer'::public.permission_level
     and v_lanes.resolved_class in ('organization','public')
     and v_vis >= 'internal'::platform.visibility and v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
  -- DD-137b: our own staff go through the door too on the two private classes (§3.1
  -- derivation two). This is the runtime half of suppress_platform_admin_lane.
  -- DD-170 (2026-09-13): THE SAME WALL DD-165 GAVE THE OTHER STAFF ARMS, applied here too.
  -- This arm used to admit a super admin to ANY row owned by a global_readable system org
  -- with no visibility guard at all — the one staff arm DD-165 named but did not close
  -- (measured: 8 personal rows, browser.site_policy 4, mandate.binding 2, education.learn_doc 1,
  -- agent.definition 1). Same predicate as the org-admin arm above: a table with a real
  -- visibility column is walled at >= internal; a table with none at all (and not a parented
  -- component, which has no visibility concept of its own) keeps the arm it always had.
  if v_lanes.platform_admin_lane
     and v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
     and (v_vis >= 'internal'::platform.visibility
          or (not iam.table_has_visibility(v_schema, v_table) and not iam.token_is_parented_component(p_type)))
     and public.is_super_admin_for(v_uid) then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id and m.user_id = v_uid
      and m.deleted_at is null and g.confers >= p_required) then return true; end if;
  if p_required = 'viewer'::public.permission_level and public._edu_can_read_via_assignment(v_uid, p_type, p_id) then return true; end if;
  for rec in
    select r.container_type, r.container_id from platform.reachability r
    where r.item_type = p_type and r.item_id = p_id and r.max_level >= p_required
      and v_containment_carries
  loop
    if (rec.container_type, rec.container_id) is distinct from (p_type, p_id)
       and iam.has_access_for_base(v_uid, rec.container_type, rec.container_id, p_required,
             p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility))
    then return true; end if;
  end loop;
  -- DD-137b: the late org lanes, each answering to the class that owns it. The
  -- `visibility >= internal` guard is DD-136's and is unchanged — the class says whether
  -- the lane exists, the row's own value says how far it reaches.
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if v_lanes.org_role_lane then
      if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
      if v_is_org_admin then return true; end if;
    end if;
    if v_lanes.org_member_lane
       and p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  v_parent_include_public := p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility);
  for rec in
    select er.parent_type, er.fk_column from platform.entity_relationships er
    where er.child_type = p_type and er.kind in ('composition', 'containment')
      and v_containment_carries
    order by er.kind, er.parent_type, er.fk_column
  loop
    execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table) into v_parent_id using p_id;
    if v_parent_id is not null
       and iam.has_access_for_base(v_uid, rec.parent_type, v_parent_id, p_required, v_parent_include_public)
    then return true; end if;
  end loop;
  return false;
end; $function$;


CREATE OR REPLACE FUNCTION iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- DD-171: containment never carries a personal row (see iam._dd171_containment_filter).

declare
  v_uid uuid := auth.uid();
  v_schema text; v_table text; v_tbl text; v_owner_col text;
  v_has_org boolean; v_has_vis boolean;
  v_parent_ids uuid[]; v_nonpublic_parent_ids uuid[]; v_more uuid[];
  v_trusted text; v_sql text;
  v_ids uuid[] := '{}';
  -- 🚨 DD-175 (2026-09-12) — THE SET FORM ASKS THE SAME QUESTION THE KERNEL ASKS.
  -- iam.has_access_for_base and iam.entity_read_expr both gate the organization and
  -- platform-staff lanes on iam.class_lanes (DD-137b). This function never learned that,
  -- so it returned ids the parent's own policy refuses. On the parent's own std_select that
  -- is harmless — the set is only a CANDIDATE there and iam.has_access confirms every id —
  -- but a generated COMPONENT lane takes this set as FINAL with nothing behind it, so the
  -- component read rows its parent refuses. Measured live, 2026-09-12, before this change:
  -- arman@titaniumsuccess.com read 2,313 docproc.processed_document_pages whose parent
  -- processed_document its own policy refuses; admin@admin.com 106 udt_document_snapshots
  -- and 87 udt_workbook_snapshots; users.credential_attachments leaked all 3 of its rows
  -- under a refused credential_item; workbench.udt_structured_list_items all 15 of its.
  v_lanes platform.lane_set;
  -- 🚨 DD-175e (2026-09-13) — THE `restricted` VARIANT HIDES ITS SOFT-DELETED ROWS AND THIS
  -- FUNCTION DID NOT. iam._apply_rls_unchecked's restricted branch emits std_select with its
  -- own `deleted_at is null and …` prefix (v_delpfx). The set form had no soft-delete arm, so
  -- a component under a restricted parent read rows whose parent the parent's own policy
  -- hides: measured live, admin@admin.com read 101 chat.coding_session_entry rows under one
  -- soft-deleted chat.coding_session. Scoped to `restricted` ON PURPOSE — every other variant
  -- keeps archived rows readable (the archived-items law), and cutting them out here would
  -- empty every archive view on the platform.
  v_soft_deleted_hidden boolean;
  rec record;
begin
  if v_uid is null or p_depth > 12 then return '{}'::uuid[]; end if;

  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then return '{}'::uuid[]; end if;
  v_tbl := format('%I.%I', v_schema, v_table);
  v_lanes := iam.class_lanes(p_type);
  select coalesce(et.rls_variant = 'restricted', false)
         and exists (select 1 from information_schema.columns c
                      where c.table_schema = v_schema and c.table_name = v_table
                        and c.column_name = 'deleted_at')
    into v_soft_deleted_hidden
    from platform.entity_types et where et.token = p_type and et.is_active;
  v_soft_deleted_hidden := coalesce(v_soft_deleted_hidden, false);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name
    when 'created_by' then 1 when 'owner_id' then 2 else 3 end
  limit 1;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'visibility'
      and c.udt_schema = 'platform' and c.udt_name = 'visibility'
  ) into v_has_vis;

  v_trusted := case
    when v_owner_col is not null then format('t.%I = $1', v_owner_col)
    else 'false' end;
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level and v_lanes.org_member_lane then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om where om.user_id = $1))';
    elsif p_required > 'editor'::public.permission_level and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;
  end if;
  if v_has_org and v_lanes.platform_admin_lane and public.is_super_admin_for(v_uid) then
    v_trusted := v_trusted
      || ' or t.organization_id in (select so.organization_id '
      || 'from iam.system_orgs so where so.global_readable)';
  end if;
  if p_required = 'viewer'::public.permission_level then
    if p_include_public and v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      -- 🚨 DD-185 (2026-09-13) — THE SECOND COPY OF THE §6e ARM, and the one the generated
      -- policy's bounded `iam.has_access` lane is asked about. Gated on the same two classes as
      -- the kernel and the mirror: an every-signed-in-user arm is not a lane a `confidential` or
      -- `private` token has. Server-side lists call this function directly, so leaving it here
      -- would have been a safe path beside an unsafe one.
      if v_has_org and v_lanes.resolved_class in ('organization','public') then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select so.organization_id from iam.system_orgs so where so.global_readable))';
      end if;
    end if;
    -- 🚨 DD-136b (2026-09-12) — THE THIRD COPY OF THE ORG-ADMIN LANE.
    -- Unguarded, it handed an organization's admins every id in the
    -- organization at viewer, including `personal` rows, and a component's
    -- generated read lane takes this set as final with no has_access behind it.
    -- Guarded to match iam.has_access_for_base and iam.entity_read_expr; a
    -- parented component still gets nothing by role here, because its access is
    -- its parent's (db-rules §6d-1).
    if v_has_org and v_has_vis and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    elsif v_has_org and v_lanes.org_role_lane and not iam.token_is_parented_component(p_type) then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id '
        || 'from iam.organization_member om where om.user_id = $1 '
        || 'and om.role in (''owner'', ''admin''))';
    end if;
  end if;

  v_sql := format(
    'select coalesce(array_agg(t.id), ''{}'') from %s t where %s',
    v_tbl, v_trusted
  );
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  -- Candidate lanes. THE ANTIJOIN IS HASHED, NEVER `= any(<param array>)`:
  -- a param array is not a Const, so PostgreSQL cannot use a hashed
  -- ScalarArrayOpExpr and falls back to a linear scan of the array PER ROW.
  -- Against v_ids of 32,697 that is what made this function quadratic.
  for rec in
    with have as materialized (select iam.unnest_uuids(v_ids) as id)
    select distinct c.id
    from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (
          p.granted_to_user_id = v_uid
          or p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om where om.user_id = v_uid
          )
        )
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type and m.user_id = v_uid and m.deleted_at is null
      union
      select r.item_id
      from platform.reachability r
      where r.item_type = p_type and r.max_level >= p_required
      union
      select a.source_id
      from platform.associations_live a
      where a.source_type = p_type and a.role = 'assignment'
        and a.target_type = 'scope'
      -- D261 (2026-08-23): THE LIBRARY LANES. iam.has_access_for_base opens with
      -- two token-agnostic viewer lanes — public.user_can_read_via_library_grant
      -- and public.library_is_open ("THE OPEN LIBRARY") — that both read
      -- platform.entity_grants. This function never learned them, so a row
      -- readable ONLY through a library grant was never even a CANDIDATE, and
      -- the set form disagreed with the per-row form for the same (type, id).
      -- Measured before this change: 15 disagreements across the three tokens
      -- that have entity_grants rows (rag.data_stores 6, platform.rulebook 6,
      -- seo.starter_pack 3).
      --
      -- This can only ever ADD ids, and only ids the loop below then confirms
      -- with has_access_for_base — the authority. A wider candidate SET cannot
      -- grant anything the per-row resolver denies; it can only stop the two
      -- forms from disagreeing. That asymmetry is what makes this landable on
      -- machinery every component parent arm depends on.
      union
      select g.entity_id
      from platform.entity_grants g
      where g.entity_type = p_type
      -- ...and the two curator lanes, for the same reason: has_access_for_base
      -- grants a curator every row in their industry, and none of those ids
      -- appear in permissions, memberships, reachability or assignments.
      union
      select rb.id
      from platform.rulebook rb
      join iam.industry_curators ic on ic.industry_id = rb.industry_id
      where p_type = 'rulebook' and ic.user_id = v_uid and ic.deleted_at is null
        and rb.deleted_at is null
      union
      select sp.id
      from seo.starter_pack sp
      join iam.industry_curators ic on ic.industry_id = sp.industry_id
      where p_type = 'seo_starter_pack' and ic.user_id = v_uid and ic.deleted_at is null
    ) c
    where not exists (select 1 from have h where h.id = c.id)
  loop
    if iam.has_access_for_base(v_uid, p_type, rec.id, p_required, p_include_public)
    then v_ids := v_ids || rec.id; end if;
  end loop;

  -- Parent cascade. SELF-CONTAINMENT EDGES ARE A TRANSITIVE CLOSURE, NOT A
  -- RECURSION: `folder -> folder` made a depth-0 call fan out to ~91
  -- invocations (12 levels, doubled at every level by the include_public /
  -- non-public pair), each one re-deriving the SAME base set over the whole
  -- table. Ordered so self edges run LAST, over the fully accumulated v_ids.
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_type
      and er.kind in ('composition', 'containment')
    order by (er.parent_type = p_type), er.kind, er.parent_type, er.fk_column
  loop
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = v_schema and c.table_name = v_table
        and c.column_name = rec.fk_column
    ) then
      if rec.parent_type = p_type then
        -- P = closure_public(S_T u N) where N is the non-public closure.
        -- Proof that this equals the old recursion's fixpoint: N is closed
        -- under ALL children (its own branch takes the else arm), so every
        -- non-public row the old code admitted via `parent in N` is already
        -- IN N; only the public arm still needs iterating. N costs exactly one
        -- nested call, and that call takes this same branch with
        -- p_include_public = false, so it does not fan out either.
        if p_include_public and v_has_vis then
          v_ids := v_ids || iam.accessible_entity_ids(
            p_type, p_required, p_depth + 1, false);
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from %s t join clo c on t.%I = c.id'
            || '  where t.visibility = ''public'''
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column);
        else
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from %s t join clo c on t.%I = c.id%s'
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, 't', ' where '));
        end if;
        execute v_sql into v_more using v_ids;
        v_ids := coalesce(v_more, '{}'::uuid[]);
      else
        v_parent_ids := iam.accessible_entity_ids(
          rec.parent_type, p_required, p_depth + 1, p_include_public
        );
        if p_include_public and v_has_vis then
          v_nonpublic_parent_ids := iam.accessible_entity_ids(
            rec.parent_type, p_required, p_depth + 1, false
          );
          v_sql := format(
            'with have as materialized (select iam.unnest_uuids($3) as id) '
            || 'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where ('
            || '(t.visibility = ''public'' and t.%I = any($1)) '
            || 'or ((t.visibility is null or t.visibility >= ''internal''::platform.visibility)'
            || ' and t.visibility is distinct from ''public'' and t.%I = any($2))'
            || ') and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column, rec.fk_column
          );
          execute v_sql into v_more using v_parent_ids, v_nonpublic_parent_ids, v_ids;
        else
          v_sql := format(
            'with have as materialized (select iam.unnest_uuids($2) as id) '
            || 'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where t.%I = any($1) %s'
            || 'and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, 't', ' and ')
          );
          execute v_sql into v_more using v_parent_ids, v_ids;
        end if;
        v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
      end if;
    end if;
  end loop;

  -- DD-175e: one filter over every lane at once, so no arm can reintroduce a row the
  -- parent's own std_select hides.
  if v_soft_deleted_hidden and coalesce(array_length(v_ids,1),0) > 0 then
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t' ||
      ' where t.id = any($1) and t.deleted_at is null', v_tbl);
    execute v_sql into v_more using v_ids;
    v_ids := coalesce(v_more, '{}'::uuid[]);
  end if;
  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$function$;


CREATE OR REPLACE FUNCTION iam.is_discoverable_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_is_component boolean; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_type text; v_parent_col text; v_parent_id uuid; rec record;
begin
  if v_uid is null then return false; end if;
  select schema_name, table_name, coalesce(is_component, false) into v_schema, v_table, v_is_component
  from platform.entity_types where token = p_type and is_active;
  if v_schema is null then return false; end if;
  if v_is_component then
    select parent_type, fk_column into v_parent_type, v_parent_col
    from platform.entity_relationships where child_type = p_type and kind = 'composition' limit 1;
    if v_parent_type is null then return false; end if;
    execute format('select %I from %I.%I where id=$1', v_parent_col, v_schema, v_table) into v_parent_id using p_id;
    if v_parent_id is null then return false; end if;
    return iam.is_discoverable_base(v_uid, v_parent_type, v_parent_id, p_required, p_include_public);
  end if;
  if p_required = 'viewer' and public.user_can_read_via_library_grant(v_uid, p_type, p_id) then return true; end if;
  if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id) then return true; end if;
  select * into v_vis, v_owner, v_org, v_found from platform.entity_row_access_attrs(v_schema, v_table, p_id);
  if not coalesce(v_found, false) then return false; end if;
  if v_owner = v_uid then return true; end if;
  if p_required = 'viewer' and v_org is not null and public.is_org_admin_for(v_uid, v_org) then return true; end if;
  if p_include_public and v_vis = 'public' and p_required = 'viewer' then return true; end if;
  -- DD-185: the §6e arm follows the class here too. NOTE FOR THE REGISTER: the REST of this
  -- function is still class-blind (its org-admin and org-access arms never got DD-137b), which is
  -- a finding of its own and not this lane's brief — only the every-signed-in-user arm is closed.
  if p_include_public and p_required = 'viewer' and v_vis >= 'internal'::platform.visibility and v_org is not null
     and (iam.class_lanes(p_type)).resolved_class in ('organization','public')
     and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
  if v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
     and public.is_super_admin_for(v_uid) then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id and m.user_id = v_uid and m.deleted_at is null and m.status = 'active' and g.confers >= p_required
  ) then return true; end if;
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if public.is_org_admin_for(v_uid, v_org) then return true; end if;
    if p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  if v_vis >= 'internal'::platform.visibility then
    for rec in select parent_type, fk_column from platform.entity_relationships where child_type = p_type and kind = 'containment' loop
      execute format('select %I from %I.%I where id=$1', rec.fk_column, v_schema, v_table) into v_parent_id using p_id;
      if v_parent_id is not null and iam.is_discoverable_base(v_uid, rec.parent_type, v_parent_id, p_required, false) then return true; end if;
    end loop;
  end if;
  return false;
end; $function$;


CREATE OR REPLACE FUNCTION iam.discoverable_ids(p_user_id uuid, p_type text, p_required permission_level, p_depth integer, p_include_public boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := p_user_id;
  v_schema text;
  v_table text;
  v_is_component boolean;
  v_tbl text;
  v_owner_col text;
  v_has_org boolean;
  v_has_vis boolean;
  v_parent_type text;
  v_parent_col text;
  v_parent_ids uuid[];
  v_more uuid[];
  v_trusted text;
  v_sql text;
  v_ids uuid[] := '{}';
  rec record;
begin
  if v_uid is null or p_depth > 4 then return '{}'::uuid[]; end if;
  if auth.role() = 'anon' then return '{}'::uuid[]; end if;
  if auth.role() = 'authenticated'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id)
  then return '{}'::uuid[]; end if;

  select et.schema_name, et.table_name, coalesce(et.is_component, false)
    into v_schema, v_table, v_is_component
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then return '{}'::uuid[]; end if;
  v_tbl := format('%I.%I', v_schema, v_table);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name
    when 'created_by' then 1 when 'owner_id' then 2 else 3 end
  limit 1;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'visibility'
      and c.udt_schema = 'platform' and c.udt_name = 'visibility'
  ) into v_has_vis;

  if v_is_component then
    select er.parent_type, er.fk_column into v_parent_type, v_parent_col
    from platform.entity_relationships er
    where er.child_type = p_type and er.kind = 'composition'
    limit 1;
    if v_parent_type is null then return '{}'::uuid[]; end if;
    v_parent_ids := iam.discoverable_ids(
      v_uid, v_parent_type, p_required, p_depth + 1, p_include_public
    );
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t '
      || 'where t.%I = any($1)%s',
      v_tbl, v_parent_col,
      case when v_owner_col is not null
        then format(' or (t.%I is null and t.%I = $2)', v_parent_col, v_owner_col)
        else '' end
    );
    execute v_sql into v_ids using v_parent_ids, v_uid;
    return coalesce(v_ids, '{}'::uuid[]);
  end if;

  v_trusted := case when v_owner_col is not null
    then format('t.%I = $1', v_owner_col) else 'false' end;
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om where om.user_id = $1))';
    else
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;
  end if;
  if v_has_org and public.is_super_admin_for(v_uid) then
    v_trusted := v_trusted
      || ' or t.organization_id in (select so.organization_id '
      || 'from iam.system_orgs so where so.global_readable)';
  end if;
  if p_required = 'viewer'::public.permission_level then
    if p_include_public and v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      -- DD-185: as in iam.accessible_entity_ids. The rest of this function's lanes are still
      -- class-blind — reported, not silently half-fixed here.
      if v_has_org and (iam.class_lanes(p_type)).resolved_class in ('organization','public') then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select so.organization_id from iam.system_orgs so where so.global_readable))';
      end if;
    end if;
    if v_has_org then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id '
        || 'from iam.organization_member om where om.user_id = $1 '
        || 'and om.role in (''owner'', ''admin''))';
    end if;
  end if;

  v_sql := format(
    'select coalesce(array_agg(t.id), ''{}'') from %s t where %s',
    v_tbl, v_trusted
  );
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  for rec in
    select distinct c.id from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (
          p.granted_to_user_id = v_uid
          or p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om where om.user_id = v_uid
          )
        )
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type
        and m.user_id = v_uid and m.deleted_at is null
    ) c
    where not (c.id = any(v_ids))
  loop
    if iam.is_discoverable_base(
      v_uid, p_type, rec.id, p_required, p_include_public
    ) then v_ids := v_ids || rec.id; end if;
  end loop;

  if v_has_vis then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_type and er.kind = 'containment'
    loop
      if exists (
        select 1 from information_schema.columns c
        where c.table_schema = v_schema and c.table_name = v_table
          and c.column_name = rec.fk_column
      ) then
        v_parent_ids := iam.discoverable_ids(
          v_uid, rec.parent_type, p_required, p_depth + 1, false
        );
        if coalesce(array_length(v_parent_ids, 1), 0) > 0 then
          v_sql := format(
            'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where t.visibility >= ''internal'' and t.%I = any($1) '
            || 'and not (t.id = any($2))',
            v_tbl, rec.fk_column
          );
          execute v_sql into v_more using v_parent_ids, v_ids;
          v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
        end if;
      end if;
    end loop;
  end if;

  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$function$;

-- ══════════════════════════════════════════════════ THE KERNEL FINGERPRINT, RE-PINNED ON PURPOSE
-- `iam.entity_read_expr` refuses to bound its definer call when the access kernel has moved under
-- it: it compares `iam.entity_read_kernel_fingerprint()` (an md5 over the sixteen resolver bodies)
-- to `iam.entity_read_kernel_expected()`, warns, and emits an UNBOUNDED `iam.has_access` lane —
-- correct but slow. Two of those sixteen bodies are edited above, so the fingerprint HAS moved,
-- and leaving the pin stale would silently rewrite every policy this migration and the batch files
-- regenerate into the slow shape.
--
-- Re-pinning is only honest because this file is the proof the mirror still expresses the kernel:
-- the SAME predicate, in the SAME words, was added to both in the same transaction, and the
-- forcing test below asks the policy, the kernel and the id producer about the same row. The
-- broader prover (`scripts/_verify_entity_read_equivalence.py --apply`) is the tool for a change
-- that alters WHICH lanes exist; this one removes one arm from both sides at once.
--
-- It is computed, never typed: a hand-copied hash that does not match what the catalog holds is a
-- pin that lies, and this block asserts it both moved and now matches.
do $b77pin$
declare v_old text; v_new text;
begin
  v_old := iam.entity_read_kernel_expected();
  v_new := iam.entity_read_kernel_fingerprint();
  if v_old = v_new then
    raise exception 'DD-185: the access-kernel fingerprint did NOT move (%), but this file rewrote iam.has_access_for_base and iam.accessible_entity_ids. Either the edits did not land or the fingerprint no longer covers them — both make the staleness guard blind.', v_old;
  end if;
  execute format($f$create or replace function iam.entity_read_kernel_expected() returns text language sql immutable as $x$ select %L::text $x$$f$, v_new);
  if iam.entity_read_kernel_expected() is distinct from iam.entity_read_kernel_fingerprint() then
    raise exception 'DD-185: re-pinning the access-kernel fingerprint did not take.';
  end if;
  raise notice 'DD-185 — access-kernel fingerprint re-pinned % -> % (iam.has_access_for_base and iam.accessible_entity_ids changed in this file)', v_old, v_new;
end
$b77pin$;

-- ═══════════════ SECTION 4 — THE CHECK: iam.verify_canonical grows an arm that can fail
CREATE OR REPLACE FUNCTION iam.verify_canonical(p_schema text, p_table text, p_token text, p_variant text DEFAULT NULL::text)
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_tbl regclass;
  v_relkind "char";
  v_is_component boolean; v_variant text; v_reg_variant text;
  v_soft_delete boolean; v_is_versioned boolean; v_is_listed boolean; v_shareable boolean;
  v_vstore text; v_vstore_ref regclass;
  v_store_token text; v_store_fk text; v_store_trig boolean; v_store_uq boolean; v_store_kind "char";
  f_id_uuid boolean; f_id boolean; f_id_int boolean; f_org boolean; f_org_nn boolean;
  f_cb boolean; f_ub boolean; f_ca_nn boolean; f_occ_nn boolean; f_ua_nn boolean; f_del boolean;
  f_ver boolean; f_meta boolean;
  f_vis boolean; f_vis_enum boolean; f_vis_nn boolean;
  l_owner boolean; l_orgid boolean; l_isdel boolean; l_ispub boolean;
  fk_org boolean; fk_cb boolean; fk_ub boolean;
  t_stamp boolean; t_touch boolean; t_hist boolean;
  v_rls boolean; v_polnames text[]; v_sel text;
  v_reg_rt text; v_expected text[]; v_unexpected text[]; v_missing text[];
  v_bespoke text[];  -- DD-147: policies on this table iam.apply_rls did not author
  v_parent_type text; v_parent_col text;
  v_owner_pat text := '%created_by = ( SELECT auth.uid()%';
  -- THE PRIVACY WALL (SPEC-ACCESS §3.5). A token declaring
  -- suppress_platform_admin_lane is generated WITHOUT platform_admin_all, so the
  -- expected-policy set must omit it or every flipped table fails certification.
  v_suppress_admin boolean := false;
  -- THE PUBLIC-PARENT ANON LANE (0580). A component token declaring
  -- component_anon_read_via_public_parent is generated WITH a pub_read anon
  -- policy keyed on the parent's visibility, so the expected-policy set must
  -- include it — and a dedicated check keeps the lane from being silently
  -- dropped by a regeneration, exactly like the privacy wall in the other
  -- direction.
  v_anon_component boolean := false;
  v_pub text;
  -- THE PER-VARIANT BASE CONTRACT (derived above)
  v_actor_req boolean;      -- must the actor pair EXIST?
  v_mutation_req boolean;   -- must the mutation trio EXIST?
BEGIN
  v_tbl := to_regclass(format('%I.%I',p_schema,p_table));
  IF v_tbl IS NULL THEN
    check_name:='table_exists'; status:='FAIL'; detail:='table not found'; RETURN NEXT; RETURN;
  END IF;

  SELECT relkind INTO v_relkind FROM pg_class WHERE oid=v_tbl;
  IF v_relkind NOT IN ('r','p') THEN
    check_name:='relation_kind'; status:='SKIP';
    detail:=format('%s — base contract not applicable; access follows the underlying query',
                   CASE v_relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE 'relkind '||v_relkind::text END);
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(is_component,false),COALESCE(has_soft_delete,false),COALESCE(is_versioned,false),COALESCE(is_listed,false),rls_variant,
         COALESCE(version_store,'history'),version_store_ref,COALESCE(suppress_platform_admin_lane,false),
         COALESCE(component_anon_read_via_public_parent,false)
    INTO v_is_component,v_soft_delete,v_is_versioned,v_is_listed,v_reg_variant,v_vstore,v_vstore_ref,v_suppress_admin,
         v_anon_component
    FROM platform.entity_types WHERE token=p_token;
  v_variant := COALESCE(p_variant, v_reg_variant, CASE WHEN v_is_component THEN 'component' ELSE 'entity' END);
  v_shareable := EXISTS(SELECT 1 FROM platform.shareable_resource_registry WHERE resource_type=p_token AND is_active);

  v_actor_req    := v_variant IN ('entity','system','restricted');
  -- The mutation trio is required where the row is USER-REVISED (the entity family) or where
  -- the registry DECLARES it versioned (any variant — a versioned row must bump `version`,
  -- §7's prerequisite pairing). `ledger` means "no user writes", not "the server never
  -- updates it": a server-written durable work queue is a legitimate ledger and may be
  -- versioned. Nothing in the machinery forbids it, so the gate must not either.
  v_mutation_req := v_variant IN ('entity','system','restricted','personal') OR v_is_versioned;

  SELECT
    bool_or(column_name='id' AND data_type='uuid'), bool_or(column_name='id'),
    bool_or(column_name='id' AND data_type IN ('bigint','integer','smallint')),
    bool_or(column_name='organization_id'), bool_or(column_name='organization_id' AND is_nullable='NO'),
    bool_or(column_name='created_by'), bool_or(column_name='updated_by'),
    bool_or(column_name='created_at' AND is_nullable='NO'),
    bool_or(column_name='occurred_at' AND is_nullable='NO'),
    bool_or(column_name='updated_at' AND is_nullable='NO'),
    bool_or(column_name='deleted_at'),
    bool_or(column_name='version' AND data_type='integer' AND is_nullable='NO'),
    bool_or(column_name='metadata' AND data_type='jsonb' AND is_nullable='NO'),
    bool_or(column_name='visibility'),
    bool_or(column_name='visibility' AND udt_schema='platform' AND udt_name='visibility'),
    bool_or(column_name='visibility' AND udt_schema='platform' AND udt_name='visibility' AND is_nullable='NO'),
    bool_or(column_name IN ('user_id','owner_id','author_id','creator_id')),
    bool_or(column_name='org_id'), bool_or(column_name='is_deleted'), bool_or(column_name='is_public')
  INTO f_id_uuid,f_id,f_id_int,f_org,f_org_nn,f_cb,f_ub,f_ca_nn,f_occ_nn,f_ua_nn,f_del,f_ver,f_meta,
       f_vis,f_vis_enum,f_vis_nn,l_owner,l_orgid,l_isdel,l_ispub
  FROM information_schema.columns WHERE table_schema=p_schema AND table_name=p_table;

  SELECT
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='organization_id' AND c.confrelid='iam.organizations'::regclass),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='created_by' AND c.confrelid='auth.users'::regclass),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='updated_by' AND c.confrelid='auth.users'::regclass)
  INTO fk_org,fk_cb,fk_ub;

  SELECT COALESCE(bool_or(pr.proname='_stamp_actor'),false),COALESCE(bool_or(pr.proname='_touch_row'),false),
         COALESCE(bool_or(pr.proname='_version_capture'),false)
    INTO t_stamp,t_touch,t_hist
  FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid WHERE tg.tgrelid=v_tbl AND NOT tg.tgisinternal;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid=v_tbl;
  SELECT array_agg(polname) INTO v_polnames FROM pg_policy WHERE polrelid=v_tbl;
  SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy WHERE polrelid=v_tbl AND polname='std_select';
  SELECT pg_get_expr(polqual,polrelid) INTO v_pub FROM pg_policy WHERE polrelid=v_tbl AND polname='pub_read';

  check_name:='entity_registered';
  IF EXISTS(SELECT 1 FROM platform.entity_types WHERE token=p_token AND schema_name=p_schema AND table_name=p_table)
    THEN status:='PASS'; detail:=v_variant; ELSE status:='FAIL'; detail:=format('no entity_types row for token=%s at %s.%s',p_token,p_schema,p_table); END IF; RETURN NEXT;

  -- ---- id -------------------------------------------------------------------------------
  -- A ledger row has a POSITION, not an identity: its std_select reads only organization_id
  -- and iam.has_access is never called on it, so a monotonic bigint (the shape
  -- history.row_versions itself uses) is canonical there.
  check_name:='base_id_uuid';
  IF f_id_uuid THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' AND f_id_int THEN
    status:='PASS'; detail:='ledger sequence id (integer) — a ledger row has a position, not a shareable identity';
  ELSIF f_id THEN status:='FAIL'; detail:='id not uuid';
  ELSE status:='FAIL'; detail:='missing id'; END IF; RETURN NEXT;

  -- ---- org: UNIVERSAL. The NO-NULL-ORG ruling is platform-wide, every variant. -----------
  check_name:='base_organization_id'; status:=CASE WHEN f_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_org THEN NULL ELSE 'missing organization_id' END; RETURN NEXT;
  check_name:='base_org_not_null'; status:=CASE WHEN NOT f_org THEN 'SKIP' WHEN f_org_nn THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN f_org AND NOT f_org_nn THEN 'organization_id must be NOT NULL' END; RETURN NEXT;
  check_name:='base_org_fk'; status:=CASE WHEN fk_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN fk_org THEN NULL ELSE 'organization_id missing FK -> iam.organizations' END; RETURN NEXT;

  -- ---- actor pair: entity family only (§6d-1) --------------------------------------------
  check_name:='base_created_by';
  IF f_cb THEN status:='PASS'; detail:=CASE WHEN v_variant='component' THEN 'present but NOT an access key (§6d-1): neutralize from the parent, rename to a domain author column, or drop' END;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing created_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no owner column (§6d-1) — access is the parent''s; the actor is in history.row_versions';
  ELSE status:='SKIP'; detail:='ledger actor is a named domain column (e.g. actor_id), never an access key'; END IF; RETURN NEXT;

  check_name:='base_created_by_fk'; status:=CASE WHEN NOT f_cb THEN 'SKIP' WHEN fk_cb THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_cb AND NOT fk_cb THEN 'created_by missing FK -> auth.users' END; RETURN NEXT;

  check_name:='base_updated_by';
  IF f_ub THEN status:='PASS'; detail:=NULL;
  ELSIF v_actor_req THEN status:='FAIL'; detail:='missing updated_by';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component has no actor columns (§6d-1) — every write is stamped into history.row_versions';
  ELSE status:='SKIP'; detail:='append-only ledger row is never updated'; END IF; RETURN NEXT;

  check_name:='base_updated_by_fk'; status:=CASE WHEN NOT f_ub THEN 'SKIP' WHEN fk_ub THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_ub AND NOT fk_ub THEN 'updated_by missing FK -> auth.users' END; RETURN NEXT;

  -- ---- append timestamp: UNIVERSAL. A ledger names it occurred_at (history.row_versions). -
  check_name:='base_created_at';
  IF f_ca_nn THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' AND f_occ_nn THEN status:='PASS'; detail:='ledger append timestamp is occurred_at (the history.row_versions shape)';
  ELSE status:='FAIL'; detail:=CASE WHEN v_variant='ledger' THEN 'missing/nullable created_at (or occurred_at)' ELSE 'missing/nullable created_at' END; END IF; RETURN NEXT;

  -- ---- mutation trio: only where the row is user-revised ----------------------------------
  check_name:='base_updated_at';
  IF f_ua_nn THEN status:='PASS'; detail:=NULL;
  ELSIF v_mutation_req THEN status:='FAIL'; detail:='missing/nullable updated_at';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='non-versioned component — its revision history is its parent''s; adding a stamp nothing maintains is the dead-column anti-pattern (§8)';
  ELSE status:='SKIP'; detail:='non-versioned ledger — no user-write lane (SELECT-only grants, §6d-2) and nothing maintains the stamp'; END IF; RETURN NEXT;

  check_name:='base_version';
  IF f_ver THEN status:='PASS'; detail:=NULL;
  ELSIF v_mutation_req THEN status:='FAIL'; detail:='missing version int NOT NULL';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='non-versioned component — nothing reads version (§7: version matters iff is_versioned)';
  ELSE status:='SKIP'; detail:='non-versioned ledger — nothing reads version (§7: version matters iff is_versioned)'; END IF; RETURN NEXT;

  check_name:='base_metadata'; status:=CASE WHEN f_meta THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_meta THEN NULL ELSE 'missing metadata jsonb NOT NULL' END; RETURN NEXT;

  check_name:='soft_delete';
  IF v_soft_delete THEN status:=CASE WHEN f_del THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_del THEN NULL ELSE 'has_soft_delete=true but no deleted_at' END;
  ELSIF f_del THEN status:='PASS'; detail:=NULL;
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='a ledger row is never soft-deleted; the ledger RLS lane has no deleted_at prefix (§8 corollary 2)';
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='a component''s lifecycle is its parent''s — the parent''s deleted_at governs the tree, and the component RLS lane emits no deleted_at prefix; soft-deleting a child independently is the "own identity" a component does not have';
  ELSE status:='WARN'; detail:='no deleted_at (has_soft_delete=false)'; END IF; RETURN NEXT;

  -- ---- canonical triggers: required where they have something to do ----------------------
  -- platform._stamp_actor() assigns NEW.created_by UNGUARDED — attaching it to a table with
  -- no actor columns raises 42703 on every write. It can only be required where they exist.
  -- And it stamps auth.uid(), which §6d-1 calls the ENTITY fix: on a component a lingering
  -- created_by must be DERIVED FROM THE PARENT or dropped, never forced to the acting user.
  check_name:='trg_stamp_actor';
  IF v_actor_req THEN status:=CASE WHEN t_stamp THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_stamp THEN NULL ELSE 'missing _stamp_actor trigger' END;
  ELSIF f_cb OR f_ub THEN status:='SKIP'; detail:=format('lingering actor column on a %s — §6d-1: derive it from the parent or drop it; attaching _stamp_actor (it stamps auth.uid()) is the entity fix and is wrong here',v_variant);
  ELSE status:='SKIP'; detail:='no actor columns to stamp — platform._stamp_actor raises 42703 on a table without created_by'; END IF; RETURN NEXT;

  -- platform._touch_row() is jsonb-guarded and is a genuine no-op with neither column.
  check_name:='trg_touch_row';
  IF f_ua_nn OR f_ver THEN status:=CASE WHEN t_touch THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_touch THEN NULL ELSE 'missing _touch_row trigger' END;
  ELSE status:='SKIP'; detail:='no updated_at/version to maintain — platform._touch_row would be a no-op'; END IF; RETURN NEXT;

  check_name:='trg_version_capture';
  IF v_is_versioned AND v_vstore='custom' THEN
    -- CERTIFIED CUSTOM VERSION STORE (Arman-ratified 2026-08-12): the entity's versioning IS
    -- its declared store (e.g. a publication table product rows FK-pin). Requirements:
    IF t_hist THEN
      status:='FAIL'; detail:='DUPLICATE VERSIONING: version_store=custom but _version_capture also attached — an entity has exactly one versioning system';
    ELSIF v_vstore_ref IS NULL THEN
      status:='FAIL'; detail:='version_store=custom but version_store_ref is NULL';
    ELSE
      SELECT c.relkind INTO v_store_kind FROM pg_class c WHERE c.oid=v_vstore_ref;
      SELECT et.token INTO v_store_token FROM platform.entity_types et WHERE et.table_ref=v_vstore_ref AND et.is_active LIMIT 1;
      SELECT er.fk_column INTO v_store_fk FROM platform.entity_relationships er
        WHERE er.child_type=v_store_token AND er.parent_type=p_token AND er.kind='composition' LIMIT 1;
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid
        WHERE tg.tgrelid=v_tbl AND NOT tg.tgisinternal
          AND pr.prosrc ILIKE '%'||v_vstore_ref::text||'%'
      ) INTO v_store_trig;
      SELECT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid=v_vstore_ref AND i.indisunique
          AND v_store_fk = ANY (SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=v_vstore_ref AND a.attnum = ANY(i.indkey))
          AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_vstore_ref AND a.attnum = ANY(i.indkey) AND a.attname ILIKE '%version%')
      ) INTO v_store_uq;
      IF v_store_kind IS DISTINCT FROM 'r' THEN status:='FAIL'; detail:=format('custom store %s is not a plain table',v_vstore_ref::text);
      ELSIF v_store_token IS NULL THEN status:='FAIL'; detail:=format('custom store %s is not an active registered entity',v_vstore_ref::text);
      ELSIF v_store_fk IS NULL THEN status:='FAIL'; detail:=format('custom store token %s has no composition edge to %s',v_store_token,p_token);
      ELSIF NOT v_store_trig THEN status:='FAIL'; detail:=format('no automatic capture trigger on %s.%s writing %s',p_schema,p_table,v_vstore_ref::text);
      ELSIF NOT v_store_uq THEN status:='FAIL'; detail:=format('custom store %s lacks UNIQUE(%s, <version column>)',v_vstore_ref::text,v_store_fk);
      ELSE status:='PASS'; detail:=format('certified custom version store: %s',v_vstore_ref::text);
      END IF;
    END IF;
  ELSIF v_is_versioned THEN
    status:=CASE WHEN t_hist THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_hist THEN NULL ELSE 'is_versioned=true but no _version_capture trigger' END;
  ELSE
    status:=CASE WHEN t_hist THEN 'WARN' ELSE 'SKIP' END; detail:=CASE WHEN t_hist THEN '_version_capture present but is_versioned=false' ELSE 'not versioned' END;
  END IF; RETURN NEXT;

  -- ---- visibility -------------------------------------------------------------------------
  -- A component's and a ledger's RLS lane NEVER reads visibility. A column there is a second,
  -- competing access authority (§6d-1) — flag it for removal rather than blessing it.
  check_name:='visibility';
  IF f_vis AND v_variant IN ('component','ledger') THEN
    status:='WARN'; detail:=format('%s carries a stray visibility column — its RLS lane never reads it (§6d-1/§6d-2); a second competing access authority, file the removal',v_variant);
  ELSIF f_vis AND NOT f_vis_enum THEN status:='FAIL'; detail:='visibility not platform.visibility enum (free-text kill)';
  ELSIF f_vis_enum THEN status:=CASE WHEN f_vis_nn THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_vis_nn THEN NULL ELSE 'visibility must be NOT NULL' END;
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component inherits parent access';
  ELSIF v_variant='restricted' THEN status:='PASS'; detail:='restricted server-only table has no visibility column';
  ELSIF v_variant='ledger' THEN status:='SKIP'; detail:='ledger access is org-scoped; the ledger RLS lane never reads visibility';
  ELSIF v_is_listed OR v_shareable THEN status:='FAIL'; detail:='listed/shareable entity requires visibility enum';
  ELSE status:='WARN'; detail:='no visibility enum (add + migrate is_public)'; END IF; RETURN NEXT;

  check_name:='legacy_org_id'; status:=CASE WHEN l_orgid THEN 'FAIL' ELSE 'PASS' END; detail:=CASE WHEN l_orgid THEN 'legacy org_id present; drop it' END; RETURN NEXT;
  check_name:='legacy_owner_col';
  IF v_variant='personal' THEN
    status:=CASE WHEN l_owner THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN l_owner THEN 'user_id is the personal access owner' ELSE 'personal variant requires user_id' END;
  ELSE
    status:=CASE WHEN l_owner THEN 'WARN' ELSE 'PASS' END;
    detail:=CASE WHEN l_owner THEN 'user_id/owner_id/author_id/creator_id present; created_by is canonical owner' END;
  END IF;
  RETURN NEXT;
  check_name:='legacy_is_public'; status:=CASE WHEN l_ispub THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_ispub THEN 'is_public present; visibility is the access driver' END; RETURN NEXT;
  check_name:='legacy_is_deleted'; status:=CASE WHEN l_isdel THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_isdel THEN 'is_deleted present; deleted_at is canonical' END; RETURN NEXT;

  check_name:='rls_enabled'; status:=CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END; detail:=NULL; RETURN NEXT;

  -- `platform_admin_all` is emitted by iam.apply_rls for every variant
  -- (2026-08-22, the admin lane). It is canonical, not drift.
  -- EXCEPT where the token declares suppress_platform_admin_lane (SPEC-ACCESS
  -- §3.5, the D19 privacy wall): the generator does not emit it, so expecting it
  -- would FAIL every flipped table. `personal` never had it in the first place.
  IF v_variant='restricted' AND NOT f_vis THEN v_expected:=ARRAY['svc_all'];
  ELSIF v_variant='ledger' THEN v_expected:=ARRAY['svc_all','platform_admin_all','std_select'];
  ELSIF v_variant='personal' THEN v_expected:=ARRAY['svc_all','std_select','std_insert','std_update','std_delete'];
  ELSE v_expected:=ARRAY['svc_all','platform_admin_all','std_select','std_insert','std_update','std_delete'];
       IF v_variant IN ('entity','system','restricted') AND f_vis_enum THEN v_expected:=array_append(v_expected,'pub_read'); END IF;
       -- THE PUBLIC-PARENT ANON LANE (0580): a flagged component table is
       -- generated WITH pub_read, so the expectation must include it.
       IF v_variant='component' AND v_anon_component THEN v_expected:=array_append(v_expected,'pub_read'); END IF; END IF;
  IF v_suppress_admin AND v_variant<>'personal' THEN
    v_expected:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT 'platform_admin_all');
  END IF;
  v_unexpected:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(v_expected));
  v_missing:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT unnest(COALESCE(v_polnames,'{}')));
  check_name:='policies_canonical';
  IF v_missing='{}' AND v_unexpected='{}' THEN status:='PASS'; detail:=NULL; ELSE status:='FAIL'; detail:=format('missing=%s legacy/unexpected=%s',v_missing,v_unexpected); END IF; RETURN NEXT;

  -- 🚨 DD-147 (2026-09-12) — THE GENERATOR KEEPS WHAT IT DID NOT AUTHOR, SO SOMETHING HAS TO SAY
  -- WHAT IT KEPT. Until today `iam.apply_rls` dropped EVERY policy on a table before regenerating,
  -- bespoke ones included: in the B-30 rehearsal it removed the signed-out invitation-request lanes
  -- and two migrations put them back by hand. The generator now drops only the names it authors
  -- (`iam.generated_policy_names()`), which means a hand-written policy SURVIVES a regeneration —
  -- and a surviving door that nothing generated and nothing certifies must never be silent.
  -- WARN, not FAIL: a bespoke policy is not by itself a defect (the vault, the anon share-link
  -- resolver and the signed-out invitation lanes are all deliberate). `policies_canonical` above
  -- already FAILs a table whose policy SET is wrong. This check exists to NAME them.
  check_name:='bespoke_policy_present';
  v_bespoke:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(iam.generated_policy_names()));
  IF v_bespoke='{}' THEN status:='PASS'; detail:=NULL;
  ELSE status:='WARN';
    detail:=format('%s policy/policies here were NOT authored by iam.apply_rls and are PRESERVED across regeneration: %s. Each is a live door the class regime never emitted and iam.verify_canonical cannot certify. Fold it into the class and name it in iam.supersede_bespoke_policies(...) with a reason, or state why it must stay.',
                   cardinality(v_bespoke), array_to_string(v_bespoke,', '));
  END IF; RETURN NEXT;

  -- THE PRIVACY WALL GATE (SPEC-ACCESS §3.5). Emitted ONLY for a token that
  -- declares the flag, so an unflagged table's finding set is byte-for-byte what
  -- it was. A wall that is only written down is a wall that a regeneration
  -- quietly removes; this is the check that makes it stay up.
  IF v_suppress_admin THEN
    check_name:='privacy_wall';
    IF v_variant='personal' THEN status:='PASS'; detail:='personal variant never had a platform-admin lane';
    ELSIF 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}')) THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but platform_admin_all exists — re-run iam.apply_rls';
    ELSIF COALESCE(v_sel,'') LIKE '%is_platform_admin%' OR COALESCE(v_sel,'') LIKE '%is_super_admin%' THEN status:='FAIL';
      detail:='suppress_platform_admin_lane=true but std_select still carries a platform-staff arm — re-run iam.apply_rls';
    ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;
  END IF;

  -- 🚨 THE PERSONAL-ROW WALL (DD-165, 2026-09-12). The CLASS decides which lanes a table emits;
  -- a ROW's `visibility` only narrows them. Before this check, `note` (workbench.notes) was classed
  -- `organization`, kept `platform_admin_all`, and 137 of 4,166 rows marked `personal` by the person
  -- who wrote them were readable by any platform admin — measured, V-43 §A. The class regime had no
  -- opinion about it and nothing FAILed. Arman, 2026-09-12: an admin cannot read a person's private
  -- data. So on every classed table that carries a real `platform.visibility` column and still has a
  -- staff lane, each staff arm must be emitted in its WALLED form — `visibility >= 'internal'` AND
  -- the staff predicate — and this check FAILs when one is not.
  --
  -- What it deliberately does NOT assert: the system-org arm
  -- `(organization_id in (select organization_id from iam.system_orgs where global_readable) and
  --  is_super_admin())`, which `iam.entity_read_expr` mirrors from `iam.has_access_for_base`. That
  -- arm can only ever match a row owned by a global_readable SYSTEM organization — platform content,
  -- never a customer's person — and walling the mirror alone would change no access at all while the
  -- kernel's own copy stayed open, i.e. a wall that only LOOKS like one. 8 rows live behind it today
  -- and they are named in the DD-165 report rather than hidden here. It is recognised by the
  -- `system_orgs` reference in the same expression.
  IF f_vis_enum AND NOT v_suppress_admin AND v_variant <> 'personal' THEN
    check_name:='personal_row_wall';
    DECLARE
      w_admin constant text := '(visibility >= ''internal''::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)';
      w_super constant text := '(visibility >= ''internal''::platform.visibility) AND is_super_admin()';
      r_pol record; v_rest text; v_bad text := NULL; v_admin_ok boolean := NULL;
    BEGIN
      FOR r_pol IN
        SELECT p.polname,
               regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), '\s+', ' ', 'g') AS q
          FROM pg_policy p
         WHERE p.polrelid = v_tbl AND p.polpermissive
         ORDER BY p.polname
      LOOP
        IF r_pol.polname = 'platform_admin_all' THEN
          v_admin_ok := position(w_admin in r_pol.q) > 0;
        END IF;
        v_rest := replace(replace(r_pol.q, w_admin, ''), w_super, '');
        IF v_rest LIKE '%is_platform_admin%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname || ' carries an UNWALLED platform-admin arm';
        ELSIF v_rest LIKE '%is_super_admin%' AND r_pol.q NOT LIKE '%system_orgs%' THEN
          v_bad := coalesce(v_bad || '; ', '') || r_pol.polname || ' carries an UNWALLED super-admin arm';
        END IF;
      END LOOP;
      IF v_admin_ok IS FALSE THEN
        v_bad := coalesce(v_bad || '; ', '') || 'platform_admin_all USING does not exclude visibility=''personal''';
      END IF;
      IF v_bad IS NULL THEN status:='PASS'; detail:=NULL;
      ELSE status:='FAIL';
        detail:= v_bad || ' — a personal row stays personal inside an organization-class table (DD-165); re-run iam.apply_rls';
      END IF;
    END;
    RETURN NEXT;
  END IF;

  -- 🚨 A COMPONENT LANE IS NEVER WIDER THAN ITS PARENT'S READ (DD-175, 2026-09-12).
  -- A component has no class and no owner column of its own: its access IS its parent's
  -- (db-rules §6d-1). So every door a signed-in client can use on a component table must go
  -- through the parent. Measured live before this check existed: arman@titaniumsuccess.com read
  -- 2,313 docproc.processed_document_pages whose processed_document its own policy refuses, and
  -- admin@admin.com read 106 udt_document_snapshots through a `platform_admin_all` policy sitting
  -- beside a lane that had nothing to do with the parent.
  IF v_variant = 'component' THEN
    DECLARE
      r_pol record; v_bad text := NULL; v_any_parent boolean := false; v_rls boolean;
    BEGIN
      SELECT EXISTS (SELECT 1 FROM platform.entity_relationships er
                      JOIN platform.entity_types pt ON pt.token = er.parent_type AND pt.is_active
                     WHERE er.child_type = p_token AND er.kind IN ('composition','containment')
                       AND EXISTS (SELECT 1 FROM information_schema.columns c
                                    WHERE c.table_schema = p_schema AND c.table_name = p_table
                                      AND c.column_name = er.fk_column))
        INTO v_any_parent;
      IF v_any_parent THEN
        SELECT cl.relrowsecurity INTO v_rls
          FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
         WHERE ns.nspname = p_schema AND cl.relname = p_table;
        IF NOT COALESCE(v_rls, false) THEN
          v_bad := 'row security is DISABLED on the table — every signed-in client reads every row, '
                || 'which is the widest lane a component can have';
        ELSE
          FOR r_pol IN
            SELECT pol.polname,
                   regexp_replace(COALESCE(pg_get_expr(pol.polqual, pol.polrelid),'true'),'\s+',' ','g') AS q
              FROM pg_policy pol
              JOIN pg_class cl ON cl.oid = pol.polrelid
              JOIN pg_namespace ns ON ns.oid = cl.relnamespace
             WHERE ns.nspname = p_schema AND cl.relname = p_table
               AND pol.polpermissive AND pol.polcmd IN ('r','*')
               AND NOT EXISTS (SELECT 1 FROM unnest(pol.polroles) rr JOIN pg_roles ro ON ro.oid = rr
                                WHERE ro.rolname = 'service_role')
             ORDER BY pol.polname
          LOOP
            IF EXISTS (
              SELECT 1 FROM platform.entity_relationships er
                JOIN platform.entity_types pt ON pt.token = er.parent_type AND pt.is_active
               WHERE er.child_type = p_token AND er.kind IN ('composition','containment')
                 AND EXISTS (SELECT 1 FROM information_schema.columns c
                              WHERE c.table_schema = p_schema AND c.table_name = p_table
                                AND c.column_name = er.fk_column)
                 AND (r_pol.q LIKE '%accessible_entity_ids(''' || er.parent_type || '''%'
                   OR r_pol.q LIKE '%has_access(''' || er.parent_type || '''%'
                   OR r_pol.q LIKE '%' || pt.schema_name || '.' || pt.table_name || '%')
            ) THEN
              CONTINUE;
            END IF;
            IF (iam.class_lanes(p_token)).platform_admin_lane
               AND (r_pol.q LIKE '%is_platform_admin%' OR r_pol.q LIKE '%is_super_admin%') THEN
              CONTINUE;  -- the staff lane this token's class still keeps
            END IF;
            v_bad := COALESCE(v_bad || '; ', '') || r_pol.polname
                  || ' is a readable door that never asks the parent';
          END LOOP;
          IF NOT EXISTS (SELECT 1 FROM pg_policy pol
                           JOIN pg_class cl ON cl.oid = pol.polrelid
                           JOIN pg_namespace ns ON ns.oid = cl.relnamespace
                          WHERE ns.nspname = p_schema AND cl.relname = p_table
                            AND pol.polpermissive AND pol.polcmd IN ('r','*')
                            AND NOT EXISTS (SELECT 1 FROM unnest(pol.polroles) rr JOIN pg_roles ro ON ro.oid = rr
                                             WHERE ro.rolname = 'service_role')) THEN
            v_bad := COALESCE(v_bad || '; ', '')
                  || 'no permissive read policy for a signed-in client exists at all';
          END IF;
        END IF;
        check_name := 'component_not_wider_than_parent';
        IF v_bad IS NULL THEN status := 'PASS'; detail := NULL;
        ELSE status := 'FAIL';
          detail := v_bad || ' — a component''s access IS its parent''s (db-rules §6d-1, DD-175); '
                 || 'every readable door must resolve the parent. Re-run iam.apply_rls.';
        END IF;
        RETURN NEXT;
      END IF;
    END;
  END IF;

  -- 🚨 CONTAINMENT NEVER CARRIES A PERSONAL ROW (DD-171, 2026-09-12). DD-165 walled every STAFF
  -- arm; it never touched containment, so a child row still inherited its container's reach with no
  -- look at its own visibility. Measured live before this round: a PLAIN MEMBER — no admin.admins
  -- row, no org-admin role — read 8,815 other people's `personal` files, because files.files'
  -- parent-folder arm admitted any non-public file once the folder was viewer-accessible.
  -- Chair, 2026-09-12: a personal row is reachable only by its owner and by explicit direct grants
  -- ON THAT ROW; containment carries the container's reach to `internal` and above, never to
  -- `personal`. So on a table that carries a typed visibility column AND a composition/containment
  -- parent, the emitted parent-FK arm must read `visibility >= 'internal'`, and this check FAILs
  -- when it reads the old `visibility IS NOT NULL` instead (every enum value except public —
  -- `personal` included) or when the walled arm is missing altogether.
  IF f_vis_enum AND v_variant <> 'component' AND v_variant <> 'personal' THEN
    DECLARE
      r_rel record; v_q text; v_bad text := NULL; v_seen boolean := false;
    BEGIN
      v_q := regexp_replace(COALESCE(v_sel,''), '\s+', ' ', 'g');
      FOR r_rel IN
        SELECT er.parent_type, er.fk_column
          FROM platform.entity_relationships er
         WHERE er.child_type = p_token AND er.kind IN ('composition','containment')
           AND EXISTS (SELECT 1 FROM information_schema.columns c
                        WHERE c.table_schema = p_schema AND c.table_name = p_table
                          AND c.column_name = er.fk_column)
         ORDER BY er.parent_type, er.fk_column
      LOOP
        v_seen := true;
        IF v_q LIKE '%(' || r_rel.fk_column || ' IS NOT NULL) AND (visibility IS NOT NULL) AND (visibility <> ''public''%' THEN
          v_bad := COALESCE(v_bad || '; ', '') || r_rel.fk_column
                || ' carries the UNWALLED containment arm (admits visibility=''personal'')';
        ELSIF v_q NOT LIKE '%(' || r_rel.fk_column || ' IS NOT NULL) AND (visibility >= ''internal''::platform.visibility) AND (visibility <> ''public''%' THEN
          v_bad := COALESCE(v_bad || '; ', '') || r_rel.fk_column
                || ' has no walled containment arm at all';
        END IF;
      END LOOP;
      IF v_seen THEN
        check_name := 'containment_respects_personal';
        IF v_bad IS NULL THEN status := 'PASS'; detail := NULL;
        ELSE status := 'FAIL';
          detail := v_bad || ' — containment never carries a personal row (DD-171); re-run iam.apply_rls';
        END IF;
        RETURN NEXT;
      END IF;
    END;
  END IF;

  -- THE PUBLIC-PARENT ANON LANE GATE (0580). Same shape as the privacy wall,
  -- opposite direction: emitted ONLY for a flagged component token, so every
  -- unflagged table's finding set is byte-for-byte what it was. The lane that
  -- is only written down is a lane the next regeneration quietly drops; this
  -- check makes it stay up, and makes it stay CORRECT (keyed on the parent's
  -- public visibility, never a blanket read).
  IF v_anon_component AND v_variant='component' THEN
    check_name:='component_public_read';
    IF NOT ('pub_read'=ANY(COALESCE(v_polnames,'{}'))) THEN status:='FAIL';
      detail:='component_anon_read_via_public_parent=true but pub_read is missing — re-run iam.apply_rls';
    ELSIF COALESCE(v_pub,'') NOT LIKE '%visibility = ''public''%' THEN status:='FAIL';
      detail:='pub_read exists but is not keyed on the parent''s visibility=public — re-run iam.apply_rls';
    ELSIF NOT has_table_privilege('anon', v_tbl, 'SELECT') THEN status:='FAIL';
      detail:='pub_read exists but anon has no SELECT grant — the policy is unreachable; re-run iam.apply_rls';
    ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;
  END IF;

  IF v_variant IN ('entity','system') THEN
    check_name:='policy_owner_shortcircuit'; status:=CASE WHEN v_sel LIKE v_owner_pat THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE v_owner_pat THEN NULL ELSE 'std_select missing created_by short-circuit (42501 risk)' END; RETURN NEXT;
    check_name:='policy_uses_has_access'; status:=CASE WHEN v_sel LIKE '%has_access('''||p_token||'''%' THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE '%has_access('''||p_token||'''%' THEN NULL ELSE format('std_select does not call has_access(%L)',p_token) END; RETURN NEXT;
    check_name:='pub_read_anon';
      IF f_vis_enum THEN status:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN NULL ELSE 'missing anon visibility=public policy' END;
      ELSE status:='SKIP'; detail:='no visibility column'; END IF; RETURN NEXT;
    IF v_variant='system' THEN
      check_name:='policy_system_public_read'; status:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN 'PASS' ELSE 'FAIL' END;
        detail:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN NULL ELSE 'system variant std_select must pass visibility=public (authenticated catalog reads)' END; RETURN NEXT;
    END IF;
  ELSIF v_variant='personal' THEN
    check_name:='policy_personal_owner_only';
    status:=CASE
      WHEN v_sel LIKE '%user_id%'
       AND v_sel LIKE '%auth.uid%'
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE
      WHEN v_sel LIKE '%user_id%'
       AND v_sel LIKE '%auth.uid%'
       AND NOT ('platform_admin_all'=ANY(COALESCE(v_polnames,'{}')))
      THEN NULL ELSE 'personal std_select must require user_id=auth.uid and omit platform_admin_all' END;
    RETURN NEXT;
  ELSIF v_variant='component' THEN
    SELECT parent_type,fk_column INTO v_parent_type,v_parent_col FROM platform.entity_relationships WHERE child_type=p_token AND kind='composition' LIMIT 1;
    check_name:='composition_parent'; status:=CASE WHEN v_parent_type IS NOT NULL THEN 'PASS' ELSE 'FAIL' END; detail:=COALESCE(v_parent_type,'no composition edge'); RETURN NEXT;
    check_name:='policy_defers_parent'; status:=CASE WHEN v_parent_type IS NOT NULL AND (v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||p_token||'''%') THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_parent_type IS NOT NULL AND (v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||p_token||'''%') THEN NULL ELSE 'std_select must defer to composition parent' END; RETURN NEXT;
  END IF;

  SELECT resource_type INTO v_reg_rt FROM platform.shareable_resource_registry WHERE table_name=p_table AND schema_name=p_schema AND is_active LIMIT 1;
-- ═══ DD-137b (VISIBILITY-BY-CLASS §3.2 interlock two) — THE CLASS IS RE-DERIVED HERE.
  -- A declaration nothing checks is §1.3's measured price: the registry said one thing and
  -- the policies said another for as long as anyone cared to look.
  DECLARE v_dc platform.data_class; v_ls platform.list_scope; v_lanes platform.lane_set;
  BEGIN
  SELECT et.data_class, et.default_list_scope INTO v_dc, v_ls
    FROM platform.entity_types et WHERE et.token = p_token;
  check_name:='data_class_set';
  -- DD-137b14: a COMPONENT holds NULL and resolves through its parent; a LEDGER holds a class,
  -- because it has no composition parent to resolve through (chair ruling 2026-09-12).
  IF v_variant = 'component' THEN
    status:=CASE WHEN v_dc IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NULL
                 THEN format('resolves to %s through its composition parent (§3.1, DD-137b10)',
                             (iam.class_lanes(p_token)).resolved_class)
                 ELSE 'a component may not hold a data_class of its own — its access IS its parent''s (db-rules §6d-1); iam.class_lanes resolves it upward' END;
  ELSIF v_variant = 'ledger' THEN
    status:=CASE WHEN v_dc IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_dc IS NOT NULL THEN v_dc::text
                 ELSE 'a ledger has no composition parent, so it must STATE its class — an unset one would have to be guessed, and guessing is how 299 of 311 components kept a platform-staff lane under a private parent (DD-137b10)' END;
  ELSIF v_dc IS NULL THEN status:='FAIL';
    detail:='data_class is unset. Unset is a REFUSAL, not a value (chair R3): iam.apply_rls will not generate for this token and iam.class_lanes resolves it to private.';
  ELSE status:='PASS'; detail:=v_dc::text; END IF; RETURN NEXT;

  check_name:='data_class_derivations';
  IF v_variant = 'personal' AND v_dc IS DISTINCT FROM 'private'::platform.data_class THEN
    status:='FAIL'; detail:=format('§3.1 derivation one: rls_variant=personal emits no org, staff or sharing lane, so the class is private — the registry says %s', v_dc);
  ELSIF v_variant IN ('component','ledger')
        AND (iam.class_lanes(p_token)).resolved_class IN ('private','confidential')
        AND NOT v_suppress_admin THEN
    status:='FAIL'; detail:=format('DD-137b10: this %s resolves to class %s through its ' ||
      'parent, so the platform-staff lane is closed on it too — our own staff go through the ' ||
      'door like anyone. suppress_platform_admin_lane is false.', v_variant,
      (iam.class_lanes(p_token)).resolved_class);
  ELSIF v_dc IN ('private','confidential') AND NOT v_suppress_admin THEN
    status:='FAIL'; detail:=format('§3.1 derivation two: a %s token suppresses the platform-admin lane — our own staff go through the door too. suppress_platform_admin_lane is false.', v_dc);
  ELSE status:='PASS'; detail:=NULL; END IF; RETURN NEXT;

  check_name:='default_list_scope_set';
  IF v_variant IN ('component','ledger') THEN
    status:=CASE WHEN v_ls IS NULL THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN v_ls IS NULL THEN 'a component has no owner column, so "mine" is not expressible (§3.3)' ELSE 'component/ledger may not hold a default_list_scope' END;
  ELSIF v_ls IS NULL THEN status:='FAIL'; detail:='default_list_scope is unset — the screen has no declared landing place (§3.3)';
  ELSE status:='PASS'; detail:=v_ls::text; END IF; RETURN NEXT;

  check_name:='class_lanes_match_policy';
  -- DD-137b10: a component IS asked, through its resolved parent class. Skipping it here is
  -- what let 299 of 311 components keep a platform-staff lane under a private parent.
  IF v_variant = 'personal' OR v_sel IS NULL THEN
    status:='SKIP'; detail:='std_select is not built by the class-aware mirror on this variant';
  ELSE
    v_lanes := iam.class_lanes(p_token);
    IF NOT v_lanes.org_role_lane AND (v_sel LIKE '%role = ANY (ARRAY[''owner''%' OR v_sel LIKE '%is_org_admin%') THEN
      status:='FAIL'; detail:=format('class %s emits NO organization-role read lane, but std_select carries one — re-run iam.apply_rls', v_lanes.resolved_class);
    ELSIF NOT v_lanes.platform_admin_lane AND (v_sel LIKE '%is_platform_admin%' OR v_sel LIKE '%is_super_admin%') THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but std_select still carries a platform-staff arm — re-run iam.apply_rls', v_lanes.resolved_class);
    ELSIF NOT v_lanes.platform_admin_lane AND 'platform_admin_all'=ANY(COALESCE(v_polnames,'{}')) THEN
      status:='FAIL'; detail:=format('class %s closes the platform-admin lane, but a ' ||
        'platform_admin_all policy still sits beside std_select — that policy is permissive ' ||
        'and grants everything on its own. Re-run iam.apply_rls.', v_lanes.resolved_class);
    ELSIF NOT v_lanes.anon_lane AND 'pub_read'=ANY(COALESCE(v_polnames,'{}')) AND v_variant<>'system' AND NOT v_anon_component THEN
      status:='WARN'; detail:=format('class %s emits no anonymous lane, but a pub_read policy exists', v_lanes.resolved_class);
    ELSE status:='PASS'; detail:=v_lanes.resolved_class::text; END IF;
  END IF; RETURN NEXT;

  -- 🚨 DD-185 (2026-09-13) — THE §6e SYSTEM-ORGANIZATION ARM IS AN EVERY-SIGNED-IN-USER ARM.
  -- `class_lanes_match_policy` above could not see this one: it keys the organization arms on
  -- `org_role_lane` and `platform_admin_lane`, and the global-readable arm is neither — it is
  -- gated on nothing but the row's organization being a global-readable system org. On a
  -- `confidential` token `org_member_lane` is TRUE, so the mirror's own filter kept the arm and
  -- every check in this function said PASS while a non-member read the rows (measured 0 -> 8 on
  -- `audit_exemption`, B-65; live on hr.earning_code, 24 rows). A lane with no check is a lane
  -- that comes back the next time somebody edits the generator.
  check_name:='system_org_arm_respects_class';
  IF v_variant = 'personal' OR v_sel IS NULL THEN
    status:='SKIP'; detail:='no class-built std_select on this variant';
  ELSIF (iam.class_lanes(p_token)).resolved_class IN ('organization','public') THEN
    status:='PASS';
    detail:=format('class %s: the global-readable system-organization arm is this class''s to carry',
                   (iam.class_lanes(p_token)).resolved_class);
  ELSIF v_sel LIKE '%global_readable%' THEN
    status:='FAIL';
    detail:=format('class %s carries NO global-readable system-organization read arm — that arm '
      || 'admits every signed-in account with no membership, role or grant — but std_select still '
      || 'has one. Re-run iam.apply_rls (DD-185).', (iam.class_lanes(p_token)).resolved_class);
  ELSE status:='PASS'; detail:=format('class %s: arm absent', (iam.class_lanes(p_token)).resolved_class);
  END IF; RETURN NEXT;
  END;

  check_name:='sharing_token';
  IF v_reg_rt IS NULL THEN status:='SKIP'; detail:='not in shareable_resource_registry';
  ELSIF v_reg_rt=p_token THEN status:='PASS'; detail:=NULL;
  ELSE status:='FAIL'; detail:=format('registry resource_type=%s != token=%s',v_reg_rt,p_token); END IF; RETURN NEXT;
END;

$function$;

-- ══════════════════════════════════════════ THE FORCING TEST, PART 2 OF 2: GREEN, AFTER THE FIX
do $b77green$
declare
  v_schema   text := (select v from _b77_ft where k = 'schema');
  v_token    text := (select v from _b77_ft where k = 'token');
  v_sysrow   uuid := (select v from _b77_ft where k = 'sysrow')::uuid;
  v_old_expr text := (select v from _b77_ft where k = 'org_class_expr');
  v_new_expr text;
  v_member   constant uuid := '34ed4fc3-c527-4819-99bf-15c26603b261';  -- arman@titaniumsuccess.com
  v_stranger constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, in neither organization
  v_st text; v_det text;
  n bigint;
begin
  -- ── GREEN 1: the same CONFIDENTIAL probe, regenerated by the fixed generator ────────────────
  perform iam.apply_rls(v_schema, 'probe', v_token, 'entity');

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from %I.probe', v_schema) into n;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if n <> 0 then
    raise exception 'DD-185 forcing test: GREEN FAILED — after the fix test@test.com still reads % row(s) of a confidential table they belong to no organization of.', n;
  end if;
  raise notice 'DD-185 GREEN (policy) — the confidential probe: a non-member reads 0 (was 1, the system-org row).';

  if iam.has_access_for_base(v_stranger, v_token, v_sysrow, 'viewer'::public.permission_level, true) then
    raise exception 'DD-185 forcing test: GREEN FAILED IN THE KERNEL — iam.has_access_for_base still admits test@test.com to the confidential system-org row, so the generated policy''s bounded has_access arm would re-open the door the mirror just closed.';
  end if;
  raise notice 'DD-185 GREEN (kernel) — iam.has_access_for_base refuses test@test.com the confidential system-org row.';

  -- Over-tightening is the same class of defect as a stranger let in (db-rules §6): a member of
  -- the row's OWN organization must keep reading it. Measured at 2 in the RED block above (their
  -- organization's row plus the system org's) and it must be exactly the 1 that is theirs — not
  -- 0, which would mean the filter cut the class's own organization-member lane with it.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute format('select count(*) from %I.probe', v_schema) into n;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if n <> 1 then
    raise exception 'DD-185 forcing test: GREEN FAILED THE OTHER WAY — arman@titaniumsuccess.com, a member of the real organization that owns one probe row, reads % row(s) instead of 1. The fix over-tightened.', n;
  end if;
  raise notice 'DD-185 GREEN (member) — a member of the row''s own organization still reads their organization''s row (1).';

  -- ── GREEN 2: the new verify_canonical check, RED then GREEN, on the scratch table only ──────
  -- The FAIL is produced by putting the pre-DD-185 arm back as a hand-written policy on the probe.
  -- A check nobody has seen fail is not a check.
  execute format('drop policy std_select on %I.probe', v_schema);
  execute format(
    'create policy std_select on %I.probe for select to authenticated using ('
    || 'created_by = (select auth.uid()) or ((organization_id is not null) and '
    || '(visibility >= ''internal''::platform.visibility) and (organization_id in '
    || '(select so.organization_id from iam.system_orgs so where so.global_readable))))', v_schema);
  select status, detail into v_st, v_det from iam.verify_canonical(v_schema, 'probe', v_token, 'entity')
   where check_name = 'system_org_arm_respects_class';
  if v_st is distinct from 'FAIL' then
    raise exception 'DD-185 forcing test: the new check system_org_arm_respects_class returned % on a confidential table whose std_select carries the global-readable arm verbatim. A check that cannot fail is decoration. Detail: %', coalesce(v_st,'<no row>'), coalesce(v_det,'');
  end if;
  raise notice 'DD-185 CHECK RED   — system_org_arm_respects_class FAILs on a confidential std_select carrying the arm: %', v_det;
  perform iam.apply_rls(v_schema, 'probe', v_token, 'entity');
  select status, detail into v_st, v_det from iam.verify_canonical(v_schema, 'probe', v_token, 'entity')
   where check_name = 'system_org_arm_respects_class';
  if v_st is distinct from 'PASS' then
    raise exception 'DD-185 forcing test: the new check still says % after the fixed generator regenerated the table. Detail: %', coalesce(v_st,'<no row>'), coalesce(v_det,'');
  end if;
  raise notice 'DD-185 CHECK GREEN — system_org_arm_respects_class PASSes after regeneration: %', v_det;

  -- ── GREEN 3: BYTE-IDENTITY for `organization` — the 361 live tokens that must not move ──────
  update platform.entity_types
     set data_class = 'organization', suppress_platform_admin_lane = false
   where token = v_token;
  perform iam.apply_rls(v_schema, 'probe', v_token, 'entity');
  select pg_get_expr(polqual, polrelid) into v_new_expr
    from pg_policy where polrelid = format('%I.probe', v_schema)::regclass and polname = 'std_select';
  if v_new_expr is distinct from v_old_expr then
    raise exception 'DD-185 forcing test: an `organization`-class ENTITY did NOT come out byte-identical to the pre-DD-185 emit. 361 live tokens would move and nobody approved that. NEW: % OLD: %', v_new_expr, v_old_expr;
  end if;
  raise notice 'DD-185 GREEN (identity) — an `organization`-class entity emits the pre-DD-185 expression character for character; the 283 organization and 78 public tokens do not move.';

  -- ── teardown, verified ─────────────────────────────────────────────────────────────────────
  delete from iam.superseded_policy where schema_name = v_schema;
  delete from platform.entity_types where token = v_token;
  execute format('drop schema %I cascade', v_schema);
  if to_regclass(format('%I.probe', v_schema)) is not null
     or exists (select 1 from platform.entity_types where token = v_token) then
    raise exception 'DD-185 forcing test: the teardown left something behind (schema %, token %).', v_schema, v_token;
  end if;
  raise notice 'DD-185 — forcing test torn down: schema % and token % are gone.', v_schema, v_token;
end
$b77green$;
