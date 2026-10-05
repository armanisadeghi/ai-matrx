-- chair-step: archives (soft, never deletes) every remaining live scope of the retired "Tag" scope types through the scope's own archive door custom.context_scope_archive; the tags live on in platform.tag and every filing edge already points at them.
-- lane: FINISH-THE-SWITCH
-- lock: platform
--
-- FTS-4 e/4 — file d archived the 38 "Tag" scope types and their store Tables; the type door does not take the
-- scopes beneath it, so the tag scopes (9,319 on 2026-10-04) are archived one by one through their own door.
-- Measured on the clone: 200 scopes in 0.76 s.

set local statement_timeout = '500s';

select set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
select set_config('app.actor_system', 'fts4.tags_archive', true);

do $archive$
declare
  r record;
  v_n integer := 0;
begin
  for r in select s.id
             from context.scopes s join context.scope_types st on st.id = s.scope_type_id
            where st.slug = 'tag' and s.deleted_at is null
            order by s.id loop
    perform custom.context_scope_archive(r.id);
    v_n := v_n + 1;
  end loop;
  raise notice 'FTS-4 e: % tag scope(s) archived', v_n;
end
$archive$;
