-- dd211_the_agent_rung_on_a_write_is_real
-- DD-211 — "an agent's write carries the agent, so an agent-level born-confirmed
-- exception is real".
--
-- ═══ WHAT V-64 FOUND (the finding this file closes) ════════════════════════
-- `records.confirmation.agent_write_born_confirmed` has
-- `overridable_by = {organization, agent}`, so DD-183's rung picker offers
-- "Exceptions by … agents" on it and `platform.knob_override_set` accepts the
-- write happily (`{"ok":true,"origin":"agent_override","effective_value":true}`).
-- Its ONLY reader anywhere is `platform._stamp_actor_tier`, and that function
-- names a `table` rung and nothing else — because until this file NOTHING in
-- the database could say WHICH AGENT was writing. Measured live 2026-09-13 in a
-- rolled-back transaction, as role `authenticated` with admin@admin.com's
-- claims, agent `92c37a37-…` in `admin's Workspace`:
--
--   agent rung set to true              -> {"ok": true, "origin": "agent_override"}
--   table rung set to true              -> {"ok": true, "origin": "table_override"}
--   knob_resolve(… [{"kind":"table"}])  -> false      <- what the carrier asked
--   knob_resolve(… [{"kind":"agent"}])  -> true       <- what the person set
--   AI-tier INSERT into content_ir.kind_instance -> confirmation = 'unconfirmed'
--   platform functions able to read an agent declaration: 0
--
-- So an org admin could turn "this agent's writes are born confirmed" on, see it
-- saved and listed, and it would never change a single row. That is law 4 from
-- the other side: a control that accepts a value nothing honours.
--
-- ═══ THE SMALLEST HONEST FIX ══════════════════════════════════════════════
-- A third declared-actor value beside tier and system, carried the SAME way and
-- by the same rules (DD-176 R-A/R-B, dd131, dd190):
--
--   * `platform.declared_actor_agent()` — the GUC `app.actor_agent` on EVERY
--     channel; the header `x-matrx-actor-agent` on the CLIENT channel only
--     (`current_user = 'authenticated'`), so a forged header on a server channel
--     is inert by construction. Malformed => WARNING + NULL, never a raise and
--     never a guess.
--   * A PERSON'S WRITE HAS NO AGENT. Declaring both `human` and an agent is a
--     contradiction and is refused with a sentence, exactly as an `ai` write
--     with no system already is (wf_051). Nothing sets `app.actor_agent` before
--     this migration, so nothing existing can trip it.
--   * `platform._stamp_actor_tier` names the agent rung BESIDE the table rung
--     when one is declared, and the table rung alone when none is. The array is
--     the DD-198 shape; `knob_resolve` filters each candidate by the knob's own
--     `overridable_by`, so passing both rungs to both keys is safe — the
--     agent rung can only ever answer `agent_write_born_confirmed` and the table
--     rung can only ever answer `table_allows_born_confirmed`.
--
-- An agent id that names no `agent.definition` row simply matches no override
-- and the write stays `unconfirmed` — fail-safe, and no per-row SPI probe is
-- added to the platform's hottest write path (the reason `_stamp_actor` and
-- `_stamp_actor_tier` are separate functions at all: FEATURE.md §2).
--
-- ═══ WHAT IS NOT CHANGED, AND WHY ═════════════════════════════════════════
-- `content_ir.edit_kind_instance_value` resolves ONE knob,
-- `records.confirmation.confirm_on_human_edit`, whose `overridable_by` is
-- `{organization, table}` — it has no agent rung, and it is the door a PERSON
-- edits through, where by the rule above there is no agent at all. It keeps the
-- table-only array DD-198 gave it. The agent rung does not apply there.
--
-- Nothing about the tier or system columns changes; no new column is added; no
-- trigger is attached or detached (the attachment count is asserted below).

-- ---------------------------------------------------------------------------
-- (1) platform.declared_actor_agent() — the third declaration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.declared_actor_agent()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  raw     text := NULLIF(current_setting('app.actor_agent', true), '');
  hdr_raw text;
  hdr     text;
