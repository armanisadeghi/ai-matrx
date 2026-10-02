-- chair-step: undo chairdoors2_e_who_wrote_it_is_read_off_the_channel.sql — restores the six bodies it replaced (platform.declared_actor_tier, declared_actor_system, declared_actor_agent, actor_tier, _stamp_actor_tier, actor_declaration_report) exactly as they were on 2026-10-02, then drops platform.is_client_channel(). Reopens: an UPDATE can set created_by_tier/created_by_system; an agent header is dropped inside SECURITY DEFINER doors; an undeclared server write with an identity is stamped user.
-- lane: CHAIR-DOORS-2
-- based-on: platform.declared_actor_tier() 9bfb528d7b1801ee1f0ca88e2fd909940a40f218cfe9ed43c6700ad67def1507
-- based-on: platform.declared_actor_system() f3ca43a48e70b99bff6837da5088deebc629ec00d6047277c34705496ea03bf2
-- based-on: platform.declared_actor_agent() 2f09a5282bfb52b0c0f13ef8ff6dabe98c4785de258737d6ba1c9774a936dcc9
-- based-on: platform.actor_tier() b708e53a7f8638666d13e36d7898fbf3197923cdb6d822df84a91ffd5d79cf0c
-- based-on: platform._stamp_actor_tier() 82720db2886edd824acdf282e30b72ef1f3c1ea367c16dbe206e39f59a80bbf7
-- based-on: platform.actor_declaration_report() a351894255e6283c8ac3eb4d4e28a44e4d85167f5c00838d45297f200a3d5dda
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

  -- 2. The client channel only. `authenticated` is the role PostgREST sets for a signed-in
  --    browser/extension/desktop write under RLS. On any other role this block is skipped
  --    entirely, which is what makes a forged header on a server channel inert (R-B).
  IF current_user = 'authenticated' THEN
    hdr_raw := NULLIF(current_setting('request.headers', true), '');
    IF hdr_raw IS NOT NULL THEN
      BEGIN
        hdr := NULLIF(lower(trim((hdr_raw::json) ->> 'x-matrx-actor-tier')), '');
      EXCEPTION WHEN others THEN
        -- request.headers is set by PostgREST and is always JSON. Anything else is a host defect.
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
    END IF;

    -- No header on the client channel: a person is typing. R2 as amended by the chair.
    RETURN 'user';
  END IF;

  -- 3. A server channel that declared nothing. UNDECLARED, never 'user' — the door forgot, and
  --    Phase 1 turns this into `unconfirmed` plus a system_errors row naming the call site.
  RETURN NULL;
END
$function$

;

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
  -- 1. The GUC is the declaration on EVERY channel, and the only one a
  --    server channel honours — exactly platform.declared_actor_tier()'s
  --    rule 1.
  IF raw IS NOT NULL THEN
    RETURN raw;
  END IF;

  -- 2. The client channel only. `authenticated` is the role PostgREST sets
  --    for a signed-in browser/extension/desktop write under RLS. A forged
  --    header on any other role is skipped entirely — inert by construction,
  --    same as the tier header (R-B).
  IF current_user = 'authenticated' THEN
    hdr_raw := NULLIF(current_setting('request.headers', true), '');
    IF hdr_raw IS NOT NULL THEN
      BEGIN
        hdr := NULLIF(trim((hdr_raw::json) ->> 'x-matrx-actor-system'), '');
      EXCEPTION WHEN others THEN
        -- request.headers is set by PostgREST and is always JSON. Anything
        -- else is a host defect, not a client's problem.
        RAISE WARNING '[provenance] request.headers is not JSON — ignoring the client actor-system header for this write.';
        hdr := NULL;
      END;

      IF hdr IS NOT NULL THEN
        RETURN hdr;
      END IF;
    END IF;

    -- No header on the client channel: a person is typing, and a person's
    -- write has no system (chair ruling, DD-131/B-56).
    RETURN NULL;
  END IF;

  -- 3. A server channel that declared nothing. UNDECLARED, same as tier.
  RETURN NULL;
END
$function$

;

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
$function$

;

CREATE OR REPLACE FUNCTION platform.actor_tier()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  raw      text := NULLIF(current_setting('app.actor_tier', true), '');
  identity text;
  fallback text;
BEGIN
  IF raw IS NOT NULL THEN
    IF platform.canonical_actor_tier(raw) IS NOT NULL THEN
      RETURN platform.canonical_actor_tier(raw);
    END IF;
    RAISE WARNING '[provenance] invalid app.actor_tier=%; must be system|agent|user — using the documented default', raw;
  END IF;

  identity := COALESCE(
    NULLIF(current_setting('app.user_id', true), ''),
    (SELECT auth.uid())::text
  );
  fallback := CASE WHEN identity IS NOT NULL THEN 'user' ELSE 'system' END;
  RAISE LOG '[provenance] app.actor_tier unset — defaulting to % (authenticated identity present: %)',
    fallback, (identity IS NOT NULL);
  RETURN fallback;
END
$function$

;

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
  -- Read live from pg_attribute on every firing: this is the catalog, not a cache,
  -- so it already sees a column added earlier in this transaction.  Every column this
  -- function writes is tested for on its own, because the write below is now a direct
  -- field assignment and a missing column is an error rather than a silent skip.
  -- WRITE-PERF-4: the same seven questions, asked of the catalogue once per relation per
  -- statement instead of once per ROW, and cleared by `platform.memo_ddl_forgets_the_shape`
  -- the moment ANY DDL runs -- so the promise this comment makes (a column added earlier in
  -- this transaction is seen) is still kept, by an event trigger rather than by paying for a
  -- catalogue scan on every row. Without that event trigger this would be a cache pretending
  -- to be the catalogue and it would not ship.
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
  -- channel this write arrived on. A `user` tier is exempt on purpose: its NULL system is the
  -- chair's ruling, not a gap.
  IF tier IN ('agent', 'system') AND sys IS NULL THEN
    RAISE EXCEPTION
      'This write declares actor_tier=%, but names no actor_system. An agent or automated write must say WHICH agent/system it is (x-matrx-actor-system on the client channel, or the app.actor_system GUC on a server channel) — a person''s write needs no system at all, but "an AI did it" with no name is not provenance. Table: %.%',
      tier, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  -- DD-211: a PERSON'S write carries no agent. "A person did this" and "agent X did
  -- this" are two different authors, and a row cannot have both -- accepting the pair
  -- would let a human-tier write borrow an agent's born-confirmed exception.
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

      IF raw_tier = 'user' THEN
        -- A person declared themselves the author. Writing it is standing behind it.
        born := 'confirmed';
      ELSIF raw_tier IN ('agent', 'system') THEN
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
$function$

;

CREATE OR REPLACE FUNCTION platform.actor_declaration_report()
 RETURNS TABLE(declared_tier text, channel text, source text, actor_system text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  raw     text := NULLIF(current_setting('app.actor_tier', true), '');
  hdr_raw text := NULLIF(current_setting('request.headers', true), '');
  hdr     text;
  v_chan  text := CASE WHEN current_user = 'authenticated' THEN 'client' ELSE 'server' END;
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
    source := 'UNDECLARED on a server channel. This write will be born unconfirmed and the door that made it is a defect: it must declare app.actor_tier. A request header is ignored here on purpose.';
  END IF;

  RETURN NEXT;
END
$function$

;

DROP FUNCTION platform.is_client_channel();
