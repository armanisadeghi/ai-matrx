-- udt_column_facets / udt_table_profile
--
-- THE COLUMN KNOWS ITSELF.
--
-- Every "what is actually in this column" question the UI asks — the value
-- picker in a column filter, the option list pre-filled when someone declares
-- a `choice` format, the empty-column and wrong-type findings in the column
-- profile panel — is the SAME question. It gets ONE answer path, computed in
-- the database over every row, instead of the browser pulling 5,000 rows down
-- and counting them in JavaScript (which silently answered over a partial set
-- the moment a table passed the cap).
--
-- Both functions are SECURITY INVOKER on purpose: `workbench.udt_dataset_rows`
-- RLS is already the correct gate for reading a dataset's rows, and it is the
-- same gate `get_user_table_data_paginated_v2` reads through. A SECURITY
-- DEFINER read here would be a second, weaker authority over the same rows.
--
-- Idempotent. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- udt_column_facets — the distinct values of ONE column, with counts.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Returns the top `p_limit` values by frequency, plus the totals the caller
-- needs to decide whether a picker is even appropriate:
--
--   distinct_count  — total distinct non-empty values (NOT capped by p_limit)
--   truncated       — true when distinct_count exceeds what `values` carries
--   blank           — rows where the cell is null or whitespace-only; this is a
--                     first-class filter target ("is empty"), not a gap
--   max_length      — longest value in the column; the caller uses it to refuse
--                     a picker on a column of long prose
--   unlistable      — non-empty values too long to be worth offering as options
--
-- Values longer than 300 characters are counted but never returned: a column of
-- 5,000 distinct markdown blobs would otherwise ship megabytes to render a
-- picker no one could use.
--
-- `p_search_term` mirrors the paginated reader's global search so facets
-- describe the rows the user is actually looking at, not the whole table.

CREATE OR REPLACE FUNCTION public.udt_column_facets(
    p_table_id   UUID,
    p_field_name TEXT,
    p_limit      INTEGER DEFAULT 50,
    p_search_term TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
    v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
    v_result JSONB;
BEGIN
    IF p_field_name IS NULL OR btrim(p_field_name) = '' THEN
        RAISE EXCEPTION 'udt_column_facets: p_field_name is required';
    END IF;

    -- A field that is not a real column must be REFUSED, never answered with an
    -- empty facet list — an empty list reads as "this column has no values",
    -- which is a confident wrong answer to a typo.
    IF NOT EXISTS (
        SELECT 1 FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id AND field_name = p_field_name
    ) THEN
        -- Distinguish "no such column" from "no such dataset / no access". The
        -- second is genuinely ambiguous under RLS (the D167 class) and is
        -- reported with the honest ambiguous message + P0002 so the client can
        -- hand it to AccessGate instead of blaming the field name.
        IF NOT EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE id = p_table_id) THEN
            RAISE EXCEPTION
                'dataset % is not available to this account — it may not exist, or your access may not reach it',
                p_table_id
                USING ERRCODE = 'P0002';
        END IF;
        RAISE EXCEPTION 'udt_column_facets: field % is not a column of table %',
            p_field_name, p_table_id;
    END IF;

    WITH scoped AS (
        SELECT nullif(btrim(r.data ->> p_field_name), '') AS v
        FROM workbench.udt_dataset_rows r
        WHERE r.table_id = p_table_id
          AND (p_search_term IS NULL
               OR r.data::text ILIKE '%' || p_search_term || '%')
    ),
    totals AS (
        SELECT
            count(*)::int                                              AS total_rows,
            count(v)::int                                              AS filled,
            count(*) FILTER (WHERE v IS NULL)::int                     AS blank,
            count(DISTINCT v)::int                                     AS distinct_count,
            COALESCE(max(length(v)), 0)::int                           AS max_length,
            count(DISTINCT v) FILTER (WHERE length(v) > 300)::int      AS unlistable
        FROM scoped
    ),
    top_values AS (
        SELECT v, count(*)::int AS c
        FROM scoped
        WHERE v IS NOT NULL AND length(v) <= 300
        GROUP BY v
        ORDER BY count(*) DESC, v ASC
        LIMIT v_limit
    )
    SELECT jsonb_build_object(
        'success',        true,
        'table_id',       p_table_id,
        'field_name',     p_field_name,
        'total_rows',     t.total_rows,
        'filled',         t.filled,
        'blank',          t.blank,
        'distinct_count', t.distinct_count,
        'max_length',     t.max_length,
        'unlistable',     t.unlistable,
        'limit',          v_limit,
        'truncated',      (t.distinct_count - t.unlistable) > v_limit,
        'values',         COALESCE((
            SELECT jsonb_agg(jsonb_build_object('value', tv.v, 'count', tv.c)
                             ORDER BY tv.c DESC, tv.v ASC)
            FROM top_values tv
        ), '[]'::jsonb)
    )
    INTO v_result
    FROM totals t;

    RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.udt_column_facets(UUID, TEXT, INTEGER, TEXT) IS
