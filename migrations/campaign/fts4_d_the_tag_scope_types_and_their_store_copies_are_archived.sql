-- chair-step: archives (soft, never deletes) every organization's "Tag" scope type, its scopes and its record-store copy, through the type's own archive door custom.context_type_archive; the tags themselves live on in platform.tag (files a-c) and every filing edge already points at them.
-- lane: FINISH-THE-SWITCH
-- lock: platform
--
-- FTS-4 d/4 — THE OLD HOME OF TAGS IS ARCHIVED. After file b every tag is a platform.tag row with its old id and
-- every `<kind> -> scope` edge to a tag is a `<kind> -> tag` edge, and after the readers moved (Knowledge Hub,
-- the server's #tag lookup, the filed-tags projection) nothing reads a tag from the scopes. So the 38 per-
-- organization scope types with slug `tag`, their ~9,300 scopes and the record-store Table that copies each one
-- are archived — the door archives the type, its scopes and its store Table in one statement per organization.
-- Nothing is deleted: archive is `deleted_at`, and a type restores through its own restore door.
-- The door decides by who calls it; this file is a service-role system step, so it says so for its transaction.

set local statement_timeout = '500s';

select set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
select set_config('app.actor_system', 'fts4.tags_archive', true);

do $archive$
declare
  r record;
  v_n integer := 0;
begin
  for r in select st.id from context.scope_types st where st.slug = 'tag' and st.deleted_at is null order by st.id loop
    perform custom.context_type_archive(r.id);
    v_n := v_n + 1;
  end loop;
  raise notice 'FTS-4 d: % tag scope type(s) archived', v_n;
end
$archive$;
