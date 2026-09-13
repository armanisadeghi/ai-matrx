-- =============================================================================
-- DD-184 — platform._touch_row() and platform._stamp_actor_tier() must never
-- write a column list older than the table they are attached to.
--
-- THE DEFECT (B-65 found it; reproduced here on a scratch table AND on a real
-- live table before this file changes anything)
-- -----------------------------------------------------------------------------
-- Both functions rebuilt the trigger row with `jsonb_populate_record(NEW, patch)`.
-- `jsonb_populate_record` resolves the composite shape of its base argument ONCE
-- and caches that TupleDesc in the call site's `fn_extra` for the life of the
-- plan.  The cache is keyed by the row type's OID and typmod — and `ALTER TABLE
-- ... ADD COLUMN` changes NEITHER.  So once the trigger has fired on a table in a
-- transaction, every later firing in that SAME transaction rebuilds the row from
-- the shape the table had at the first firing: a column added in between is
-- dropped from the rebuilt record and lands as NULL.  No error, no warning.
--
-- Measured on the live database on 2026-09-13, in rolled-back transactions:
--   * scratch table, INSERT (trigger fires) -> ADD COLUMN later_col -> UPDATE SET
--     later_col = 1  ->  later_col IS NULL on 2 of 2 rows.
--   * inside the trigger, `to_jsonb(NEW)` BEFORE the populate call reads
--     {"later_col": 5, ...} and AFTER it reads {"later_col": null, ...} — the
--     value is destroyed by the rebuild itself, not by the caller.
--   * real table `ops.proof_check`: ONE add+update pair is fine (the trigger's
--     first firing caches the CURRENT shape); a SECOND add+update pair in the
--     same transaction lost the value on 4 of 4 rows.
--   * `to_jsonb(NEW)` and direct field assignment (`NEW.updated_at := now()`)
--     are both immune — they use the tuple's own descriptor every time.
--   * the staleness does NOT survive the transaction (proved over a session-mode
--     connection: ADD COLUMN in its own transaction, UPDATE in the next, value
--     preserved), so the blast radius is exactly "one transaction that both adds
--     a column and writes rows of that table" — i.e. migrations, which
--     `pnpm db:apply` deliberately runs as ONE transaction.
--
-- It was introduced on 2026-07-15 by `ai_050_anthropic_cache_cost_accuracy.sql`,
-- which replaced direct field assignment with the jsonb rebuild to stop
-- `NEW.version := ...` raising on row types that carry no `version` field.  That
-- problem is real, and this file keeps it fixed: a plpgsql *record* field
-- reference is resolved when the statement executes, so a field assignment that
-- sits inside an `IF ... THEN` branch that is not taken never resolves and never
-- raises.  Both shapes are proven below on tables that lack the columns.
--
-- THE CLASS.  Every trigger function in the database whose body rebuilds its
-- return row through `*_populate_record` was censused (2026-09-13):
--   * platform._touch_row        — 679 triggers — FIXED HERE
--   * platform._stamp_actor_tier — 576 triggers — FIXED HERE (same rebuild, same
--                                  loss; it writes the actor-tier and
--                                  confirmation columns)
--   * web.validate_cross_pointers — 11 triggers — NOT a member: it populates a
--                                  LOCAL %ROWTYPE variable to READ pointer
--                                  columns and returns NEW untouched, so it can
--                                  never write a stale column list.  Left alone.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RED — reproduce the loss with the CURRENT bodies, before replacing them.
--
--    The proof runs against COPIES of the shipped bodies in a throwaway schema:
--    the real functions are never weakened, not even for an instant, because
--    other lanes are writing to this database in this same minute.  The whole
--    block undoes itself: the inner BEGIN is a subtransaction that ends by
--    raising, so the scratch schema never exists after this statement.
-- -----------------------------------------------------------------------------
do $red$
declare v_touch int; v_tier text;
begin
  -- Every proof below writes rows through _stamp_actor_tier, which refuses an undeclared
  -- automated write (DD-131). Name this migration as the actor, for this transaction only.
  perform set_config('app.actor_system', 'dd184_migration_proof', true);
  begin
    execute 'create schema dd184_red';

    -- byte-for-byte the body this file is replacing
    execute $f$
      create function dd184_red.touch_old() returns trigger language plpgsql as $body$
      BEGIN
          IF to_jsonb(NEW) ? 'updated_at' THEN
              NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
          END IF;
          IF TG_OP = 'UPDATE' AND to_jsonb(NEW) ? 'version' THEN
              NEW := jsonb_populate_record(
                  NEW,
                  jsonb_build_object(
                      'version', COALESCE((to_jsonb(OLD)->>'version')::integer, 0) + 1
                  )
              );
          END IF;
          RETURN NEW;
      END
      $body$;
    $f$;

    execute 'create table dd184_red.t(id int primary key, updated_at timestamptz, version int default 1, seed text)';
    execute 'create trigger tg before insert or update on dd184_red.t for each row execute function dd184_red.touch_old()';
    execute 'insert into dd184_red.t(id, seed) values (1, ''r1'')';   -- first firing: shape cached
    execute 'alter table dd184_red.t add column later_col int';
    execute 'update dd184_red.t set later_col = 5';
    execute 'select later_col from dd184_red.t where id = 1' into v_touch;

    if v_touch is not null then
      raise exception
        'DD-184 RED did not reproduce on platform._touch_row''s current body: later_col came back as %, expected NULL. The premise of this migration is wrong — stop and re-diagnose.', v_touch;
    end if;

    -- the same rebuild in _stamp_actor_tier: a table carrying updated_by_tier
    execute 'create table dd184_red.s(id int primary key, updated_by_tier text, updated_by_system text, seed text)';
    execute 'create trigger tg before insert or update on dd184_red.s for each row execute function platform._stamp_actor_tier()';
    execute 'insert into dd184_red.s(id, seed) values (1, ''r1'')';
    execute 'alter table dd184_red.s add column later_col text';
    execute 'update dd184_red.s set later_col = ''kept''';
    execute 'select later_col from dd184_red.s where id = 1' into v_tier;

    if v_tier is not null then
      raise exception
        'DD-184 RED did not reproduce on platform._stamp_actor_tier: later_col came back as %, expected NULL. Stop and re-diagnose.', v_tier;
    end if;

    raise exception using errcode = 'DD184', message = 'red-ok';
  exception
    when sqlstate 'DD184' then
      raise notice 'DD-184 RED proven on BOTH functions: a column added after the trigger''s first firing in the transaction came back NULL (touch_row and stamp_actor_tier). Scratch schema rolled back.';
  end;
end
$red$;

-- -----------------------------------------------------------------------------
-- 2. THE FIX — direct field assignment, guarded by the row's OWN shape.
--
--    `to_jsonb(NEW)` is read once per row and is always current (proven above),
--    so it stays as the shape test.  What changes is how the value is WRITTEN:
--    a plpgsql field assignment mutates the tuple in place and cannot drop an
--    attribute it does not know about.
-- -----------------------------------------------------------------------------
create or replace function platform._touch_row()
returns trigger
language plpgsql
as $function$
DECLARE
    shape jsonb := to_jsonb(NEW);
BEGIN
    -- DD-184: NEVER `NEW := jsonb_populate_record(NEW, ...)` here.  That rebuilds the
    -- row from a TupleDesc cached at the first firing in this transaction, so a column
    -- added in between is silently written back as NULL.  Direct field assignment is
    -- resolved against the tuple itself, every time.
    IF shape ? 'updated_at' THEN
        NEW.updated_at := now();
    END IF;
    IF TG_OP = 'UPDATE' AND shape ? 'version' THEN
        -- A record field reference inside a branch that is not taken is never resolved,
        -- so this stays inert on the row types that carry no `version` (the reason
        -- ai_050 reached for jsonb_populate_record in the first place).
        NEW.version := COALESCE((to_jsonb(OLD) ->> 'version')::integer, 0) + 1;
    END IF;
    RETURN NEW;
END
$function$;

create or replace function platform._stamp_actor_tier()
returns trigger
language plpgsql
as $function$
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
                        org, NULL, jsonb_build_object('table', table_scope_id)))::text::boolean, false)
        AND COALESCE((platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                        org, NULL, jsonb_build_object('table', table_scope_id)))::text::boolean, false)
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

-- -----------------------------------------------------------------------------
-- 3. GREEN — the same scenarios, against the REAL functions this file just wrote.
--    Scratch schema again, self-rolling-back again.
-- -----------------------------------------------------------------------------
do $green$
declare
  v_later int; v_ver int; v_upd timestamptz; v_tier text; v_later_t text; v_conf text; v_failures text := '';
begin
  perform set_config('app.actor_system', 'dd184_migration_proof', true);
  begin
    execute 'create schema dd184_green';

    -- (a) _touch_row: the RED scenario, now expected to keep the value
    execute 'create table dd184_green.t(id int primary key, updated_at timestamptz, version int default 1, seed text)';
    execute 'create trigger tg before insert or update on dd184_green.t for each row execute function platform._touch_row()';
    execute 'insert into dd184_green.t(id, seed) values (1, ''r1'')';
    execute 'alter table dd184_green.t add column later_col int';
    execute 'update dd184_green.t set later_col = 5';
    execute 'select later_col, version, updated_at from dd184_green.t where id = 1' into v_later, v_ver, v_upd;
    if v_later is distinct from 5 then v_failures := v_failures || E'\n  _touch_row still drops a column added in the same transaction (later_col = ' || coalesce(v_later::text,'NULL') || ')'; end if;
    if v_ver is distinct from 2 then v_failures := v_failures || E'\n  _touch_row stopped bumping version (got ' || coalesce(v_ver::text,'NULL') || ', expected 2)'; end if;
    if v_upd is null then v_failures := v_failures || E'\n  _touch_row stopped stamping updated_at'; end if;

    -- (b) _touch_row on a row type with NEITHER updated_at NOR version: must stay inert,
    --     never raise.  This is the failure ai_050 was written to stop, and it is the only
    --     reason the jsonb rebuild was there.
    execute 'create table dd184_green.bare(id int primary key, seed text)';
    execute 'create trigger tg before insert or update on dd184_green.bare for each row execute function platform._touch_row()';
    execute 'insert into dd184_green.bare(id, seed) values (1, ''r1'')';
    execute 'update dd184_green.bare set seed = ''r2''';

    -- (c) _touch_row on a row type with updated_at but NO version (the chat.request shape)
    execute 'create table dd184_green.noversion(id int primary key, updated_at timestamptz, seed text)';
    execute 'create trigger tg before insert or update on dd184_green.noversion for each row execute function platform._touch_row()';
    execute 'insert into dd184_green.noversion(id, seed) values (1, ''r1'')';
    execute 'update dd184_green.noversion set seed = ''r2''';
    execute 'select updated_at from dd184_green.noversion where id = 1' into v_upd;
    if v_upd is null then v_failures := v_failures || E'\n  _touch_row stopped stamping updated_at on a versionless table'; end if;

    -- (d) _stamp_actor_tier: the RED scenario, now expected to keep the value, and still stamp
    execute 'create table dd184_green.s(id int primary key, updated_by_tier text, updated_by_system text, seed text)';
    execute 'create trigger tg before insert or update on dd184_green.s for each row execute function platform._stamp_actor_tier()';
    execute 'insert into dd184_green.s(id, seed) values (1, ''r1'')';
    execute 'alter table dd184_green.s add column later_col text';
    execute 'update dd184_green.s set later_col = ''kept''';
    execute 'select later_col, updated_by_tier from dd184_green.s where id = 1' into v_later_t, v_tier;
    if v_later_t is distinct from 'kept' then v_failures := v_failures || E'\n  _stamp_actor_tier still drops a column added in the same transaction (later_col = ' || coalesce(v_later_t,'NULL') || ')'; end if;
    if v_tier is null then v_failures := v_failures || E'\n  _stamp_actor_tier stopped writing updated_by_tier'; end if;

    -- (e) _stamp_actor_tier on a table carrying updated_by_tier but NO updated_by_system:
    --     the old jsonb rebuild ignored the absent key; the new direct assignment must too.
    execute 'create table dd184_green.tier_only(id int primary key, updated_by_tier text, seed text)';
    execute 'create trigger tg before insert or update on dd184_green.tier_only for each row execute function platform._stamp_actor_tier()';
    execute 'insert into dd184_green.tier_only(id, seed) values (1, ''r1'')';
    execute 'select updated_by_tier from dd184_green.tier_only where id = 1' into v_tier;
    if v_tier is null then v_failures := v_failures || E'\n  _stamp_actor_tier stopped writing updated_by_tier when updated_by_system is absent'; end if;

    -- (f) the ENUM confirmation column (content_ir.kind_instance's shape): text -> enum must
    --     survive the change from jsonb_populate_record to direct assignment.
    execute 'create table dd184_green.conf(id int primary key, created_by_tier text, created_by_system text, confirmation platform.confirmation, confirmed_by uuid, confirmed_at timestamptz, seed text)';
    execute 'create trigger tg before insert or update on dd184_green.conf for each row execute function platform._stamp_actor_tier()';
    execute 'insert into dd184_green.conf(id, seed) values (1, ''r1'')';
    execute 'select confirmation::text from dd184_green.conf where id = 1' into v_conf;
    if v_conf is null then v_failures := v_failures || E'\n  _stamp_actor_tier stopped writing the confirmation enum'; end if;

    if v_failures <> '' then
      raise exception 'DD-184 GREEN FAILED:%', v_failures;
    end if;

    raise exception using errcode = 'DD184', message = 'green-ok';
  exception
    when sqlstate 'DD184' then
      raise notice 'DD-184 GREEN proven on scratch tables: both functions keep a column added mid-transaction, still stamp updated_at / version / updated_by_tier / confirmation, and stay inert on row types that lack those columns.';
  end;
end
$green$;

-- -----------------------------------------------------------------------------
-- 4. GREEN on a REAL live table, in a subtransaction that undoes itself.
--
--    `ops.proof_check` carries BOTH triggers and a handful of rows.  Two add+update
--    pairs in one transaction is the exact shape that lost 4 of 4 rows before this
--    file; the ADD COLUMNs are metadata-only and the block releases the lock the
--    moment it rolls back.
-- -----------------------------------------------------------------------------
do $real$
declare filled bigint; total bigint; failures text := '';
begin
  perform set_config('app.actor_system', 'dd184_migration_proof', true);
  begin
    set local lock_timeout = '15s';

    execute 'alter table ops.proof_check add column dd184_probe_a int';
    execute 'update ops.proof_check set dd184_probe_a = 1';
    execute 'select count(*) filter (where dd184_probe_a = 1), count(*) from ops.proof_check' into filled, total;
    if filled <> total then
      failures := failures || format(E'\n  first add+update pair: %s of %s rows kept the value', filled, total);
    end if;

    execute 'alter table ops.proof_check add column dd184_probe_b int';
    execute 'update ops.proof_check set dd184_probe_b = 2';
    execute 'select count(*) filter (where dd184_probe_b = 2), count(*) from ops.proof_check' into filled, total;
    if filled <> total then
      failures := failures || format(E'\n  SECOND add+update pair in the same transaction: %s of %s rows kept the value (this is the DD-184 defect)', filled, total);
    end if;

    if failures <> '' then
      raise exception 'DD-184 REAL-TABLE GREEN FAILED on ops.proof_check:%', failures;
    end if;

    raise exception using errcode = 'DD184', message = 'real-ok';
  exception
    when sqlstate 'DD184' then
      raise notice 'DD-184 GREEN proven on the live table ops.proof_check: TWO add+update pairs in one transaction, every row kept both values. Both probe columns rolled back.';
  end;
end
$real$;

-- -----------------------------------------------------------------------------
-- 5. THE GUARD — a standing check, so the class cannot come back through a third
--    trigger function.  Any trigger function that rebuilds its return row through
--    *_populate_record must declare itself here with a reason, or this fails.
-- -----------------------------------------------------------------------------
create or replace function platform.assert_no_stale_rowtype_triggers()
returns table (trigger_function text, trigger_count bigint, verdict text)
language sql
stable
as $function$
  -- A trigger function is a MEMBER of the DD-184 class when it ASSIGNS TO or RETURNS
  -- a *_populate_record(...) built from NEW/OLD: that rebuild uses a TupleDesc cached
  -- at the call site's first firing in the transaction, so a column added later in the
  -- same transaction is written back as NULL with no error.  Populating a LOCAL
  -- variable to READ from is not a member — it cannot write a stale column list.
  select (p.pronamespace::regnamespace)::text || '.' || p.proname,
         (select count(*) from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal),
         'MEMBER — rebuilds the trigger row from a cached rowtype; use direct field assignment (DD-184)'
    from pg_proc p
   where p.prorettype = 'trigger'::regtype
     -- Comments are part of prosrc, and this very file's fixed bodies NAME the banned
     -- construct in order to warn the next author off it. Strip line and block comments
     -- before matching, so the guard reads code and never prose.
     and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', ' ', 'gs'), '--[^\n]*', ' ', 'g')
         ~* '(^|[^a-z_])(new|old)\s*:=\s*(pg_catalog\.)?(jsonb|json)_populate_record|\mreturn\s+(pg_catalog\.)?(jsonb|json)_populate_record\s*\(\s*(new|old)\M'
   order by 2 desc, 1;
$function$;

comment on function platform.assert_no_stale_rowtype_triggers() is
  'DD-184 guard. Returns one row per trigger function that rebuilds NEW/OLD through jsonb_populate_record — the construct that silently NULLs a column added earlier in the same transaction. An empty result is the healthy state; anything returned is a data-loss defect. Called by matrx-frontend''s pnpm check:stale-rowtype-triggers.';

-- The guard proven RED on a planted offender, then GREEN on the real database.
do $guard$
declare offenders text; planted text;
begin
  begin
    execute 'create schema dd184_guard';
    execute $f$
      create function dd184_guard.offender() returns trigger language plpgsql as $body$
      BEGIN
        NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
        RETURN NEW;
      END
      $body$;
    $f$;
    select string_agg(trigger_function, ', ') into planted
      from platform.assert_no_stale_rowtype_triggers()
     where trigger_function = 'dd184_guard.offender';
    if planted is null then
      raise exception 'DD-184 guard does not detect a planted offender — it would never have caught the defect it exists for. Fix the guard before shipping it.';
    end if;
    raise exception using errcode = 'DD184', message = 'guard-red-ok';
  exception
    when sqlstate 'DD184' then
      raise notice 'DD-184 guard proven RED: a planted trigger function rebuilding NEW through jsonb_populate_record was reported by name. Scratch schema rolled back.';
  end;

  select string_agg(trigger_function || ' (' || trigger_count || ' triggers)', ', ')
    into offenders
    from platform.assert_no_stale_rowtype_triggers();
  if offenders is not null then
    raise exception
      'DD-184 guard is RED right after its own fix: % still rebuild the trigger row from a cached rowtype. Fix them with direct field assignment before this migration lands.', offenders;
  end if;
  raise notice 'DD-184 guard GREEN: no trigger function in this database rebuilds NEW/OLD through jsonb_populate_record.';
end
$guard$;
