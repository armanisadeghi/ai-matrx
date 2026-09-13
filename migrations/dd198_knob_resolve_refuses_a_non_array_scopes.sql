-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DD-198 — THE CARRIER ASKS knob_resolve WITH AN ARRAY OF SCOPES; knob_resolve REFUSES ANYTHING ELSE
--
-- WHAT WAS WRONG (found by B-88 while building the per-rung override picker; measured live here)
-- ----------------------------------------------------------------------------------------------
-- `platform.knob_resolve(p_feature, p_key, p_organization_id, p_user_id, p_scopes)` reads p_scopes
-- in exactly ONE place:
--
--     or (p_scopes is not null and exists (
--           select 1 from jsonb_array_elements(p_scopes) e
--            where e ->> 'kind' = o.scope_kind and (e ->> 'id')::uuid = o.scope_id))
--
-- so p_scopes is an ARRAY of {"kind": …, "id": …} rungs. Two callers passed an OBJECT:
--
--   * `platform._stamp_actor_tier` — the provenance/born-confirmed carrier attached to every
--     registered entity and component base table — passed `jsonb_build_object('table', <id>)` for
--     BOTH `records.confirmation.agent_write_born_confirmed` and
--     `records.confirmation.table_allows_born_confirmed`.
--   * `content_ir.edit_kind_instance_value` — the edit-confirms door — passed `'{}'::jsonb` for
--     `records.confirmation.confirm_on_human_edit`.
--
-- The `jsonb_array_elements` line is reached ONLY when a candidate override row already exists at a
-- rung that is neither `organization` nor `user`. So the wrong argument was harmless for as long as
-- nobody could create a row-keyed override — and DD-183's picker (B-88, shipped 2026-09-13) is
-- exactly the screen that lets a person create one in one click. The first such override in an
-- organization turned every AI/code insert on an admitted table into
-- `22023 cannot extract elements from an object`, and every human edit through the kind-instance
-- door likewise. Reproduced live before this file, in rolled-back transactions, on
-- `content_ir.kind_instance` in `admin's Workspace` (884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f):
--
--   | planted override                                                   | act                                   | result |
--   |--------------------------------------------------------------------|---------------------------------------|--------|
--   | org `agent_write_born_confirmed`=true + table `table_allows…`=true  | AI-tier INSERT into kind_instance      | 22023 cannot extract elements from an object |
--   | agent-rung `agent_write_born_confirmed`=true                        | AI-tier INSERT into kind_instance      | 22023 cannot extract elements from an object |
--   | table `confirm_on_human_edit`=false                                 | content_ir.edit_kind_instance_value    | 22023 cannot extract elements from an object |
--   | none                                                               | the same three                        | no error (the bug is invisible until an override exists) |
--
-- WHY THE GUARD IS AT THE TOP OF knob_resolve, NOT IN THE CALLERS
-- ---------------------------------------------------------------
-- Two call sites held a wrong argument for as long as they did because the function accepted it
-- silently on every call that did not happen to reach the one line that dereferences it. A wrong
-- argument must be wrong on the FIRST call. `knob_resolve` now refuses a non-null, non-array
-- p_scopes up front with `22023` and a sentence naming what arrived, which knob was being resolved,
-- and the exact expression to pass instead (law 4: nothing fails silently).
--
-- THE CENSUS BEHIND "EVERY OTHER CALLER" (live catalog + four repos, 2026-09-13)
-- ------------------------------------------------------------------------------
-- 15 functions in this database call `platform.knob_resolve`, 18 call sites in total. Classified by
-- the p_scopes argument: 8 omit it, 7 pass a literal `null`/`NULL`, 1 already passes the correct
-- `jsonb_build_array(jsonb_build_object('kind', …, 'id', …))` (`platform._knob_override_write` —
-- the shape this file adopts), and 3 passed an object: the two in `_stamp_actor_tier` and the one in
-- `edit_kind_instance_value`, all three fixed here. Source: matrx-frontend
-- `lib/scoped-config/effectiveKnobs.ts` passes `[{kind:"device", id}]` (an array) and
-- `scripts/hr/continued_access_render_walk.py` passes null; aidream's two trial scripts pass null or
-- a JSON array; matrx-local and matrx-extend never call it. Standing guard:
-- `pnpm check:knob-resolve-callers` re-measures both halves and fails on any non-array literal.
--
-- WHAT THIS FILE DOES
--   1. `platform.knob_resolve` — the up-front refusal. SECURITY INVOKER, STABLE and its grants are
--      unchanged (CREATE OR REPLACE keeps the ACL; asserted below, including the anon EXECUTE that
--      `platform_feature_knob_anon_contract_dd168.sql` installed).
--   2. `platform._stamp_actor_tier` — both calls pass
--      `jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))`. Body otherwise
--      byte-identical to the live DD-184 version (direct field assignment kept — DD-184's guard
--      `pnpm check:stale-rowtype-triggers` still passes). Stays SECURITY INVOKER (db-rules §6d).
--   3. `content_ir.edit_kind_instance_value` — names the rung it actually stands on, derived from
--      the registry (`platform._confirmation_admission('content_ir.kind_instance')`) rather than a
--      constant, and passes NULL when the table is not admitted. Stays SECURITY INVOKER.
--   4. Forcing assertions, below, all self-cleaning: the refusal fires for an object and for
--      `'{}'::jsonb`; an array still resolves; a table-rung override now makes an AI insert BORN
--      CONFIRMED while a sibling table's id resolves to unconfirmed; the org and user rungs are
--      unchanged; the edit door honours a table-rung `confirm_on_human_edit=false` and confirms
--      again once it is removed; the carrier is still attached to every table it was attached to
--      (DD-176's coverage). Every probe row is deleted by name in the same transaction and the file
--      asserts 0 left.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION platform.knob_resolve(p_feature text, p_key text, p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_scopes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'platform', 'public'
AS $function$
declare
  k record;
  v jsonb;
  v_num numeric;
begin
  -- ═══ DD-198: p_scopes is an ARRAY of rungs, or it is nothing ═══════════════
  -- This check is FIRST, before the register lookup, because the only other place
  -- p_scopes is ever touched is `jsonb_array_elements(p_scopes)` inside the
  -- candidate-override EXISTS below -- and that is reached only once an override
  -- row exists at a row-keyed rung. A caller passing an OBJECT therefore ran
  -- green for as long as nobody had created such an override, and raised
  -- `cannot extract elements from an object` on the first person who did
  -- (`platform._stamp_actor_tier`, every AI/code insert in that organization).
  -- A wrong argument must be wrong on the FIRST call, not on the first call that
  -- happens to reach the line that dereferences it.
  if p_scopes is not null and jsonb_typeof(p_scopes) <> 'array' then
    raise exception
      'platform.knob_resolve: p_scopes must be a JSON ARRAY of rungs this read is standing on, each {"kind": <rung>, "id": <uuid>} -- it arrived as a %, resolving %.%. An object such as jsonb_build_object(''table'', <id>) or ''{}''::jsonb names no rung at all, so every row-keyed override would be silently unreachable.',
      jsonb_typeof(p_scopes), p_feature, p_key
      using errcode = '22023',
            hint = 'Pass jsonb_build_array(jsonb_build_object(''kind'', ''table'', ''id'', <uuid>)), or NULL when this read stands on no row-keyed rung.';
  end if;
  select value_type, coalesce(value, default_value) as base,
         min_value, max_value, allowed_values, overridable_by
    into k
    from platform.feature_knob
   where feature = p_feature and key = p_key;
  if not found then
    raise exception 'platform.knob_resolve: knob %.% is not seeded', p_feature, p_key
      using errcode = 'P0001',
            hint = 'A missing knob raises rather than falling back to a hard-coded value. Seed it in the knob register.';
  end if;

  if p_organization_id is not null and k.overridable_by <> '{}'::text[] then
    select o.value into v
      from platform.knob_override o
      join platform.knob_scope_kind s on s.kind = o.scope_kind
     where o.feature = p_feature and o.key = p_key
       and o.organization_id = p_organization_id
       and o.scope_kind = any (k.overridable_by)
       and not exists (select 1 from platform.knob_rung_lock l
                        where l.feature = o.feature and l.key = o.key
                          and l.organization_id = o.organization_id
                          and o.scope_kind = any (l.locked_kinds)
                        and not (o.scope_kind = 'user' and 'user' = any (k.overridable_by)))
       and (   (o.scope_kind = 'organization')
            or (o.scope_kind = 'user' and p_user_id is not null and o.scope_id = p_user_id)
            or (p_scopes is not null and exists (
                  select 1 from jsonb_array_elements(p_scopes) e
                   where e ->> 'kind' = o.scope_kind
                     and (e ->> 'id')::uuid = o.scope_id)))
     order by s.precedence desc
     limit 1;
  end if;

  if v is null then
    return k.base;
  end if;

  if k.value_type in ('number','integer') and jsonb_typeof(v) = 'number' then
    v_num := (v #>> '{}')::numeric;
    if k.min_value is not null and v_num < k.min_value then
      raise warning 'knob_resolve: %.% override % below current min % — clamped',
        p_feature, p_key, v_num, k.min_value;
      return to_jsonb(k.min_value);
    end if;
    if k.max_value is not null and v_num > k.max_value then
      raise warning 'knob_resolve: %.% override % above current max % — clamped',
        p_feature, p_key, v_num, k.max_value;
      return to_jsonb(k.max_value);
    end if;
  elsif k.value_type in ('enum','string') and k.allowed_values is not null
        and not (k.allowed_values @> jsonb_build_array(v)) then
    raise warning 'knob_resolve: %.% override % no longer in allowed_values — using platform value',
      p_feature, p_key, v;
    return k.base;
  end if;

  return v;
end;
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
        IF  COALESCE((platform.knob_resolve('records', 'confirmation.agent_write_born_confirmed',
                        org, NULL, jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))))::text::boolean, false)
        AND COALESCE((platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                        org, NULL, jsonb_build_array(jsonb_build_object('kind', 'table', 'id', table_scope_id))))::text::boolean, false)
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

