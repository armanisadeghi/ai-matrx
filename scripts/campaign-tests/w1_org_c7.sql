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

begin;

do $b$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'w1_org_c7.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $b$;

do $t$
declare
  v_org     uuid := gen_random_uuid();
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
  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org, 'ZZ W1ORG C7', 'zz-w1org-c7', 'ZZC');

  select u.id into v_user from auth.users u order by u.created_at limit 1;
  if v_user is null then
    raise exception 'C-7: the branch has no auth.users row to resolve a tier for';
  end if;

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, v_user, 'owner', 'active');

  -- The extensibility layer's own guard (`_guard_definition`) refuses a custom_entity field
  -- whose definition does not exist, so the fixture creates a real one to hang fields on.
  insert into platform.custom_entity_definition (id, slug, name, name_plural, organization_id)
  values (gen_random_uuid(), 'zz-c7-thing', 'ZZ C7 Thing', 'ZZ C7 Things', v_org)
  returning id into v_defn;

  insert into users.user_preferences (user_id, preferences, default_organization_id)
  values (v_user, '{}'::jsonb, v_org)
  on conflict (user_id) do update set default_organization_id = excluded.default_organization_id;

  -- ============================================ 1. REC-47 / REC-62 — tier through the org plan
  -- OFF: today's per-person answer. The person has no user_plan and no subscription, so `free`.
  v_tier := billing.resolve_tier(v_user);
  if v_tier <> 'free' then
    raise exception 'C-7 1a: with the guard OFF the legacy answer changed (got %)', v_tier;
  end if;

  -- Give the DEFAULT ORGANIZATION a premium plan and turn the guard ON. The person's tier must
  -- now be premium WITHOUT a single per-person row existing anywhere.
  -- plan_id is a FK into billing.plan, which holds ZERO rows on the branch; the tier is what
  -- resolves, so the fixture leaves the catalogue pointer null rather than inventing a plan.
  insert into billing.org_plan (organization_id, tier, source, note)
  values (v_org, 'premium', 'complimentary', 'C-7 fixture');

  update platform.feature_knob set value = 'true'::jsonb where feature = 'custom' and key = 'signup_provisioning_guard';
  v_tier2 := billing.resolve_tier(v_user);
  if v_tier2 <> 'premium' then
    raise exception 'C-7 1b: with the guard ON the tier did not follow the default organization''s plan (got %)', v_tier2;
  end if;

  -- The person belongs to the organization but is NOT its plan holder in any per-person table:
  select count(*) into v_n from billing.user_plan where user_id = v_user;
  if v_n <> 0 then
    raise exception 'C-7 1c: the fixture leaked a per-person plan row, so 1b proved nothing';
  end if;

  -- REC-62's own proof: nobody is lowered by the move.
  select count(*) into v_n from billing.tier_no_downgrade();
  if v_n <> 0 then
    raise exception 'C-7 1d: billing.tier_no_downgrade() returned % people whose tier would drop', v_n;
  end if;

  update platform.feature_knob set value = 'false'::jsonb where feature = 'custom' and key = 'signup_provisioning_guard';
  if billing.resolve_tier(v_user) <> 'free' then
    raise exception 'C-7 1e: the OFF path did not come back';
  end if;
  raise notice 'GREEN 1 — REC-47/REC-62: OFF is free, ON follows the default organization to premium with no per-person row, nobody is downgraded, OFF comes back';

  -- =================================================== 2. REC-62 — the columns are the org's
  select count(*) into v_n
    from information_schema.columns
   where (table_schema, table_name, column_name) in
         (('billing','customer','organization_id'),
          ('billing','connect_account','organization_id'),
          ('billing','subscription','organization_id'));
  if v_n <> 3 then
    raise exception 'C-7 2a: only % of the 3 billing tables carry organization_id', v_n;
  end if;
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'billing' and column_name in ('user_id','org_id')
     and table_name in ('customer','connect_account','subscription');
  if v_n <> 0 then
    raise exception 'C-7 2b: % legacy owner column(s) survive on the billing tables', v_n;
  end if;
  -- and the foreign key points at an ORGANIZATION, not at a person
  select count(*) into v_n
    from pg_constraint c
   where c.conrelid = 'billing.customer'::regclass and c.contype = 'f'
     and c.confrelid = 'iam.organizations'::regclass;
  if v_n <> 1 then
    raise exception 'C-7 2c: billing.customer.organization_id does not reference iam.organizations';
  end if;
  raise notice 'GREEN 2 — REC-62: all three billing tables key on organization_id, no user_id or org_id survives, and the FK points at iam.organizations';

  -- ============================================= 3. REC-61 — the flag records, it does not rule
  select count(*) into v_n from pg_indexes
   where schemaname = 'iam' and indexname = 'organizations_one_personal_per_creator';
  if v_n <> 0 then
    raise exception 'C-7 3a: is_personal still ENFORCES - the partial unique index is back';
  end if;
  select count(*) into v_n from platform.deprecated_relations
   where old_ref = 'iam.organizations.is_personal'
     and new_ref = 'users.user_preferences.default_organization_id';
  if v_n <> 1 then
    raise exception 'C-7 3b: the deprecation is not registered';
  end if;
  -- the work list is a QUERY and it is not empty, which is the honest state: the column stays
  -- until it is.
  select count(*) into v_n from iam.is_personal_dependents();
  if v_n = 0 then
    raise exception 'C-7 3c: the dependent list is empty, so the column should have been DROPPED, not deprecated';
  end if;
  raise notice 'GREEN 3 — REC-61: the partial unique index is gone, the deprecation is registered, and % dependents remain to rewrite', v_n;

  -- ====================================================== 4. REC-64 — the audience is a word
  insert into context.templates (key, name, category, audience)
  values ('zz-c7-individual', 'ZZ C7 Individual', 'zz', 'individual') returning id into v_tmpl;
  insert into context.templates (key, name, category, audience)
  values ('zz-c7-org', 'ZZ C7 Org', 'zz', 'organization');

  v_caught := null;
  begin
    insert into context.templates (key, name, category, audience)
    values ('zz-c7-bad', 'ZZ C7 Bad', 'zz', 'team');
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'C-7 4a: a third audience word landed';
  end if;

  v_json := public.list_templates('zz', null);
  if not exists (select 1 from jsonb_array_elements(v_json) e
                  where e ->> 'key' = 'zz-c7-individual'
                    and e ->> 'audience' = 'individual'
                    and (e ->> 'is_personal')::boolean) then
    raise exception 'C-7 4b: list_templates did not emit the word (and the derived boolean) for the individual template';
  end if;
  if not exists (select 1 from jsonb_array_elements(public.list_templates('zz', false)) e
                  where e ->> 'key' = 'zz-c7-org') then
    raise exception 'C-7 4c: the legacy boolean argument stopped selecting organization templates';
  end if;
  raise notice 'GREEN 4 — REC-64: individual and organization both land, a third word is refused by the table''s own CHECK, and list_templates emits the word while the old boolean argument still works';

  -- ============================== 5. REC-30 / REC-31 / REC-39 — a value never stands in for a relation
  update platform.feature_knob set value = 'true'::jsonb where feature = 'custom' and key = 'entity_custom_fields_guard';

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

  update platform.feature_knob set value = 'false'::jsonb where feature = 'custom' and key = 'entity_custom_fields_guard';
  -- OFF, the very field REC-31 refused lands untouched: the guard is a switch, not a wall.
  insert into platform.custom_field_definition
    (target_kind, target_definition_id, field_key, display_name, field_type, organization_id)
  values ('custom_entity', v_defn, 'photo_url', 'Photo URL', 'url', v_org);
  raise notice 'GREEN 5 — REC-30/31/39: a person as a value, a picture as a value and a per-person field (spelled AND declared) are each refused by their own rule; the same fields typed user_reference and file land, an unrelated text field lands, and with the knob OFF everything lands';

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
