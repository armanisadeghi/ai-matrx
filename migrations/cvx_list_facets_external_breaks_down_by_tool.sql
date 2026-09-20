-- retired: its public.cvx_audience and public.cvx_list_facets bodies were replaced by cvx_audience_derives_from_the_lane_classifier.sql, which derives the audience from chat.conversation_lane
-- External chips break down by TOOL again (2026-09-18).
--
-- Arman's ruling (2026-09-18): every conversation from an outside coding tool is
-- source_app = 'code-plugin'; the tool is source_feature (claude-code | codex |
-- cursor | vscode), and a person's AI Matrx reply on a mirrored conversation is
-- source_feature = 'coding_session_reply'. aidream's
-- db/migrations/0904_code_plugin_is_the_outside_data_app.sql relabelled the rows
-- and replaced public.cvx_audience so external = provider IS NOT NULL OR
-- source_app = 'code-plugin'.
--
-- That collapsed the External bucket's second cut on /work/conversations: the
-- `audience_source_app` facet grouped every external row under one value,
-- 'code-plugin', so the Claude Code / Codex / Cursor / VS Code chips became one.
--
-- This file:
--   1. restates public.cvx_audience EXACTLY as 0904 left it live, so the newest
--      definition in THIS repo is the live rule (cvx_list_scoped_audience.sql is
--      frozen history — it still lists the old tool slugs; never edit or
--      --reapply it, that would revert the external rule);
--   2. replaces public.cvx_list_facets so external code-plugin rows are counted
--      by source_feature in a new `audience_source_feature` family (the chip
--      writes the existing `source_feature` filter), and `audience_source_app`
--      keeps chat plus any external row that is not the code plugin.
-- Row shape unchanged; safe under live traffic. CREATE OR REPLACE keeps each
-- function's existing ACL (authenticated only; anon was revoked by
-- cvx_list_scoped_revoke_anon_execute.sql), so this file carries no GRANT/REVOKE.

-- based-on: public.cvx_audience(text, text, text, text) 462143964ae5375bdc33caacb3cb79ec4a8f88d06a5844800fba2bb34ffcb5eb
CREATE OR REPLACE FUNCTION public.cvx_audience(
  p_provider          text,
  p_source_app        text,
  p_origin_class      text,
  p_conversation_type text
)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN p_provider IS NOT NULL
      OR p_source_app = 'code-plugin'
      THEN 'external'
    WHEN p_origin_class IN ('child_agent','workflow','scheduled','system','client_auto')
      THEN 'internal'
    WHEN p_origin_class = 'human'
      THEN 'chat'
    WHEN p_conversation_type IN ('subagent','auto','system','hindsight_replay',
                                 'workflow','scheduled','research','podcast')
      THEN 'internal'
    ELSE 'chat'
  END
$function$;


-- based-on: public.cvx_list_facets(text, uuid, text, boolean, text) eaf881d29188e06ce8987cf41fa8383d7192fb66f63eb207495967ab97823c27
CREATE OR REPLACE FUNCTION public.cvx_list_facets(
  p_scope    text    DEFAULT 'mine',
  p_org_id   uuid    DEFAULT NULL,
  p_search   text    DEFAULT NULL,
  p_deep     boolean DEFAULT false,
  p_archived text    DEFAULT 'active'
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT r.conversation_type, r.origin_class, r.source_app, r.source_feature,
           r.provider, r.workspace_name, r.provider_account, r.title_source,
           r.category, r.fidelity, r.binding_status, r.visibility, r.owner_email,
           r.organization_name, r.access_level, r.message_count,
           r.is_favorite, r.is_archived,
           public.cvx_audience(r.provider, r.source_app, r.origin_class, r.conversation_type)
             AS audience
    FROM public.cvx_list_scoped(p_scope, p_org_id, p_search, p_deep, 'updated','desc',
      false, p_archived, '{}'::jsonb, 1000000, 0) r
  )
  SELECT 'audience'::text, b.audience, count(*) FROM base b GROUP BY 2
  UNION ALL
  -- Second cut inside each bucket: app for chat + external, run type for internal.
  -- The app, for chat and for any external row that is NOT the code plugin
  -- (a coding-session binding on a row some other app stamped).
  SELECT 'audience_source_app'::text, b.audience||':'||coalesce(nullif(b.source_app,''),'__none__'), count(*)
    FROM base b
   WHERE b.audience = 'chat'
      OR (b.audience = 'external' AND coalesce(b.source_app,'') <> 'code-plugin')
   GROUP BY 2
  UNION ALL
  -- The TOOL, for code-plugin rows: source_app is the family ('code-plugin'),
  -- source_feature is the tool (claude-code | codex | cursor | vscode) or
  -- 'coding_session_reply'. The chip writes the `source_feature` filter.
  SELECT 'audience_source_feature'::text, b.audience||':'||coalesce(nullif(b.source_feature,''),'__none__'), count(*)
    FROM base b WHERE b.audience = 'external' AND b.source_app = 'code-plugin' GROUP BY 2
  UNION ALL
  SELECT 'audience_conversation_type'::text, b.audience||':'||b.conversation_type, count(*)
    FROM base b WHERE b.audience = 'internal' GROUP BY 2
  UNION ALL
  SELECT 'conversation_type'::text, b.conversation_type, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'origin_class'::text, b.origin_class, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'source_app'::text, coalesce(nullif(b.source_app,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'source_feature'::text, coalesce(nullif(b.source_feature,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'provider'::text, coalesce(b.provider,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'workspace_name'::text, coalesce(b.workspace_name,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'provider_account'::text, coalesce(b.provider_account,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'title_source'::text, coalesce(b.title_source,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'category'::text, coalesce(b.category,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'fidelity'::text, coalesce(b.fidelity,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'binding_status'::text, coalesce(b.binding_status,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'visibility'::text, b.visibility, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'owner_email'::text, coalesce(nullif(b.owner_email,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'organization_name'::text, coalesce(nullif(b.organization_name,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'access_level'::text, b.access_level, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'message_count'::text, public.cvx_size_band(b.message_count), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'favorite'::text, 'only', count(*) FILTER (WHERE b.is_favorite) FROM base b
  UNION ALL
  SELECT 'archived'::text, 'archived', count(*) FILTER (WHERE b.is_archived) FROM base b;
END;
$function$;