BEGIN
  -- 1. The GUC is the declaration on EVERY channel, and the only one a server
  --    channel honours — exactly platform.declared_actor_tier()'s rule 1.
  IF raw IS NOT NULL THEN
    BEGIN
      RETURN raw::uuid;
    EXCEPTION WHEN others THEN
      RAISE WARNING '[provenance] invalid app.actor_agent=% — must be the uuid of an agent.definition row. Treating this write as carrying NO agent; fix the door that set it.', raw;
      RETURN NULL;
    END;
  END IF;

  -- 2. The client channel only. `authenticated` is the role PostgREST sets for a
  --    signed-in browser/extension/desktop write under RLS. On any other role
  --    this block is skipped entirely, which is what makes a forged header on a
  --    server channel inert (R-B, same as tier and system).
  IF current_user = 'authenticated' THEN
    hdr_raw := NULLIF(current_setting('request.headers', true), '');
    IF hdr_raw IS NOT NULL THEN
      BEGIN
        hdr := NULLIF(trim((hdr_raw::json) ->> 'x-matrx-actor-agent'), '');
      EXCEPTION WHEN others THEN
        RAISE WARNING '[provenance] request.headers is not JSON — ignoring the client actor-agent header for this write.';
        hdr := NULL;
      END;

      IF hdr IS NOT NULL THEN
        BEGIN
          RETURN hdr::uuid;
        EXCEPTION WHEN others THEN
          RAISE WARNING '[provenance] invalid x-matrx-actor-agent=% — must be the uuid of an agent.definition row. Treating this write as carrying NO agent.', hdr;
          RETURN NULL;
        END;
      END IF;
    END IF;

    -- No header on the client channel: a person is typing, and a person's write
    -- carries no agent.
    RETURN NULL;
  END IF;

  -- 3. A server channel that declared no agent. Most writes are exactly this.
  RETURN NULL;
END
$function$;

COMMENT ON FUNCTION platform.declared_actor_agent() IS
  'WHICH AGENT is writing, declared through the app.actor_agent GUC (every channel) or the x-matrx-actor-agent header (role authenticated only). NULL means no agent is writing — a person''s write never carries one. Read by platform._stamp_actor_tier to name the `agent` rung when resolving records.confirmation.agent_write_born_confirmed (DD-211).';

DO $$
BEGIN
  -- The other two declarations are executable by anon, authenticated and
  -- service_role; this one is read on the same write paths and must match, or a
  -- client-channel INSERT would fail on `permission denied for function`.
  EXECUTE 'grant execute on function platform.declared_actor_agent() to anon, authenticated, service_role';
END
$$;

