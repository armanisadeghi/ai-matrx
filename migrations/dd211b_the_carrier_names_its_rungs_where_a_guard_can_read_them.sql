-- dd211b_the_carrier_names_its_rungs_where_a_guard_can_read_them
-- DD-211, immediately after dd211_the_agent_rung_on_a_write_is_real.sql.
--
-- ═══ WHAT RUNNING THE GUARD FOUND ═════════════════════════════════════════
-- dd211 assembled the rung array into a local variable and passed `scopes` to
-- both `knob_resolve` calls. Behaviourally identical — and it took the carrier
-- out of BOTH guards' reach in one move:
--
--   pnpm check:knob-resolve-callers, at dd211:
--     [NOTE] 6 call site(s) pass an expression this guard cannot read …
--       catalog platform._stamp_actor_tier:132 — p_scopes = scopes
--       catalog platform._stamp_actor_tier:134 — p_scopes = scopes
--     [ OK ] 18 knob_resolve call site(s) …      (it was 20 before dd211)
--
-- DD-198's guard proves a call site passes an ARRAY by READING the argument.
-- `scopes` is a name, so the two call sites that raised `22023 cannot extract
-- elements from an object` on every AI insert in an organization — the exact
-- defect DD-198 exists to prevent coming back — dropped from `ok` into the
-- unreadable NOTE tier, where nothing fails and nothing is proven. DD-211's own
-- rung census (which reads the SAME argument to answer "does any reader name
-- the `agent` rung?") would have been blind in the same way.
--
-- A variable that makes a guard look away is worse than the duplication it
-- saved. The expression is inlined at both call sites — the shape DD-198 blessed
-- and `content_ir.edit_kind_instance_value` already uses — so the text at the
-- call site says which rungs this read stands on, and both guards can read it.
--
-- Body otherwise byte-identical to dd211's. Still SECURITY INVOKER, still the
-- same attachments (asserted), and the same five-case behaviour is re-proven
-- below rather than assumed from the previous file.

CREATE OR REPLACE FUNCTION platform._stamp_actor_tier()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  has_upd_tier     boolean;
  has_upd_sys      boolean;
  has_crt_tier     boolean;
  has_crt_sys      boolean;
  has_confirmation boolean;
  has_conf_by      boolean;
  has_conf_at      boolean;
  table_scope_id   uuid;
  tier             text;
  raw_tier         text;
  sys              text;
  agent_id         uuid;
  patch            jsonb := '{}'::jsonb;
  row_json         jsonb;
  org              uuid;
  actor            uuid;
  born             text;
BEGIN
  -- Read live from pg_attribute on every firing: this is the catalog, not a cache,
  -- so it already sees a column added earlier in this transaction.  Every column this
  -- function writes is tested for on its own, because the write below is now a direct
  -- field assignment and a missing column is an error rather than a silent skip.
  SELECT bool_or(attname = 'updated_by_tier'),
         bool_or(attname = 'updated_by_system'),
         bool_or(attname = 'created_by_tier'),
         bool_or(attname = 'created_by_system'),
         bool_or(attname = 'confirmation'),
         bool_or(attname = 'confirmed_by'),
         bool_or(attname = 'confirmed_at')
    INTO has_upd_tier, has_upd_sys, has_crt_tier, has_crt_sys,
         has_confirmation, has_conf_by, has_conf_at
    FROM pg_attribute
   WHERE attrelid = TG_RELID
     AND attname IN ('updated_by_tier', 'updated_by_system', 'created_by_tier',
                     'created_by_system', 'confirmation', 'confirmed_by', 'confirmed_at')
     AND NOT attisdropped;

  -- Column-guarded: inert on every table that does not carry what it writes. That guard is what
  -- makes this trigger legal on a `component`, where _stamp_actor is forbidden (db-rules §6d-1).
  IF NOT COALESCE(has_upd_tier, false)
     AND NOT (COALESCE(has_crt_tier, false) AND TG_OP = 'INSERT')
     AND NOT (COALESCE(has_confirmation, false) AND TG_OP = 'INSERT') THEN
    RETURN NEW;
  END IF;

  raw_tier := platform.declared_actor_tier();
  sys      := platform.actor_system();
  -- DD-211: WHICH AGENT, when one is writing. Three current_setting() reads, no SPI,
  -- no catalog probe -- the per-row cost FEATURE.md §2 measures is a round trip, and
  -- this is not one.
  agent_id := platform.declared_actor_agent();

  -- Chair R-A/R-B: the RAW declaration first, so a client's x-matrx-actor-tier header reaches the
  -- tier columns. platform.actor_tier() remains the fallback for the *_by_tier columns only, so
  -- nothing that worked before wf_044 changes.
  tier := COALESCE(raw_tier, platform.actor_tier());

  -- wf_051 / V-45 §6: an agent must name itself; a person needs no system. `platform.actor_system()`
  -- resolves to `platform.declared_actor_system()` alone (matrx-frontend's
  -- dd131_actor_system_no_person_header.sql) — NULL here means genuinely undeclared, on whichever
  -- channel this write arrived on. A `human` tier is exempt on purpose: its NULL system is the
  -- chair's ruling, not a gap.
  IF tier IN ('ai', 'code') AND sys IS NULL THEN
    RAISE EXCEPTION
      'This write declares actor_tier=%, but names no actor_system. An agent or automated write must say WHICH agent/system it is (x-matrx-actor-system on the client channel, or the app.actor_system GUC on a server channel) — a person''s write needs no system at all, but "an AI did it" with no name is not provenance. Table: %.%',
      tier, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  -- DD-211: a PERSON'S write carries no agent. "A person did this" and "agent X did
  -- this" are two different authors, and a row cannot have both -- accepting the pair
  -- would let a human-tier write borrow an agent's born-confirmed exception.
  IF tier = 'human' AND agent_id IS NOT NULL THEN
    RAISE EXCEPTION
      'This write declares actor_tier=human AND an actor_agent (%). A person''s write carries no agent: either the person is the author (drop the x-matrx-actor-agent header / the app.actor_agent GUC) or the agent is (declare actor_tier=ai and the agent that is running). Table: %.%',
      agent_id, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(has_upd_tier, false) THEN
    patch := patch || jsonb_build_object('updated_by_tier', tier);
    IF COALESCE(has_upd_sys, false) THEN
      patch := patch || jsonb_build_object('updated_by_system', sys);
    END IF;
  END IF;
  IF COALESCE(has_crt_tier, false) AND TG_OP = 'INSERT' THEN
    patch := patch || jsonb_build_object('created_by_tier', tier);
    IF COALESCE(has_crt_sys, false) THEN
      patch := patch || jsonb_build_object('created_by_system', sys);
    END IF;
  END IF;

  -- ---- DD-131: the confirmation branch, INSERT only (wf_046/wf_048, unchanged by wf_051). -----
  -- UPDATE never moves the value here: every transition is a named action with its own door (§3).
  IF COALESCE(has_confirmation, false) AND TG_OP = 'INSERT' THEN
    table_scope_id := platform._confirmation_admission(TG_RELID);

    IF table_scope_id IS NULL THEN
      -- The column exists but this table is not admitted (or is not registered at all). Write
      -- the only value that is TRUE of such a row -- nobody has confirmed it -- so the flag can
      -- be turned off again without bricking the table (wf_048).
      born  := 'unconfirmed';
      patch := patch || jsonb_build_object('confirmation', born);
      IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', NULL); END IF;
      IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', NULL); END IF;
    ELSE
      row_json := to_jsonb(NEW);
      org   := NULLIF(row_json ->> 'organization_id', '')::uuid;
      actor := COALESCE(NULLIF(current_setting('app.user_id', true), '')::uuid, auth.uid());

      IF raw_tier = 'human' THEN
        -- A person declared themselves the author. Writing it is standing behind it.
        born := 'confirmed';
      ELSIF raw_tier IN ('ai', 'code') THEN
        -- Born confirmed ONLY when a person decided that in advance, at BOTH rungs (§3.3, §4.2
        -- keys 1 and 2). They are a conjunction across different rungs, so no precedence race.
        --
        -- DD-198 shape: an ARRAY of {kind, id}. DD-211: the rungs are WRITTEN OUT at the call
        -- site -- the table always, and the AGENT too when one is writing -- so that both the
        -- array guard and the rung census can READ which rungs this read stands on. A local
        -- variable here made this call site unreadable to both (dd211b's header). knob_resolve
        -- filters every candidate override by the knob's own `overridable_by`, so naming both
        -- rungs on both keys can never cross them over.
        IF  COALESCE((platform.knob_resolve('records', 'confirmation.agent_write_born_confirmed',
                        org, NULL,
                        CASE WHEN agent_id IS NULL
                             THEN jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))
                             ELSE jsonb_build_array(jsonb_build_object('kind', 'agent', 'id', agent_id),
                                                    jsonb_build_object('kind', 'table', 'id', table_scope_id))
                        END))::text::boolean, false)
        AND COALESCE((platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                        org, NULL,
                        CASE WHEN agent_id IS NULL
                             THEN jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))
                             ELSE jsonb_build_array(jsonb_build_object('kind', 'agent', 'id', agent_id),
                                                    jsonb_build_object('kind', 'table', 'id', table_scope_id))
                        END))::text::boolean, false)
        THEN
          born := 'confirmed';
        ELSE
          born := 'unconfirmed';
        END IF;
      ELSE
        -- raw_tier IS NULL: a server channel that declared nothing. Fail SAFE and fail LOUD.
        born := 'unconfirmed';
        PERFORM platform._report_undeclared_confirmation_write(TG_RELID, org, actor);
      END IF;

      -- Unconditional: no API, no RPC, no client and no agent may pass `confirmation`,
      -- `confirmed_by` or `confirmed_at` (§2.2 rule 3).
      patch := patch || jsonb_build_object('confirmation', born);
      IF born = 'confirmed' THEN
        IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', actor); END IF;
        IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', now()); END IF;
      ELSE
        IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', NULL); END IF;
        IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', NULL); END IF;
      END IF;
    END IF;
  END IF;

  IF patch = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- DD-184: apply the patch by DIRECT FIELD ASSIGNMENT. `jsonb_populate_record(NEW, patch)`
  -- rebuilds the whole row from a TupleDesc cached at this call site's first firing in the
  -- transaction, which silently NULLs any column added after that.  Each key is present only
  -- when the column exists (checked against pg_attribute above), so no assignment can raise.
  IF patch ? 'updated_by_tier'   THEN NEW.updated_by_tier   := patch ->> 'updated_by_tier';   END IF;
  IF patch ? 'updated_by_system' THEN NEW.updated_by_system := patch ->> 'updated_by_system'; END IF;
  IF patch ? 'created_by_tier'   THEN NEW.created_by_tier   := patch ->> 'created_by_tier';   END IF;
  IF patch ? 'created_by_system' THEN NEW.created_by_system := patch ->> 'created_by_system'; END IF;
  IF patch ? 'confirmation'      THEN NEW.confirmation      := patch ->> 'confirmation';      END IF;
  IF patch ? 'confirmed_by'      THEN NEW.confirmed_by      := (patch ->> 'confirmed_by')::uuid; END IF;
  IF patch ? 'confirmed_at'      THEN NEW.confirmed_at      := (patch ->> 'confirmed_at')::timestamptz; END IF;

  RETURN NEW;
