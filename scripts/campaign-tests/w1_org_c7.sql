-- LANE W1-ORG — `C-7`, THE GREEN, for the rows this seat built: REC-47 · REC-62 · REC-61
-- (second half, as a deprecation) · REC-64 · REC-30 · REC-31 · REC-39 · REC-63.
--
-- REC-42…REC-46 were proven earlier tonight by REAL SIGNUPS through the branch's own
-- /auth/v1/admin/users and are not re-run here (the owner's 2026-09-18 directive: one green
-- suite per lane, no re-measuring what a BUILD-LOG row already states). REC-29's T15 run is
-- `scripts/campaign-tests/v1store_fixes_green.sql` blocks 1a-1c, which this seat RAN rather
-- than rebuilt, exactly as the resume order says.
--
-- WHAT MAKES EACH BLOCK FAIL — THE CHANGE, NAMED (rule 3):
--   1. put `billing.resolve_tier`'s old per-person body back and block 1 fails, because the
--      ON arm stops following the person's default organization.
--   2. undo `w1_org_billing_owner_columns_move_to_the_organization.sql` and block 2 fails on
--      the first column it asks for by name.
--   3. re-create `organizations_one_personal_per_creator`, or delete the
--      `platform.deprecated_relations` row, and block 3 fails.
--   4. put `context.templates.is_personal` back and block 4 fails; loosen the CHECK and 4b
--      fails, because a third audience word lands.
--   5. drop the trigger `_doctrine_field_shape_guard` and block 5 fails — that is exactly what
--      the RED twin does, deliberately.
--   6. take the `keep` arm out of `iam.legacy_column_worklist()` and block 6 fails, because
--      the personal variant's `user_id` becomes convertible.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE IN EVERY BLOCK, because a guard that refuses
-- everything passes a test made only of refusals:
--   1 pairs the ON answer with the OFF answer on the SAME person; 4 pairs the refused third
--   word with `individual` and `organization`, which both land; 5 pairs every refusal with the
--   same field declared as `user_reference` / `file`, which lands; 6 pairs each refusal with a
--   real `rename` row whose statement comes back as text.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, and its one transaction ends in
-- ROLLBACK — the disposable organization, person, template and field definitions all go with
-- it, and the one knob flip is made and unmade inside it.
--
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_org_c7.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_org_c7.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- SUITES-TIDY 2026-09-22: the private "rehearsal branch only" guard that used to stand here
-- was removed. It was one of the three that SUITE-TARGET's sweep of 110 production-only guards
-- pointed the other way and missed, so this suite refused the clone AND production and could
-- run on exactly one database no sweep is allowed to touch. The shared preamble above is the
-- only target assertion now: it accepts MAIN, the rehearsal branch or the dev clone by
-- (system_identifier, project ref) together, and a runner may pin one with `-v expect=`.

do $t$
declare
  v_org     uuid := gen_random_uuid();
  v_org2    uuid := gen_random_uuid();
  v_user    uuid;
  v_tmpl    uuid;
  v_defn    uuid;
  v_caught  text;
  v_tier    billing.tier;
  v_tier2   billing.tier;
  v_n       integer;
  v_txt     text;
  v_json    jsonb;
