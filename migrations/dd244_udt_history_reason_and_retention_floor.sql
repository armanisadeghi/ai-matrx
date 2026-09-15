-- DD-244 / G10 — the grid's live data-loss path.
--
-- R1-FEATURE-INVENTORY T3/T22/G10, THE-PLAN §9 D-1
-- (`common-docs/projects/data-doctrine-adoption/plan/`). What was live until this
-- file, re-verified by SELECT on 2026-09-14:
--
--   * `udt_change_field_type(..., 'cast_or_null')` — the DEFAULT strategy, and the
--     ONLY one the Table settings dialog ever sends — rewrote an un-castable cell
--     to JSON null and reported nothing but `rows_rewritten`. The original value
--     survived only as `prior_data` on the version row the row trigger happened to
--     write, with NO reason attached: nothing in the database, and nothing on any
--     screen, said a value had been set aside or why.
--     Data Doctrine Rule 3: *a Value that does not fit … goes to History with the
--     reason, and is neither coerced nor deleted.*
--
--   * `udt_dataset_row_versions_trim()` then deleted every version past the latest
--     two that was older than **14 days** — hardcoded, platform-wide, on the weekly
--     `udt_dataset_row_versions_trim_weekly` cron (Sundays 03:00 UTC).
--     Data Doctrine Rule 10 sets a floor of **30 days**, organization-configurable,
--     **raise-only**.
--
--   Together they are a real loss path, not a cutover note: two weeks after a
--   careless type change the original values were gone from the platform.
--
-- WHAT THIS FILE CHANGES — the class, not the instance:
--
--   1. `workbench.udt_dataset_row_versions.reason` — every version row can say WHY
--      it exists. `public.udt_log_row_version()` stamps it from the transaction-local
--      `matrx.udt_version_reason`, so any writer that sets a reason gets it recorded
--      through the ONE versioning trigger rather than a second insert path.
--
--   2. `public.udt_cast_jsonb_value(jsonb, field_data_type)` — the cast rules that
--      were inlined in the UPDATE, now one function, so "does this value fit?" and
--      "what does it become?" can never answer differently.
--
--   3. `public.udt_change_field_type` counts the values that do not fit, stamps
--      `type_change:<from>→<to>` for the rewrite, and then PROVES the history
--      landed: if fewer un-castable values reached `udt_dataset_row_versions` than
--      it is about to empty, it RAISES and the whole type change rolls back. A cell
--      is never emptied when its only copy would be lost. The result gains
--      `values_moved_to_history` so the dialog can say the number and the remedy.
--
--   4. The retention floor is a knob — `extensibility.user_tables.history_retention_floor_days`,
--      default 30, `raise_only`, organization-overridable (the knob write path
--      already refuses a lowering: `platform._knob_override_write`). The trim reads
--      it PER ORGANIZATION through `platform.knob_resolve`, and says so loudly with
--      a remedy if a resolved floor ever comes back below the platform's 30.
--
--   5. `public.udt_dataset_row_versions_trim_scoped(uuid, boolean)` carries the
--      logic and can be pointed at one table, so the guard
--      (`pnpm check:udt-history`) can measure the real trim on a throwaway table
--      instead of a copy of it. The zero-argument function the cron calls keeps its
--      signature and delegates — the cron command is untouched.
--
-- Guard: `scripts/check-udt-history-honesty.ts` (`pnpm check:udt-history`,
-- `pnpm check:udt-history:self-test`). Proven RED against the bodies below on
-- 2026-09-14 before this file was applied.
--
-- based-on: public.udt_log_row_version() c153b57d98a84a9700e1294ba65e36c4d447db90e82028ca976d2294daf1da72
-- based-on: public.udt_change_field_type(uuid, uuid, field_data_type, text) 872cce085348625d6f40dc47b4f0bfb44d3924e347a8b44df3e241618b1c94c4
-- based-on: public.udt_dataset_row_versions_trim() bda1ae70e0fa53318bb1e6cb04180ffa301bb103094dfee6228a36463688f6e0

-- ═══ 1. Why a version row exists ════════════════════════════════════════════

ALTER TABLE workbench.udt_dataset_row_versions
  ADD COLUMN IF NOT EXISTS reason text;

COMMENT ON COLUMN workbench.udt_dataset_row_versions.reason IS
  'Why this version exists, when the writer knew. `type_change:<from>→<to>` marks '
  'the version that holds a value a column type change could not keep. NULL means '
  'an ordinary edit — never "unknown cause". Stamped by public.udt_log_row_version() '
  'from the transaction-local GUC matrx.udt_version_reason (DD-244).';

