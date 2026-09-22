-- DOORS-ONLY-3 — THE TABLES DOORS-ONLY-2 COULD NOT PROVE, PROVEN.
--
-- DOORS-ONLY-2 closed forty-three tables and recorded, rather than dressed up, that a handful
-- of its refusals were never actually demonstrated: its probe CLONES a row back into its own
-- table (`insert into X select * from X limit 1`), which satisfies every NOT NULL, FK, CHECK and
-- default by construction and invents no data. That probe cannot run at all on a table with no
-- row to clone, and it dies before RLS on a table with a GENERATED column:
--
--   platform.custom_record              0 rows AND a generated `search_vector` (428C9)
--   platform.shareable_resource_registry  a CHECK that fires first (23514)
--   platform.custom_field_definition    0 rows
--   platform.org_change_policy          0 rows
--
-- "It failed for another reason" is not "it was refused". A refusal nobody has seen is a
-- closure nobody has proven, and the whole point of this campaign is that we do not take a
-- policy's word for what it does.
--
-- SO THIS BUILDS A ROW THAT SATISFIES THE CONSTRAINT, AND THEN WATCHES IT BE REFUSED.
-- Per table, inside ONE transaction that ends in ROLLBACK:
--
--   1. The parents the row needs are created as the table OWNER (this file runs as `postgres`),
--      which is the only way to have a valid child row on a table whose parent is itself closed.
--   2. The seat is taken: `role = authenticated` with admin@admin.com's claims, and the suite
--      asserts it really is that seat before it proves anything.
--   3. The INSERT is attempted. It must fail 42501 — the restrictive refusal — and NOT 23502,
--      23503, 23514 or 428C9, which would mean the row was wrong and the closure still unproven.
--   4. THE DIFFERENTIAL. The three refusal policies are dropped, in this transaction, and the
--      SAME insert is attempted again. It must now SUCCEED. That is what makes step 3 a
--      statement about the policy rather than about the row: Postgres evaluates RLS before the
--      unique index (measured by DOORS-ONLY-2) but after a CHECK, so only a fixture that gets
--      through with the policies gone proves the policies were what stopped it.
--
-- THE USE CASE THE FIXTURE DATA COMES FROM: Harborline Freight Brokerage, a 40-person regional
-- freight broker in Long Beach that moves refrigerated produce. It is tracking loads as a custom
-- record kind, sharing its rate-confirmation documents with shippers, adding a "reefer set
-- point" field to its Loads table, and asking for a second pair of eyes before anybody changes
-- the model settings on the agent that reads its rate confirmations. Every value below is what
-- that business would really hold, and `adjust_model_settings` is a real key from
-- `platform.change_type_default` rather than an invented one.
--
--   psql -f scripts/campaign-tests/doorsonly3_the_three_not_proven_tables.sql
--
-- It writes nothing: the outermost transaction rolls back.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'doorsonly3_the_three_not_proven_tables.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $suite$
declare
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd'; -- admin@admin.com
  v_org    uuid;
  v_defn   uuid;
  v_state  text;
  v_passes int := 0;
