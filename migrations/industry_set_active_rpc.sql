-- Industry soft-delete / reactivate (2026-07-23) — the console can create/rename industries
-- but had no way to retire one. iam.industries.is_active already exists (default true), so
-- soft-delete = flip is_active. No hard delete (orgs may reference an industry; grants key on it).
--
-- Any-admin gated via the shared choke point public._library_assert_admin (same family as
-- industry_upsert), same actor-safety shape (COALESCE(auth.uid(), p_actor), anon revoked),
-- audit-logged. Deactivating does NOT cascade: existing org assignments and library grants are
-- left intact; is_active just removes the industry from new-assignment pickers and catalogs.

create or replace function public.industry_set_active(p_industry uuid, p_active boolean, p_actor uuid default null::uuid)
returns iam.industries
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_actor uuid; v_row iam.industries;
BEGIN
    v_actor := COALESCE(auth.uid(), p_actor);
    PERFORM public._library_assert_admin(v_actor);
    UPDATE iam.industries SET is_active = p_active, updated_at = now()
     WHERE id = p_industry
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'industry % not found', p_industry;
    END IF;
    INSERT INTO public.library_audit_log(actor_user_id, action, industry_id, detail)
    VALUES (v_actor, CASE WHEN p_active THEN 'industry_reactivate' ELSE 'industry_deactivate' END,
            p_industry, jsonb_build_object('is_active', p_active));
    RETURN v_row;
END; $function$;

revoke all on function public.industry_set_active(uuid, boolean, uuid) from public, anon;
grant execute on function public.industry_set_active(uuid, boolean, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
