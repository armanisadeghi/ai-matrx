-- INVERSE of migrations/industry_upsert_revives_archived_taxonomy_identity.sql.
-- Restores the exact captured production body before the revive repair.  This
-- inverse is for clone Rule-27 rehearsal only; it deliberately returns the old
-- full-key update behavior, which leaves an archived taxonomy row archived.
-- based-on: public.industry_upsert(text, text, text, uuid, uuid, text, integer, uuid) 53e05565800f746dbde622c0fda190db13e4a731367ad8e2bf4c1b6c400d43f6

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
        sort_order = EXCLUDED.sort_order
    RETURNING * INTO v_row;
    -- rag.library_audit_log: a child of the industry row just written —
    -- inherits ITS organization_id, never re-derived independently.
    INSERT INTO rag.library_audit_log(actor_user_id, action, industry_id, detail, organization_id)
    VALUES (v_actor, 'industry_upsert', v_row.id, jsonb_build_object('slug', p_slug, 'facet', p_facet), v_row.organization_id);
    RETURN v_row;
END; $function$;