CREATE OR REPLACE FUNCTION content_ir.edit_kind_instance_value(p_id uuid, p_key text, p_value jsonb)
 RETURNS TABLE(id uuid, data jsonb, confirmation text, confirmed_by uuid, confirmed_at timestamp with time zone, confirmed_by_this_edit boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
  actor       uuid := coalesce(nullif(current_setting('app.user_id', true), '')::uuid, auth.uid());
  row_org     uuid;
  was_unconf  boolean;
  kd          record;
  title_key   text;
  do_confirm  boolean;
  tbl_scope   uuid;
BEGIN
  SELECT k.organization_id, (k.confirmation = 'unconfirmed')
    INTO row_org, was_unconf
    FROM content_ir.kind_instance k WHERE k.id = p_id AND k.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That record does not exist, or it has been deleted.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT iam.has_access('content_ir_kind_instance', p_id, 'editor'::public.permission_level) THEN
    RAISE EXCEPTION 'You need edit access to change a value on this record. Nothing changed.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The key must be one the kind actually declares. Writing an undeclared key would put data in a
  -- row that no column, no filter and no reader will ever see again -- silent loss wearing a
  -- success message.
  SELECT d.emitted_json_schema -> 'properties' ? p_key AS known,
         d.metadata ->> 'title_key' AS tkey
    INTO kd
    FROM content_ir.kind_definition d
    JOIN content_ir.kind_instance k ON k.kind_definition_id = d.id
   WHERE k.id = p_id;
  IF kd.known IS NOT TRUE THEN
    RAISE EXCEPTION 'This shape has no field called "%". Add it to the shape first, or edit one of the fields it declares.', p_key
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  title_key := kd.tkey;

  -- Knob 3, default ON, overridable at organization and table (REVIEW-FLAG-DESIGN §4.2 key 3).
  -- DD-198: the rung this read stands on is THIS table, named the way knob_resolve
  -- reads it -- an ARRAY of {kind, id}. It used to pass '{}'::jsonb, an OBJECT, which
  -- named no rung and raised `cannot extract elements from an object` the moment any
  -- table-rung override on this key existed.
  tbl_scope := platform._confirmation_admission('content_ir.kind_instance'::regclass);
  do_confirm := was_unconf
    AND coalesce((platform.knob_resolve('records', 'confirmation.confirm_on_human_edit',
                    row_org, actor,
                    CASE WHEN tbl_scope IS NULL THEN NULL
                         ELSE jsonb_build_array(jsonb_build_object('kind', 'table', 'id', tbl_scope)) END
                  ))::text::boolean, true);

  RETURN QUERY
  UPDATE content_ir.kind_instance k
     SET data  = jsonb_set(k.data, ARRAY[p_key], p_value, true),
         title = CASE WHEN title_key IS NOT NULL AND p_key = title_key
                      THEN coalesce(p_value #>> '{}', k.title) ELSE k.title END,
         confirmation = CASE WHEN do_confirm THEN 'confirmed'::platform.confirmation ELSE k.confirmation END,
         confirmed_by = CASE WHEN do_confirm THEN actor ELSE k.confirmed_by END,
         confirmed_at = CASE WHEN do_confirm THEN now() ELSE k.confirmed_at END
   WHERE k.id = p_id
  RETURNING k.id, k.data, k.confirmation::text, k.confirmed_by, k.confirmed_at, do_confirm;
END
$function$
;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- FORCING ASSERTIONS — every one of them fails this migration, and every probe row is removed by
-- name in this same transaction.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
DO $dd198$
DECLARE
  v_org    uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace (disposable)
  v_admin  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_tbl    uuid;                                             -- content_ir.kind_instance's registry id
  v_other  uuid;                                             -- any OTHER registered table
  v_kind   uuid;
  v_ver    int;
  v_row    uuid;
  v_conf   text;
  v_raised boolean;
  v_val    jsonb;
  v_n      bigint;
  v_carrier bigint;
  v_carrier_after bigint;
BEGIN
  -- ── 0. The carrier's reach BEFORE anything is replaced (DD-176). ──────────────────────────────
  SELECT count(*) INTO v_carrier
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform' AND p.proname = '_stamp_actor_tier' AND NOT t.tgisinternal;
  IF v_carrier = 0 THEN
    RAISE EXCEPTION 'dd198: the provenance carrier _stamp_actor_tier is attached to NO table — the baseline this file preserves does not exist. Refusing to proceed.';
  END IF;

  SELECT et.id INTO v_tbl FROM platform.entity_types et
   WHERE et.schema_name = 'content_ir' AND et.table_name = 'kind_instance' AND et.confirmation_enabled;
  IF v_tbl IS NULL THEN
    RAISE EXCEPTION 'dd198: content_ir.kind_instance is not an admitted confirmation table, so the born-confirmed path cannot be proven here. Refusing a migration that installs an unproven fix.';
  END IF;
  SELECT et.id INTO v_other FROM platform.entity_types et WHERE et.id <> v_tbl AND et.is_active LIMIT 1;

  -- ── 1. RED-shaped inputs are now refused UP FRONT, with a sentence. ───────────────────────────
  v_raised := false;
  BEGIN
    PERFORM platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed', v_org, NULL,
                                  jsonb_build_object('table', v_tbl));
  EXCEPTION WHEN sqlstate '22023' THEN v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'dd198: knob_resolve accepted an OBJECT as p_scopes. The guard did not install.';
  END IF;

  v_raised := false;
  BEGIN
    PERFORM platform.knob_resolve('records', 'confirmation.confirm_on_human_edit', v_org, NULL, '{}'::jsonb);
  EXCEPTION WHEN sqlstate '22023' THEN v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'dd198: knob_resolve accepted ''{}''::jsonb as p_scopes. The guard did not install.';
  END IF;

  v_raised := false;
  BEGIN
    PERFORM platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed', v_org, NULL, '"table"'::jsonb);
  EXCEPTION WHEN sqlstate '22023' THEN v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'dd198: knob_resolve accepted a jsonb STRING as p_scopes. The guard only covers objects.';
  END IF;

  -- …and NULL and an ARRAY still work, with no override in play (the whole world's calls).
  IF platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed', v_org, NULL, NULL) <> 'false'::jsonb THEN
    RAISE EXCEPTION 'dd198: the base value of table_allows_born_confirmed changed under a NULL p_scopes.';
  END IF;
  IF platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed', v_org, NULL,
       jsonb_build_array(jsonb_build_object('kind', 'table', 'id', v_tbl))) <> 'false'::jsonb THEN
    RAISE EXCEPTION 'dd198: an ARRAY p_scopes with no override no longer resolves to the base value.';
  END IF;

  -- ── 2. GREEN: a table-rung override now REACHES the carrier. ──────────────────────────────────
  IF EXISTS (SELECT 1 FROM platform.knob_override WHERE feature = 'records' AND organization_id = v_org) THEN
    RAISE EXCEPTION 'dd198: % already holds records overrides. This probe would not be reversible; refusing.', v_org;
  END IF;

  SELECT ki.kind_definition_id, ki.kind_version INTO v_kind, v_ver
    FROM content_ir.kind_instance ki WHERE ki.organization_id = v_org AND ki.deleted_at IS NULL LIMIT 1;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'dd198: no kind_instance row exists in % to borrow a kind definition from; the born-confirmed proof cannot run.', v_org;
  END IF;

  PERFORM set_config('app.actor_tier', 'ai', true);
  PERFORM set_config('app.actor_system', 'dd198_migration_assertion', true);
  PERFORM set_config('app.user_id', v_admin::text, true);

  INSERT INTO platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  VALUES ('records', 'confirmation.agent_write_born_confirmed', 'organization', v_org, v_org, 'true'::jsonb, 'dd198 assertion'),
         ('records', 'confirmation.table_allows_born_confirmed', 'table',        v_tbl, v_org, 'true'::jsonb, 'dd198 assertion');

  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title, organization_id)
  VALUES (v_kind, v_ver, '{}'::jsonb, 'dd198 assertion — born confirmed', v_org)
  RETURNING id, confirmation::text INTO v_row, v_conf;
  IF v_conf <> 'confirmed' THEN
    RAISE EXCEPTION 'dd198: with both rungs saying yes, an AI insert was born % — the table rung is still not reaching the carrier.', v_conf;
  END IF;
  DELETE FROM content_ir.kind_instance WHERE id = v_row;

  -- The SIBLING table: the same org, the same knob, an override that names a DIFFERENT table.
  UPDATE platform.knob_override SET scope_id = v_other
   WHERE feature = 'records' AND key = 'confirmation.table_allows_born_confirmed' AND organization_id = v_org;
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title, organization_id)
  VALUES (v_kind, v_ver, '{}'::jsonb, 'dd198 assertion — sibling table', v_org)
  RETURNING id, confirmation::text INTO v_row, v_conf;
  IF v_conf <> 'unconfirmed' THEN
    RAISE EXCEPTION 'dd198: an override naming ANOTHER table (%) made THIS table''s AI insert % — the scope is not being honoured per row.', v_other, v_conf;
  END IF;
  DELETE FROM content_ir.kind_instance WHERE id = v_row;

  -- The ORGANIZATION rung, unchanged: turn table_allows_born_confirmed on for the whole org.
  DELETE FROM platform.knob_override
   WHERE feature = 'records' AND key = 'confirmation.table_allows_born_confirmed' AND organization_id = v_org;
  INSERT INTO platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  VALUES ('records', 'confirmation.table_allows_born_confirmed', 'organization', v_org, v_org, 'true'::jsonb, 'dd198 assertion');
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title, organization_id)
  VALUES (v_kind, v_ver, '{}'::jsonb, 'dd198 assertion — org rung', v_org)
  RETURNING id, confirmation::text INTO v_row, v_conf;
  IF v_conf <> 'confirmed' THEN
    RAISE EXCEPTION 'dd198: the ORGANIZATION rung stopped working — an AI insert with the org override on was born %.', v_conf;
  END IF;
  DELETE FROM content_ir.kind_instance WHERE id = v_row;

  -- The USER rung, unchanged: list_hides_unconfirmed is the one records knob with a user rung.
  INSERT INTO platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  VALUES ('records', 'confirmation.list_hides_unconfirmed', 'user', v_admin, v_org, 'true'::jsonb, 'dd198 assertion');
  v_val := platform.knob_resolve('records', 'confirmation.list_hides_unconfirmed', v_org, v_admin, NULL);
  IF v_val <> 'true'::jsonb THEN
    RAISE EXCEPTION 'dd198: the USER rung stopped working — list_hides_unconfirmed resolved % for the person who set it.', v_val;
  END IF;
  v_val := platform.knob_resolve('records', 'confirmation.list_hides_unconfirmed', v_org, NULL, NULL);
  IF v_val <> 'false'::jsonb THEN
    RAISE EXCEPTION 'dd198: another person inherited a USER-rung override (resolved %).', v_val;
  END IF;

  DELETE FROM platform.knob_override WHERE feature = 'records' AND organization_id = v_org;

  -- ── 3. GREEN: the edit door reaches a table-rung confirm_on_human_edit. ───────────────────────
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  INSERT INTO content_ir.kind_instance (kind_definition_id, kind_version, data, title, organization_id)
  VALUES (v_kind, v_ver, '{}'::jsonb, 'dd198 assertion — edit door', v_org)
  RETURNING id INTO v_row;

  INSERT INTO platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  VALUES ('records', 'confirmation.confirm_on_human_edit', 'table', v_tbl, v_org, 'false'::jsonb, 'dd198 assertion');
  SELECT e.confirmation INTO v_conf
    FROM content_ir.edit_kind_instance_value(v_row, (SELECT jsonb_object_keys(d.emitted_json_schema -> 'properties')
                                                       FROM content_ir.kind_definition d WHERE d.id = v_kind
                                                      ORDER BY 1 LIMIT 1), '"dd198"'::jsonb) e;
  IF v_conf <> 'unconfirmed' THEN
    RAISE EXCEPTION 'dd198: a table-rung confirm_on_human_edit=false did not reach the edit door — the row became %.', v_conf;
  END IF;

  DELETE FROM platform.knob_override WHERE feature = 'records' AND organization_id = v_org;
  SELECT e.confirmation INTO v_conf
    FROM content_ir.edit_kind_instance_value(v_row, (SELECT jsonb_object_keys(d.emitted_json_schema -> 'properties')
                                                       FROM content_ir.kind_definition d WHERE d.id = v_kind
                                                      ORDER BY 1 LIMIT 1), '"dd198b"'::jsonb) e;
  IF v_conf <> 'confirmed' THEN
    RAISE EXCEPTION 'dd198: with the override removed, a human edit no longer confirms (row is %).', v_conf;
  END IF;
  DELETE FROM content_ir.kind_instance WHERE id = v_row;

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.actor_tier', '', true);
  PERFORM set_config('app.actor_system', '', true);
  PERFORM set_config('app.user_id', '', true);

  -- ── 4. NOTHING LEFT BEHIND. ───────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM platform.knob_override WHERE feature = 'records' AND organization_id = v_org;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'dd198: % probe override row(s) survived the assertions.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM content_ir.kind_instance WHERE title LIKE 'dd198 assertion%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'dd198: % probe record(s) survived the assertions.', v_n;
  END IF;

  -- ── 5. The carrier still reaches every table it reached (DD-176). ─────────────────────────────
  SELECT count(*) INTO v_carrier_after
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform' AND p.proname = '_stamp_actor_tier' AND NOT t.tgisinternal;
  IF v_carrier_after <> v_carrier THEN
    RAISE EXCEPTION 'dd198: the carrier went from % attachments to %.', v_carrier, v_carrier_after;
  END IF;

  -- ── 6. The three functions stayed SECURITY INVOKER, and knob_resolve kept its grants. ─────────
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE ((n.nspname, p.proname) IN (('platform', 'knob_resolve'), ('platform', '_stamp_actor_tier'))
                     OR (n.nspname, p.proname) = ('content_ir', 'edit_kind_instance_value'))
                AND p.prosecdef) THEN
    RAISE EXCEPTION 'dd198: one of the three replaced functions came back SECURITY DEFINER (db-rules §6d).';
  END IF;
  FOR v_conf IN SELECT r FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r LOOP
    IF NOT has_function_privilege(v_conf, 'platform.knob_resolve(text, text, uuid, uuid, jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION 'dd198: CREATE OR REPLACE dropped EXECUTE on platform.knob_resolve for %. The anon read contract (DD-168) is broken.', v_conf;
    END IF;
  END LOOP;

  RAISE NOTICE 'dd198: guard installed; % carrier attachments preserved; 0 probe rows left.', v_carrier_after;
END
$dd198$;

COMMENT ON FUNCTION platform.knob_resolve(text, text, uuid, uuid, jsonb) IS
  'Resolve one knob for (organization, user, scopes). p_scopes is a JSON ARRAY of {"kind","id"} rungs this read stands on, or NULL — anything else is refused up front with 22023 (DD-198). SECURITY INVOKER: a caller resolves only what its own RLS lets it see.';
