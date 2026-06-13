-- ============================================================================
-- Custom Dictionary system — terminology + pronunciation entries.
--
-- A dictionary entry carries a canonical spelling, common mishearings/aliases
-- (sounds_like), a human-readable pronunciation respelling, optional IPA, a
-- definition (helps the LLM know when a term applies), and a category. It
-- serves transcription accuracy (STT keyterm/prompt biasing + cleanup-agent
-- context) AND speech playback (TTS pronunciation).
--
-- Entries attach at exactly ONE of four owner levels:
--   user (private), organization, scope type (ctx_scope_types), scope (ctx_scopes).
--
-- At invocation time the relevant dictionaries are MERGED and de-duplicated by
-- term (case-insensitive). On collision, the most specific owner wins:
--   scope > scope_type > organization > user.
--
-- Permissions are inherited from the parent entity and kept deliberately simple
-- (per product owner): any member of an organization may read AND write that
-- org's dictionary and the dictionaries of its scope types / scopes. A user's
-- personal dictionary is private to them.
--
-- Auth model follows migrations/ctx_set_entity_scopes_auth.sql: SECURITY DEFINER
-- RPCs that check auth.uid() + org membership, EXECUTE revoked from anon.
--
-- The resolve / list-owners RPCs come in two flavours:
--   *_for(p_user_id, ...)  — plain (non-DEFINER) inner function the Python
--                            backend calls over its direct Postgres connection
--                            (where auth.uid() is NULL).
--   public name (...)      — SECURITY DEFINER wrapper that injects auth.uid()
--                            for the browser/PostgREST.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dict_entries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- exactly one owner column is non-null (enforced by CHECK below)
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    scope_type_id   uuid REFERENCES public.ctx_scope_types(id) ON DELETE CASCADE,
    scope_id        uuid REFERENCES public.ctx_scopes(id) ON DELETE CASCADE,
    term            text NOT NULL,
    sounds_like     text[] NOT NULL DEFAULT '{}',
    pronunciation   text,           -- human-readable respelling, e.g. "kuh-MAH-luh"
    ipa             text,           -- IPA for engines that support phonemes
    definition      text,           -- when/what the term means (LLM context)
    category        text,
    is_active       boolean NOT NULL DEFAULT true,
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dict_entries_one_owner CHECK (
        (CASE WHEN user_id         IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN organization_id IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN scope_type_id   IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN scope_id        IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT dict_entries_term_nonblank CHECK (length(btrim(term)) > 0)
);

-- One entry per (owner, lower(term)). NULLS NOT DISTINCT (PG15+) makes the
-- nullable owner columns behave as a real composite key — plain UNIQUE would
-- treat every NULL as distinct and silently allow duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS dict_entries_owner_term_uniq
    ON public.dict_entries (user_id, organization_id, scope_type_id, scope_id, lower(term))
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS dict_entries_user_idx       ON public.dict_entries (user_id)         WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dict_entries_org_idx        ON public.dict_entries (organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dict_entries_scope_type_idx ON public.dict_entries (scope_type_id)   WHERE scope_type_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dict_entries_scope_idx      ON public.dict_entries (scope_id)         WHERE scope_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS public.dict_settings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    scope_type_id   uuid REFERENCES public.ctx_scope_types(id) ON DELETE CASCADE,
    scope_id        uuid REFERENCES public.ctx_scopes(id) ON DELETE CASCADE,
    -- inline policy, identical semantics to agent context slots:
    --   NULL → system default (200 chars), 0 → never inline, N → custom ceiling
    max_inline_chars integer,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dict_settings_one_owner CHECK (
        (CASE WHEN user_id         IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN organization_id IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN scope_type_id   IS NOT NULL THEN 1 ELSE 0 END
       + CASE WHEN scope_id        IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT dict_settings_inline_nonneg CHECK (max_inline_chars IS NULL OR max_inline_chars >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS dict_settings_owner_uniq
    ON public.dict_settings (user_id, organization_id, scope_type_id, scope_id)
    NULLS NOT DISTINCT;


-- ─────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dict_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$fn$;

DROP TRIGGER IF EXISTS dict_entries_touch_trg ON public.dict_entries;
CREATE TRIGGER dict_entries_touch_trg BEFORE UPDATE ON public.dict_entries
    FOR EACH ROW EXECUTE FUNCTION public.dict_touch_updated_at();

DROP TRIGGER IF EXISTS dict_settings_touch_trg ON public.dict_settings;
CREATE TRIGGER dict_settings_touch_trg BEFORE UPDATE ON public.dict_settings
    FOR EACH ROW EXECUTE FUNCTION public.dict_touch_updated_at();


-- ─────────────────────────────────────────────────────────────────────────
-- RLS — reads allowed for owners/members; all writes go through the RPCs.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.dict_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dict_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dict_entries_read ON public.dict_entries;
CREATE POLICY dict_entries_read ON public.dict_entries FOR SELECT USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (organization_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = dict_entries.organization_id AND om.user_id = auth.uid()))
    OR (scope_type_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ctx_scope_types st
        JOIN public.organization_members om ON om.organization_id = st.organization_id
        WHERE st.id = dict_entries.scope_type_id AND om.user_id = auth.uid()))
    OR (scope_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ctx_scopes s
        JOIN public.organization_members om ON om.organization_id = s.organization_id
        WHERE s.id = dict_entries.scope_id AND om.user_id = auth.uid()))
);

DROP POLICY IF EXISTS dict_settings_read ON public.dict_settings;
CREATE POLICY dict_settings_read ON public.dict_settings FOR SELECT USING (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR (organization_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = dict_settings.organization_id AND om.user_id = auth.uid()))
    OR (scope_type_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ctx_scope_types st
        JOIN public.organization_members om ON om.organization_id = st.organization_id
        WHERE st.id = dict_settings.scope_type_id AND om.user_id = auth.uid()))
    OR (scope_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ctx_scopes s
        JOIN public.organization_members om ON om.organization_id = s.organization_id
        WHERE s.id = dict_settings.scope_id AND om.user_id = auth.uid()))
);