'Distinct values + counts for one user-table column. Powers the value-picker column filter and pre-fills options when a choice format is declared. SECURITY INVOKER — udt_dataset_rows RLS is the gate.';


-- ─────────────────────────────────────────────────────────────────────────────
-- udt_table_profile — the same question asked of EVERY column at once.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- One round trip that tells a surface what the table actually contains, so the
-- column profile panel and the "3 of your columns look like pick lists"
-- findings never need a request per column.
--
-- Per column it returns the same shape counts as udt_column_facets plus cheap
-- type evidence (`looks_numeric` / `looks_url` / `looks_email` / `looks_bool`)
-- and a short `top_values` preview. The evidence is COUNTS, never a verdict:
-- deciding "this column should be a URL" is the caller's judgement, and a
-- column where 19 of 20 values are URLs is a different situation from 20 of 20.

CREATE OR REPLACE FUNCTION public.udt_table_profile(
    p_table_id       UUID,
    p_preview_values INTEGER DEFAULT 12
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
    v_preview INTEGER := LEAST(GREATEST(COALESCE(p_preview_values, 12), 1), 100);
    v_result  JSONB;
    v_rows    INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE id = p_table_id) THEN
        RAISE EXCEPTION
            'dataset % is not available to this account — it may not exist, or your access may not reach it',
            p_table_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*)::int INTO v_rows
    FROM workbench.udt_dataset_rows WHERE table_id = p_table_id;

    SELECT jsonb_build_object(
        'success',    true,
        'table_id',   p_table_id,
        'total_rows', v_rows,
        'columns',    COALESCE(jsonb_agg(col ORDER BY col_order), '[]'::jsonb)
    )
    INTO v_result
    FROM (
        SELECT
            f.field_order AS col_order,
            jsonb_build_object(
                'field_name',     f.field_name,
                'display_name',   f.display_name,
                'data_type',      f.data_type::text,
                'is_required',    f.is_required,
                'format',         f.metadata -> 'format',
                'filled',         s.filled,
                'blank',          s.blank,
                'distinct_count', s.distinct_count,
                'max_length',     s.max_length,
                'looks_numeric',  s.looks_numeric,
                'looks_url',      s.looks_url,
                'looks_email',    s.looks_email,
                'looks_bool',     s.looks_bool,
                'top_values',     COALESCE(s.top_values, '[]'::jsonb)
            ) AS col
        FROM workbench.udt_dataset_fields f
        CROSS JOIN LATERAL (
            WITH scoped AS (
                SELECT nullif(btrim(r.data ->> f.field_name), '') AS v
                FROM workbench.udt_dataset_rows r
                WHERE r.table_id = p_table_id
            )
            SELECT
                count(v)::int                          AS filled,
                count(*) FILTER (WHERE v IS NULL)::int  AS blank,
                count(DISTINCT v)::int                  AS distinct_count,
                COALESCE(max(length(v)), 0)::int        AS max_length,
                count(*) FILTER (
                    WHERE v ~ '^-?[0-9][0-9,]*(\.[0-9]+)?$')::int  AS looks_numeric,
                count(*) FILTER (
                    WHERE v ~* '^https?://\S+$')::int              AS looks_url,
                count(*) FILTER (
                    WHERE v ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$')::int AS looks_email,
                count(*) FILTER (
                    WHERE lower(v) IN ('true','false','yes','no','y','n','1','0'))::int AS looks_bool,
                (
                    SELECT jsonb_agg(jsonb_build_object('value', t.v, 'count', t.c)
                                     ORDER BY t.c DESC, t.v ASC)
                    FROM (
                        SELECT v, count(*)::int AS c
                        FROM scoped
                        WHERE v IS NOT NULL AND length(v) <= 300
                        GROUP BY v
                        ORDER BY count(*) DESC, v ASC
                        LIMIT v_preview
                    ) t
                ) AS top_values
            FROM scoped
        ) s
        WHERE f.table_id = p_table_id
    ) cols;

    RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.udt_table_profile(UUID, INTEGER) IS
'Shape of every column in a user table in one call — fill rate, distinct count, type evidence, top values. Powers the column profile panel and format suggestions. SECURITY INVOKER — udt_dataset_rows RLS is the gate.';


GRANT EXECUTE ON FUNCTION public.udt_column_facets(UUID, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.udt_table_profile(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