-- ═══ 2. The retention floor is a knob, not a literal ════════════════════════
-- Rule 10: thirty days, organization-configurable, RAISE-ONLY. `override_direction`
-- = 'raise_only' + `bound_value` = 30 is what platform._knob_override_write reads to
-- refuse an organization that tries to keep LESS history than the platform floor;
-- `min_value` = 30 is the second belt, read by platform.knob_resolve.

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit,
   min_value, max_value, allowed_values, bound_value,
   overridable_by, override_direction, propagation, taxonomy_node_id,
   label, description, set_by, basis, review_due)
VALUES
  ('extensibility', 'user_tables.history_retention_floor_days',
   '30', '30', 'integer', 'days',
   30, 3650, NULL, '30',
   ARRAY['organization']::text[], 'raise_only', 'next_load',
   'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93',
   'How long a table row''s edit history is kept, at the least',
   'Every edit to a row in a user-defined table is kept in that row''s history. Beyond the two most recent versions, a version is deleted once it is older than this. Thirty days is the platform floor and an organization may only RAISE it, never lower it — the history is the only copy of a value a column type change could not keep, so a shorter window is a data-loss window. Raise it for organizations that must be able to look further back.',
   'agent',
   'Arman''s ruled floor (Data Doctrine Rule 10, 2026-09-10), replacing the 14-day literal that lived inside udt_dataset_row_versions_trim() (DD-244 / G10).',
   date '2026-12-15')
ON CONFLICT (feature, key) DO UPDATE
  SET default_value      = EXCLUDED.default_value,
      value              = EXCLUDED.value,
      min_value          = EXCLUDED.min_value,
      bound_value        = EXCLUDED.bound_value,
      overridable_by     = EXCLUDED.overridable_by,
      override_direction = EXCLUDED.override_direction,
      updated_at         = now();

-- ═══ 3. One definition of "does this value fit the new type?" ═══════════════
-- Returns SQL NULL when the value CANNOT become the new type. A jsonb `null`
-- input stays jsonb `null` (absent == null semantically; there is nothing to
-- preserve and nothing to report).