-- ─────────────────────────────────────────────────────────────────────────
-- Authorization helpers
-- ─────────────────────────────────────────────────────────────────────────

-- Map an (level, owner_id) to its owning organization (NULL for the user level).
-- Raises if the owner row does not exist.
CREATE OR REPLACE FUNCTION public.dict_owner_org(p_level text, p_owner_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_org uuid;
BEGIN
    IF p_level = 'user' THEN
        RETURN NULL;
    ELSIF p_level = 'organization' THEN
        SELECT id INTO v_org FROM public.organizations WHERE id = p_owner_id;
    ELSIF p_level = 'scope_type' THEN
        SELECT organization_id INTO v_org FROM public.ctx_scope_types WHERE id = p_owner_id;
    ELSIF p_level = 'scope' THEN
        SELECT organization_id INTO v_org FROM public.ctx_scopes WHERE id = p_owner_id;
    ELSE
        RAISE EXCEPTION 'dict: unknown level "%"', p_level USING ERRCODE = '22023';
    END IF;

    IF p_level <> 'user' AND v_org IS NULL THEN
        RAISE EXCEPTION 'dict: % "%" not found', p_level, p_owner_id USING ERRCODE = 'P0002';
    END IF;
    RETURN v_org;
END;
$fn$;

-- Assert the given user may read+write the given owner. Org membership = both.
CREATE OR REPLACE FUNCTION public.dict_assert_access(p_user_id uuid, p_level text, p_owner_id uuid)
RETURNS void LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_org uuid;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;

    IF p_level = 'user' THEN
        IF p_owner_id <> p_user_id THEN
            RAISE EXCEPTION 'dict: cannot access another user''s personal dictionary' USING ERRCODE = '42501';
        END IF;
        RETURN;
    END IF;

    v_org := public.dict_owner_org(p_level, p_owner_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = v_org AND om.user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'dict: % is outside your organizations', p_level USING ERRCODE = '42501';
    END IF;
END;
$fn$;

-- Column predicate matching a (level, owner_id) on dict_entries/dict_settings.
-- Used internally by the CRUD functions via dynamic equality.


-- ─────────────────────────────────────────────────────────────────────────
-- CRUD (inner *_for functions + DEFINER wrappers)
-- ─────────────────────────────────────────────────────────────────────────

-- LIST entries for one owner ------------------------------------------------
CREATE OR REPLACE FUNCTION public.dict_list_entries_for(p_user_id uuid, p_level text, p_owner_id uuid)
RETURNS SETOF public.dict_entries LANGUAGE plpgsql STABLE AS $fn$
BEGIN
    PERFORM public.dict_assert_access(p_user_id, p_level, p_owner_id);
    RETURN QUERY
        SELECT * FROM public.dict_entries e
        WHERE (p_level = 'user'         AND e.user_id = p_owner_id)
           OR (p_level = 'organization' AND e.organization_id = p_owner_id)
           OR (p_level = 'scope_type'   AND e.scope_type_id = p_owner_id)
           OR (p_level = 'scope'        AND e.scope_id = p_owner_id)
        ORDER BY lower(e.term);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dict_list_entries(p_level text, p_owner_id uuid)
RETURNS SETOF public.dict_entries LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $fn$
    SELECT * FROM public.dict_list_entries_for(auth.uid(), p_level, p_owner_id);
$fn$;

-- UPSERT a batch of entries -------------------------------------------------
-- p_entries: jsonb array of { id?, term, sounds_like?, pronunciation?, ipa?,
--   definition?, category?, is_active? }. Rows with an id update in place;
--   rows without an id insert (or merge onto an existing same-term row via the
--   owner+lower(term) unique index). Returns the resulting rows for the owner.
CREATE OR REPLACE FUNCTION public.dict_upsert_entries_for(p_user_id uuid, p_level text, p_owner_id uuid, p_entries jsonb)
RETURNS SETOF public.dict_entries LANGUAGE plpgsql AS $fn$
DECLARE rec jsonb;
BEGIN
    PERFORM public.dict_assert_access(p_user_id, p_level, p_owner_id);
    IF jsonb_typeof(p_entries) <> 'array' THEN
        RAISE EXCEPTION 'dict_upsert_entries: p_entries must be a JSON array' USING ERRCODE = '22023';
    END IF;

    FOR rec IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
        IF coalesce(btrim(rec->>'term'), '') = '' THEN
            CONTINUE;  -- skip blank terms defensively
        END IF;

        INSERT INTO public.dict_entries
            (id, user_id, organization_id, scope_type_id, scope_id,
             term, sounds_like, pronunciation, ipa, definition, category, is_active, created_by)
        VALUES (
            coalesce((rec->>'id')::uuid, gen_random_uuid()),
            CASE WHEN p_level = 'user'         THEN p_owner_id END,
            CASE WHEN p_level = 'organization' THEN p_owner_id END,
            CASE WHEN p_level = 'scope_type'   THEN p_owner_id END,
            CASE WHEN p_level = 'scope'        THEN p_owner_id END,
            btrim(rec->>'term'),
            CASE WHEN rec ? 'sounds_like' AND jsonb_typeof(rec->'sounds_like') = 'array'
                 THEN ARRAY(SELECT btrim(v) FROM jsonb_array_elements_text(rec->'sounds_like') v WHERE btrim(v) <> '')
                 ELSE '{}'::text[] END,
            nullif(btrim(coalesce(rec->>'pronunciation','')), ''),
            nullif(btrim(coalesce(rec->>'ipa','')), ''),
            nullif(btrim(coalesce(rec->>'definition','')), ''),
            nullif(btrim(coalesce(rec->>'category','')), ''),
            coalesce((rec->>'is_active')::boolean, true),
            p_user_id
        )
        ON CONFLICT (user_id, organization_id, scope_type_id, scope_id, lower(term)) DO UPDATE SET
            sounds_like   = EXCLUDED.sounds_like,
            pronunciation = EXCLUDED.pronunciation,
            ipa           = EXCLUDED.ipa,
            definition    = EXCLUDED.definition,
            category      = EXCLUDED.category,
            is_active     = EXCLUDED.is_active,
            term          = EXCLUDED.term,
            updated_at    = now();
    END LOOP;

    RETURN QUERY SELECT * FROM public.dict_list_entries_for(p_user_id, p_level, p_owner_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dict_upsert_entries(p_level text, p_owner_id uuid, p_entries jsonb)
RETURNS SETOF public.dict_entries LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $fn$
    SELECT * FROM public.dict_upsert_entries_for(auth.uid(), p_level, p_owner_id, p_entries);
$fn$;

-- DELETE entries by id ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dict_delete_entries_for(p_user_id uuid, p_level text, p_owner_id uuid, p_ids uuid[])
RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE v_deleted integer;
BEGIN
    PERFORM public.dict_assert_access(p_user_id, p_level, p_owner_id);
    DELETE FROM public.dict_entries e
    WHERE e.id = ANY(p_ids)
      AND ((p_level = 'user'         AND e.user_id = p_owner_id)
        OR (p_level = 'organization' AND e.organization_id = p_owner_id)
        OR (p_level = 'scope_type'   AND e.scope_type_id = p_owner_id)
        OR (p_level = 'scope'        AND e.scope_id = p_owner_id));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dict_delete_entries(p_level text, p_owner_id uuid, p_ids uuid[])
RETURNS integer LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $fn$
    SELECT public.dict_delete_entries_for(auth.uid(), p_level, p_owner_id, p_ids);
$fn$;

-- GET / SET inline-policy settings ------------------------------------------
CREATE OR REPLACE FUNCTION public.dict_get_settings_for(p_user_id uuid, p_level text, p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_val integer; v_found boolean := false;
BEGIN
    PERFORM public.dict_assert_access(p_user_id, p_level, p_owner_id);
    SELECT max_inline_chars, true INTO v_val, v_found FROM public.dict_settings s
    WHERE (p_level = 'user'         AND s.user_id = p_owner_id)
       OR (p_level = 'organization' AND s.organization_id = p_owner_id)
       OR (p_level = 'scope_type'   AND s.scope_type_id = p_owner_id)
       OR (p_level = 'scope'        AND s.scope_id = p_owner_id);
    RETURN jsonb_build_object('max_inline_chars', v_val, 'has_row', coalesce(v_found, false));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dict_get_settings(p_level text, p_owner_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $fn$
    SELECT public.dict_get_settings_for(auth.uid(), p_level, p_owner_id);
$fn$;

-- p_max_inline_chars: pass NULL to clear (revert to the 200-char default).
CREATE OR REPLACE FUNCTION public.dict_set_settings_for(p_user_id uuid, p_level text, p_owner_id uuid, p_max_inline_chars integer)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
BEGIN
    PERFORM public.dict_assert_access(p_user_id, p_level, p_owner_id);
    IF p_max_inline_chars IS NOT NULL AND p_max_inline_chars < 0 THEN
        RAISE EXCEPTION 'dict: max_inline_chars must be >= 0' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.dict_settings (user_id, organization_id, scope_type_id, scope_id, max_inline_chars)
    VALUES (
        CASE WHEN p_level = 'user'         THEN p_owner_id END,
        CASE WHEN p_level = 'organization' THEN p_owner_id END,
        CASE WHEN p_level = 'scope_type'   THEN p_owner_id END,
        CASE WHEN p_level = 'scope'        THEN p_owner_id END,
        p_max_inline_chars
    )
    ON CONFLICT (user_id, organization_id, scope_type_id, scope_id) DO UPDATE SET
        max_inline_chars = EXCLUDED.max_inline_chars,
        updated_at = now();

    RETURN public.dict_get_settings_for(p_user_id, p_level, p_owner_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dict_set_settings(p_level text, p_owner_id uuid, p_max_inline_chars integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $fn$
    SELECT public.dict_set_settings_for(auth.uid(), p_level, p_owner_id, p_max_inline_chars);
$fn$;


-- ─────────────────────────────────────────────────────────────────────────
-- LIST OWNERS — every dictionary-bearing owner visible to the user, with entry
-- counts and inline-policy settings. Powers the selector UI + the agent tool.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dict_list_owners_for(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
DECLARE v_result jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;

    WITH member_orgs AS (
        SELECT om.organization_id AS org_id
        FROM public.organization_members om
        WHERE om.user_id = p_user_id
    ),
    personal AS (
        SELECT jsonb_build_object(
            'level', 'user',
            'owner_id', p_user_id,
            'name', 'Personal',
            'entry_count', (SELECT count(*) FROM public.dict_entries e WHERE e.user_id = p_user_id),
            'max_inline_chars', (SELECT s.max_inline_chars FROM public.dict_settings s WHERE s.user_id = p_user_id)
        ) AS obj
    ),
    orgs AS (
        SELECT jsonb_build_object(
            'level', 'organization',
            'owner_id', o.id,
            'name', o.name,
            'entry_count', (SELECT count(*) FROM public.dict_entries e WHERE e.organization_id = o.id),
            'max_inline_chars', (SELECT s.max_inline_chars FROM public.dict_settings s WHERE s.organization_id = o.id)
        ) AS obj
        FROM public.organizations o
        WHERE o.id IN (SELECT org_id FROM member_orgs)
    ),
    scope_types AS (
        SELECT jsonb_build_object(
            'level', 'scope_type',
            'owner_id', st.id,
            'name', st.label_singular,
            'organization_id', st.organization_id,
            'entry_count', (SELECT count(*) FROM public.dict_entries e WHERE e.scope_type_id = st.id),
            'max_inline_chars', (SELECT s.max_inline_chars FROM public.dict_settings s WHERE s.scope_type_id = st.id)
        ) AS obj
        FROM public.ctx_scope_types st
        WHERE st.organization_id IN (SELECT org_id FROM member_orgs)
    ),
    scopes AS (
        SELECT jsonb_build_object(
            'level', 'scope',
            'owner_id', sc.id,
            'name', sc.name,
            'organization_id', sc.organization_id,
            'scope_type_id', sc.scope_type_id,
            'entry_count', (SELECT count(*) FROM public.dict_entries e WHERE e.scope_id = sc.id),
            'max_inline_chars', (SELECT s.max_inline_chars FROM public.dict_settings s WHERE s.scope_id = sc.id)
        ) AS obj
        FROM public.ctx_scopes sc
        WHERE sc.organization_id IN (SELECT org_id FROM member_orgs)
    )
    SELECT jsonb_build_object(
        'personal',    (SELECT obj FROM personal),
        'organizations', coalesce((SELECT jsonb_agg(obj ORDER BY obj->>'name') FROM orgs), '[]'::jsonb),
        'scope_types',   coalesce((SELECT jsonb_agg(obj ORDER BY obj->>'name') FROM scope_types), '[]'::jsonb),
        'scopes',        coalesce((SELECT jsonb_agg(obj ORDER BY obj->>'name') FROM scopes), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dict_list_owners()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $fn$
    SELECT public.dict_list_owners_for(auth.uid());
$fn$;


-- ─────────────────────────────────────────────────────────────────────────
-- RESOLVE — merge + de-dupe the selected dictionaries into one active set.
--
-- Selection:
--   p_all = true                → personal + ALL member orgs + their scope
--                                  types + their scopes (everything visible).
--   otherwise                   → (personal if p_include_user) + the listed
--                                  org / scope_type / scope ids (filtered to
--                                  those the user may access).
--
-- Dedupe is by lower(term); on collision the most-specific owner wins
-- (scope > scope_type > organization > user); ties break on updated_at DESC.
--
-- Returns:
--   { entries: [ {term, sounds_like, pronunciation, ipa, definition, category,
--                 source_level, source_name, overridden:[...] } ],
--     effective_max_inline_chars: int|null,   -- most-specific present setting
--     source_count: int }
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dict_resolve_for(
    p_user_id uuid,
    p_include_user boolean DEFAULT true,
    p_all boolean DEFAULT false,
    p_organization_ids uuid[] DEFAULT '{}',
    p_scope_type_ids uuid[] DEFAULT '{}',
    p_scope_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
DECLARE
    v_entries jsonb;
    v_inline integer;
    v_sources integer;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'dict: not authenticated' USING ERRCODE = '42501';
    END IF;

    WITH member_orgs AS (
        SELECT om.organization_id AS org_id
        FROM public.organization_members om
        WHERE om.user_id = p_user_id
    ),
    -- The owners actually in play, with a specificity rank.
    sel AS (
        -- personal
        SELECT 'user'::text AS level, p_user_id AS owner_id, 1 AS rank, 'Personal'::text AS name
        WHERE p_include_user OR p_all
        UNION ALL
        -- organizations
        SELECT 'organization', o.id, 2, o.name
        FROM public.organizations o
        WHERE o.id IN (SELECT org_id FROM member_orgs)
          AND (p_all OR o.id = ANY(p_organization_ids))
        UNION ALL
        -- scope types
        SELECT 'scope_type', st.id, 3, st.label_singular
        FROM public.ctx_scope_types st
        WHERE st.organization_id IN (SELECT org_id FROM member_orgs)
          AND (p_all OR st.id = ANY(p_scope_type_ids))
        UNION ALL
        -- scopes
        SELECT 'scope', sc.id, 4, sc.name
        FROM public.ctx_scopes sc
        WHERE sc.organization_id IN (SELECT org_id FROM member_orgs)
          AND (p_all OR sc.id = ANY(p_scope_ids))
    ),
    raw AS (
        SELECT e.*, sel.rank, sel.level AS source_level, sel.name AS source_name
        FROM public.dict_entries e
        JOIN sel ON (
            (sel.level = 'user'         AND e.user_id = sel.owner_id)
         OR (sel.level = 'organization' AND e.organization_id = sel.owner_id)
         OR (sel.level = 'scope_type'   AND e.scope_type_id = sel.owner_id)
         OR (sel.level = 'scope'        AND e.scope_id = sel.owner_id)
        )
        WHERE e.is_active
    ),
    ranked AS (
        SELECT DISTINCT ON (lower(term)) *
        FROM raw
        ORDER BY lower(term), rank DESC, updated_at DESC
    ),
    -- which lower(term)s were overridden (present at more than one level)
    collisions AS (
        SELECT lower(term) AS lt, array_agg(DISTINCT source_name) AS names
        FROM raw GROUP BY lower(term) HAVING count(*) > 1
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'term', r.term,
            'sounds_like', to_jsonb(r.sounds_like),
            'pronunciation', r.pronunciation,
            'ipa', r.ipa,
            'definition', r.definition,
            'category', r.category,
            'source_level', r.source_level,
            'source_name', r.source_name
        ) ORDER BY lower(r.term)
    ) INTO v_entries
    FROM ranked r;

    -- effective inline policy = the most-specific owner that has a setting row
    SELECT s.max_inline_chars INTO v_inline
    FROM public.dict_settings s
    JOIN (
        SELECT 'user'::text AS level, p_user_id AS owner_id, 1 AS rank WHERE p_include_user OR p_all
        UNION ALL SELECT 'organization', o.id, 2 FROM public.organizations o
            WHERE o.id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = p_user_id)
              AND (p_all OR o.id = ANY(p_organization_ids))
        UNION ALL SELECT 'scope_type', st.id, 3 FROM public.ctx_scope_types st
            WHERE st.organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = p_user_id)
              AND (p_all OR st.id = ANY(p_scope_type_ids))
        UNION ALL SELECT 'scope', sc.id, 4 FROM public.ctx_scopes sc
            WHERE sc.organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = p_user_id)
              AND (p_all OR sc.id = ANY(p_scope_ids))
    ) owners ON (
        (owners.level = 'user'         AND s.user_id = owners.owner_id)
     OR (owners.level = 'organization' AND s.organization_id = owners.owner_id)
     OR (owners.level = 'scope_type'   AND s.scope_type_id = owners.owner_id)
     OR (owners.level = 'scope'        AND s.scope_id = owners.owner_id)
    )
    WHERE s.max_inline_chars IS NOT NULL
    ORDER BY owners.rank DESC
    LIMIT 1;

    SELECT count(DISTINCT (source_level, source_name)) INTO v_sources
    FROM (
        SELECT e.*, sel.level AS source_level, sel.name AS source_name
        FROM public.dict_entries e
        JOIN (
            SELECT 'user'::text AS level, p_user_id AS owner_id, 'Personal'::text AS name WHERE p_include_user OR p_all
            UNION ALL SELECT 'organization', o.id, o.name FROM public.organizations o
                WHERE o.id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = p_user_id)
                  AND (p_all OR o.id = ANY(p_organization_ids))
            UNION ALL SELECT 'scope_type', st.id, st.label_singular FROM public.ctx_scope_types st
                WHERE st.organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = p_user_id)
                  AND (p_all OR st.id = ANY(p_scope_type_ids))
            UNION ALL SELECT 'scope', sc.id, sc.name FROM public.ctx_scopes sc
                WHERE sc.organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = p_user_id)
                  AND (p_all OR sc.id = ANY(p_scope_ids))
        ) sel ON (
            (sel.level = 'user'         AND e.user_id = sel.owner_id)
         OR (sel.level = 'organization' AND e.organization_id = sel.owner_id)
         OR (sel.level = 'scope_type'   AND e.scope_type_id = sel.owner_id)
         OR (sel.level = 'scope'        AND e.scope_id = sel.owner_id)
        )
        WHERE e.is_active
    ) src;

    RETURN jsonb_build_object(
        'entries', coalesce(v_entries, '[]'::jsonb),
        'effective_max_inline_chars', v_inline,
        'source_count', coalesce(v_sources, 0)
    );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dict_resolve(
    p_include_user boolean DEFAULT true,
    p_all boolean DEFAULT false,
    p_organization_ids uuid[] DEFAULT '{}',
    p_scope_type_ids uuid[] DEFAULT '{}',
    p_scope_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $fn$
    SELECT public.dict_resolve_for(auth.uid(), p_include_user, p_all, p_organization_ids, p_scope_type_ids, p_scope_ids);
$fn$;


-- ─────────────────────────────────────────────────────────────────────────
-- Lock down anon. The browser is always authenticated; the Python backend
-- calls the *_for variants over its own connection (auth.uid() = NULL there).
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.dict_list_entries(text, uuid)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.dict_upsert_entries(text, uuid, jsonb)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.dict_delete_entries(text, uuid, uuid[])  FROM anon;
REVOKE EXECUTE ON FUNCTION public.dict_get_settings(text, uuid)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.dict_set_settings(text, uuid, integer)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.dict_list_owners()                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.dict_resolve(boolean, boolean, uuid[], uuid[], uuid[]) FROM anon;

NOTIFY pgrst, 'reload schema';
