-- agx_search_score — the SQL half of THE canonical agent relevance scorer.
--
-- WHY THIS EXISTS: /agents/all shipped a server-side search that was a flat
-- `ILIKE OR` across name/description/category/tags with NO ranking, ordered by
-- updated_at. A description mention scored exactly the same as a name match,
-- so searching "image" returned ten unrelated agents before any of the actual
-- image-generation agents. The proven client-side scorer
-- (features/agents/search/score.ts) already solved this and was simply not
-- ported when the list moved server-side.
--
-- MIRRORS features/agents/search/score.ts EXACTLY. Server-side paging forces a
-- second implementation — relevance must be computed BEFORE LIMIT, which the
-- browser cannot do — but the two must stay in lockstep:
--
--   CHANGE ONE, CHANGE THE OTHER IN THE SAME COMMIT.
--
-- Guarded both sides against ONE shared fixture
-- (features/agents/search/__fixtures__/search-score-parity.json):
--   TS  → features/agents/search/score.parity.test.ts
--   SQL → scripts/search-parity/check-search-score-parity.sql
--
-- Tiers (identical to the TS constants):
--   id exact            100000   paste a UUID from a URL and land on it
--   name exact           10000
--   name starts-with      5000
--   id partial            5000
--   name word-boundary    3000   IMPROVEMENT: "image" beats "Images"
--   name contains         2000
--   description exact     1000
--   description contains   500
--   category / tags        300
--   shared-by email        200
--   model / type           100
--   prompt body             50   IMPROVEMENT: deep hits sort below all metadata
--
-- Multi-term queries ("image gen") are an IMPROVEMENT over the original, which
-- scored the query only as a literal phrase: each term is scored and ALL terms
-- must land, so multi-word search works without degrading into a loose OR.

CREATE OR REPLACE FUNCTION public.agx_escape_regex(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(p,''), '([\\^$.|?*+()\[\]{}])', '\\\1', 'g');
$$;