CREATE OR REPLACE FUNCTION public.udt_cast_jsonb_value(
  p_value jsonb,
  p_new_type public.field_data_type
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN 'null'::jsonb
    WHEN p_new_type = 'string' THEN to_jsonb(p_value #>> '{}')
    WHEN p_new_type IN ('number','integer') THEN
      CASE WHEN (p_value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
           THEN CASE WHEN p_new_type = 'integer'
                     THEN to_jsonb(floor((p_value #>> '{}')::numeric)::bigint)
                     ELSE to_jsonb((p_value #>> '{}')::numeric) END
           ELSE NULL END
    WHEN p_new_type = 'boolean' THEN
      CASE lower(p_value #>> '{}')
        WHEN 'true'  THEN to_jsonb(true)  WHEN '1' THEN to_jsonb(true)  WHEN 'yes' THEN to_jsonb(true)
        WHEN 'false' THEN to_jsonb(false) WHEN '0' THEN to_jsonb(false) WHEN 'no'  THEN to_jsonb(false)
        ELSE NULL END
    -- Every other declared type is stored as-is today; nothing is lost, so
    -- nothing needs a home in history.
    ELSE p_value
  END
$function$;

COMMENT ON FUNCTION public.udt_cast_jsonb_value(jsonb, public.field_data_type) IS
  'The ONE cast rule for a user-defined table cell. SQL NULL means the value does '
  'not fit the new type — udt_change_field_type uses the same answer to decide what '
  'to preserve and what to write, so "fits" and "becomes" can never disagree (DD-244).';

-- ═══ 4. The versioning trigger records the reason ═══════════════════════════

CREATE OR REPLACE FUNCTION public.udt_log_row_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID := auth.uid();  -- NULL for service_role / cron / admin tool writes
  -- Why this write is happening, when the writer knew. Transaction-local, set by
  -- udt_change_field_type; NULL for an ordinary edit (DD-244).
  v_reason TEXT := nullif(current_setting('matrx.udt_version_reason', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO workbench.udt_dataset_row_versions(row_id, table_id, data, prior_data, change_kind, changed_by, reason)
    VALUES (NEW.id, NEW.table_id, NEW.data, NULL, 'insert', v_actor, v_reason);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.data IS DISTINCT FROM OLD.data THEN
      INSERT INTO workbench.udt_dataset_row_versions(row_id, table_id, data, prior_data, change_kind, changed_by, reason)
      VALUES (NEW.id, NEW.table_id, NEW.data, OLD.data, 'update', v_actor, v_reason);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO workbench.udt_dataset_row_versions(row_id, table_id, data, prior_data, change_kind, changed_by, reason)
    VALUES (OLD.id, OLD.table_id, NULL, OLD.data, 'delete', v_actor, v_reason);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- ═══ 5. A type change never empties a cell whose only copy would be lost ════

CREATE OR REPLACE FUNCTION public.udt_change_field_type(
  p_table_id uuid,
  p_field_id uuid,
  p_new_type public.field_data_type,
  p_strategy text DEFAULT 'cast_or_null'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid(); v_dataset workbench.udt_datasets%ROWTYPE; v_field workbench.udt_dataset_fields%ROWTYPE;
  v_changed INTEGER := 0; v_total INTEGER := 0;
  v_unfit INTEGER := 0; v_preserved INTEGER := 0;
  v_reason TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'udt_change_field_type: not authenticated'; END IF;
  IF p_strategy NOT IN ('cast_or_null','cast_or_skip') THEN
    RAISE EXCEPTION 'udt_change_field_type: unknown strategy %', p_strategy;
  END IF;
  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_change_field_type: table % not found', p_table_id; END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_change_field_type: caller lacks editor permission';
  END IF;
  SELECT * INTO v_field FROM workbench.udt_dataset_fields WHERE id = p_field_id AND table_id = p_table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'udt_change_field_type: field % not in table %', p_field_id, p_table_id; END IF;

  SELECT COUNT(*) INTO v_total FROM workbench.udt_dataset_rows WHERE table_id = p_table_id;

  -- Data Doctrine Rule 3. Values that do NOT fit the new type: count them BEFORE
  -- anything is rewritten, so the proof below has a number to hold the history to.
  SELECT COUNT(*) INTO v_unfit
    FROM workbench.udt_dataset_rows r
   WHERE r.table_id = p_table_id
     AND r.data ? v_field.field_name
     AND jsonb_typeof(r.data -> v_field.field_name) <> 'null'
     AND public.udt_cast_jsonb_value(r.data -> v_field.field_name, p_new_type) IS NULL;

  v_reason := 'type_change:' || v_field.data_type::text || '→' || p_new_type::text;
  -- The ONE versioning path (udt_log_row_version) stamps this on every version row
  -- the rewrite produces, in this same transaction. Transaction-local: it cannot
  -- leak into another statement's writes.
  PERFORM set_config('matrx.udt_version_reason', v_reason, true);

  WITH updated AS (
    UPDATE workbench.udt_dataset_rows r
       SET data = jsonb_set(r.data, ARRAY[v_field.field_name],
             COALESCE(
               public.udt_cast_jsonb_value(r.data -> v_field.field_name, p_new_type),
               CASE p_strategy WHEN 'cast_or_null' THEN 'null'::jsonb
                               ELSE r.data -> v_field.field_name END
             ), true),
           updated_at = now()
     -- Only touch rows that actually have this field. Absent==null semantically;
     -- nothing to cast, no audit row to write, no realtime event to emit.
     WHERE r.table_id = p_table_id
       AND r.data ? v_field.field_name
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_changed FROM updated;

  PERFORM set_config('matrx.udt_version_reason', '', true);

  -- The proof. Every value this call is about to leave empty must be readable in
  -- the row's history, with the reason, in THIS transaction. `now()` is the
  -- transaction timestamp and the version row's default, so this counts only what
  -- this call wrote. Under 'cast_or_skip' nothing is emptied, so nothing is owed.
  IF p_strategy = 'cast_or_null' AND v_unfit > 0 THEN
    SELECT COUNT(*) INTO v_preserved
      FROM workbench.udt_dataset_row_versions v
     WHERE v.table_id = p_table_id
       AND v.reason = v_reason
       AND v.changed_at = now()
       AND v.prior_data ? v_field.field_name
       AND jsonb_typeof(v.prior_data -> v_field.field_name) <> 'null'
       AND public.udt_cast_jsonb_value(v.prior_data -> v_field.field_name, p_new_type) IS NULL;

    IF v_preserved < v_unfit THEN
      RAISE EXCEPTION
        'udt_change_field_type: % value(s) in "%" cannot become % and only % reached row history — refusing to empty a cell whose only copy would be lost. Nothing was changed.',
        v_unfit, v_field.field_name, p_new_type, v_preserved
        USING errcode = 'P0001',
              hint = 'The row-version trigger udt_dataset_rows_version_update on workbench.udt_dataset_rows is what preserves these values. Restore it (migrations/udt_v2_backbone.sql), or run the change with strategy ''cast_or_skip'', which leaves un-castable values in place.';
    END IF;
  END IF;

  UPDATE workbench.udt_dataset_fields SET data_type = p_new_type, updated_at = now() WHERE id = p_field_id;

  RETURN jsonb_build_object(
    'field_id',                 p_field_id,
    'new_type',                 p_new_type,
    'strategy',                 p_strategy,
    'rows_rewritten',           v_changed,
    'rows_skipped',             v_total - v_changed,
    'rows_total',               v_total,
    -- What the screen must say. Rule 3 + "a screen never lies": the caller emptied
    -- this many cells, and every one of them is in that row's history under
    -- `history_reason`, restorable from the row's history.
    'values_moved_to_history',  CASE WHEN p_strategy = 'cast_or_null' THEN v_unfit ELSE 0 END,
    'history_reason',           v_reason
  );
END;
$function$;

-- ═══ 6. The trim reads the floor per organization ══════════════════════════

CREATE OR REPLACE FUNCTION public.udt_dataset_row_versions_trim_scoped(
  p_table_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted bigint := 0;
  v_org_deleted bigint;
  v_started timestamptz := clock_timestamp();
  v_days integer;
  v_orgs integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT d.organization_id AS org
      FROM workbench.udt_datasets d
     WHERE (p_table_id IS NULL OR d.id = p_table_id)
  LOOP
    v_orgs := v_orgs + 1;
    v_days := (platform.knob_resolve('extensibility',
                                     'user_tables.history_retention_floor_days',
                                     r.org) #>> '{}')::integer;

    -- Nothing fails silently: the knob write path refuses a lowering and
    -- knob_resolve clamps at min_value, so this cannot normally happen — if it
    -- ever does, the trim says which organization and what it did instead of
    -- quietly deleting history under Arman's ruled floor.
    IF v_days IS NULL OR v_days < 30 THEN
      RAISE WARNING 'udt_dataset_row_versions_trim: organization % resolved a % day history floor, below the platform floor of 30 — keeping 30 days instead. Remedy: the floor is raise-only; clear that organization''s override of extensibility.user_tables.history_retention_floor_days with platform.knob_override_set(...,''organization'', <org>, <org>, NULL, ''below the ruled floor''), or raise the registry min_value deliberately.',
        r.org, v_days;
      v_days := 30;
    END IF;

    WITH ranked AS (
      SELECT v.id,
             ROW_NUMBER() OVER (PARTITION BY v.row_id ORDER BY v.changed_at DESC) AS recency_rank,
             (v.changed_at < (now() - make_interval(days => v_days))) AS past_the_floor
        FROM workbench.udt_dataset_row_versions v
        JOIN workbench.udt_datasets d ON d.id = v.table_id
       WHERE d.organization_id = r.org
         AND (p_table_id IS NULL OR d.id = p_table_id)
    ),
    to_delete AS (
      SELECT id FROM ranked WHERE recency_rank > 2 AND past_the_floor
    ),
    deleted AS (
      DELETE FROM workbench.udt_dataset_row_versions
       WHERE NOT p_dry_run AND id IN (SELECT id FROM to_delete)
      RETURNING 1
    )
    SELECT CASE WHEN p_dry_run THEN (SELECT COUNT(*) FROM to_delete)
                ELSE (SELECT COUNT(*) FROM deleted) END
      INTO v_org_deleted;

    v_deleted := v_deleted + COALESCE(v_org_deleted, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'function', 'udt_dataset_row_versions_trim_scoped',
    'policy', 'keep latest 2 OR within the organization''s extensibility.user_tables.history_retention_floor_days (platform floor 30)',
    'organizations', v_orgs,
    'table_id', p_table_id,
    'dry_run', p_dry_run,
    'rows_deleted', v_deleted,
    'duration_ms', EXTRACT(MILLISECOND FROM (clock_timestamp() - v_started))::int,
    'trimmed_at', now()
  );
END;
$function$;

-- The cron's entry point keeps its exact signature — `cron.job` 13,
-- `udt_dataset_row_versions_trim_weekly`, `SELECT public.udt_dataset_row_versions_trim();`
-- is untouched — and delegates. There is one policy, in one place.
CREATE OR REPLACE FUNCTION public.udt_dataset_row_versions_trim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.udt_dataset_row_versions_trim_scoped(NULL, false);
END;
$function$;

COMMENT ON FUNCTION public.udt_dataset_row_versions_trim_scoped(uuid, boolean) IS
  'Trims user-defined table row history: keeps the latest 2 versions of every row, '
  'plus everything newer than that organization''s retention floor '
  '(extensibility.user_tables.history_retention_floor_days, default 30 days, '
  'raise-only). p_table_id scopes it to one table so a guard can measure the real '
  'trim; p_dry_run counts without deleting. DD-244.';

REVOKE ALL ON FUNCTION public.udt_dataset_row_versions_trim_scoped(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.udt_cast_jsonb_value(jsonb, public.field_data_type) FROM PUBLIC;
