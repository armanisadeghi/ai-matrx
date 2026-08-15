-- crm_08_inbox_chasebox — the unified outreach inbox + the Chasebox, as VIEWS
-- over crm.interaction + crm.outreach_list_member.
--
-- D9 (orchestrator, research/03): the inbox and the Chasebox are NOT new
-- tables and NOT a new inbox data model. A separate inbox store violates the
-- one-engine rule. Everything here is a read over the two tables the outreach
-- engine already writes, plus ONE namespaced attributes key the human uses to
-- say "I dealt with this" (crm.interaction.attributes.inbox.handled_at).
--
-- Template: lib/list-scope/FEATURE.md + migrations/agx_list_scoped_v3_all_columns.sql
-- and migrations/trx_list_scoped.sql. Invariants carried over verbatim:
--   1. every ORDER BY ends in id (a non-total order silently drops rows)
--   2. deleted_at IS NULL, always
--   3. count(*) OVER () AS total_count — a true server total, never rows.length
--   4. ONE p_filters jsonb bag keyed by column id
--   5. filter and sort server-side or not at all
--   6. SECURITY DEFINER ⇒ the function enforces reach itself
--   7. qualify every relation column (RETURNS TABLE names are implicit vars)
--   8. cast enums explicitly at the wire boundary
-- Search is relevance-ranked from day one (crm_inbox_search_score, tiers
-- ported from agx_search_score / trx_search_score).
--
-- THE RLS CEILING, RESTATED. crm.interaction's std_select policy is
--   party_id IN accessible_entity_ids('party','viewer')
--   OR has_access('crm_interaction', id, 'viewer')
-- and crm.outreach_list_member's is the same shape over crm_outreach_list.
-- SECURITY DEFINER bypasses RLS, so both are reproduced here — otherwise these
-- surfaces would show rows the user cannot open.
--
-- SCOPES: `mine` + `orgs` only. An interaction is private business data with no
-- `visibility` axis and no CRM grant-reader RPC yet (features/crm/FEATURE.md
-- § Not built yet), so `shared`, `industry` and `public` would each be a lie.
-- A surface declares a SUBSET of the fixed five; it never invents a sixth.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE PROVISIONAL ATTRIBUTES ACCESSOR — one place in SQL, one in TypeScript
-- ════════════════════════════════════════════════════════════════════════════
-- Inbound reply ingestion (aidream, landing in parallel) writes its
-- classification under crm.interaction.attributes. The exact path is not frozen
-- yet, so every reader in the platform goes through these two functions and
-- through features/crm/inbox/attributes.ts on the client. A rename is a
-- one-line change in each, never a grep across surfaces.
--
-- Assumed path: attributes.inbound_classification = { label, evidence }
-- Accepted fallback: attributes.classification = { label, evidence }
CREATE OR REPLACE FUNCTION public.crm_inbound_label(p_attributes jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(coalesce(
    p_attributes #>> '{inbound_classification,label}',
    p_attributes #>> '{classification,label}',
    ''
  )), '');
$$;
GRANT EXECUTE ON FUNCTION public.crm_inbound_label(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_inbound_evidence(p_attributes jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(coalesce(
    p_attributes #>> '{inbound_classification,evidence}',
    p_attributes #>> '{classification,evidence}',
    ''
  )), '');
$$;
GRANT EXECUTE ON FUNCTION public.crm_inbound_evidence(jsonb) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. RELEVANCE — ported from agx_search_score, never a flat ILIKE OR
-- ════════════════════════════════════════════════════════════════════════════
-- lib/entity-list/FEATURE.md rule 4: "When you move something to a new layer,
-- PORT the proven implementation first and improve it second." Tiers match the
-- agents/transcripts scorers; the fields are this surface's own (who replied
-- outranks what they said, which outranks which campaign it came from).
CREATE OR REPLACE FUNCTION public.crm_inbox_search_score(
  p_query        text,
  p_id           uuid,
  p_party_name   text,
  p_subject      text,
  p_snippet      text,
  p_list_name    text,
  p_employer     text,
  p_classification text,
  p_deep_hit     boolean DEFAULT false
)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $function$
DECLARE
  q     text := btrim(lower(coalesce(p_query, '')));
  score integer := 0;
  nm    text := lower(coalesce(p_party_name, ''));
  sj    text := lower(coalesce(p_subject, ''));
  sn    text := lower(coalesce(p_snippet, ''));
  idt   text := lower(p_id::text);
  qesc  text;
  term  text;
  terms text[];
  term_hits integer := 0;
BEGIN
  IF q = '' THEN RETURN 0; END IF;
  qesc := public.agx_escape_regex(q);

  -- Who replied is the name tier.
  IF nm = q THEN score := score + 10000;
  ELSIF nm LIKE q || '%' THEN score := score + 5000;
  ELSIF nm ~ ('\m' || qesc || '\M') THEN score := score + 3000;
  ELSIF position(q in nm) > 0 THEN score := score + 2000;
  END IF;

  -- The subject line is the description tier.
  IF sj = q THEN score := score + 1000;
  ELSIF position(q in sj) > 0 THEN score := score + 500;
  END IF;

  IF position(q in sn) > 0 THEN score := score + 400; END IF;
  IF position(q in lower(coalesce(p_list_name, ''))) > 0 THEN score := score + 300; END IF;
  IF position(q in lower(coalesce(p_employer, ''))) > 0 THEN score := score + 300; END IF;
  IF position(q in lower(coalesce(p_classification, ''))) > 0 THEN score := score + 100; END IF;

  IF idt = q THEN score := score + 100000;
  ELSIF position(q in idt) > 0 THEN score := score + 5000;
  END IF;

  IF score = 0 AND position(' ' in q) > 0 THEN
    terms := regexp_split_to_array(q, '\s+');
    FOREACH term IN ARRAY terms LOOP
      IF term <> '' AND (
           position(term in nm) > 0
        OR position(term in sj) > 0
        OR position(term in sn) > 0
        OR position(term in lower(coalesce(p_list_name, ''))) > 0
      ) THEN
        term_hits := term_hits + 1;
        IF position(term in nm) > 0 THEN score := score + 400;
        ELSE score := score + 100;
        END IF;
      END IF;
    END LOOP;
    IF term_hits < array_length(terms, 1) THEN score := 0; END IF;
  END IF;

  IF score = 0 AND p_deep_hit THEN score := 50; END IF;
  RETURN score;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.crm_inbox_search_score(text,uuid,text,text,text,text,text,text,boolean) TO authenticated;