CREATE OR REPLACE FUNCTION public.agx_search_score(
  p_query       text,
  p_id          uuid,
  p_name        text,
  p_description text,
  p_category    text,
  p_tags        text[],
  p_model_id    uuid,
  p_agent_type  text,
  p_owner_email text,
  p_deep_hit    boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  q     text := btrim(lower(coalesce(p_query, '')));
  score integer := 0;
  nm    text := lower(coalesce(p_name, ''));
  ds    text := lower(coalesce(p_description, ''));
  idt   text := lower(p_id::text);
  qesc  text;
  term  text;
  terms text[];
  term_hits integer := 0;
BEGIN
  IF q = '' THEN RETURN 0; END IF;
  qesc := public.agx_escape_regex(q);

  -- ── Name: the dominant signal ────────────────────────────────────────────
  IF nm = q THEN score := score + 10000;
  ELSIF nm LIKE q || '%' THEN score := score + 5000;
  ELSIF nm ~ ('\m' || qesc || '\M') THEN score := score + 3000;
  ELSIF position(q in nm) > 0 THEN score := score + 2000;
  END IF;

  -- ── Description ──────────────────────────────────────────────────────────
  IF ds = q THEN score := score + 1000;
  ELSIF position(q in ds) > 0 THEN score := score + 500;
  END IF;

  -- ── Secondary fields ─────────────────────────────────────────────────────
  IF position(q in lower(coalesce(p_category, ''))) > 0 THEN score := score + 300; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_tags, ARRAY[]::text[])) t
             WHERE position(q in lower(t)) > 0) THEN score := score + 300; END IF;
  IF position(q in lower(coalesce(p_owner_email, ''))) > 0 THEN score := score + 200; END IF;
  IF position(q in lower(coalesce(p_model_id::text, ''))) > 0 THEN score := score + 100; END IF;
  IF position(q in lower(coalesce(p_agent_type, ''))) > 0 THEN score := score + 100; END IF;

  -- ── Id: an exact UUID always wins outright ───────────────────────────────
  IF idt = q THEN score := score + 100000;
  ELSIF position(q in idt) > 0 THEN score := score + 5000;
  END IF;

  -- ── Multi-term fallback ──────────────────────────────────────────────────
  IF score = 0 AND position(' ' in q) > 0 THEN
    terms := regexp_split_to_array(q, '\s+');
    FOREACH term IN ARRAY terms LOOP
      IF term <> '' AND (
           position(term in nm) > 0
        OR position(term in ds) > 0
        OR position(term in lower(coalesce(p_category, ''))) > 0
        OR EXISTS (SELECT 1 FROM unnest(coalesce(p_tags, ARRAY[]::text[])) t
                   WHERE position(term in lower(t)) > 0)
      ) THEN
        term_hits := term_hits + 1;
        IF position(term in nm) > 0 THEN score := score + 400;
        ELSE score := score + 100;
        END IF;
      END IF;
    END LOOP;
    -- All-or-nothing: a partial term match is not a match.
    IF term_hits < array_length(terms, 1) THEN score := 0; END IF;
  END IF;

  -- ── Deep (prompt body) hits rank below every metadata hit ────────────────
  IF score = 0 AND p_deep_hit THEN score := 50; END IF;

  RETURN score;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_escape_regex(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agx_search_score(text,uuid,text,text,text,text[],uuid,text,text,boolean) TO authenticated;

-- ── Wire relevance into the list reader ─────────────────────────────────────
-- Applied to the live agx_list_scoped as a guarded textual patch (the function
-- body is large and versioned in agx_list_scoped_v3_all_columns.sql). Two
-- edits:
--
--   1. A `scored` CTE between `filtered` and `counted` that computes
--      agx_search_score per row, passing `p_deep AND messages ILIKE …` so a
--      prompt-body-only hit is recognised and scored at the bottom tier.
--
--   2. RELEVANCE LEADS THE ORDER BY when a search is active:
--        CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
--      placed BEFORE the favorites-first clause. With no search every score is
--      0, so the clause is inert and favorites-first + the chosen column sort
--      behave exactly as before.
--
-- Re-run the patch below if agx_list_scoped is ever recreated from its own
-- migration file; it is idempotent (it no-ops when already wired).

DO $do$
DECLARE v_src text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='agx_list_scoped';

  IF v_src IS NULL OR position('agx_search_score' in v_src) > 0 THEN
    RAISE NOTICE 'agx_list_scoped already wired for relevance (or absent)';
    RETURN;
  END IF;

  v_new := replace(v_src,
    'counted AS (SELECT f.*, count(*) OVER () AS s_total FROM filtered f)',
    $patch$scored AS (
    SELECT f.*, public.agx_search_score(
      v_search, f.id, f.name, f.description, f.category, f.tags,
      f.model_id, f.agent_type, f.s_owner_email,
      p_deep AND f.messages::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)$patch$);
  IF v_new = v_src THEN RAISE EXCEPTION 'counted CTE anchor not found'; END IF;
  v_src := v_new;

  v_new := replace(v_src,
    $anchor$  ORDER BY
    -- Favorites pinned to the top of EVERY sort. This is the product default:
    -- what you starred is what you reach for.
    CASE WHEN p_favorites_first THEN c.is_favorite END DESC NULLS LAST,$anchor$,
    $patch2$  ORDER BY
    -- RELEVANCE FIRST when searching. A name match must outrank a description
    -- match; ordering a search by updated_at buries the thing you asked for.
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    -- Favorites pinned to the top of EVERY sort. This is the product default:
    -- what you starred is what you reach for.
    CASE WHEN p_favorites_first THEN c.is_favorite END DESC NULLS LAST,$patch2$);
  IF v_new = v_src THEN RAISE EXCEPTION 'ORDER BY anchor not found'; END IF;

  EXECUTE v_new;
END
$do$;
