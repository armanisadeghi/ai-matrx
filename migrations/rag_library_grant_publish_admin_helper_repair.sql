-- Repair the one Shared Knowledge issuance caller missed by the deliberate
-- _library_assert_super_admin -> _library_assert_admin rename.
--
-- The publish body matches the live function verbatim except for that helper
-- call. In particular, preserve the pre-check used because data_store_grants
-- is a view whose INSTEAD OF trigger cannot support ON CONFLICT.

create or replace function rag.library_grant_publish(
    p_store_id uuid,
    p_audience text,
    p_industry_id uuid default null::uuid,
    p_organization_id uuid default null::uuid,
    p_actor uuid default null::uuid
)
returns rag.data_store_grants
language plpgsql
security definer
set search_path to 'public', 'rag'
as $function$
declare v_actor uuid; v_lib uuid; v_row rag.data_store_grants;
begin
    v_actor := coalesce(auth.uid(), p_actor);
    perform public._library_assert_admin(v_actor);
    v_lib := public.system_org_id('library');
    if v_lib is null then
        raise exception 'Matrx Library org not configured (system_orgs.key=''library'')';
    end if;
    if not exists (select 1 from rag.data_stores s
                    where s.id = p_store_id and s.organization_id = v_lib) then
        raise exception 'store % is not a Matrx Library store', p_store_id;
    end if;

    -- Idempotent by pre-check: ON CONFLICT is unsupported through the view's
    -- INSTEAD OF trigger. Same outcome as the old ON CONFLICT DO NOTHING.
    select * into v_row from rag.data_store_grants
     where data_store_id = p_store_id and audience = p_audience
       and industry_id     is not distinct from p_industry_id
       and organization_id is not distinct from p_organization_id
     limit 1;

    if v_row.id is null then
        insert into rag.data_store_grants
            (data_store_id, audience, industry_id, organization_id, granted_by)
        values (p_store_id, p_audience, p_industry_id, p_organization_id, v_actor);
        select * into v_row from rag.data_store_grants
         where data_store_id = p_store_id and audience = p_audience
           and industry_id     is not distinct from p_industry_id
           and organization_id is not distinct from p_organization_id
         limit 1;
    end if;

    insert into public.library_audit_log
        (actor_user_id, action, data_store_id, industry_id, organization_id, detail)
    values (v_actor, 'grant_publish', p_store_id, p_industry_id, p_organization_id,
            jsonb_build_object('audience', p_audience));
    return v_row;
end;
$function$;

-- audit.function_runtime_probe accepts SELECT-only probes. This helper invokes
-- the real publish RPC with a reserved-invalid store id and accepts only the
-- expected pre-write rejection. The exception subtransaction guarantees that
-- an unexpected future write before that rejection is rolled back.
create or replace function audit.probe_library_grant_publish()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
    v_actor uuid;
    v_probe_store constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
    select a.user_id
      into v_actor
      from admin.admins a
     order by a.user_id
     limit 1;

    if v_actor is null then
        raise exception 'library_grant_publish runtime probe requires at least one admin';
    end if;

    if exists (select 1 from rag.data_stores s where s.id = v_probe_store) then
        raise exception 'library_grant_publish runtime probe store id unexpectedly exists';
    end if;

    begin
        perform rag.library_grant_publish(
            v_probe_store,
            'global',
            null::uuid,
            null::uuid,
            v_actor
        );
        raise exception 'library_grant_publish runtime probe unexpectedly returned';
    exception
        when raise_exception then
            if sqlstate = 'P0001'
               and sqlerrm = format(
                   'store %s is not a Matrx Library store',
                   v_probe_store::text
               ) then
                return 1;
            end if;
            raise;
    end;
end;
$function$;

revoke all on function audit.probe_library_grant_publish()
from public, anon, authenticated;

insert into audit.function_runtime_probe (
    function_signature,
    probe_sql,
    enabled,
    note
)
values (
    'rag.library_grant_publish(uuid,text,uuid,uuid,uuid)',
    'select audit.probe_library_grant_publish()',
    true,
    'Executes Shared Knowledge grant publishing through its any-admin gate and expected pre-write invalid-store rejection. Read-only.'
)
on conflict (function_signature) do update
set probe_sql = excluded.probe_sql,
    enabled = excluded.enabled,
    note = excluded.note;

select audit.refresh();

do $assert$
declare
    v_old_reference_count integer;
    v_target_real_count integer;
    v_probe_enabled boolean;
begin
    select count(*)
      into v_old_reference_count
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('pg_catalog', 'information_schema', 'graveyard')
       and p.prokind = 'f'
       and pg_get_functiondef(p.oid) ilike '%_library_assert_super_admin%';

    if v_old_reference_count <> 0 then
        raise exception
            'Expected zero live function references to _library_assert_super_admin; found %',
            v_old_reference_count;
    end if;

    select enabled
      into v_probe_enabled
      from audit.function_runtime_probe
     where function_signature = 'rag.library_grant_publish(uuid,text,uuid,uuid,uuid)';

    if v_probe_enabled is not true then
        raise exception 'library_grant_publish runtime probe is missing or disabled';
    end if;

    select count(*)
      into v_target_real_count
      from audit.broken_functions
     where severity = 'real'
       and signature = 'rag.library_grant_publish(uuid,text,uuid,uuid,uuid)';

    if v_target_real_count <> 0 then
        raise exception
            'library_grant_publish remains in audit.broken_functions severity=real (% rows)',
            v_target_real_count;
    end if;
end;
$assert$;