END
$function$;

-- ---------------------------------------------------------------------------
-- The same five cases, re-proven against the real database and cleaned up.
-- Identical in shape to dd211's block: a rewrite is never assumed to have kept
-- what the previous one proved.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org        uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin's Workspace
  v_actor      uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com
  v_agent      uuid;
  v_sibling    uuid;
  v_table      uuid;
  v_def        uuid;
  v_defver     integer;
  v_conf       text;
  v_id         uuid;
  v_attach_before bigint;
  v_attach_after  bigint;
  v_left       bigint;
  v_probes     uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT count(*) INTO v_left FROM platform.knob_override WHERE feature = 'records';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd211b: % `records` override row(s) already exist. This file plants and removes its own; it will not run beside overrides it cannot safely restore.', v_left;
  END IF;

  SELECT count(*) INTO v_attach_before
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform' AND p.proname = '_stamp_actor_tier' AND NOT t.tgisinternal;

  SELECT id INTO v_table FROM platform.entity_types WHERE confirmation_enabled LIMIT 1;
  SELECT id, version INTO v_def, v_defver
    FROM content_ir.kind_definition WHERE is_active AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_agent FROM agent.definition
   WHERE organization_id = v_org AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO v_sibling FROM agent.definition
   WHERE organization_id = v_org AND deleted_at IS NULL AND id <> v_agent ORDER BY created_at LIMIT 1;
  IF v_table IS NULL OR v_def IS NULL OR v_agent IS NULL OR v_sibling IS NULL THEN
    RAISE EXCEPTION 'dd211b: the subjects this proof needs (an admitted table, an active kind, two agents in admin''s Workspace) are not all present. Nothing was asserted.';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_actor::text, 'role', 'authenticated')::text, true);
  PERFORM platform.knob_override_set('records', 'confirmation.agent_write_born_confirmed',
            'agent', v_agent, v_org, to_jsonb(true), 'dd211b self-proof');
  PERFORM platform.knob_override_set('records', 'confirmation.table_allows_born_confirmed',
            'table', v_table, v_org, to_jsonb(true), 'dd211b self-proof');
  PERFORM set_config('app.user_id', v_actor::text, true);
  PERFORM set_config('app.actor_tier', 'ai', true);
  PERFORM set_config('app.actor_system', 'dd211b_self_proof', true);

  PERFORM set_config('app.actor_agent', v_agent::text, true);
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                        validation_status, organization_id, created_by)
  VALUES (v_def, v_defver, '{"dd211b":"granted agent"}'::jsonb, 'dd211b self-proof',
          'passed', v_org, v_actor)
  RETURNING id, confirmation::text INTO v_id, v_conf;
  v_probes := v_probes || v_id;
  IF v_conf <> 'confirmed' THEN
    RAISE EXCEPTION 'dd211b assertion — the granted agent''s write came out %, not confirmed. The inlined rungs are not reaching knob_resolve.', v_conf;
  END IF;

  PERFORM set_config('app.actor_agent', v_sibling::text, true);
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                        validation_status, organization_id, created_by)
  VALUES (v_def, v_defver, '{"dd211b":"sibling agent"}'::jsonb, 'dd211b self-proof',
          'passed', v_org, v_actor)
  RETURNING id, confirmation::text INTO v_id, v_conf;
  v_probes := v_probes || v_id;
  IF v_conf <> 'unconfirmed' THEN
    RAISE EXCEPTION 'dd211b assertion — a SIBLING agent''s write came out %, not unconfirmed.', v_conf;
  END IF;

  PERFORM set_config('app.actor_agent', '', true);
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                        validation_status, organization_id, created_by)
  VALUES (v_def, v_defver, '{"dd211b":"no agent"}'::jsonb, 'dd211b self-proof',
          'passed', v_org, v_actor)
  RETURNING id, confirmation::text INTO v_id, v_conf;
  v_probes := v_probes || v_id;
  IF v_conf <> 'unconfirmed' THEN
    RAISE EXCEPTION 'dd211b assertion — an undeclared-agent AI write came out %. Table-only behaviour changed; it must not.', v_conf;
  END IF;

  PERFORM platform.knob_override_set('records', 'confirmation.agent_write_born_confirmed',
            'organization', v_org, v_org, to_jsonb(true), 'dd211b self-proof');
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                        validation_status, organization_id, created_by)
  VALUES (v_def, v_defver, '{"dd211b":"org rung"}'::jsonb, 'dd211b self-proof',
          'passed', v_org, v_actor)
  RETURNING id, confirmation::text INTO v_id, v_conf;
  v_probes := v_probes || v_id;
  IF v_conf <> 'confirmed' THEN
    RAISE EXCEPTION 'dd211b assertion — the ORGANIZATION rung came out %, not confirmed.', v_conf;
  END IF;
  PERFORM platform.knob_override_set('records', 'confirmation.agent_write_born_confirmed',
            'organization', v_org, v_org, NULL, 'dd211b self-proof cleanup');

  PERFORM set_config('app.actor_tier', 'human', true);
  PERFORM set_config('app.actor_system', '', true);
  PERFORM set_config('app.actor_agent', v_agent::text, true);
  BEGIN
    INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                          validation_status, organization_id, created_by)
    VALUES (v_def, v_defver, '{"dd211b":"human + agent"}'::jsonb, 'dd211b self-proof',
            'passed', v_org, v_actor)
    RETURNING id INTO v_id;
    v_probes := v_probes || v_id;
    RAISE EXCEPTION 'dd211b assertion — a human-tier write carrying an agent was ACCEPTED.';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  PERFORM set_config('app.actor_agent', '', true);
  PERFORM set_config('app.actor_tier', '', true);
  PERFORM set_config('app.actor_system', '', true);
  PERFORM platform.knob_override_set('records', 'confirmation.agent_write_born_confirmed',
            'agent', v_agent, v_org, NULL, 'dd211b self-proof cleanup');
  PERFORM platform.knob_override_set('records', 'confirmation.table_allows_born_confirmed',
            'table', v_table, v_org, NULL, 'dd211b self-proof cleanup');
  DELETE FROM content_ir.kind_instance WHERE id = ANY (v_probes);
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO v_left FROM platform.knob_override WHERE feature = 'records';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd211b: % `records` override row(s) survived the self-proof. Not clean.', v_left;
  END IF;
  SELECT count(*) INTO v_left FROM content_ir.kind_instance WHERE id = ANY (v_probes);
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd211b: % probe record(s) survived the self-proof. Not clean.', v_left;
  END IF;

  SELECT count(*) INTO v_attach_after
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform' AND p.proname = '_stamp_actor_tier' AND NOT t.tgisinternal;
  IF v_attach_after <> v_attach_before THEN
    RAISE EXCEPTION 'dd211b: the carrier''s trigger attachments went from % to %.', v_attach_before, v_attach_after;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'platform' AND p.proname = '_stamp_actor_tier' AND p.prosecdef) THEN
    RAISE EXCEPTION 'dd211b: platform._stamp_actor_tier came back SECURITY DEFINER.';
  END IF;

  -- The point of this file: the argument is READABLE where it is passed.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'platform' AND p.proname = '_stamp_actor_tier'
       AND p.prosrc !~ 'jsonb_build_object\(''kind'', ''agent'''
  ) THEN
    RAISE EXCEPTION 'dd211b: the carrier does not name the `agent` rung in its own text, so no guard can read which rungs it stands on.';
  END IF;

  RAISE NOTICE 'dd211b: the carrier names its rungs inline — granted agent confirmed, sibling unconfirmed, no-agent and org-rung unchanged, human+agent refused; % attachments preserved, 0 overrides and 0 probe rows left.', v_attach_after;
END
$$;
