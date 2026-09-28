-- based-on: public.industry_upsert(text, text, text, uuid, uuid, text, integer, uuid) 1a052de54515a48001581dea5f05acd44957ca317ac749f8b955f3cddd815568
--
-- iam.industries.slug is the permanent platform taxonomy identity.  The
-- existing admin-only canonical writer already resolves this full key; when an
-- administrator explicitly saves the same taxonomy item again, it must revive
-- that identity instead of leaving an invisible archived row behind.
--
-- This preserves the captured live function's actor gate, system-organization
-- assignment, audit write, signature, security definer, and search path.  It
-- changes only the conflict update to restore the canonical row to live state.

set local lock_timeout = '2s';

create or replace function public.industry_upsert(p_slug text, p_name text, p_facet text default 'domain'::text, p_parent_id uuid default null::uuid, p_default_template_id uuid default null::uuid, p_description text default null::text, p_sort_order integer default 0, p_actor uuid default null::uuid)
 returns iam.industries
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE v_actor uuid; v_row iam.industries;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    -- organization_id: iam.industries is a global platform taxonomy (slug is
    -- UNIQUE across the whole table, curated only by super/library admins) —
    -- not an org's own data; every existing row already belongs to the
    -- ratified platform tenant. New rows get the same, via
    -- public.system_org_id('system'). Never defaulted or resolver-chosen
    -- (Data Doctrine, 2026-09-19).
    INSERT INTO iam.industries(slug, name, facet, parent_id, default_template_id, description, sort_order, organization_id)
    VALUES (p_slug, p_name, p_facet, p_parent_id, p_default_template_id, p_description, p_sort_order, public.system_org_id('system'))
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, facet = EXCLUDED.facet, parent_id = EXCLUDED.parent_id,
        default_template_id = EXCLUDED.default_template_id, description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        deleted_at = NULL,
        is_active = TRUE
    RETURNING * INTO v_row;
    -- rag.library_audit_log: a child of the industry row just written —
    -- inherits ITS organization_id, never re-derived independently.
    INSERT INTO rag.library_audit_log(actor_user_id, action, industry_id, detail, organization_id)
    VALUES (v_actor, 'industry_upsert', v_row.id, jsonb_build_object('slug', p_slug, 'facet', p_facet), v_row.organization_id);
    RETURN v_row;
END; $function$;