-- Attempt-number buckets, so the "Step" column can filter like every other
-- column rather than being the one exempt from app policy.
CREATE OR REPLACE FUNCTION public.crm_step_matches(p_step integer, p_bucket text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_bucket
    WHEN '1'        THEN p_step = 1
    WHEN '2'        THEN p_step = 2
    WHEN '3'        THEN p_step = 3
    WHEN 'gt3'      THEN p_step > 3
    WHEN '__none__' THEN p_step IS NULL
    ELSE false END;
$$;
GRANT EXECUTE ON FUNCTION public.crm_step_matches(integer, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. THE UNIFIED INBOX — one row = one INBOUND crm.interaction, in full context
-- ════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.crm_inbox_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.crm_inbox_list_scoped(
  p_scope   text    DEFAULT 'mine',
  p_org_id  uuid    DEFAULT NULL,
  p_search  text    DEFAULT NULL,
  p_deep    boolean DEFAULT false,
  p_sort    text    DEFAULT 'occurred',
  p_dir     text    DEFAULT 'desc',
  p_filters jsonb   DEFAULT '{}'::jsonb,
  p_limit   integer DEFAULT 25,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  occurred_at timestamptz,
  created_at timestamptz,
  channel_code text,
  subject text,
  snippet text,
  thread_key text,
  classification text,
  evidence text,
  handled boolean,
  handled_at timestamptz,
  party_id uuid,
  party_name text,
  party_kind text,
  employer_id uuid,
  employer_name text,
  outreach_list_id uuid,
  outreach_list_name text,
  outreach_list_status text,
  member_id uuid,
  member_status text,
  step integer,
  outbound_id uuid,
  outbound_subject text,
  outbound_sent_at timestamptz,
  sending_identity_id uuid,
  sending_identity_label text,
  reputation_case_id uuid,
  reputation_case_label text,
  backlink_id uuid,
  backlink_label text,
  organization_id uuid,
  organization_name text,
  is_owner boolean,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_scope  text := lower(coalesce(p_scope, 'mine'));
  v_dir    text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort   text := lower(coalesce(p_sort, 'occurred'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f      jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'crm_inbox_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs') THEN
    RAISE EXCEPTION 'crm_inbox_list_scoped: unsupported scope % (this surface declares mine|orgs)', v_scope;
  END IF;
  IF v_sort NOT IN ('occurred','created','party_name','subject','snippet','classification',
                    'outreach_list_name','sending_identity_label','employer_name','step',
                    'handled','channel','organization_name','member_status') THEN
    v_sort := 'occurred';
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT DISTINCT m.container_id AS org_id
    FROM iam.memberships m
    WHERE m.user_id = v_uid
      AND m.container_type = 'organization'
      AND (p_org_id IS NULL OR m.container_id = p_org_id)
  ),
  reachable_parties AS (
    SELECT unnest(iam.accessible_entity_ids('party'::text, 'viewer'::permission_level)) AS party_id
  ),
  inbound AS (
    SELECT
      i.id                       AS u_id,
      coalesce(i.occurred_at, i.created_at) AS u_occurred,
      i.created_at               AS u_created,
      i.channel_code             AS u_channel,
      coalesce(nullif(btrim(i.subject), ''), '(no subject)') AS u_subject,
      left(coalesce(i.body, ''), 400) AS u_snippet,
      i.body                     AS u_body,
      i.thread_key               AS u_thread_key,
      public.crm_inbound_label(i.attributes)    AS u_classification,
      public.crm_inbound_evidence(i.attributes) AS u_evidence,
      (i.attributes #>> '{inbox,handled_at}')::timestamptz AS u_handled_at,
      i.party_id                 AS u_party_id,
      i.outreach_list_id         AS u_list_id,
      i.organization_id          AS u_org_id,
      i.created_by               AS u_created_by,
      i.assigned_to              AS u_assigned_to
    FROM crm.interaction i
    WHERE i.deleted_at IS NULL
      AND i.direction = 'inbound'
      -- THE RLS CEILING, RESTATED (crm.interaction std_select).
      AND (i.party_id IN (SELECT rp.party_id FROM reachable_parties rp)
           OR iam.has_access('crm_interaction'::text, i.id, 'viewer'::permission_level))
  ),
  scoped AS (
    -- MINE — the runner acts as the campaign owner (D-W1-3), so an ingested
    -- reply on my campaign carries created_by = me. Assignment counts too: a
    -- reply handed to me is mine to answer.
    SELECT b.*, true AS s_is_owner
    FROM inbound b
    WHERE v_scope = 'mine'
      AND (b.u_created_by = v_uid OR b.u_assigned_to = v_uid)
    UNION ALL
    SELECT b.*, (b.u_created_by = v_uid) AS s_is_owner
    FROM inbound b
    WHERE v_scope = 'orgs'
      AND b.u_org_id IN (SELECT mo.org_id FROM my_orgs mo)
  ),
  -- The outbound step this reply answers: same Gmail thread, sent at or before
  -- the reply. D-W1-5 — correlation is by thread_key, never RFC822 Message-ID.
  contextual AS (
    SELECT
      s.*,
      ob.id           AS x_outbound_id,
      ob.subject      AS x_outbound_subject,
      coalesce(ob.occurred_at, ob.created_at) AS x_outbound_sent_at,
      ob.attempt_number::integer AS x_step,
      nullif(ob.attributes #>> '{outreach_single_send,reputation_case_id}', '')::uuid AS x_reputation_case_id,
      nullif(ob.attributes #>> '{outreach_single_send,backlink_id}', '')::uuid        AS x_backlink_id,
      nullif(ob.attributes #>> '{outreach_single_send,member_id}', '')::uuid          AS x_member_id
    FROM scoped s
    LEFT JOIN LATERAL (
      SELECT o.*
      FROM crm.interaction o
      WHERE o.deleted_at IS NULL
        AND o.direction = 'outbound'
        AND s.u_thread_key IS NOT NULL
        AND o.thread_key = s.u_thread_key
        AND coalesce(o.occurred_at, o.created_at) <= s.u_occurred
      ORDER BY coalesce(o.occurred_at, o.created_at) DESC, o.id
      LIMIT 1
    ) ob ON true
  ),
  joined AS (
    SELECT
      c.*,
      pt.display_name                AS j_party_name,
      pt.party_kind                  AS j_party_kind,
      pt.primary_employer_party_id   AS j_employer_id,
      emp.display_name               AS j_employer_name,
      ol.name                        AS j_list_name,
      ol.status                      AS j_list_status,
      ol.sending_identity_id         AS j_identity_id,
      coalesce(nullif(si.from_name, ''), si.from_address) AS j_identity_label,
      org.name                       AS j_org_name,
      mem.id                         AS j_member_id,
      mem.status                     AS j_member_status,
      coalesce(nullif(rc.headline,''), nullif(rc.source_title,''), rc.source_domain) AS j_case_label,
      coalesce(nullif(bl.source_url,''), bl.source_domain) AS j_backlink_label,
      -- HANDLED. Two independent, honest signals; neither is a new table:
      --   (a) a human pressed "Mark handled" -> attributes.inbox.handled_at
      --   (b) we already answered -> a later outbound in the same thread
      -- (b) means replying through the ONE send primitive clears the row on its
      -- own, so the queue cannot rot behind a forgotten checkbox.
      (c.u_handled_at IS NOT NULL
       OR EXISTS (
            SELECT 1 FROM crm.interaction r
            WHERE r.deleted_at IS NULL
              AND r.direction = 'outbound'
              AND c.u_thread_key IS NOT NULL
              AND r.thread_key = c.u_thread_key
              AND coalesce(r.occurred_at, r.created_at) > c.u_occurred
          )) AS j_handled
    FROM contextual c
    LEFT JOIN crm.party pt              ON pt.id  = c.u_party_id
    LEFT JOIN crm.party emp             ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.outreach_list ol      ON ol.id  = c.u_list_id
    LEFT JOIN crm.sending_identity si   ON si.id  = ol.sending_identity_id
    LEFT JOIN iam.organizations org     ON org.id = c.u_org_id
    LEFT JOIN crm.outreach_list_member mem ON mem.id = c.x_member_id AND mem.deleted_at IS NULL
    LEFT JOIN seo.reputation_case rc    ON rc.id  = c.x_reputation_case_id
    LEFT JOIN seo.backlink bl           ON bl.id  = c.x_backlink_id
  ),
  filtered AS (
    SELECT j.*,
      (p_deep AND v_search IS NOT NULL AND coalesce(j.u_body,'') ILIKE '%'||v_search||'%') AS f_deep_hit
    FROM joined j
    WHERE (v_search IS NULL
        OR coalesce(j.j_party_name,'')   ILIKE '%'||v_search||'%'
        OR j.u_subject                   ILIKE '%'||v_search||'%'
        OR j.u_snippet                   ILIKE '%'||v_search||'%'
        OR coalesce(j.j_list_name,'')    ILIKE '%'||v_search||'%'
        OR coalesce(j.j_employer_name,'')ILIKE '%'||v_search||'%'
        OR (p_deep AND coalesce(j.u_body,'') ILIKE '%'||v_search||'%'))
      AND (NOT v_f ? 'party_name'  OR coalesce(j.j_party_name,'') ILIKE '%'||(v_f->'party_name'->>'value')||'%')
      AND (NOT v_f ? 'subject'     OR j.u_subject ILIKE '%'||(v_f->'subject'->>'value')||'%')
      AND (NOT v_f ? 'snippet'     OR j.u_snippet ILIKE '%'||(v_f->'snippet'->>'value')||'%')
      AND (NOT v_f ? 'employer_name' OR coalesce(j.j_employer_name,'') ILIKE '%'||(v_f->'employer_name'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.j_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'classification'
           OR coalesce(nullif(j.u_classification,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'classification'->'values')))
      AND (NOT v_f ? 'outreach_list_name'
           OR coalesce(nullif(j.j_list_name,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'outreach_list_name'->'values')))
      AND (NOT v_f ? 'sending_identity_label'
           OR coalesce(nullif(j.j_identity_label,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'sending_identity_label'->'values')))
      AND (NOT v_f ? 'member_status'
           OR coalesce(nullif(j.j_member_status,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'member_status'->'values')))
      AND (NOT v_f ? 'channel'
           OR j.u_channel IN (SELECT jsonb_array_elements_text(v_f->'channel'->'values')))
      AND (NOT v_f ? 'handled'
           OR j.j_handled IS NOT DISTINCT FROM (v_f->'handled'->>'value')::boolean)
      AND (NOT v_f ? 'step'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'step'->'values') b
                      WHERE public.crm_step_matches(j.x_step, b)))
      AND (NOT v_f ? 'occurred' OR j.u_occurred >= public.agx_since_bucket(v_f->'occurred'->'values'->>0))
      AND (NOT v_f ? 'created'  OR j.u_created  >= public.agx_since_bucket(v_f->'created'->'values'->>0))
  ),
  scored AS (
    -- Only a real page pays for per-row plpgsql scoring; the counts/facets
    -- callers come through with LIMIT 1 (same guard as trx_list_scoped).
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.crm_inbox_search_score(
        v_search, f.u_id, f.j_party_name, f.u_subject, f.u_snippet,
        f.j_list_name, f.j_employer_name, f.u_classification, f.f_deep_hit)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT
    c.u_id, c.u_occurred, c.u_created, c.u_channel, c.u_subject, c.u_snippet,
    c.u_thread_key, c.u_classification, c.u_evidence, c.j_handled, c.u_handled_at,
    c.u_party_id, c.j_party_name, c.j_party_kind::text, c.j_employer_id, c.j_employer_name,
    c.u_list_id, c.j_list_name, c.j_list_status::text,
    c.j_member_id, c.j_member_status::text, c.x_step,
    c.x_outbound_id, c.x_outbound_subject, c.x_outbound_sent_at,
    c.j_identity_id, c.j_identity_label,
    c.x_reputation_case_id, c.j_case_label, c.x_backlink_id, c.j_backlink_label,
    c.u_org_id, c.j_org_name, c.s_is_owner, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST while searching (lib/entity-list/FEATURE.md rule 4).
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='occurred'   AND v_dir='desc' THEN c.u_occurred END DESC,
    CASE WHEN v_sort='occurred'   AND v_dir='asc'  THEN c.u_occurred END ASC,
    CASE WHEN v_sort='created'    AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created'    AND v_dir='asc'  THEN c.u_created END ASC,
    CASE WHEN v_sort='party_name' AND v_dir='desc' THEN lower(coalesce(c.j_party_name,'')) END DESC,
    CASE WHEN v_sort='party_name' AND v_dir='asc'  THEN lower(coalesce(c.j_party_name,'')) END ASC,
    CASE WHEN v_sort='subject'    AND v_dir='desc' THEN lower(c.u_subject) END DESC,
    CASE WHEN v_sort='subject'    AND v_dir='asc'  THEN lower(c.u_subject) END ASC,
    CASE WHEN v_sort='snippet'    AND v_dir='desc' THEN lower(c.u_snippet) END DESC,
    CASE WHEN v_sort='snippet'    AND v_dir='asc'  THEN lower(c.u_snippet) END ASC,
    CASE WHEN v_sort='classification' AND v_dir='desc' THEN lower(coalesce(c.u_classification,'')) END DESC,
    CASE WHEN v_sort='classification' AND v_dir='asc'  THEN lower(coalesce(c.u_classification,'')) END ASC,
    CASE WHEN v_sort='outreach_list_name' AND v_dir='desc' THEN lower(coalesce(c.j_list_name,'')) END DESC,
    CASE WHEN v_sort='outreach_list_name' AND v_dir='asc'  THEN lower(coalesce(c.j_list_name,'')) END ASC,
    CASE WHEN v_sort='sending_identity_label' AND v_dir='desc' THEN lower(coalesce(c.j_identity_label,'')) END DESC,
    CASE WHEN v_sort='sending_identity_label' AND v_dir='asc'  THEN lower(coalesce(c.j_identity_label,'')) END ASC,
    CASE WHEN v_sort='employer_name' AND v_dir='desc' THEN lower(coalesce(c.j_employer_name,'')) END DESC,
    CASE WHEN v_sort='employer_name' AND v_dir='asc'  THEN lower(coalesce(c.j_employer_name,'')) END ASC,
    CASE WHEN v_sort='member_status' AND v_dir='desc' THEN lower(coalesce(c.j_member_status,'')) END DESC,
    CASE WHEN v_sort='member_status' AND v_dir='asc'  THEN lower(coalesce(c.j_member_status,'')) END ASC,
    CASE WHEN v_sort='channel'  AND v_dir='desc' THEN c.u_channel END DESC,
    CASE WHEN v_sort='channel'  AND v_dir='asc'  THEN c.u_channel END ASC,
    CASE WHEN v_sort='step'     AND v_dir='desc' THEN c.x_step END DESC NULLS LAST,
    CASE WHEN v_sort='step'     AND v_dir='asc'  THEN c.x_step END ASC NULLS LAST,
    CASE WHEN v_sort='handled'  AND v_dir='desc' THEN c.j_handled END DESC,
    CASE WHEN v_sort='handled'  AND v_dir='asc'  THEN c.j_handled END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.j_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc'  THEN lower(coalesce(c.j_org_name,'')) END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_inbox_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_inbox_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer) TO authenticated;

-- Scope tab totals + the My Orgs narrowing options — names AND counts from the
-- SAME query, never a Redux slice (lib/list-scope/FEATURE.md).
CREATE OR REPLACE FUNCTION public.crm_inbox_list_scope_counts(
  p_search  text    DEFAULT NULL,
  p_deep    boolean DEFAULT false,
  p_filters jsonb   DEFAULT '{}'::jsonb
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  FOREACH v_scope IN ARRAY ARRAY['mine','orgs'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.crm_inbox_list_scoped(v_scope, NULL, p_search, p_deep, 'occurred', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, coalesce(o.name, 'Unnamed org'), coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.memberships m
    ON m.container_id = o.id AND m.container_type = 'organization' AND m.user_id = auth.uid()
  LEFT JOIN LATERAL public.crm_inbox_list_scoped('orgs', o.id, p_search, p_deep, 'occurred','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_inbox_list_scope_counts(text,boolean,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_inbox_list_scope_counts(text,boolean,jsonb) TO authenticated;

-- Filter-panel options WITH counts, for the current scope + search. Deliberately
-- NOT narrowed by the selection itself — a facet list that hides the option you
-- just deselected traps the user inside their own filter.
CREATE OR REPLACE FUNCTION public.crm_inbox_list_facets(
  p_scope  text    DEFAULT 'mine',
  p_org_id uuid    DEFAULT NULL,
  p_search text    DEFAULT NULL,
  p_deep   boolean DEFAULT false
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT r.classification AS b_class, r.outreach_list_name AS b_list,
           r.sending_identity_label AS b_identity, r.channel_code AS b_channel,
           r.handled AS b_handled, r.member_status AS b_member_status,
           r.step AS b_step, r.organization_name AS b_org
    FROM public.crm_inbox_list_scoped(p_scope, p_org_id, p_search, p_deep, 'occurred','desc',
      '{}'::jsonb, 1000000, 0) r
  )
  SELECT 'classification'::text, coalesce(nullif(b.b_class,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'outreach_list_name'::text, coalesce(nullif(b.b_list,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'sending_identity_label'::text, coalesce(nullif(b.b_identity,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'channel'::text, b.b_channel, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'member_status'::text, coalesce(nullif(b.b_member_status,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'handled'::text, CASE WHEN b.b_handled THEN 'true' ELSE 'false' END, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'step'::text,
         CASE WHEN b.b_step IS NULL THEN '__none__'
              WHEN b.b_step > 3 THEN 'gt3'
              ELSE b.b_step::text END,
         count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'organization_name'::text, coalesce(nullif(b.b_org,''),'__none__'), count(*) FROM base b GROUP BY 2;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_inbox_list_facets(text,uuid,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_inbox_list_facets(text,uuid,text,boolean) TO authenticated;

-- Mark an inbound reply handled / unhandled. The ONE writer of the
-- attributes.inbox namespace: everything else in `attributes` belongs to the
-- server (outreach_single_send, the inbound classifier), so the human's "I
-- dealt with this" gets its own key rather than overwriting a sibling.
-- jsonb_set with create_missing is not enough on a NULL/absent object, hence
-- the coalesce chain.
CREATE OR REPLACE FUNCTION public.crm_inbox_set_handled(
  p_interaction_id uuid,
  p_handled boolean DEFAULT true
)
RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_party uuid;
  v_result timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'crm_inbox_set_handled: not authenticated'; END IF;

  SELECT i.party_id INTO v_party
  FROM crm.interaction i
  WHERE i.id = p_interaction_id AND i.deleted_at IS NULL AND i.direction = 'inbound';

  IF v_party IS NULL THEN
    RAISE EXCEPTION 'crm_inbox_set_handled: no inbound interaction %', p_interaction_id;
  END IF;

  -- EDITOR reach, restated from crm.interaction's std_update policy. A viewer
  -- may read the inbox; only someone who can edit the record may clear it.
  IF NOT (v_party IN (SELECT unnest(iam.accessible_entity_ids('party'::text, 'editor'::permission_level)))
          OR iam.has_access('crm_interaction'::text, p_interaction_id, 'editor'::permission_level)) THEN
    RAISE EXCEPTION 'crm_inbox_set_handled: not permitted on interaction %', p_interaction_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE crm.interaction i
  SET attributes = jsonb_set(
        coalesce(i.attributes, '{}'::jsonb),
        '{inbox}',
        coalesce(i.attributes -> 'inbox', '{}'::jsonb)
          || CASE WHEN p_handled
                  THEN jsonb_build_object('handled_at', to_jsonb(v_now), 'handled_by', to_jsonb(v_uid))
                  ELSE jsonb_build_object('handled_at', 'null'::jsonb, 'handled_by', 'null'::jsonb) END,
        true)
  WHERE i.id = p_interaction_id;

  v_result := CASE WHEN p_handled THEN v_now ELSE NULL END;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_inbox_set_handled(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_inbox_set_handled(uuid, boolean) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. THE CHASEBOX — "what needs me now", as saved filters over the SAME schema
-- ════════════════════════════════════════════════════════════════════════════
-- Five queues, ONE row type with a `queue` column (the ratified heterogeneous-
-- rows decision, proven on /transcripts). Every row carries its own problem AND
-- its one-click fix — THE DOOR LAW's corollary, non-negotiable here.
--
--   fresh_replies          inbound replies nobody has answered or cleared
--   pending_drafts         status='planned' drafts the trust ladder held (IC-6)
--   stalled_sequences      members past next_attempt_at, or paused upstream
--   blocked_members        members whose send would refuse (the ONE authority)
--   escalation_candidates  sequence finished, no reply — a SUGGESTION only
DROP FUNCTION IF EXISTS public.crm_chasebox_items(text, text, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.crm_chasebox_items(
  p_queue  text,
  p_scope  text    DEFAULT 'mine',
  p_org_id uuid    DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  queue text,
  id uuid,
  interaction_id uuid,
  member_id uuid,
  party_id uuid,
  party_name text,
  employer_name text,
  outreach_list_id uuid,
  outreach_list_name text,
  outreach_list_status text,
  sending_identity_id uuid,
  sending_identity_label text,
  subject text,
  detail text,
  problem_code text,
  problem_message text,
  problem_fix text,
  step integer,
  occurred_at timestamptz,
  organization_id uuid,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
  v_queue text := lower(coalesce(p_queue, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'crm_chasebox_items: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs') THEN
    RAISE EXCEPTION 'crm_chasebox_items: unsupported scope %', v_scope;
  END IF;
  IF v_queue NOT IN ('fresh_replies','pending_drafts','stalled_sequences',
                     'blocked_members','escalation_candidates') THEN
    RAISE EXCEPTION 'crm_chasebox_items: unknown queue %', v_queue;
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT DISTINCT m.container_id AS org_id
    FROM iam.memberships m
    WHERE m.user_id = v_uid AND m.container_type = 'organization'
      AND (p_org_id IS NULL OR m.container_id = p_org_id)
  ),
  -- THE RLS CEILING for the member half: crm.outreach_list_member's std_select
  -- keys on reach to its parent crm_outreach_list.
  reachable_lists AS (
    SELECT ol.id AS list_id, ol.name AS list_name, ol.status AS list_status,
           ol.lane AS list_lane, ol.sending_identity_id AS list_identity_id,
           ol.definition AS list_definition, ol.organization_id AS list_org_id,
           ol.created_by AS list_created_by, ol.paused_at AS list_paused_at,
           ol.pause_reason AS list_pause_reason
    FROM crm.outreach_list ol
    WHERE ol.deleted_at IS NULL
      AND ol.id IN (SELECT unnest(iam.accessible_entity_ids('crm_outreach_list'::text, 'viewer'::permission_level)))
      AND ((v_scope = 'mine' AND ol.created_by = v_uid)
        OR (v_scope = 'orgs' AND ol.organization_id IN (SELECT mo.org_id FROM my_orgs mo)))
  ),
  reachable_parties AS (
    SELECT unnest(iam.accessible_entity_ids('party'::text, 'viewer'::permission_level)) AS pid
  ),

  -- ── 1. FRESH REPLIES ──────────────────────────────────────────────────────
  q_fresh AS (
    SELECT
      'fresh_replies'::text AS r_queue,
      r.id                  AS r_id,
      r.id                  AS r_interaction_id,
      r.member_id           AS r_member_id,
      r.party_id            AS r_party_id,
      r.party_name          AS r_party_name,
      r.employer_name       AS r_employer_name,
      r.outreach_list_id    AS r_list_id,
      r.outreach_list_name  AS r_list_name,
      r.outreach_list_status AS r_list_status,
      r.sending_identity_id AS r_identity_id,
      r.sending_identity_label AS r_identity_label,
      r.subject             AS r_subject,
      r.snippet             AS r_detail,
      coalesce(r.classification, 'unclassified') AS r_problem_code,
      coalesce(r.evidence, 'A real person replied and nobody has answered yet.') AS r_problem_message,
      'Read it and reply through the same governed send path.'::text AS r_problem_fix,
      r.step                AS r_step,
      r.occurred_at         AS r_occurred,
      r.organization_id     AS r_org_id
    FROM public.crm_inbox_list_scoped(v_scope, p_org_id, NULL, false, 'occurred', 'desc',
           jsonb_build_object('handled', jsonb_build_object('value', false)), 1000000, 0) r
    WHERE v_queue = 'fresh_replies'
  ),

  -- ── 2. DRAFTS AWAITING APPROVAL (IC-6) ────────────────────────────────────
  -- The sequence runner leaves a step `planned` whenever the earned-trust
  -- ladder says a human must approve it (D-W1-2). Surfacing those is a
  -- first-class Chasebox job — an unapproved draft is a stopped campaign.
  q_drafts AS (
    SELECT
      'pending_drafts'::text, i.id, i.id,
      nullif(i.attributes #>> '{outreach_single_send,member_id}', '')::uuid,
      i.party_id,
      pt.display_name,
      emp.display_name,
      i.outreach_list_id,
      ol.name, ol.status::text,
      ol.sending_identity_id,
      coalesce(nullif(si.from_name,''), si.from_address),
      coalesce(nullif(btrim(i.subject),''), '(no subject)'),
      left(coalesce(i.body,''), 400),
      'awaiting_approval'::text,
      'This message is written and waiting for a human to approve it.'::text,
      'Open it, read the exact rendered message, then approve and send.'::text,
      i.attempt_number::integer,
      coalesce(i.scheduled_at, i.created_at),
      i.organization_id
    FROM crm.interaction i
    LEFT JOIN crm.party pt          ON pt.id = i.party_id
    LEFT JOIN crm.party emp         ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.outreach_list ol  ON ol.id = i.outreach_list_id
    LEFT JOIN crm.sending_identity si ON si.id = ol.sending_identity_id
    WHERE v_queue = 'pending_drafts'
      AND i.deleted_at IS NULL
      AND i.direction = 'outbound'
      AND i.status = 'planned'
      AND i.attributes ? 'outreach_single_send'
      AND (i.party_id IN (SELECT rp.pid FROM reachable_parties rp)
           OR iam.has_access('crm_interaction'::text, i.id, 'viewer'::permission_level))
      AND ((v_scope = 'mine' AND (i.created_by = v_uid OR i.assigned_to = v_uid))
        OR (v_scope = 'orgs' AND i.organization_id IN (SELECT mo.org_id FROM my_orgs mo)))
  ),

  -- ── 3. STALLED SEQUENCES ──────────────────────────────────────────────────
  -- Two ways a member stops moving: its own retry time passed and nothing
  -- happened, or the campaign/mailbox above it is paused. Both render the real
  -- pause_reason and a door to the thing that can resume it.
  q_stalled AS (
    SELECT
      'stalled_sequences'::text, m.id, NULL::uuid, m.id, m.party_id,
      pt.display_name, emp.display_name,
      rl.list_id, rl.list_name, rl.list_status::text,
      rl.list_identity_id, coalesce(nullif(si.from_name,''), si.from_address),
      NULL::text,
      'Step ' || coalesce(m.current_step, 0)::text || ' · ' ||
        coalesce(m.attempt_count, 0)::text || ' attempt(s) · status ' || m.status,
      CASE
        WHEN rl.list_paused_at IS NOT NULL THEN 'campaign_paused'
        WHEN si.paused_at IS NOT NULL THEN 'mailbox_paused'
        ELSE 'overdue'
      END::text,
      CASE
        WHEN rl.list_paused_at IS NOT NULL
          THEN 'The campaign is paused' ||
               coalesce(' — ' || nullif(rl.list_pause_reason,''), '') || '.'
        WHEN si.paused_at IS NOT NULL
          THEN 'The sending mailbox is paused' ||
               coalesce(' — ' || nullif(si.pause_reason,''), '') || '.'
        ELSE 'This step was due ' || to_char(m.next_attempt_at, 'YYYY-MM-DD HH24:MI') ||
             ' and has not moved since.'
      END::text,
      CASE
        WHEN rl.list_paused_at IS NOT NULL THEN 'Open the campaign and resume it, or fix what paused it.'
        WHEN si.paused_at IS NOT NULL THEN 'Open the mailbox checklist and resume sending.'
        ELSE 'Open the campaign and advance or retire this member.'
      END::text,
      m.current_step::integer,
      m.next_attempt_at,
      m.organization_id
    FROM crm.outreach_list_member m
    JOIN reachable_lists rl ON rl.list_id = m.outreach_list_id
    LEFT JOIN crm.party pt  ON pt.id = m.party_id
    LEFT JOIN crm.party emp ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.sending_identity si ON si.id = rl.list_identity_id
    WHERE v_queue = 'stalled_sequences'
      AND m.deleted_at IS NULL
      AND m.status NOT IN ('replied','not_interested','meeting_booked','suppressed','done','bounced')
      AND (
        (m.next_attempt_at IS NOT NULL AND m.next_attempt_at < now())
        OR rl.list_paused_at IS NOT NULL
        OR si.paused_at IS NOT NULL
      )
  ),

  -- ── 4. BLOCKED MEMBERS ────────────────────────────────────────────────────
  -- The send WOULD refuse. Cheap structural blocks are resolved in SQL; where a
  -- medium exists we ask crm.check_send_eligibility — THE ONE AUTHORITY — and
  -- render its own `fix`. Never a second copy of a compliance check.
  q_blocked AS (
    SELECT
      'blocked_members'::text, m.id, NULL::uuid, m.id, m.party_id,
      pt.display_name, emp.display_name,
      rl.list_id, rl.list_name, rl.list_status::text,
      rl.list_identity_id, coalesce(nullif(si.from_name,''), si.from_address),
      NULL::text,
      coalesce(cm.display_value, 'No contact point attached'),
      blk.b_code, blk.b_message, blk.b_fix,
      m.current_step::integer,
      m.last_attempt_at,
      m.organization_id
    FROM crm.outreach_list_member m
    JOIN reachable_lists rl ON rl.list_id = m.outreach_list_id
    LEFT JOIN crm.party pt  ON pt.id = m.party_id
    LEFT JOIN crm.party emp ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.sending_identity si ON si.id = rl.list_identity_id
    LEFT JOIN crm.party_contact_point cp ON cp.id = m.contact_point_id AND cp.deleted_at IS NULL
    LEFT JOIN crm.contact_medium cm ON cm.id = cp.medium_id AND cm.deleted_at IS NULL
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN m.contact_point_id IS NULL THEN 'recipient_not_in_list'
          WHEN cp.id IS NULL THEN 'contact_point_missing'
          WHEN pt.do_not_contact THEN 'party_do_not_contact'
          WHEN cp.opt_out_at IS NOT NULL THEN 'contact_point_opted_out'
          WHEN cm.id IS NULL THEN 'medium_missing'
          WHEN cm.is_contactable IS NOT TRUE THEN 'medium_not_contactable'
          ELSE nullif(v.v_first_block #>> '{code}', '')
        END AS b_code,
        CASE
          WHEN m.contact_point_id IS NULL
            THEN 'This member has no contact point, so eligibility always fails with recipient_not_in_list.'
          WHEN cp.id IS NULL THEN 'The attached contact point has been deleted.'
          WHEN pt.do_not_contact
            THEN 'This record is flagged do-not-contact. The send gate does not read that flag — the runner enforces it, so nothing will go out.'
          WHEN cp.opt_out_at IS NOT NULL THEN 'This person opted this address out.'
          WHEN cm.id IS NULL THEN 'The contact point points at a medium that no longer exists.'
          WHEN cm.is_contactable IS NOT TRUE
            THEN 'This address is suppressed, unsubscribed, complained, DNC-listed or hard-bounced.'
          ELSE coalesce(v.v_first_block #>> '{message}', 'The send gate refuses this recipient.')
        END AS b_message,
        CASE
          WHEN m.contact_point_id IS NULL
            THEN 'Open the record and attach the email address to use, then re-enroll.'
          WHEN cp.id IS NULL THEN 'Open the record and attach a live contact point.'
          WHEN pt.do_not_contact
            THEN 'Open the record — lift do-not-contact only if it was set by mistake.'
          WHEN cp.opt_out_at IS NOT NULL THEN 'An opt-out is not ours to lift. Remove this member from the campaign.'
          WHEN cm.id IS NULL THEN 'Open the record and re-add the address.'
          WHEN cm.is_contactable IS NOT TRUE
            THEN 'Open the record to see exactly what is on this value; a mistaken do-not-call is reversible, a legal opt-out is not.'
          ELSE coalesce(v.v_first_block #>> '{fix}', 'Open the sending checklist and resolve this item.')
        END AS b_fix
      FROM (
        SELECT CASE
          WHEN cm.id IS NULL OR cm.is_contactable IS NOT TRUE THEN NULL
          ELSE (crm.check_send_eligibility(cm.id, rl.list_id, rl.list_identity_id) -> 'blocks' -> 0)
        END AS v_first_block
      ) v
    ) blk
    WHERE v_queue = 'blocked_members'
      AND m.deleted_at IS NULL
      AND m.status NOT IN ('replied','not_interested','meeting_booked','done')
      AND blk.b_code IS NOT NULL
  ),

  -- ── 5. SECONDARY-CONTACT ESCALATION CANDIDATES ────────────────────────────
  -- The sequence finished and nobody replied. Rendered as a SUGGESTION only —
  -- research/03 is explicit that this never auto-sends.
  q_escalation AS (
    SELECT
      'escalation_candidates'::text, m.id, NULL::uuid, m.id, m.party_id,
      pt.display_name, emp.display_name,
      rl.list_id, rl.list_name, rl.list_status::text,
      rl.list_identity_id, coalesce(nullif(si.from_name,''), si.from_address),
      NULL::text,
      coalesce(m.attempt_count, 0)::text || ' message(s) sent · last '
        || coalesce(to_char(m.last_attempt_at, 'YYYY-MM-DD'), 'unknown'),
      'no_reply_after_sequence'::text,
      'The whole sequence ran and this person never replied.'::text,
      'Consider a different person at the same company — review the record and enroll them deliberately. Nothing is sent automatically.'::text,
      m.current_step::integer,
      m.last_attempt_at,
      m.organization_id
    FROM crm.outreach_list_member m
    JOIN reachable_lists rl ON rl.list_id = m.outreach_list_id
    LEFT JOIN crm.party pt  ON pt.id = m.party_id
    LEFT JOIN crm.party emp ON emp.id = pt.primary_employer_party_id
    LEFT JOIN crm.sending_identity si ON si.id = rl.list_identity_id
    WHERE v_queue = 'escalation_candidates'
      AND m.deleted_at IS NULL
      AND m.status IN ('sent','delivered','opened','clicked','done')
      AND coalesce(m.attempt_count, 0) > 0
      -- Sequence exhausted: either the campaign itself is finished, or the
      -- member walked past the last step in definition.sequence.
      AND (rl.list_status = 'completed'
           OR (jsonb_typeof(rl.list_definition -> 'sequence') = 'array'
               AND coalesce(m.current_step, 0) >= jsonb_array_length(rl.list_definition -> 'sequence')))
      AND NOT EXISTS (
        SELECT 1 FROM crm.interaction ri
        WHERE ri.deleted_at IS NULL
          AND ri.direction = 'inbound'
          AND ri.party_id = m.party_id
          AND ri.outreach_list_id = m.outreach_list_id
      )
  ),

  merged AS (
    SELECT * FROM q_fresh
    UNION ALL SELECT * FROM q_drafts
    UNION ALL SELECT * FROM q_stalled
    UNION ALL SELECT * FROM q_blocked
    UNION ALL SELECT * FROM q_escalation
  ),
  counted AS (SELECT x.*, count(*) OVER () AS x_total FROM merged x)
  SELECT
    c.r_queue, c.r_id, c.r_interaction_id, c.r_member_id, c.r_party_id,
    c.r_party_name, c.r_employer_name, c.r_list_id, c.r_list_name, c.r_list_status,
    c.r_identity_id, c.r_identity_label, c.r_subject, c.r_detail,
    c.r_problem_code, c.r_problem_message, c.r_problem_fix, c.r_step,
    c.r_occurred, c.r_org_id, c.x_total
  FROM counted c
  -- Oldest pain first: the thing that has been stuck longest is the thing that
  -- most needs a human. Total order (ends in id) per the template.
  ORDER BY c.r_occurred ASC NULLS FIRST, c.r_id
  LIMIT greatest(coalesce(p_limit, 50), 1) OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_chasebox_items(text,text,uuid,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_chasebox_items(text,text,uuid,integer,integer) TO authenticated;

-- Live counts for the five queue cards. Every count is itself a door, so this
-- is one round trip rather than five — and a queue at zero returns a real 0
-- rather than being absent, so the UI can render an honest empty state instead
-- of a spinner that never resolves.
CREATE OR REPLACE FUNCTION public.crm_chasebox_counts(
  p_scope  text DEFAULT 'mine',
  p_org_id uuid DEFAULT NULL
)
RETURNS TABLE(queue text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_queue text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  FOREACH v_queue IN ARRAY ARRAY['fresh_replies','pending_drafts','stalled_sequences',
                                 'blocked_members','escalation_candidates'] LOOP
    RETURN QUERY
    SELECT v_queue, coalesce(max(r.total_count), 0)
    FROM public.crm_chasebox_items(v_queue, p_scope, p_org_id, 1, 0) r;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_chasebox_counts(text,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.crm_chasebox_counts(text,uuid) TO authenticated;
