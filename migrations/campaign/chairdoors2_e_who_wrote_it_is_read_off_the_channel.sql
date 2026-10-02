-- chair-step: this CREATES one helper platform.is_client_channel() (STABLE, SECURITY INVOKER; EXECUTE granted to exactly the roles that hold EXECUTE on platform.declared_actor_tier today) and replaces the bodies of platform.declared_actor_tier, platform.declared_actor_system, platform.declared_actor_agent, platform.actor_tier, platform._stamp_actor_tier and platform.actor_declaration_report (same signatures, same security). The client channel is now "a PostgREST request (request.headers set) whose verified claims say authenticated" instead of "current_user = authenticated", so an agent client's x-matrx-actor-* headers are honoured inside SECURITY DEFINER doors and the server acting as a person (role authenticated, no request.headers) is a server channel. platform.actor_tier() is declared-first and its undeclared fallback is `system`, never `user`. _stamp_actor_tier holds created_by_tier / created_by_system to OLD on every UPDATE. No table, trigger, policy, index or data row is touched, and no existing grant changes.
-- lane: CHAIR-DOORS-2 (asked by v6 lane 11 AUTOMATIONS-AND-PAGES, need 9; register WF-028)
-- based-on: platform.declared_actor_tier() f6d5d30363286568e16454997836232c50e2396a503349c5e566bc037dce8904
-- based-on: platform.declared_actor_system() c7bfbf2c50f5e0136d6ffb05e978b5bca79ea8537318cbcdc2dd73f9ebfd46f7
-- based-on: platform.declared_actor_agent() 639c9f5aba8dd4a6b14ad45a9a1133016d080164935d952a92c1858ceadc8e34
-- based-on: platform.actor_tier() a8092b43c4d8a82caca6402aad15d4a61cf96f39a9519d9eace8e54054beb21d
-- based-on: platform._stamp_actor_tier() fdf9035e0fad873740d924d3b0bf1e51f33ce57d1b7993cbfc59f1bd4b6725e2
-- based-on: platform.actor_declaration_report() d2cc904bd134521bf56f01818be4eebbc0795e558925a7897380bd96d8d40285
--
-- WHO WROTE IT COMES FROM THE CHANNEL, NEVER FROM THE CALLER'S WORD.
-- Measured on the clone 2026-10-02 (scripts/campaign-tests/chairdoors2_e_who_wrote_it_is_read_off_the_channel.sql, RED 9 of 15):
--   * created_by_tier / created_by_system were stamped on INSERT only, so the member's own UPDATE set them to
--     anything (crm.party, workflow.definition_version — every table carrying the columns; the trigger is
--     already BEFORE INSERT OR UPDATE on all ten, so this is a body change only).
--   * the "client channel" was `current_user = 'authenticated'`. Inside any SECURITY DEFINER door (the record
--     store's writes, history capture, set_org_change_policy) current_user is the owner, so an agent client's
--     honest `x-matrx-actor-tier: agent` was dropped and platform.actor_tier() answered `user` from auth.uid():
--     the agent was stamped a person, and the human-only change-policy door let it through.
--   * the server acting AS a person (matrx_orm.rls_session: role authenticated + claims, no request.headers)
--     with nothing declared was stamped `user` by declared_actor_tier's client branch, and the server pool with
--     only app.user_id was stamped `user` by actor_tier()'s identity fallback.
-- THE RULE. A person is somebody typing in their own signed-in browser: PostgREST (the only thing that sets
-- request.headers — a client can set no GUC) with verified claims role `authenticated` and no agent header.
-- A server connection is believed only when it DECLARES app.actor_tier (aidream's request boundary declares
-- `user` for a signed-in person's request, `agent` for an agent's turn). Undeclared anywhere else is `system`:
-- software wrote it. On a tier-stamped table an undeclared write under a person's identity is stamped
-- system/`undeclared` and reported to ops.system_error (fail safe and loud, like DD-131's undeclared
-- confirmation write) rather than refused, so background doors that never declared keep working while the
-- report names them; undeclared with no identity keeps the wf_051 refusal (23514) unchanged.
-- Inverse: migrations/inverse/chairdoors2_e_who_wrote_it_is_read_off_the_channel_down.sql

-- 1. The one definition of the client channel.
CREATE OR REPLACE FUNCTION platform.is_client_channel()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  hdr text := NULLIF(current_setting('request.headers', true), '');
  clm text;
BEGIN
  -- PostgREST sets request.headers on every request it serves; no client can set a GUC, and the server's
  -- own sessions (matrx_orm.rls_session, the pool) never set it. So its presence IS the PostgREST channel,
  -- inside a SECURITY DEFINER door or out of one.
  IF hdr IS NULL THEN
    RETURN false;
  END IF;
  clm := NULLIF(current_setting('request.jwt.claims', true), '');
  IF clm IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    -- Verified by PostgREST against the project's JWT secret: `anon` and `service_role` are not a person.
    RETURN (clm::jsonb ->> 'role') = 'authenticated' AND NULLIF(clm::jsonb ->> 'sub', '') IS NOT NULL;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[provenance] request.jwt.claims is not JSON — this request is not treated as a person''s browser.';
    RETURN false;
  END;
END
$function$;
-- Every role that can call platform.declared_actor_tier() today must be able to call what it now calls, or
-- its writes would fail on a permission error. Mirror that ACL exactly (anon and PUBLIC have neither).
GRANT EXECUTE ON FUNCTION platform.is_client_channel()
  TO authenticated, service_role, authenticator, cli_login_postgres, dashboard_user, matrx_provisioner, svc_seo;

-- 2. The tier a connection declared. GUC first on every channel; the header only on the client channel.
CREATE OR REPLACE FUNCTION platform.declared_actor_tier()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  raw     text := NULLIF(current_setting('app.actor_tier', true), '');
  hdr_raw text;
  hdr     text;
BEGIN
  -- 1. The GUC is the declaration on EVERY channel, and the only one a server channel honours.
  IF raw IS NOT NULL THEN
    IF platform.canonical_actor_tier(raw) IS NOT NULL THEN
      RETURN platform.canonical_actor_tier(raw);
    END IF;
    RAISE WARNING '[provenance] invalid app.actor_tier=% — must be system|agent|user. Treating this write as UNDECLARED; fix the door that set it.', raw;
    RETURN NULL;
  END IF;

  -- 2. The client channel only: a PostgREST request signed in as a person (platform.is_client_channel).
  --    It holds inside a SECURITY DEFINER door too — current_user is the owner there, the request is not.
  --    The server acting as a person (role authenticated, no request.headers) is NOT this channel.
  IF platform.is_client_channel() THEN
    hdr_raw := NULLIF(current_setting('request.headers', true), '');
    BEGIN
      hdr := NULLIF(lower(trim((hdr_raw::json) ->> 'x-matrx-actor-tier')), '');
    EXCEPTION WHEN others THEN
      RAISE WARNING '[provenance] request.headers is not JSON — ignoring the client actor header for this write.';
      hdr := NULL;
    END;

    IF hdr IS NOT NULL THEN
      IF hdr IN ('agent', 'system', 'ai', 'code') THEN
        RETURN platform.canonical_actor_tier(hdr);
      END IF;
      -- `human` is not accepted from a header: a client cannot promote itself to a person, it
      -- simply omits the header and IS one. Anything else is malformed.
      RAISE WARNING '[provenance] invalid x-matrx-actor-tier=% — must be agent|system (omit the header for a person''s own action). Treating this write as a person.', hdr;
    END IF;

    -- No header on the client channel: a person is typing in their own browser.
    RETURN 'user';
  END IF;

  -- 3. A server channel that declared nothing. UNDECLARED, never 'user'.
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION platform.declared_actor_system()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  raw     text := NULLIF(current_setting('app.actor_system', true), '');
  hdr_raw text;
  hdr     text;
BEGIN
  -- 1. The GUC is the declaration on EVERY channel — platform.declared_actor_tier()'s rule 1.
  IF raw IS NOT NULL THEN
    RETURN raw;
  END IF;

  -- 2. The client channel only (platform.is_client_channel), inside a definer door or out of one.
  IF platform.is_client_channel() THEN
    hdr_raw := NULLIF(current_setting('request.headers', true), '');
    BEGIN
      hdr := NULLIF(trim((hdr_raw::json) ->> 'x-matrx-actor-system'), '');
    EXCEPTION WHEN others THEN
      RAISE WARNING '[provenance] request.headers is not JSON — ignoring the client actor-system header for this write.';
      hdr := NULL;
    END;
    -- No header: a person is typing, and a person's write has no system (DD-131/B-56).
    RETURN hdr;
  END IF;

  -- 3. A server channel that declared nothing. UNDECLARED, same as tier.
  RETURN NULL;
END
$function$;

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
  -- 1. The GUC is the declaration on EVERY channel — platform.declared_actor_tier()'s rule 1.
  IF raw IS NOT NULL THEN
    BEGIN
      RETURN raw::uuid;
    EXCEPTION WHEN others THEN
      RAISE WARNING '[provenance] invalid app.actor_agent=% — must be the uuid of an agent.definition row. Treating this write as carrying NO agent; fix the door that set it.', raw;
      RETURN NULL;
    END;
  END IF;

  -- 2. The client channel only (platform.is_client_channel), inside a definer door or out of one.
  IF platform.is_client_channel() THEN
    hdr_raw := NULLIF(current_setting('request.headers', true), '');
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
    RETURN NULL;
  END IF;

  -- 3. A server channel that declared no agent. Most writes are exactly this.
  RETURN NULL;
END
$function$;

-- 3. The effective tier every reader uses. Declared first (so the client header is seen by history capture,
--    the human-only change-policy door and every other caller); undeclared is `system`, never `user`.
CREATE OR REPLACE FUNCTION platform.actor_tier()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  declared text := platform.declared_actor_tier();
BEGIN
  IF declared IS NOT NULL THEN
    RETURN declared;
  END IF;

  -- Undeclared, and not a person's own browser (that channel always declares above). Software wrote this:
  -- a server door that forgot to say who, or an invalid declaration. An identity in app.user_id or the
  -- claims is WHOSE authority it ran under, not proof a person typed it.
  RAISE LOG '[provenance] app.actor_tier unset off the client channel — defaulting to system (authenticated identity present: %)',
    (COALESCE(NULLIF(current_setting('app.user_id', true), ''), (SELECT auth.uid())::text) IS NOT NULL);
  RETURN 'system';
END
$function$;

-- 4. The row stamp. Unchanged except: an UPDATE can never move created_by_tier / created_by_system.
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
  col_flags        text;
BEGIN
  -- WRITE-PERF-4: the seven column questions, asked of the catalogue once per relation per statement and
  -- cleared by `platform.memo_ddl_forgets_the_shape` the moment ANY DDL runs.
  col_flags := platform.memo_col_flags(TG_RELID,
                 ARRAY['updated_by_tier', 'updated_by_system', 'created_by_tier',
                       'created_by_system', 'confirmation', 'confirmed_by', 'confirmed_at']);
  has_upd_tier     := substr(col_flags, 1, 1) = 't';
  has_upd_sys      := substr(col_flags, 2, 1) = 't';
  has_crt_tier     := substr(col_flags, 3, 1) = 't';
  has_crt_sys      := substr(col_flags, 4, 1) = 't';
  has_confirmation := substr(col_flags, 5, 1) = 't';
  has_conf_by      := substr(col_flags, 6, 1) = 't';
  has_conf_at      := substr(col_flags, 7, 1) = 't';

  -- CHAIR-DOORS-2 E: who CREATED a row is a fact of its INSERT. No UPDATE — a client's, an agent's or a
  -- door's — can rewrite it; it is held to OLD before anything else runs (field assignment is guarded by
  -- the column's existence, so this is inert on every table without it).
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(has_crt_tier, false) THEN
      NEW.created_by_tier := OLD.created_by_tier;
    END IF;
    IF COALESCE(has_crt_sys, false) THEN
      NEW.created_by_system := OLD.created_by_system;
    END IF;
  END IF;

  -- Column-guarded: inert on every table that does not carry what it writes. That guard is what
  -- makes this trigger legal on a `component`, where _stamp_actor is forbidden (db-rules §6d-1).
  IF NOT COALESCE(has_upd_tier, false)
     AND NOT (COALESCE(has_crt_tier, false) AND TG_OP = 'INSERT')
     AND NOT (COALESCE(has_confirmation, false) AND TG_OP = 'INSERT') THEN
    RETURN NEW;
  END IF;

  raw_tier := platform.declared_actor_tier();
  sys      := platform.actor_system();
  -- DD-211: WHICH AGENT, when one is writing.
  agent_id := platform.declared_actor_agent();

  -- The raw declaration first; platform.actor_tier() is the fallback, and since CHAIR-DOORS-2 E it answers
  -- `system` (never `user`) for a write nothing declared.
  tier := COALESCE(raw_tier, platform.actor_tier());

  -- CHAIR-DOORS-2 E: an UNDECLARED server write that runs under a person's identity (app.user_id, or the
  -- server acting as them with their claims) used to be stamped `user`. It is software's write: stamped
  -- `system`, named `undeclared` so the row says exactly what is known, and reported as the door defect it
  -- is — the same fail-safe-and-loud shape as DD-131's undeclared confirmation write. It is NOT refused:
  -- background doors that never declared (they were silently called people) keep working while the
  -- report names them. Undeclared with no identity at all keeps the wf_051 refusal below, unchanged.
  IF raw_tier IS NULL AND sys IS NULL
     AND COALESCE(NULLIF(current_setting('app.user_id', true), ''), (SELECT auth.uid())::text) IS NOT NULL THEN
    sys := 'undeclared';
    BEGIN
      PERFORM ops.record_system_error(jsonb_build_object(
        'kind', 'provenance',
        'error_type', 'undeclared_actor_on_tier_stamped_table',
        'error_text', format(
          'A write to %s declared no actor, so it was stamped system/undeclared instead of a person. '
          || 'This is a defect in the door that made it: a server path must declare app.actor_tier '
          || '(user for a person''s request, agent for an agent''s turn, system for a job) before it writes.',
          TG_RELID::regclass::text),
        'source_app', 'database',
        'source_feature', 'provenance',
        'route', TG_RELID::regclass::text,
        'organization_id', NULLIF(to_jsonb(NEW) ->> 'organization_id', ''),
        'user_id', COALESCE(NULLIF(current_setting('app.user_id', true), ''), (SELECT auth.uid())::text),
        'context', jsonb_build_object('relation', TG_RELID::regclass::text, 'operation', TG_OP,
                                      'session_role', current_user, 'register', 'WF-028')));
    EXCEPTION WHEN others THEN
      RAISE WARNING '[provenance] undeclared write to % could not be reported (%); it is still stamped system/undeclared.',
        TG_RELID::regclass::text, SQLERRM;
    END;
  END IF;

  -- wf_051 / V-45 §6: an agent must name itself; a person needs no system.
  IF tier IN ('agent', 'system') AND sys IS NULL THEN
    RAISE EXCEPTION
      'This write declares actor_tier=%, but names no actor_system. An agent or automated write must say WHICH agent/system it is (x-matrx-actor-system on the client channel, or the app.actor_system GUC on a server channel) — a person''s write needs no system at all, but "an AI did it" with no name is not provenance. Table: %.%',
      tier, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  -- DD-211: a PERSON'S write carries no agent.
  IF tier = 'user' AND agent_id IS NOT NULL THEN
    raise exception 'This write declares actor_tier=user AND an actor_agent. A person''s write carries no agent: either the person is the author (drop the x-matrx-actor-agent header / the app.actor_agent GUC) or the agent is (declare actor_tier=agent and the agent that is running). Table: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME using ERRCODE = '23514',
            detail = jsonb_build_object('agent_id', agent_id)::text;
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
      born  := 'unconfirmed';
      patch := patch || jsonb_build_object('confirmation', born);
      IF COALESCE(has_conf_by, false) THEN patch := patch || jsonb_build_object('confirmed_by', NULL); END IF;
      IF COALESCE(has_conf_at, false) THEN patch := patch || jsonb_build_object('confirmed_at', NULL); END IF;
    ELSE
      row_json := to_jsonb(NEW);
      org   := NULLIF(row_json ->> 'organization_id', '')::uuid;
      actor := COALESCE(NULLIF(current_setting('app.user_id', true), '')::uuid, auth.uid());

      IF raw_tier = 'user' THEN
        born := 'confirmed';
      ELSIF raw_tier IN ('agent', 'system') THEN
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
        born := 'unconfirmed';
        PERFORM platform._report_undeclared_confirmation_write(TG_RELID, org, actor);
      END IF;

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

  -- DD-184: apply the patch by DIRECT FIELD ASSIGNMENT (never jsonb_populate_record).
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

