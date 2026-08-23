-- 2026-08-22 — rag.library_grant_publish AND rag.library_grant_revoke were found live
-- calling public._library_assert_super_admin, a helper deliberately dropped on
-- 2026-08-15 (library_issuance_any_admin_gate.sql). audit.broken_functions already
-- flagged both severity=real; every publish/revoke from /administration/shared-knowledge
-- raised "function does not exist". Some later re-apply restored the pre-rename bodies.
--
-- This file restates BOTH issuance functions against the live shape:
--   * helper  = public._library_assert_admin (any platform admin tier)
--   * grants  = rag.data_store_grants is a VIEW over platform.entity_grants with INSTEAD OF
--               triggers, so idempotency is a pre-check, never ON CONFLICT
--   * audit   = rag.library_audit_log(..., target_organization_id, ...) — the live table
-- Idempotent. Ledger: public._schema_migrations source='matrx-frontend'.

create or replace function rag.library_grant_publish(
    p_store_id uuid, p_audience text,
    p_industry_id uuid default null::uuid, p_organization_id uuid default null::uuid,
    p_actor uuid default null::uuid)
returns rag.data_store_grants language plpgsql security definer
set search_path to 'public', 'rag' as $function$
declare v_actor uuid; v_lib uuid; v_row rag.data_store_grants;
begin
    v_actor := coalesce(auth.uid(), p_actor);
    perform public._library_assert_admin(v_actor);
    v_lib := public.system_org_id('library');
    if v_lib is null then
        raise exception 'Matrx Library org not configured (system_orgs.key=''library'')';
    end if;
    if not exists (select 1 from rag.data_stores s where s.id = p_store_id and s.organization_id = v_lib) then
        raise exception 'store % is not a Matrx Library store', p_store_id;
    end if;
    select * into v_row from rag.data_store_grants
     where data_store_id = p_store_id and audience = p_audience
       and industry_id     is not distinct from p_industry_id
       and organization_id is not distinct from p_organization_id
     limit 1;
    if v_row.id is null then
        insert into rag.data_store_grants(data_store_id, audience, industry_id, organization_id, granted_by)
        values (p_store_id, p_audience, p_industry_id, p_organization_id, v_actor);
        select * into v_row from rag.data_store_grants
         where data_store_id = p_store_id and audience = p_audience
           and industry_id     is not distinct from p_industry_id
           and organization_id is not distinct from p_organization_id
         limit 1;
    end if;
    insert into rag.library_audit_log(actor_user_id, action, data_store_id, industry_id, target_organization_id, detail)
    values (v_actor, 'grant_publish', p_store_id, p_industry_id, p_organization_id, jsonb_build_object('audience', p_audience));
    return v_row;
end; $function$;

create or replace function rag.library_grant_revoke(p_grant_id uuid, p_actor uuid default null::uuid)
returns void language plpgsql security definer
set search_path to 'public', 'rag' as $function$
declare v_actor uuid; v_row rag.data_store_grants;
begin
    v_actor := coalesce(auth.uid(), p_actor);
    perform public._library_assert_admin(v_actor);
    select * into v_row from rag.data_store_grants where id = p_grant_id;
    if v_row.id is null then return; end if;
    delete from rag.data_store_grants where id = p_grant_id;
    insert into rag.library_audit_log(actor_user_id, action, data_store_id, industry_id, target_organization_id, detail)
    values (v_actor, 'grant_revoke', v_row.data_store_id, v_row.industry_id, v_row.organization_id, jsonb_build_object('audience', v_row.audience));
end; $function$;

do $assert$
declare v_n integer;
begin
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('pg_catalog','information_schema','graveyard') and p.prokind = 'f'
       and pg_get_functiondef(p.oid) ilike '%_library_assert_super_admin%';
    if v_n <> 0 then raise exception 'still % live references to _library_assert_super_admin', v_n; end if;
end $assert$;
