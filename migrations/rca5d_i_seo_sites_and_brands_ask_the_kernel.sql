-- draft: rc-a5d-deep SEO batch of the definer-door census; remove when rehearsed + suite green
-- RC-A5d census, batch 1 (SEO) — A SITE OR A BRAND IS OPENED BY THE KERNEL, NEVER BY ORGANIZATION MEMBERSHIP.
-- Register row RC-A5d. Census: aidream db/tests/test_definer_doors_ask_each_record.py (backlog).
--
-- THE DEFECT (measured on production 2026-09-26 as test@test.com, rolled back): seo.gsc_assert_site_access —
-- the gate ~44 SEO doors call before returning a site's pages, keywords, performance and settings — admitted
-- ANY member of the site's organization. Two PERSONAL sites sit in test@test.com's organizations; web.site's own
-- RLS and iam.has_access('web_site') both refuse her, the gate let her in. Siblings: fn_value_rule_sync_meaning
-- (same arm, on a writer), value_settings_scope and ai_autonomy_scope (a brand opened by membership of its org —
-- 4 personal brands live), and fn_autonomy_apply_timed_out (no gate at all: any signed-in caller could make it
-- apply a site's pending AI proposals). And web.create_site: called with a domain that already exists in the
-- organization it RETURNED that existing site's whole row (settings, integrations) — another member's personal
-- site included — and attached or silently reused (by name) a brand the caller may not open.
--
-- THE FIX: the membership arm becomes iam.has_access('web_site' | 'web_brand', id, viewer) — the kernel, which
-- already carries the org-member lane for internal rows. Admin-lane and owner arms kept. The timed-out applier
-- refuses a client caller who is not the site's editor (the server's own run is not a client lane). create_site
-- returns an existing site only to someone who may open it (otherwise an honest 23505 naming nothing), and
-- attaches or reuses only a brand the caller may open.
-- Inverse: migrations/inverse/rca5d_i_seo_sites_and_brands_ask_the_kernel_down.sql.
-- based-on: seo.gsc_assert_site_access(uuid) 80418540e10e53ea30e86b35bb419de0af82299b7f8f7e68dcffd081b4e06983
-- based-on: seo.fn_value_rule_sync_meaning(uuid) 04c3517448a35226eb25f9c92647938e43d6263bf5c17dfe4ad8c9a61a96ca78
-- based-on: seo.value_settings_scope(text, uuid) 2a5041936d50cf6f9e7d428309043c0df9541759c5b6747a95c70a39caa4da3a
-- based-on: seo.ai_autonomy_scope(text, uuid) e9fc426e4c2bcfb9fb5c60ef3049260a5f4c1c6850d4c1c0b696e49f1e89fe6b
-- based-on: seo.fn_autonomy_apply_timed_out(uuid, text) 73d0851749df96d91470e70fda80b44b6f010d5790a71221ebbe24d2d430a729
-- based-on: web.create_site(uuid, text, text, text, jsonb, jsonb, platform.visibility, uuid) af7f74d2b2c8be614f67fd3179f0cfdc19793755fc5619007904cc7b9c1856aa

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION seo.gsc_assert_site_access(p_site_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_created_by uuid;
  v_found boolean;
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'gsc_assert_site_access: p_site_id is required (got NULL)'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.organization_id, s.created_by INTO v_org, v_created_by
  FROM web.site s WHERE s.id = p_site_id;
  v_found := FOUND;

  -- Same first clause as every std_select on the tables behind this guard.
  IF v_found
     AND (public.is_platform_admin()
          OR v_created_by = ( SELECT auth.uid())
          -- rca5d_i: the kernel, not organization membership (a personal site stays personal)
          OR iam.has_access('web_site', p_site_id, 'viewer'::public.permission_level)) THEN
    RETURN;
  END IF;

  -- ONE answer for "no such site" and "not your site", and no id in it: two
  -- answers, or one answer carrying the id back, is an existence oracle.
  RAISE EXCEPTION 'gsc_site_access_denied: no access to that site'
    USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION seo.fn_value_rule_sync_meaning(p_rule_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  r record;
  v_org uuid; v_qual_dim uuid; v_val uuid; v_class_val uuid; v_facet_val uuid;
  v_slug text; v_outcome text;
  v_matchers int := 0; v_worth int := 0; v_retired int := 0; v_conflicts int := 0;
BEGIN
  -- ACCESS BEFORE EXISTENCE (lessons 2, 27, 35). The rule names a site and the site is
  -- what access is decided on. A rule this caller may not reach and a rule id that was
  -- never issued answer with the IDENTICAL 42501 and the identical sentence, so this is
  -- an existence oracle for neither. A pack TEMPLATE (site_id IS NULL) owns no site and
  -- writes nothing — it keeps the 'skipped' answer below.
  if iam.is_client_lane() then
    if p_rule_id is null then
      raise exception 'fn_value_rule_sync_meaning: p_rule_id is required (got NULL)'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from seo.keyword_class_rule kr
       where kr.id = p_rule_id
         and (kr.site_id is null
              or public.is_platform_admin()
              or exists (select 1 from web.site s
                          where s.id = kr.site_id
                            and (s.created_by = (select auth.uid())
                                 or iam.has_access('web_site', s.id, 'viewer'::public.permission_level))))  -- rca5d_i: the kernel, not membership
    ) then
      raise exception 'value_rule_access_denied: no access to that value rule'
        using errcode = '42501';
    end if;
  end if;

  SELECT * INTO r FROM seo.keyword_class_rule WHERE id = p_rule_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_such_rule');
  END IF;

  -- Pack TEMPLATES (site_id IS NULL) are catalogue entries, not a site's own
  -- rules. Adopting a pack is what mints a site's meaning; a template itself
  -- has no site to mint into.
  IF r.site_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'pack_template');
  END IF;

  SELECT COALESCE(r.organization_id, s.organization_id) INTO v_org
    FROM web.site s WHERE s.id = r.site_id;

  -- The rule's own value is found by IDENTITY, never by its label, so renaming
  -- a rule renames its value instead of minting a second one.
  SELECT c.id INTO v_val FROM platform.categories c
   WHERE c.dimension = 'seo_facet' AND c.metadata->>'rule_id' = p_rule_id::text
   ORDER BY c.deleted_at NULLS FIRST, c.created_at LIMIT 1;

  -- ── ARCHIVED RULE → retire its meaning instead of orphaning it ───────────
  IF r.deleted_at IS NOT NULL THEN
    WITH gone AS (
      UPDATE seo.dimension_value_matcher SET deleted_at = now(), updated_at = now()
       WHERE site_id = r.site_id AND deleted_at IS NULL
         AND metadata->>'rule_id' = p_rule_id::text
      RETURNING 1) SELECT count(*) INTO v_retired FROM gone;
    UPDATE seo.site_value_worth SET deleted_at = now(), updated_at = now()
     WHERE site_id = r.site_id AND deleted_at IS NULL
       AND metadata->>'rule_id' = p_rule_id::text;
    -- Only a value this rule OWNS is retired. A shared value (traffic_class:*,
    -- or a facet another rule scores) keeps living; we only removed our rows.
    IF v_val IS NOT NULL THEN
      UPDATE seo.keyword_facet SET deleted_at = now(), updated_at = now()
       WHERE category_id = v_val AND deleted_at IS NULL
         AND source = 'matcher' AND NOT pinned;
      UPDATE platform.categories SET deleted_at = now(), updated_at = now()
       WHERE id = v_val AND deleted_at IS NULL;
    END IF;
    RETURN jsonb_build_object('ok', true, 'archived', true,
                              'rule_id', p_rule_id, 'retired', v_retired);
  END IF;

  -- ── SHAPE 1 — class rule → matcher on the shared traffic_class value ─────
  IF r.target_class IS NOT NULL AND NULLIF(btrim(r.pattern), '') IS NOT NULL
     AND r.target_class IN ('money', 'educational', 'brand', 'mismatch') THEN
    SELECT id INTO v_class_val FROM platform.categories
     WHERE dimension = 'seo_facet'
       AND slug = 'traffic_class:' || r.target_class
       AND deleted_at IS NULL;
    v_outcome := seo._rule_claim_matcher(
      p_rule_id, 'class', r.site_id, v_org, v_class_val,
      COALESCE(r.match_kind, 'contains'), r.pattern,
      r.auto_apply,                      -- the C1 ruling, in one place
      r.pack_id, 'from class rule "' || r.name || '"');
    IF v_outcome = 'conflict' THEN v_conflicts := v_conflicts + 1;
    ELSIF v_outcome <> 'unresolved' THEN v_matchers := v_matchers + 1; END IF;
  ELSE
    -- The rule stopped being a class rule: retire only that matcher.
    UPDATE seo.dimension_value_matcher SET deleted_at = now(), updated_at = now()
     WHERE site_id = r.site_id AND deleted_at IS NULL
       AND metadata->>'rule_id' = p_rule_id::text
       AND metadata->>'rule_shape' = 'class';
  END IF;

  -- ── SHAPE 2 — phrase + multiplier → a rule-owned Qualifiers value ────────
  IF r.value_multiplier IS NOT NULL AND NULLIF(btrim(r.pattern), '') IS NOT NULL THEN
    v_qual_dim := seo._ensure_site_dimension(
      r.site_id, 'qualifiers', 'Qualifiers',
      'Words in a search that change what it is worth to this business (free, cheap, certified, emergency…).',
      'intrinsic');
    IF v_val IS NULL THEN
      v_slug := COALESCE(NULLIF(seo._slugify(r.name), ''), 'rule_' || left(p_rule_id::text, 8));
      v_val := seo._ensure_value(v_qual_dim, v_slug, r.name,
        jsonb_build_object('rule_id', p_rule_id::text, 'description', r.description));
    ELSE
      -- Rename / restore. The slug never moves — only the label follows.
      UPDATE platform.categories
         SET name = r.name, parent_id = v_qual_dim, deleted_at = NULL,
             metadata = COALESCE(metadata, '{}'::jsonb)
                        || jsonb_build_object('rule_id', p_rule_id::text,
                                              'description', r.description),
             updated_at = now()
       WHERE id = v_val
         AND (name IS DISTINCT FROM r.name
              OR parent_id IS DISTINCT FROM v_qual_dim
              OR deleted_at IS NOT NULL);
    END IF;

    v_outcome := seo._rule_claim_matcher(
      p_rule_id, 'qualifier', r.site_id, v_org, v_val,
      COALESCE(r.match_kind, 'contains'), r.pattern, true,
      r.pack_id, 'from value rule "' || r.name || '"');
    IF v_outcome = 'conflict' THEN v_conflicts := v_conflicts + 1;
    ELSIF v_outcome <> 'unresolved' THEN v_matchers := v_matchers + 1; END IF;

    v_outcome := seo._rule_claim_worth(
      p_rule_id, 'qualifier', r.site_id, v_org, v_val, r.value_multiplier,
      COALESCE(r.notes, 'from value rule "' || r.name || '"'), r.pack_id);
    IF v_outcome = 'conflict' THEN v_conflicts := v_conflicts + 1;
    ELSIF v_outcome <> 'unresolved' THEN v_worth := v_worth + 1; END IF;
  END IF;

  -- ── SHAPE 3 — multiplier on an existing facet value → worth only ─────────
  -- The AI stamps the facet; this rule only says what that value is worth here.
  -- Its worth sits on a SHARED value, which is exactly where the 23505 lived.
  IF r.value_multiplier IS NOT NULL
     AND r.match_facet IS NOT NULL AND r.match_facet_value IS NOT NULL THEN
    SELECT id INTO v_facet_val FROM platform.categories
     WHERE dimension = 'seo_facet'
       AND slug = r.match_facet || ':' || r.match_facet_value
       AND deleted_at IS NULL;
    v_outcome := seo._rule_claim_worth(
      p_rule_id, 'facet', r.site_id, v_org, v_facet_val, r.value_multiplier,
      COALESCE(r.notes, 'from value rule "' || r.name || '"'), r.pack_id);
    IF v_outcome = 'conflict' THEN v_conflicts := v_conflicts + 1;
    ELSIF v_outcome <> 'unresolved' THEN v_worth := v_worth + 1; END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'rule_id', p_rule_id, 'site_id', r.site_id,
                            'value_id', v_val, 'matchers', v_matchers,
                            'worth', v_worth, 'conflicts', v_conflicts);