-- ---------------------------------------------------------------------------
-- (2) platform._stamp_actor_tier — name the agent rung when an agent is writing.
--
-- Body byte-identical to the live (DD-198) definition except for: the
-- `agent_id` declaration, the read beside tier/system, the human-carries-no-agent
-- refusal, the `scopes` assembly, and the two `knob_resolve` calls now passing
-- `scopes`. Stays SECURITY INVOKER (db-rules §6d) — asserted below.
-- ---------------------------------------------------------------------------
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
  scopes           jsonb;
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

      -- DD-211: the rungs this read is standing on. The table always; the AGENT too when
      -- one is writing, which is what makes `overridable_by = {organization, agent}` on
      -- `agent_write_born_confirmed` reachable at all. DD-198 shape: an ARRAY of
      -- {kind, id}. knob_resolve filters every candidate override by the knob's own
      -- `overridable_by`, so naming both rungs on both keys can never cross them over.
      scopes := CASE
                  WHEN agent_id IS NULL
                    THEN jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))
                  ELSE jsonb_build_array(jsonb_build_object('kind', 'agent', 'id', agent_id),
                                         jsonb_build_object('kind', 'table', 'id', table_scope_id))
                END;

      IF raw_tier = 'human' THEN
        -- A person declared themselves the author. Writing it is standing behind it.
        born := 'confirmed';
      ELSIF raw_tier IN ('ai', 'code') THEN
        -- Born confirmed ONLY when a person decided that in advance, at BOTH rungs (§3.3, §4.2
        -- keys 1 and 2). They are a conjunction across different rungs, so no precedence race.
        IF  COALESCE((platform.knob_resolve('records', 'confirmation.agent_write_born_confirmed',
                        org, NULL, scopes))::text::boolean, false)
        AND COALESCE((platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                        org, NULL, scopes))::text::boolean, false)
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
-- (3) THE MIGRATION PROVES ITSELF, against the real database, and cleans up.
--
-- Everything below runs in this migration's own transaction and every row it
-- plants is deleted before the block ends; the final assertions re-count.
-- It REFUSES TO RUN AT ALL if the organization it probes already holds
-- `records` overrides, because then the probe would not be reversible.
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
  v_secdef     boolean;
  v_probes     uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT count(*) INTO v_left FROM platform.knob_override WHERE feature = 'records';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd211: % `records` override row(s) already exist. This file plants and removes its own; it will not run beside overrides it cannot safely restore.', v_left;
  END IF;

  SELECT count(*) INTO v_attach_before
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform' AND p.proname = '_stamp_actor_tier' AND NOT t.tgisinternal;

  SELECT id INTO v_table FROM platform.entity_types WHERE confirmation_enabled LIMIT 1;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'dd211: no table is admitted to confirmation, so the carrier cannot be proven. Nothing was asserted.';
  END IF;

  SELECT id, version INTO v_def, v_defver
    FROM content_ir.kind_definition WHERE is_active AND deleted_at IS NULL LIMIT 1;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'dd211: no active content_ir.kind_definition to write a probe record against. Nothing was asserted.';
  END IF;

  SELECT id INTO v_agent FROM agent.definition
   WHERE organization_id = v_org AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
  SELECT id INTO v_sibling FROM agent.definition
   WHERE organization_id = v_org AND deleted_at IS NULL AND id <> v_agent ORDER BY created_at LIMIT 1;
  IF v_agent IS NULL OR v_sibling IS NULL THEN
    RAISE EXCEPTION 'dd211: needs two agents in admin''s Workspace to prove "this agent yes, that agent no". Nothing was asserted.';
  END IF;

  -- The overrides below are planted through the PICKER'S OWN DOOR
  -- (`platform.knob_override_set`), not by an INSERT into the override table,
  -- so what is proven is the path a person actually walks. That door refuses a
  -- caller it cannot identify (`{"ok": false, "reason": "not_authenticated"}`),
  -- and a migration runs as `postgres` with no JWT — so admin@admin.com's
  -- claims are declared for this transaction only (`is_local => true`, gone at
  -- COMMIT) and cleared again at the end of the block.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_actor::text, 'role', 'authenticated')::text, true);

  -- The function exists and reads the declaration.
  PERFORM set_config('app.actor_agent', v_agent::text, true);
  IF platform.declared_actor_agent() IS DISTINCT FROM v_agent THEN
    RAISE EXCEPTION 'dd211: declared_actor_agent() did not return the declared agent. The guard did not install.';
  END IF;
  PERFORM set_config('app.actor_agent', 'not-a-uuid', true);
  IF platform.declared_actor_agent() IS NOT NULL THEN
    RAISE EXCEPTION 'dd211: declared_actor_agent() accepted a malformed agent id instead of warning and returning NULL.';
  END IF;
  PERFORM set_config('app.actor_agent', '', true);
  IF platform.declared_actor_agent() IS NOT NULL THEN
    RAISE EXCEPTION 'dd211: declared_actor_agent() invented an agent where none was declared.';
  END IF;

  -- Both rungs on, the writing agent named -> BORN CONFIRMED. This is the exact
  -- combination that produced `unconfirmed` before this file.
  PERFORM platform.knob_override_set('records', 'confirmation.agent_write_born_confirmed',
            'agent', v_agent, v_org, to_jsonb(true), 'dd211 self-proof');
  PERFORM platform.knob_override_set('records', 'confirmation.table_allows_born_confirmed',
            'table', v_table, v_org, to_jsonb(true), 'dd211 self-proof');

  PERFORM set_config('app.user_id', v_actor::text, true);
  PERFORM set_config('app.actor_tier', 'ai', true);
  PERFORM set_config('app.actor_system', 'dd211_self_proof', true);
  PERFORM set_config('app.actor_agent', v_agent::text, true);

  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                        validation_status, organization_id, created_by)
  VALUES (v_def, v_defver, '{"dd211":"the agent that owns the exception"}'::jsonb,
          'dd211 self-proof (declared agent)', 'passed', v_org, v_actor)
  RETURNING id, confirmation::text INTO v_id, v_conf;
  v_probes := v_probes || v_id;
  IF v_conf <> 'confirmed' THEN
    RAISE EXCEPTION 'dd211 assertion — the declared agent''s write is STILL born %, not confirmed, with its own agent-rung override on. The carrier is not naming the agent rung.', v_conf;
  END IF;

  -- A SIBLING agent, same organization, same table override -> unconfirmed.
  -- An exception granted to one agent is not a hole for every agent.
  PERFORM set_config('app.actor_agent', v_sibling::text, true);
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                        validation_status, organization_id, created_by)
  VALUES (v_def, v_defver, '{"dd211":"a sibling agent with no exception"}'::jsonb,
          'dd211 self-proof (sibling agent)', 'passed', v_org, v_actor)
  RETURNING id, confirmation::text INTO v_id, v_conf;
  v_probes := v_probes || v_id;
  IF v_conf <> 'unconfirmed' THEN
    RAISE EXCEPTION 'dd211 assertion — a SIBLING agent''s write came out %, not unconfirmed. One agent''s exception is leaking to every agent.', v_conf;
  END IF;

  -- NO agent declared, both rungs as above -> unchanged from today: unconfirmed.
  PERFORM set_config('app.actor_agent', '', true);
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                        validation_status, organization_id, created_by)
  VALUES (v_def, v_defver, '{"dd211":"no agent declared"}'::jsonb,
          'dd211 self-proof (no agent)', 'passed', v_org, v_actor)
  RETURNING id, confirmation::text INTO v_id, v_conf;
  v_probes := v_probes || v_id;
  IF v_conf <> 'unconfirmed' THEN
    RAISE EXCEPTION 'dd211 assertion — an undeclared-agent AI write came out %. Table-only behaviour changed; it must not.', v_conf;
  END IF;

  -- The ORGANIZATION rung still works on its own (V-64 T4), with no agent named.
  PERFORM platform.knob_override_set('records', 'confirmation.agent_write_born_confirmed',
            'organization', v_org, v_org, to_jsonb(true), 'dd211 self-proof');
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                        validation_status, organization_id, created_by)
  VALUES (v_def, v_defver, '{"dd211":"org rung, no agent"}'::jsonb,
          'dd211 self-proof (org rung)', 'passed', v_org, v_actor)
  RETURNING id, confirmation::text INTO v_id, v_conf;
  v_probes := v_probes || v_id;
  IF v_conf <> 'confirmed' THEN
    RAISE EXCEPTION 'dd211 assertion — the ORGANIZATION rung came out %, not confirmed. Behaviour that worked before this file no longer does.', v_conf;
  END IF;
  PERFORM platform.knob_override_set('records', 'confirmation.agent_write_born_confirmed',
            'organization', v_org, v_org, NULL, 'dd211 self-proof cleanup');

  -- A PERSON'S write carrying an agent is REFUSED, not quietly accepted.
  PERFORM set_config('app.actor_tier', 'human', true);
  PERFORM set_config('app.actor_system', '', true);
  PERFORM set_config('app.actor_agent', v_agent::text, true);
  BEGIN
    INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title,
                                          validation_status, organization_id, created_by)
    VALUES (v_def, v_defver, '{"dd211":"a person cannot also be an agent"}'::jsonb,
            'dd211 self-proof (human + agent)', 'passed', v_org, v_actor)
    RETURNING id INTO v_id;
    v_probes := v_probes || v_id;
    RAISE EXCEPTION 'dd211 assertion — a human-tier write carrying an agent was ACCEPTED. The contradiction must be refused.';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- exactly the refusal this file installs
  END;

  -- Clean the declaration and the overrides back off.
  PERFORM set_config('app.actor_agent', '', true);
  PERFORM set_config('app.actor_tier', '', true);
  PERFORM set_config('app.actor_system', '', true);
  PERFORM platform.knob_override_set('records', 'confirmation.agent_write_born_confirmed',
            'agent', v_agent, v_org, NULL, 'dd211 self-proof cleanup');
  PERFORM platform.knob_override_set('records', 'confirmation.table_allows_born_confirmed',
            'table', v_table, v_org, NULL, 'dd211 self-proof cleanup');

  DELETE FROM content_ir.kind_instance WHERE id = ANY (v_probes);
  PERFORM set_config('request.jwt.claims', '', true);

  -- ---- nothing left behind, nothing else changed -------------------------
  SELECT count(*) INTO v_left FROM platform.knob_override WHERE feature = 'records';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd211: % `records` override row(s) survived the self-proof. Not clean.', v_left;
  END IF;
  SELECT count(*) INTO v_left FROM content_ir.kind_instance WHERE id = ANY (v_probes);
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'dd211: % probe record(s) survived the self-proof. Not clean.', v_left;
  END IF;

  SELECT count(*) INTO v_attach_after
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform' AND p.proname = '_stamp_actor_tier' AND NOT t.tgisinternal;
  IF v_attach_after <> v_attach_before THEN
    RAISE EXCEPTION 'dd211: the carrier''s trigger attachments went from % to %. CREATE OR REPLACE must not move them (DD-176).', v_attach_before, v_attach_after;
  END IF;

  -- The three declarations are read on the SAME write paths, so they must be
  -- executable by the same roles. A client-channel INSERT by `anon` that could
  -- read the tier but not the agent would be `permission denied for function`
  -- on a path that worked yesterday.
  FOR v_left IN
    SELECT 1 FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
     WHERE NOT (has_function_privilege(r.role_name, 'platform.declared_actor_agent()', 'EXECUTE')
                = has_function_privilege(r.role_name, 'platform.declared_actor_tier()', 'EXECUTE'))
  LOOP
    RAISE EXCEPTION 'dd211: platform.declared_actor_agent() and platform.declared_actor_tier() do not carry the same EXECUTE grants. A write path that can read one declaration and not the other fails for that role.';
  END LOOP;

  SELECT bool_or(p.prosecdef) INTO v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform' AND p.proname IN ('_stamp_actor_tier', 'declared_actor_agent');
  IF v_secdef THEN
    RAISE EXCEPTION 'dd211: a function this file wrote came back SECURITY DEFINER. db-rules §6d forbids it here.';
  END IF;

  RAISE NOTICE 'dd211: the agent rung is real — declared agent born confirmed, sibling agent unconfirmed, no-agent and org-rung behaviour unchanged, human+agent refused; % carrier attachments preserved, 0 overrides and 0 probe rows left.', v_attach_after;
END
$$;
