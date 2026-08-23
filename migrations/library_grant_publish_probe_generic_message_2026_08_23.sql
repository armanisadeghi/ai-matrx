-- 2026-08-23 — the audit runtime probe for rag.library_grant_publish asserted the OLD pre-write
-- rejection ("store % is not a Matrx Library store"). Since the generic library family landed,
-- publish resolves the resource through public._library_entity_owner FIRST, so a
-- reserved-invalid id is rejected earlier with "library: data_store <id> not found" — and the
-- probe was reporting severity=real for a function that works. Accept either pre-write
-- rejection; still refuse to pass if publish returns. Applied live via Supabase MCP.
create or replace function audit.probe_library_grant_publish()
returns integer language plpgsql security definer set search_path to 'pg_catalog' as $function$
declare
    v_actor uuid;
    v_probe_store constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
    select a.user_id into v_actor from admin.admins a order by a.user_id limit 1;
    if v_actor is null then
        raise exception 'library_grant_publish runtime probe requires at least one admin';
    end if;
    if exists (select 1 from rag.data_stores s where s.id = v_probe_store) then
        raise exception 'library_grant_publish runtime probe store id unexpectedly exists';
    end if;
    begin
        perform rag.library_grant_publish(v_probe_store, 'global', null::uuid, null::uuid, v_actor);
        raise exception 'library_grant_publish runtime probe unexpectedly returned';
    exception
        when raise_exception then
            if sqlstate = 'P0001'
               and (sqlerrm = format('store %s is not a Matrx Library store', v_probe_store::text)
                 or sqlerrm = format('library: data_store %s not found', v_probe_store::text))
            then
                return 1;
            end if;
            raise;
    end;
end;
$function$;
revoke all on function audit.probe_library_grant_publish() from public, anon, authenticated;
select audit.refresh();