END $function$;

CREATE OR REPLACE FUNCTION seo.value_settings_scope(p_scope text, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_own_baseline   numeric;
  v_own_levels     jsonb;
  v_label          text;
  v_parent         jsonb;
  v_inh_baseline   numeric;
  v_inh_levels     jsonb;
  v_may_edit       boolean := seo.fn_value_settings_may_edit(p_scope, p_id);
  v_sites          int := 0;
BEGIN
  IF p_scope NOT IN ('platform','org','brand','site') THEN
    RAISE EXCEPTION 'seo_settings_bad_scope: scope must be platform, org, brand or site (got %)', COALESCE(p_scope,'null');
  END IF;
  IF p_scope <> 'platform' AND p_id IS NULL THEN
    RAISE EXCEPTION 'seo_settings_id_required: % needs an id', p_scope;
  END IF;
  IF NOT v_may_edit AND NOT (
       (p_scope = 'site'  AND seo.fn_is_site_editor(p_id))
    OR (p_scope = 'org'   AND iam.has_org_access(p_id))
    OR (p_scope = 'brand' AND iam.has_access('web_brand', p_id, 'viewer'::public.permission_level))  -- rca5d_i: the kernel, not membership
    OR (p_scope = 'platform')) THEN
    RAISE EXCEPTION 'seo_settings_denied: no access to these settings' USING ERRCODE = '42501';
  END IF;

  IF p_scope = 'platform' THEN
    v_label := 'Platform defaults';
    v_own_baseline := (SELECT NULLIF(k.value #>> '{}','')::numeric FROM platform.feature_knob k
                        WHERE k.feature='seo.keyword_value' AND k.key='baseline_score');
    v_own_levels := (SELECT jsonb_agg(jsonb_build_object(
                                      'value', c.slug, 'label', c.name,
                                      'min_score', NULLIF(c.metadata->>'min_score','')::numeric)
                                      ORDER BY NULLIF(c.metadata->>'min_score','')::numeric DESC NULLS LAST)
                       FROM platform.categories c
                      WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL);
    v_sites := (SELECT count(*) FROM web.site s WHERE s.deleted_at IS NULL);

  ELSIF p_scope = 'org' THEN
    SELECT o.name, NULLIF(o.settings->'keyword_value'->>'baseline','')::numeric,
           o.settings->'keyword_value'->'levels'
      INTO v_label, v_own_baseline, v_own_levels
      FROM iam.organizations o WHERE o.id = p_id;
    v_parent := jsonb_build_object('scope','platform','label','Platform defaults');
    v_sites := (SELECT count(*) FROM web.site s WHERE s.organization_id = p_id AND s.deleted_at IS NULL);

  ELSIF p_scope = 'brand' THEN
    SELECT b.name, NULLIF(b.settings->'keyword_value'->>'baseline','')::numeric,
           b.settings->'keyword_value'->'levels'
      INTO v_label, v_own_baseline, v_own_levels
      FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    v_parent := (SELECT jsonb_build_object('scope','org','id',o.id,'label',o.name)
                   FROM web.brand b JOIN iam.organizations o ON o.id = b.organization_id WHERE b.id = p_id);
    v_sites := (SELECT count(*) FROM web.site s WHERE s.brand_id = p_id AND s.deleted_at IS NULL);

  ELSE
    SELECT COALESCE(s.name, s.domain), NULLIF(s.settings->'keyword_value'->>'baseline','')::numeric
      INTO v_label, v_own_baseline
      FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    v_own_levels := (SELECT jsonb_agg(jsonb_build_object(
                                'value', sv.value,
                                'label', COALESCE(sv.label, initcap(replace(sv.value,'_',' '))),
                                'min_score', NULLIF(sv.config->>'min_score','')::numeric)
                              ORDER BY NULLIF(sv.config->>'min_score','')::numeric DESC NULLS LAST)
                       FROM seo.site_vocabulary sv
                      WHERE sv.site_id = p_id AND sv.vocab_kind='value_band' AND sv.active
                        AND sv.deleted_at IS NULL);
    v_parent := (SELECT jsonb_build_object('scope','brand','id',b.id,'label',b.name)
                   FROM web.site s JOIN web.brand b ON b.id = s.brand_id WHERE s.id = p_id);
    v_sites := 1;
  END IF;

  -- Inherited means the answer strictly ABOVE this rung. It must never include
  -- the site's own value merely because fn_value_baseline/levels are effective.
  IF p_scope = 'site' THEN
    SELECT COALESCE(
             NULLIF(b.settings->'keyword_value'->>'baseline','')::numeric,
             NULLIF(o.settings->'keyword_value'->>'baseline','')::numeric),
           COALESCE(
             NULLIF(b.settings->'keyword_value'->'levels','[]'::jsonb),
             NULLIF(o.settings->'keyword_value'->'levels','[]'::jsonb))
      INTO v_inh_baseline, v_inh_levels
      FROM web.site s
      LEFT JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
      JOIN iam.organizations o ON o.id = s.organization_id
     WHERE s.id = p_id AND s.deleted_at IS NULL;
  ELSIF p_scope = 'brand' THEN
    SELECT NULLIF(o.settings->'keyword_value'->>'baseline','')::numeric,
           o.settings->'keyword_value'->'levels'
      INTO v_inh_baseline, v_inh_levels
      FROM web.brand b JOIN iam.organizations o ON o.id = b.organization_id WHERE b.id = p_id;
  ELSIF p_scope = 'org' THEN
    v_inh_baseline := NULL;
    v_inh_levels := NULL;
  END IF;

  IF v_inh_baseline IS NULL AND p_scope <> 'platform' THEN
    v_inh_baseline := (SELECT NULLIF(k.value #>> '{}','')::numeric FROM platform.feature_knob k
                        WHERE k.feature='seo.keyword_value' AND k.key='baseline_score');
  END IF;
  IF v_inh_levels IS NULL AND p_scope <> 'platform' THEN
    v_inh_levels := (SELECT jsonb_agg(jsonb_build_object(
                                     'value', c.slug, 'label', c.name,
                                     'min_score', NULLIF(c.metadata->>'min_score','')::numeric,
                                     'source','platform')
                                     ORDER BY NULLIF(c.metadata->>'min_score','')::numeric DESC NULLS LAST)
                      FROM platform.categories c
                     WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL);
  END IF;

  RETURN jsonb_build_object(
    'scope', p_scope, 'id', p_id, 'label', v_label,
    'may_edit', v_may_edit,
    'parent', v_parent,
    'sites_affected', v_sites,
    'own', jsonb_build_object('baseline', v_own_baseline, 'levels', v_own_levels),
    'inherited', jsonb_build_object('baseline', v_inh_baseline, 'levels', v_inh_levels),
    'effective', jsonb_build_object(
      'baseline', COALESCE(v_own_baseline, v_inh_baseline),
      'levels', COALESCE(NULLIF(v_own_levels,'[]'::jsonb), v_inh_levels)));
END;
$function$;

CREATE OR REPLACE FUNCTION seo.ai_autonomy_scope(p_scope text, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_own jsonb := '{}'::jsonb;
  v_inherited jsonb := '{}'::jsonb;
  v_label text;
  v_parent jsonb;
  v_org uuid;
BEGIN
  IF p_scope NOT IN ('platform','org','brand','site') THEN
    RAISE EXCEPTION 'seo_autonomy_bad_scope: scope must be platform, org, brand or site (got %)', COALESCE(p_scope,'null');
  END IF;
  IF p_scope <> 'platform' AND p_id IS NULL THEN
    RAISE EXCEPTION 'seo_autonomy_id_required: % needs an id', p_scope;
  END IF;

  -- 🚨 THE READ GATE (DD-169 batch 3). `may_edit` below answered the WRITE question only;
  -- the org / brand / site name and its settings came back to any signed-in caller who
  -- guessed an id. Reading a tier now needs read access to that tier. `platform` is the
  -- product's own published defaults and carries no tenant row.
  IF p_scope = 'org' THEN
    IF NOT (public.is_platform_admin() OR iam.has_org_access(p_id)) THEN
      RAISE EXCEPTION 'seo_autonomy_denied: no access to that organization'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope = 'brand' THEN
    SELECT b.organization_id INTO v_org FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    IF NOT (public.is_platform_admin()
            OR iam.has_access('web_brand', p_id, 'viewer'::public.permission_level)
) THEN  -- rca5d_i: the brand's own access, never bare membership of its organization
      RAISE EXCEPTION 'seo_autonomy_denied: no access to that brand'
        USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope = 'site' THEN
    PERFORM seo.gsc_assert_site_access(p_id);
  END IF;

  IF p_scope = 'platform' THEN
    v_label := 'Platform defaults';
    SELECT COALESCE(k.value,'{}'::jsonb) INTO v_own FROM platform.feature_knob k
     WHERE k.feature='seo.ai_autonomy' AND k.key='modes';
  ELSIF p_scope = 'org' THEN
    SELECT o.name, COALESCE(o.settings->'ai_autonomy','{}'::jsonb) INTO v_label, v_own
      FROM iam.organizations o WHERE o.id = p_id;
    v_parent := jsonb_build_object('scope','platform','label','Platform defaults');
  ELSIF p_scope = 'brand' THEN
    SELECT b.name, COALESCE(b.settings->'ai_autonomy','{}'::jsonb) INTO v_label, v_own
      FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    v_parent := (SELECT jsonb_build_object('scope','org','id',o.id,'label',o.name)
                   FROM web.brand b JOIN iam.organizations o ON o.id=b.organization_id WHERE b.id = p_id);
  ELSE
    SELECT COALESCE(s.name, s.domain), COALESCE(s.settings->'ai_autonomy','{}'::jsonb) INTO v_label, v_own
      FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    v_parent := (SELECT jsonb_build_object('scope','brand','id',b.id,'label',b.name)
                   FROM web.site s JOIN web.brand b ON b.id=s.brand_id WHERE s.id = p_id);
  END IF;

  RETURN jsonb_build_object(
    'scope', p_scope, 'id', p_id, 'label', v_label,
    'parent', v_parent,
    'may_edit', seo.fn_value_settings_may_edit(p_scope, p_id),
    'capabilities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'slug', c.slug, 'label', c.label, 'description', c.description,
        'default_mode', c.default_mode, 'default_timeout_hours', c.default_timeout_hours,
        'enforced', c.enforced, 'enforcement_note', c.enforcement_note,
        'own_mode', v_own->c.slug->>'mode',
        'own_timeout_hours', (v_own->c.slug->>'timeout_hours')::int,
        'effective', CASE WHEN p_scope = 'site' THEN seo.fn_ai_autonomy(p_id, c.slug)
                          ELSE jsonb_build_object('mode', COALESCE(v_own->c.slug->>'mode', c.default_mode),
                                                  'source', CASE WHEN v_own ? c.slug THEN p_scope ELSE 'platform_default' END) END
      ) ORDER BY c.position), '[]'::jsonb)
      FROM seo.ai_capability c));
