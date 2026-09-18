-- DD-260 / F1 — the row-history badge named the wrong "from" type.
--
-- V-113's independent verification of DD-244 (scratchpad reports/V-113.md, finding
-- F1) caught this on production, in a real browser: after changing a column from
-- Text to Integer the row-history badge read **"Column type changed
-- (integer→integer)"**, and the stored reason on
-- `workbench.udt_dataset_row_versions.reason` read `type_change:integer→integer`.
-- The value itself was preserved and restorable — this was a LABEL that lied on the
-- one screen DD-244 exists to make honest. A user, an auditor, or a future restore
-- tool reading `integer→integer` cannot tell what the value used to be.
--
-- ROOT CAUSE. `components/user-generated-table-data/TableConfigModal.tsx` wrote the
-- field's NEW metadata first (`update_user_table_config`, with `data_type` in
-- `p_field_updates`) and only then called `udt_change_field_type`. By then
-- `workbench.udt_dataset_fields.data_type` already held the NEW type, so the
-- function's `v_field.data_type::text || '→' || p_new_type::text` could only ever
-- produce `<new>→<new>`. The DD-244 guard missed it because it calls the RPC
-- directly, without the metadata flip — it never drove the order the UI uses.
--
-- THE CLASS FIX, not the instance:
--
--   `public.udt_change_field_type` is the ONE writer of a field's declared type
--   when that type changes — it already flips `udt_dataset_fields.data_type` itself,
--   atomically with the row rewrite and the history proof. So a caller that has
--   already flipped the declared type is, by construction, a caller whose from-type
--   is unrecoverable. This file makes that case RAISE, loudly, with the remedy,
--   instead of recording `<new>→<new>` and calling it history.
--
--   * A caller that reorders the writes again cannot produce a silent lie — it gets
--     a user-visible error naming exactly what it did wrong ("nothing fails
--     silently"). The reason stamped on a version row is therefore trustworthy for
--     every caller that exists now or later, not just the one we fixed today.
--   * `TableConfigModal` stops sending `data_type` in `p_field_updates` in the same
--     change: the RPC does the flip. That is also strictly safer than before — if the
--     row rewrite fails, the declared type no longer flips without it, so the table
--     can no longer be left with a new declared type over old-shaped rows.
--
-- A same-type call was never a legitimate request through any live path: the modal
-- only calls this when the type actually changed, and there is no other caller
-- (`changeFieldType` in `features/data-tables/service.ts` is the only wrapper, and
-- `TableConfigModal` is its only consumer; no aidream/server caller exists —
-- censused 2026-09-15). A retry after a failure is safe too: this function is
-- transactional, so a failed call leaves the OLD declared type in place and the
-- retry sees a real from-type.
--
-- Guard: `scripts/check-udt-history-honesty.ts` (`pnpm check:udt-history`) gains two
-- checks that drive the REAL dialog order — the old order must be REFUSED, the new
-- order must stamp `type_change:string→integer`. Proven RED against the live
-- function before this file was applied (the old order returned success and stamped
-- `type_change:integer→integer`).
--
-- based-on: public.udt_change_field_type(uuid, uuid, field_data_type, text) a89f77e011491a7af397201d0ea0950b2397bc2e72f985862da1f5106e1b5153

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

  -- DD-260. The from-type is read from the stored definition, so a caller that has
  -- ALREADY flipped it has destroyed the only record of what the values used to be.
  -- Refuse rather than stamp `<new>→<new>` on the row history — a screen never lies.
  IF v_field.data_type = p_new_type THEN
    RAISE EXCEPTION
      'udt_change_field_type: field "%" is already declared % — there is no "from" type left to record, so this call would stamp row history with "type_change:%→%" and tell the user nothing about what their value used to be. Nothing was changed.',
      v_field.field_name, p_new_type, p_new_type, p_new_type
      USING errcode = 'P0001',
            hint = 'Call udt_change_field_type FIRST and let it flip the declared type: it updates workbench.udt_dataset_fields.data_type itself, in the same transaction as the row rewrite and the history proof. Do NOT send data_type in update_user_table_config''s p_field_updates for a type change (that was the Table settings dialog''s bug, DD-260). If the type genuinely did not change, do not call this at all.';
  END IF;

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

COMMENT ON FUNCTION public.udt_change_field_type(uuid, uuid, public.field_data_type, text) IS
  'Changes a user-defined table column''s declared type AND rewrites every row''s '
  'JSONB cell in one transaction, stamping `type_change:<from>→<to>` on the row '
  'history it produces and PROVING that history landed before it empties anything '
  '(DD-244). It is the ONE writer of udt_dataset_fields.data_type for a type change: '
  'a caller that flips the declared type first is REFUSED, because the from-type it '
  'would record would be a lie (DD-260).';