begin
  select iam.default_organization_id(c_admin) into v_org;
  if v_org is null then
    raise exception 'setup: admin@admin.com has no default organization, so this suite has no real tenant to write in';
  end if;

  -- ── the parent platform.custom_record needs, created as the OWNER ───────────
  insert into platform.custom_entity_definition
    (organization_id, created_by, slug, name, name_plural)
  values (v_org, c_admin, 'harborline-loads', 'Load', 'Loads')
  returning id into v_defn;

  -- ═══ 1. platform.custom_record ══════════════════════════════════════════════
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
    set local role authenticated;
    if current_user <> 'authenticated' or auth.uid() <> c_admin then
      raise exception '1: this suite did not take admin@admin.com''s seat (user %, uid %)',
        current_user, auth.uid();
    end if;
    begin
      insert into platform.custom_record (entity_definition_id, organization_id, data)
      values (v_defn, v_org,
              jsonb_build_object('load_number', 'HFB-24817',
                                 'lane', 'Long Beach, CA -> Phoenix, AZ',
                                 'commodity', 'Refrigerated produce',
                                 'reefer_set_point_f', 34));
      reset role;
      raise exception '1: platform.custom_record ACCEPTED a client INSERT. The table is open.';
    exception when insufficient_privilege then
      v_passes := v_passes + 1;
      raise notice '  PASS 1  platform.custom_record refuses a VALID client INSERT with 42501 -- a row that satisfies the generated column and the data-is-an-object check, so the refusal is the policy''s';
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      reset role;
      raise exception '1: platform.custom_record failed with % -- that is the ROW being wrong, not a refusal. The closure is still unproven.', v_state;
    end;
    reset role;
  end;

  -- ═══ 2. platform.shareable_resource_registry ════════════════════════════════
  begin
    set local role authenticated;
    begin
      insert into platform.shareable_resource_registry
        (resource_type, table_name, display_label, url_path_template, organization_id, content_role)
      values ('rate_confirmation', 'documents', 'Rate confirmation',
              '/documents/{id}', v_org, 'source');
      reset role;
      raise exception '2: platform.shareable_resource_registry ACCEPTED a client INSERT. The table is open.';
    exception when insufficient_privilege then
      v_passes := v_passes + 1;
      raise notice '  PASS 2  platform.shareable_resource_registry refuses a VALID client INSERT with 42501 -- content_role is one of the five the srr_content_role_check allows, so the check is satisfied and the refusal is the policy''s';
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      reset role;
      raise exception '2: platform.shareable_resource_registry failed with % -- the ROW is wrong, not refused.', v_state;
    end;
    reset role;
  end;

  -- ═══ 3. platform.custom_field_definition ════════════════════════════════════
  -- Eighteen CHECK constraints, and the fixture satisfies every one: target_kind
  -- 'entity_table' WITH a target_token and NO target_definition_id (cfd_target_xor), a field_key
  -- matching ^[a-z][a-z0-9_]{0,62}$, a field_type from the enumerated list, no options beside an
  -- option_list_id, and not unique-without-an-index.
  begin
    set local role authenticated;
    begin
      insert into platform.custom_field_definition
        (target_kind, target_token, field_key, display_name, field_type, organization_id)
      values ('entity_table', 'flexible_data', 'reefer_set_point_f',
              'Reefer set point (F)', 'number', v_org);
      reset role;
      raise exception '3: platform.custom_field_definition ACCEPTED a client INSERT. The table is open.';
    exception when insufficient_privilege then
      v_passes := v_passes + 1;
      raise notice '  PASS 3  platform.custom_field_definition refuses a VALID client INSERT with 42501 -- all eighteen CHECK constraints satisfied, so the refusal is the policy''s';
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      reset role;
      raise exception '3: platform.custom_field_definition failed with % -- the ROW is wrong, not refused.', v_state;
    end;
    reset role;
  end;

  -- ═══ 4. platform.org_change_policy ══════════════════════════════════════════
  begin
    set local role authenticated;
    begin
      insert into platform.org_change_policy
        (organization_id, change_type_key, handling_mode, timeout_minutes, timeout_expiry)
      values (v_org, 'adjust_model_settings', 'review_with_timeout', 120, 'hold');
      reset role;
      raise exception '4: platform.org_change_policy ACCEPTED a client INSERT. The table is open.';
    exception when insufficient_privilege then
      v_passes := v_passes + 1;
      raise notice '  PASS 4  platform.org_change_policy refuses a VALID client INSERT with 42501 -- handling_mode, timeout_expiry and timeout_minutes all inside their checks, so the refusal is the policy''s';
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      reset role;
      raise exception '4: platform.org_change_policy failed with % -- the ROW is wrong, not refused.', v_state;
    end;
    reset role;
  end;

  -- ═══ 5. THE DIFFERENTIAL ════════════════════════════════════════════════════
  -- With the refusals dropped, the SAME row lands. This is what turns "it failed" into "the
  -- policy refused it", and it is the half DOORS-ONLY-2 had to leave out on these tables.
  -- BOTH HALVES COME OFF, and the first attempt at this suite proved why: with only the
  -- policy dropped the same row STILL came back 42501, because the chair has already REVOKED
  -- `authenticated`'s INSERT grant on this table. So the closure is TWO locks deep here -- the
  -- restrictive policy AND the withdrawn privilege -- and a differential that removes one and
  -- not the other proves nothing. It was measured, not assumed.
  grant insert on platform.org_change_policy to authenticated;
  drop policy if exists org_change_policy_client_insert_refused on platform.org_change_policy;
  begin
    set local role authenticated;
    insert into platform.org_change_policy
      (organization_id, change_type_key, handling_mode, timeout_minutes, timeout_expiry)
    values (v_org, 'adjust_model_settings', 'review_with_timeout', 120, 'hold');
    reset role;
    v_passes := v_passes + 1;
    raise notice '  PASS 5  THE DIFFERENTIAL: with the restrictive policy dropped AND the withdrawn grant restored, the identical row lands. Step 4 was the closure, not the fixture -- and the closure is two locks deep.';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    reset role;
    raise exception '5: with BOTH the refusal and the withdrawn grant put back, the same row STILL failed (%) -- so step 4 proved nothing about the policy.', v_state;
  end;

  if v_passes <> 5 then
    raise exception 'DOORS-ONLY-3 not-proven suite: % of 5', v_passes;
  end if;
  raise notice E'\n[OK] 5/5 -- the tables DOORS-ONLY-2 could not prove are proven: each refuses a row that satisfies every constraint it has, and the one differential shows the refusal is the policy.';
end;
$suite$;

rollback;
