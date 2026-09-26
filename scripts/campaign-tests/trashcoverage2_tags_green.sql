-- LANE TRASH-COVERAGE-2 — a tagged item restored from Trash brings back its copied context tags.
--
-- THE REAL USE CASE: admin@admin.com's war room "Q4 fleet contract push" is tagged to a scope (the
-- record store's copy of that tag, role context_tag, is on the war room). The admin archives the war
-- room, changes their mind, and restores it from Trash. The restore must succeed and the tag must come
-- back with it. A direct revive of a copied tag (not through the item's restore) stays refused.
-- One transaction, ROLLBACK. ITS RED: without
-- migrations/campaign/trashcoverage2_a_restored_item_brings_back_its_copied_context_tags.sql the
-- restore raises 42501 "nobody may revive it here".

\set ON_ERROR_STOP on
\timing off

\set suite 'trashcoverage2_tags_green.sql'
\set requires 'grant:authenticated:public.entity_undelete'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid; v_wr uuid; v_scope uuid; v_assoc uuid; v_ok boolean; v_state text;
begin
  perform set_config('app.actor_system', 'campaign-test/trashcoverage2_tags_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'postgres', true);
  select s.id, s.organization_id into v_scope, v_org
    from context.scopes s
   where s.deleted_at is null and s.created_by = c_admin
     and coalesce((platform.knob_resolve('custom', 'context_copy_following', s.organization_id) #>> '{}')::boolean, true)
   order by s.id limit 1;
  if v_scope is null then raise exception 'the admin owns no live scope in an organization that follows copies'; end if;
  insert into workspace.war_rooms (title, organization_id, created_by)
  values ('Q4 fleet contract push', v_org, c_admin) returning id into v_wr;
  -- The copied tag, written the way the follow writes it (the store owner's connection).
  insert into platform.associations (source_type, source_id, target_type, target_id, role, organization_id, created_by)
  values ('war_room', v_wr, 'record', v_scope, 'context_tag', v_org, c_admin) returning id into v_assoc;

  perform set_config('role', 'authenticated', true);
  update workspace.war_rooms set deleted_at = now() where id = v_wr;
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from platform.associations where id = v_assoc and deleted_at is not null and deleted_via_id = v_wr) then
    raise exception 'the archive did not tombstone the copied tag (fixture broken)';
  end if;

  -- A direct revive of the copied tag is still refused.
  perform set_config('role', 'authenticated', true);
  begin
    update platform.associations set deleted_at = null, deleted_via_type = null, deleted_via_id = null where id = v_assoc;
    get diagnostics v_state = row_count;
    if v_state::int > 0 then raise exception 'a direct revive of a copied tag was let through'; end if;
  exception when insufficient_privilege then null;
  end;

  -- The Trash restore of the item succeeds and brings the tag back.
  if not public.entity_undelete('war_room', v_wr) then raise exception 'Trash restore answered false'; end if;
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from workspace.war_rooms where id = v_wr and deleted_at is null) then
    raise exception 'the war room is not back';
  end if;
  if not exists (select 1 from platform.associations where id = v_assoc and deleted_at is null) then
    raise exception 'the copied tag did not come back with the war room';
  end if;
  raise notice 'TRASHCOVERAGE2 TAGS GREEN — restored with its copied context tag; a direct revive stays refused.';
end
$t$;

rollback;