END;
$function$;

CREATE OR REPLACE FUNCTION seo.fn_autonomy_apply_timed_out(p_site_id uuid, p_capability text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'public', 'pg_temp'
AS $function$
declare
  v_gate     jsonb;
  v_hours    int;
  v_cap      int;
  v_a        record;
  v_proposal jsonb;
  v_applied  int := 0;
  v_skipped  int := 0;
  v_stamped  int := 0;
  v_notes    jsonb := '[]'::jsonb;
begin
  -- rca5d_i: a client caller must be the site's editor; the server's own run is not a client lane.
  if iam.is_client_lane() then
    perform seo.gsc_assert_site_editor(p_site_id);
  end if;
  v_gate := seo.fn_autonomy_gate(p_site_id, p_capability);
  if (v_gate ->> 'decision') <> 'propose' then
    -- Only "review then apply" has a window that can expire. Every other mode
    -- either applied already or must never apply without a person.
    return jsonb_build_object('applied', 0, 'skipped', 0,
                              'reason', 'mode_has_no_timeout',
                              'mode', v_gate ->> 'mode');
  end if;

  v_hours := coalesce((v_gate ->> 'timeout_hours')::int, 0);
  if v_hours <= 0 then
    -- "Review then apply" with no window would apply instantly, which is not
    -- what the operator asked for. Refuse rather than reinterpret.
    raise exception 'seo_autonomy_missing_timeout: "%" is set to review-then-apply with no waiting period', p_capability;
  end if;

  select coalesce((value #>> '{}')::int, 200) into v_cap
    from platform.feature_knob where feature = 'seo.ai_autonomy' and key = 'timeout_apply_cap';
  v_cap := coalesce(v_cap, 200);

  for v_a in
    select a.id, a.action, a.title
      from platform.assists a
     where a.deleted_at is null
       and a.status = 'pending'
       and a.entity_type = 'web_site'
       and a.entity_id = p_site_id
       and a.action ->> 'kind' = 'apply_keyword_meaning'
       and a.action -> 'provenance' ->> 'capability' = p_capability
       and a.created_at < now() - make_interval(hours => v_hours)
     order by a.created_at
     limit v_cap
  loop
    v_proposal := v_a.action -> 'proposal';

    -- THE SAME WRITE PATH A PERSON'S APPROVAL TAKES. `apply.ts` replays a
    -- proposal through the ordinary human RPC; so does this. A private applier
    -- here would be the parallel-writer defect that file exists to prevent.
    if (v_proposal ->> 'proposal') = 'stamp' then
      if (v_proposal ->> 'dimensionSlug') = 'traffic_class' then
        perform seo.gsc_set_keyword_class(
          p_site_id,
          (select array_agg(x::uuid) from jsonb_array_elements_text(v_proposal -> 'keywordIds') t(x)),
          v_proposal ->> 'valueSlug',
          'Applied automatically: nobody reviewed it within ' || v_hours || ' hours.',
          'manual', null, true);
      else
        perform seo.keyword_facet_set(
          (select array_agg(x::uuid) from jsonb_array_elements_text(v_proposal -> 'keywordIds') t(x)),
          v_proposal ->> 'dimensionSlug',
          v_proposal ->> 'valueSlug',
          'human',
          p_site_id);
      end if;
      v_stamped := v_stamped + coalesce(jsonb_array_length(v_proposal -> 'keywordIds'), 0);
    else
      -- Matcher / worth / guideline proposals belong to `meaning_suggestions`,
      -- which runs in review_required and must NEVER auto-apply. Leaving them
      -- pending is correct; saying so is what stops it looking like a miss.
      v_skipped := v_skipped + 1;
      v_notes := v_notes || jsonb_build_object('assist_id', v_a.id,
                                               'left_pending', v_proposal ->> 'proposal');
      continue;
    end if;

    update platform.assists a
       set status = 'accepted',
           decided_at = now(),
           decision_note = 'Applied automatically after ' || v_hours || ' hours with no review (' || p_capability || ').',
           result = jsonb_build_object('applied_by', 'autonomy_timeout',
                                       'capability', p_capability,
                                       'waited_hours', v_hours),
           updated_at = now()
     where a.id = v_a.id;
    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object(
    'applied', v_applied,
    'skipped', v_skipped,
    'keywords_stamped', v_stamped,
    'waited_hours', v_hours,
    'cap', v_cap,
    'left_pending', v_notes,
    'mode', v_gate ->> 'mode');
end;
$function$;

CREATE OR REPLACE FUNCTION web.create_site(p_organization_id uuid, p_name text, p_root_url text, p_domain text, p_settings jsonb DEFAULT '{}'::jsonb, p_integrations jsonb DEFAULT '{}'::jsonb, p_visibility platform.visibility DEFAULT NULL::platform.visibility, p_brand_id uuid DEFAULT NULL::uuid)
 RETURNS web.site
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  created_site web.site;
  v_brand_id uuid;
  v_constraint_name text;
  normalized_name text := nullif(btrim(p_name), '');
  normalized_root_url text := nullif(btrim(p_root_url), '');
  normalized_domain text := lower(nullif(btrim(p_domain), ''));
  root_host text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_organization_id is null
     or not iam.has_org_access(p_organization_id) then
    raise exception 'Organization access required' using errcode = '42501';
  end if;

  if normalized_name is null then
    raise exception 'Site name is required' using errcode = '22023';
  end if;

  if normalized_root_url is null
     or normalized_root_url !~* '^https?://' then
    raise exception 'root_url must be an absolute HTTP(S) URL'
      using errcode = '22023';
  end if;

  root_host := lower(
    substring(
      normalized_root_url
      from '^https?://([^/:?#@]+)(?::[0-9]+)?(?:[/?#]|$)'
    )
  );

  if root_host is null then
    raise exception 'root_url must contain a valid host and no credentials'
      using errcode = '22023';
  end if;

  if normalized_domain is null
     or normalized_domain like '%://%'
     or normalized_domain like '%/%' then
    raise exception 'domain must be a normalized host without a scheme or path'
      using errcode = '22023';
  end if;

  normalized_domain := regexp_replace(normalized_domain, '\.$', '');
  root_host := regexp_replace(root_host, '\.$', '');

  if normalized_domain = '' then
    raise exception 'domain must not be empty' using errcode = '22023';
  end if;

  if normalized_domain is distinct from root_host then
    raise exception 'domain must exactly match the root_url host'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception 'settings must be a JSON object' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_integrations, '{}'::jsonb)) <> 'object' then
    raise exception 'integrations must be a JSON object' using errcode = '22023';
  end if;

  if p_brand_id is not null then
    select b.id into v_brand_id
    from web.brand b
    where b.id = p_brand_id
      and b.organization_id = p_organization_id
      and b.deleted_at is null
      and iam.has_access('web_brand', b.id, 'viewer'::public.permission_level);  -- rca5d_i
    if v_brand_id is null then
      raise exception 'Brand not found in this organization'
        using errcode = '22023';
    end if;
  end if;

  select s.* into created_site
  from web.site s
  where s.organization_id = p_organization_id
    and s.domain = normalized_domain
    and s.deleted_at is null;

  if found then
    -- rca5d_i: an existing site is returned only to someone who may open it.
    if not iam.has_access('web_site', created_site.id, 'viewer'::public.permission_level) then
      raise exception 'A site with this domain already exists in this organization.' using errcode = '23505';
    end if;
    return created_site;
  end if;

  begin
    if p_brand_id is null then
      select b.id into v_brand_id
      from web.brand b
      where b.organization_id = p_organization_id
        and lower(b.name) = lower(normalized_name)
        and b.deleted_at is null
        and iam.has_access('web_brand', b.id, 'viewer'::public.permission_level)  -- rca5d_i
      limit 1;

      if v_brand_id is null then
        insert into web.brand (
          organization_id, created_by, name, website_url, status, visibility
        )
        values (
          p_organization_id, (select auth.uid()), normalized_name,
          normalized_root_url, 'active',
          coalesce(
            p_visibility,
            platform.entity_default_visibility('web_brand')
          )
        )
        returning id into v_brand_id;
      end if;
    end if;

    insert into web.site (
      organization_id, brand_id, name, root_url, domain,
      settings, integrations, visibility
    )
    values (
      p_organization_id, v_brand_id, normalized_name, normalized_root_url,
      normalized_domain, coalesce(p_settings, '{}'::jsonb),
      coalesce(p_integrations, '{}'::jsonb),
      coalesce(
        p_visibility,
        platform.entity_default_visibility('web_site')
      )
    )
    returning * into created_site;

    insert into web.property (
      organization_id, created_by, brand_id, kind, url, display_name, site_id
    )
    values (
      p_organization_id, (select auth.uid()), v_brand_id, 'website',
      normalized_root_url, normalized_name, created_site.id
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'site_org_domain_live_unique' then
        raise;
      end if;

      select s.* into created_site
      from web.site s
      where s.organization_id = p_organization_id
        and s.domain = normalized_domain
        and s.deleted_at is null;

      if not found then
        raise;
      end if;
  end;

  return created_site;
end;
$function$;