-- 5. The report names the channel by the same one definition.
CREATE OR REPLACE FUNCTION platform.actor_declaration_report()
 RETURNS TABLE(declared_tier text, channel text, source text, actor_system text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  raw     text := NULLIF(current_setting('app.actor_tier', true), '');
  hdr_raw text := NULLIF(current_setting('request.headers', true), '');
  hdr     text;
  v_chan  text := CASE WHEN platform.is_client_channel() THEN 'client' ELSE 'server' END;
BEGIN
  declared_tier := platform.declared_actor_tier();
  channel       := v_chan;
  actor_system  := platform.actor_system();

  IF raw IS NOT NULL AND platform.canonical_actor_tier(raw) IS NOT NULL THEN
    source := 'app.actor_tier GUC';
  ELSIF raw IS NOT NULL THEN
    source := format('app.actor_tier GUC was invalid (%s) — treated as UNDECLARED', raw);
  ELSIF v_chan = 'client' THEN
    BEGIN
      hdr := NULLIF(lower(trim((hdr_raw::json) ->> 'x-matrx-actor-tier')), '');
    EXCEPTION WHEN others THEN hdr := NULL;
    END;
    IF hdr IN ('agent','system','ai','code') THEN
      source := 'x-matrx-actor-tier request header';
    ELSIF hdr IS NOT NULL THEN
      source := format('x-matrx-actor-tier was invalid (%s) — treated as a person', hdr);
    ELSE
      source := 'no declaration on the client channel — a person is acting';
    END IF;
  ELSE
    source := 'UNDECLARED on a server channel (no PostgREST request signed in as a person). This write is software''s, not a person''s: it is stamped system (system/undeclared and reported to ops.system_error when it runs under a person''s identity; refused when it has none). The door that made it must declare app.actor_tier. A request header is ignored here on purpose.';
  END IF;

  RETURN NEXT;
END
$function$;