begin
  -- ---------------------------------------------------------------- fixtures
  -- SUITES-TIDY 2026-09-22: the slug was the literal 'cascade-electronics-recovery', which is
  -- fine on an empty rehearsal branch and collides on production's own data — a real
  -- organization of that name exists. The fixture's slug is now unique per run.
  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org, 'Cascade Electronics Recovery', 'cascade-electronics-recovery-' || left(replace(v_org::text,'-',''), 10), 'CER');

  -- SUITES-TIDY 2026-09-22: this used to take the OLDEST row in auth.users, which on the
  -- rehearsal branch was a seeded stub and on production's data is A REAL PERSON whose
  -- users.user_preferences row this fixture then writes. Test identities only.
  select u.id into v_user from auth.users u
   where u.email in ('admin@admin.com', 'test@test.com')
   order by case when u.email = 'admin@admin.com' then 0 else 1 end limit 1;
  if v_user is null then
    raise exception 'C-7: neither test identity (admin@admin.com / test@test.com) exists on this database';
  end if;

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, v_user, 'owner', 'active');

  -- The extensibility layer's own guard (`_guard_definition`) refuses a custom_entity field
  -- whose definition does not exist, so the fixture creates a real one to hang fields on.
  insert into platform.custom_entity_definition (id, slug, name, name_plural, organization_id)
  values (gen_random_uuid(), 'client-sites', 'Client Site', 'Client Sites', v_org)
  returning id into v_defn;

  -- SUITES-TIDY 2026-09-22: users.user_preferences carries a NOT NULL organization_id on
  -- production (it did not on the rehearsal branch this suite was written against).
  insert into users.user_preferences (user_id, organization_id, preferences, default_organization_id)
  values (v_user, v_org, '{}'::jsonb, v_org)
  on conflict (user_id) do update set default_organization_id = excluded.default_organization_id;

  -- ============================ 1. REC-47 as the 2026-09-19 ruling (F2) left it, and REC-62
  -- SUITES-TIDY 2026-09-22 — REWRITTEN, because the law this block used to assert is GONE.
  -- It asserted REC-47 as written in Wave 1: "the person's tier IS their default
  -- organization's tier", and proved that with the guard ON `billing.resolve_tier(user)`
  -- answered premium from the organization's plan. The 2026-09-19 ruling (F2) SUPERSEDED that
  -- and the live function says so in its own body: `iam.default_organization_id` answers with
  -- a stored preference or "the oldest organization you are an active member of" — a pick
  -- nobody made — and entitlements decided from a pick nobody made is the expensive form of
  -- the defect. So the USER-keyed door now answers 'free' EXPLICITLY, names the remedy in a
  -- notice, and the organization-keyed answer lives in
  -- `billing.resolve_effective_tier(user, org)`. This block asserts THAT, on both arms of the
  -- knob, which is what the system actually does today.
  -- SUITES-TIDY 2026-09-22: the clauses below take the identity's CURRENT answer as the
  -- baseline instead of asserting the constant 'free'. On an empty rehearsal branch the test
  -- identity had no plan; on production's own data admin@admin.com holds the pre-launch
  -- complimentary grant and legitimately answers premium. What this block is about is whether
  -- a default organization is substituted into the user-keyed answer — a delta — not what
  -- that answer happens to be.
  v_tier := billing.resolve_tier(v_user);          -- the OFF arm: the legacy per-person lane

  -- The ON arm, read BEFORE the organization has any plan. This is the ruled lane: with no
  -- organization in scope it answers free and says so in a notice.
  update platform.feature_knob set value = 'true'::jsonb where feature = 'custom' and key = 'signup_provisioning_guard';
  v_tier2 := billing.resolve_tier(v_user);
  if v_tier2 <> 'free' then
    raise exception 'C-7 1a: with the guard ON and no organization in scope the user-keyed door answered % instead of free', v_tier2;
  end if;

  -- Now the person's DEFAULT ORGANIZATION is given a premium plan. Under the superseded law
  -- this alone made them premium through this door. It must not move the answer at all.
  insert into billing.org_plan (organization_id, tier, source, note)
  values (v_org, 'premium', 'complimentary', 'C-7 fixture — Cascade Electronics Recovery');

  if billing.resolve_tier(v_user) <> v_tier2 then
    raise exception 'C-7 1b: the user-keyed door moved from % to % when the person''s DEFAULT ORGANIZATION was given a premium plan. The 2026-09-19 ruling says it substitutes nothing — a default organization is a display preference, not an entitlement source.', v_tier2, billing.resolve_tier(v_user);
  end if;

  -- THE SECOND INPUT WITH A DIFFERENT EXPECTED VALUE: the same person, the same plan, asked
  -- through the ORGANIZATION-keyed door, carries the organization's premium. Without this
  -- clause 1b would pass on a function that had simply stopped answering anything.
  if billing.resolve_effective_tier(v_user, v_org) <> 'premium' then
    raise exception 'C-7 1c: the organization-keyed door did not carry the organization''s premium plan (got %)', billing.resolve_effective_tier(v_user, v_org);
  end if;

  -- and the SECOND CONTROL: an organization with no plan of its own adds nothing, so 1c is
  -- the organization's plan being read and not a constant.
  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org2, 'Cascade Electronics Recovery — Tacoma yard',
          'cascade-electronics-recovery-tacoma-' || left(replace(v_org2::text,'-',''), 10), 'CTY');
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org2, 'organization', v_org2, v_user, 'owner', 'active');
  if billing.resolve_effective_tier(v_user, v_org2) <> v_tier2 then
    raise exception 'C-7 1d: an organization with NO plan changed the answer from % to %', v_tier2, billing.resolve_effective_tier(v_user, v_org2);
  end if;

  update platform.feature_knob set value = 'false'::jsonb where feature = 'custom' and key = 'signup_provisioning_guard';
  if billing.resolve_tier(v_user) <> v_tier then
    raise exception 'C-7 1e: the OFF path did not come back to %', v_tier;
  end if;
  raise notice 'GREEN 1 — REC-47 as ruled 2026-09-19: with the guard ON the user-keyed door answers free and does NOT move when the default organization is given a premium plan; the organization-keyed door carries that same plan (premium) while an organization with no plan adds nothing; the OFF arm comes back to the legacy per-person answer (%). REC-62: the plan is the organization''s.', v_tier;

  -- ====== 2. REC-62 — the columns are the org's — MOVED OUT, SUITES-TIDY 2026-09-22 ======
  -- This block asserted that billing.customer / billing.subscription / billing.connect_account
  -- key on `organization_id`. That rename lives in
  -- migrations/campaign/w1_org_billing_owner_columns_move_to_the_organization.sql, which is
  -- `-- target: branch` and was HELD for an attended step: it renames and drops live columns
  -- and re-points live foreign keys, which is not additive. It landed on the rehearsal branch
  -- and has NEVER been applied to the main database, so on production (and therefore on the
  -- clone, which is production's data) those three tables still carry `user_id` / `org_id`.
  -- Measured on the clone 2026-09-22: 0 of the 3 columns exist.
  --
  -- A whole suite that refuses to run because ONE of its six laws has not shipped guards
  -- nothing, so this block now lives in its own file, `w1_org_c7_billing_columns.sql`, which
  -- DECLARES those three columns to the preamble and SKIPS by name — loudly, never as a pass —
  -- until the move is applied. The remaining five blocks here now assert on every target.

  -- ====== 3 & 4. REC-61 and REC-64 — MOVED OUT, SUITES-TIDY 2026-09-22 ======
  -- Block 3 asserted that `iam.organizations_one_personal_per_creator` is GONE and the
  -- deprecation of `is_personal` is registered; block 4 asserted that `context.templates`
  -- carries an `audience` WORD. Both ship in W1-ORG migrations that are `-- target: branch`
  -- and were held for an attended step; neither has been applied to the main database.
  -- Measured on the clone (production's data) 2026-09-22: the partial unique index is still
  -- there, `platform.deprecated_relations` has no row for it, `iam.is_personal_dependents()`
  -- does not exist, and `context.templates.is_personal` is still a column.
  --
  -- They now live in `w1_org_c7_is_personal_deprecation.sql`, which declares those objects to
  -- the preamble and SKIPS by name — never as a pass — where the wave has not landed. What is
  -- left in this file (blocks 1, 5 and 6) asserts on every legal target.

  -- ============================== 5. REC-30 / REC-31 / REC-39 — a value never stands in for a relation
  -- SUITES-TIDY 2026-09-22: this block used to flip `platform.feature_knob` row
  -- custom/entity_custom_fields_guard. GUARD-SWITCH (2026-09-19) moved this guard onto the
  -- SAME switch the rest of the custom-fields layer follows — the live trigger body reads
  -- `custom.store_is_open(new.organization_id)` and nothing else — so that flip stopped being
  -- the switch and the block's "knob OFF, everything lands" clause asserted nothing. The
  -- switch is now flipped where it actually lives: an organization-scoped override of
  -- custom/system_enabled, on this fixture's own disposable organization, inside the same
  -- rolled-back transaction. Nothing outside this transaction is touched, so no live crew can
  -- go dark (that is what scripts/lib/borrow-live-switch.sh exists for, and why it is not
  -- needed here).
  --
  -- ON is the state the fixture organization is already in: LIMITS-FIX (2026-09-21) answers
  -- `store_is_open` with true for an organization born after the ruling that has said nothing,
  -- which this one is. The clause asserts that rather than assuming it.
  if not custom.store_is_open(v_org) then
    raise exception 'C-7 5.0: Cascade Electronics Recovery''s record store is not open, so nothing below would be testing the guard';
  end if;

  -- REC-30: a person declared as text is refused; the same field as user_reference lands.
  v_caught := null;
  begin
    insert into platform.custom_field_definition
      (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
    values ('custom_entity', v_defn, 'owner_email', 'Owner email', 'email', v_org);
  exception when check_violation then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like 'REC-30%' then
    raise exception 'C-7 5a: a person stored as a value was not refused by REC-30 (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;

  -- REC-31: a picture declared as a url is refused.
  v_caught := null;
  begin
    insert into platform.custom_field_definition
      (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
    values ('custom_entity', v_defn, 'avatar_url', 'Avatar URL', 'url', v_org);
  exception when check_violation then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like 'REC-31%' then
    raise exception 'C-7 5b: a picture stored as a value was not refused by REC-31 (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;

  -- REC-39: a per-person field on a shared table is refused whatever its type is.
  v_caught := null;
  begin
    insert into platform.custom_field_definition
      (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
    values ('custom_entity', v_defn, 'my_rating', 'My rating', 'number', v_org);
  exception when check_violation then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like 'REC-39%' then
    raise exception 'C-7 5c: a per-person field was not refused by REC-39 (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;

  -- REC-39 again, declared rather than spelled: display_config says so.
  v_caught := null;
  begin
    insert into platform.custom_field_definition
      (target_kind, target_definition_id, field_key, display_name, field_type, organization_id, display_config)
    values ('custom_entity', v_defn, 'rating', 'Rating', 'number', v_org, '{"per_user": true}'::jsonb);
  exception when check_violation then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like 'REC-39%' then
    raise exception 'C-7 5d: a field that DECLARES itself per-person was not refused (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;

  -- THE POSITIVE CONTROLS. The same two fields, declared as the relation they are, LAND.
  insert into platform.custom_field_definition
    (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
  values ('custom_entity', v_defn, 'owner_email', 'Owner', 'user_reference', v_org);
  insert into platform.custom_field_definition
    (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
  values ('custom_entity', v_defn, 'avatar_url', 'Avatar', 'file', v_org);
  -- and an ordinary field with none of the three words lands as plain text
  insert into platform.custom_field_definition
    (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
  values ('custom_entity', v_defn, 'invoice_number', 'Invoice number', 'text', v_org);

  -- THE SWITCH, OFF for this organization only: the very field REC-31 refused now lands
  -- untouched. The guard is a switch, not a wall.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'false'::jsonb,
          'C-7 block 5 — the OFF arm, inside a rolled-back transaction');
  if custom.store_is_open(v_org) then
    raise exception 'C-7 5e: the organization-scoped override did not close the switch, so the OFF arm below proves nothing';
  end if;
  insert into platform.custom_field_definition
    (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
  values ('custom_entity', v_defn, 'photo_url', 'Photo URL', 'url', v_org);
  raise notice 'GREEN 5 — REC-30/31/39: a person as a value, a picture as a value and a per-person field (spelled AND declared) are each refused by their own rule; the same fields typed user_reference and file land, an unrelated text field lands, and with this organization''s record store switched OFF the refused field lands untouched';

  -- ============================================== 6. REC-63 — the work list and the one verb
  select count(*) into v_n from iam.legacy_column_worklist();
  if v_n = 0 then
    raise exception 'C-7 6a: the legacy-column work list is empty, which would mean REC-63 is already done';
  end if;

  -- the trap: the personal variant's user_id is `keep`, and the verb refuses it by name
  select w.schema_name || '.' || w.table_name into v_txt
    from iam.legacy_column_worklist() w where w.disposition = 'keep' limit 1;
  if v_txt is null then
    raise exception 'C-7 6b: no personal-variant table was marked keep, so a sweep would rename the access owner';
  end if;
  v_caught := null;
  begin
    perform iam.converge_legacy_column(split_part(v_txt, '.', 1), split_part(v_txt, '.', 2), 'user_id', true);
  exception when check_violation then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like '%access owner%' then
    raise exception 'C-7 6c: the verb did not refuse the personal variant''s user_id (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;

  -- the positive control: a real `rename` row comes back as a statement and CHANGES NOTHING,
  -- because p_execute defaults to false.
  select w.schema_name || '.' || w.table_name || '.' || w.legacy_column into v_txt
    from iam.legacy_column_worklist() w where w.disposition = 'rename' limit 1;
  v_txt := iam.converge_legacy_column(split_part(v_txt, '.', 1), split_part(v_txt, '.', 2),
                                      split_part(v_txt, '.', 3));
  if v_txt not like 'alter table%rename column%' then
    raise exception 'C-7 6d: a rename row did not return its statement (got %)', v_txt;
  end if;

  -- and the switch: even a valid rename cannot EXECUTE while the knob is off
  v_caught := null;
  begin
    select w.schema_name || '.' || w.table_name || '.' || w.legacy_column into v_txt
      from iam.legacy_column_worklist() w where w.disposition = 'rename' limit 1;
    perform iam.converge_legacy_column(split_part(v_txt, '.', 1), split_part(v_txt, '.', 2),
                                       split_part(v_txt, '.', 3), true);
  exception when check_violation then get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like '%switched off%' then
    raise exception 'C-7 6e: a rename executed with custom/entity_types_guard off (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  raise notice 'GREEN 6 — REC-63: the work list is live, the personal variant''s user_id is kept and refused by name, a real rename returns its statement without running, and nothing executes while the knob is off';
end $t$;

rollback;
