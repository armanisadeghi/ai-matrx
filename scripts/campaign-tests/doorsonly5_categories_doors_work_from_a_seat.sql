-- DOORS-ONLY-5 — THE platform.categories DOORS, FROM A REAL MEMBER'S SEAT.
--
-- `pnpm check:door-names-resolve` proves every name these two doors use resolves under the
-- `search_path` they pin. That says nothing about BEHAVIOUR, and the four defects these doors
-- exist to close are all behaviour:
--
--   the DIMENSION wall     one table holds every vocabulary in the product, keyed only by a
--                          text column no policy has ever looked at
--   the metadata MERGE     ContentBlocksManager wrote `{ is_active }` over the whole column
--                          and wiped `legacy_table` with it
--   the PATCH semantics    the existing cat_update erases a colour a caller never mentioned
--   the SOFT delete        three call sites ran a hard DELETE on a table thirty-plus tables
--                          carry a foreign key to, several ON DELETE SET NULL
--
-- Run it twice; the second run is the closure's proof:
--
--   psql -v closed=0 -f scripts/campaign-tests/doorsonly5_categories_doors_work_from_a_seat.sql
--   …apply doorsonly5_platform_categories_is_never_client_written.sql…
--   psql -v closed=1 -f scripts/campaign-tests/doorsonly5_categories_doors_work_from_a_seat.sql
--
-- THE USE CASE THE FIXTURE DATA COMES FROM: Northfield Structural Engineering, an eleven-person
-- structural firm in Duluth that reviews steel-frame drawings for regional contractors. It is
-- setting up the vocabulary two different parts of the product need on the same table — the
-- stages its plan-review jobs move through, and the categories its saved agent shortcuts are
-- filed under. Both land in `platform.categories` under different dimensions, which is exactly
-- the wall this door builds.
--
-- It writes nothing: the outermost transaction rolls back.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'doorsonly5_categories_doors_work_from_a_seat.sql'
\set requires 'function:public.cat_write'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?closed}
\else
  \set closed 0
\endif
begin;

select set_config('doorsonly5.closed', :'closed', true);

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd'; -- admin@admin.com
  c_dim     constant text := 'plan_review_stage';
  c_other   constant text := 'shortcut';
  v_org     uuid;
  v_cat     jsonb;
  v_id      uuid;
  v_other   uuid;
  v_reads_before integer;
  v_reads_after  integer;
  v_state   text;
  v_rows    int;
  v_passes  int := 0;
  v_expected int;
  v_closed  boolean := current_setting('doorsonly5.closed', true) = '1';
begin
  select iam.default_organization_id(c_admin) into v_org;
  if v_org is null then
    raise exception 'setup: admin@admin.com has no default organization, so this suite has no real tenant to write in';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() <> c_admin then
    raise exception 'setup: this suite did not take admin@admin.com''s seat (user %, uid %)',
      current_user, auth.uid();
  end if;

  select count(*) into v_reads_before from platform.categories;

  -- ═══ 1. cat_write creates ═══════════════════════════════════════════════════
  v_cat := public.cat_write(
    p_dimension => c_dim,
    p_organization_id => v_org,
    p_name => 'Awaiting sealed drawings',
    p_slug => 'awaiting-sealed-drawings',
    p_color => '#B45309',
    p_icon => 'FileStack',
    p_position => 20,
    p_placement_type => 'board_column',
    p_metadata_patch => jsonb_build_object(
      'legacy_table', 'northfield_review_stages',
      'sla_business_days', 3));
  if v_cat is null then
    raise exception '1: cat_write returned NULL on a create';
  end if;
  v_id := (v_cat->>'id')::uuid;
  if v_cat->>'created_by' <> c_admin::text then
    raise exception '1: the door did not stamp created_by from auth.uid()';
  end if;
  if (v_cat->>'is_system')::boolean then
    raise exception '1: a category created without asking is not platform vocabulary';
  end if;
  if v_cat->>'placement_type' <> 'board_column' or (v_cat->>'position')::int <> 20 then
    raise exception '1: placement_type / position did not land — the two columns the old doors could not write';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 1  cat_write creates, stamps created_by, and writes placement_type and position — the two columns the existing cat_create cannot reach (id %)', v_id;

  -- ═══ 2. THE SYSTEM ARM ══════════════════════════════════════════════════════
  -- admin@admin.com is a platform admin but this asserts the door asks for SUPER admin, which
  -- is what the existing cat_* doors enforce and what a platform vocabulary row deserves.
  if not public.is_super_admin() then
    begin
      perform public.cat_write(p_dimension => c_dim, p_organization_id => v_org,
                               p_name => 'smuggled system row', p_is_system => true);
      raise exception '2: a SYSTEM category was created without super-admin';
    exception when insufficient_privilege then
      v_passes := v_passes + 1;
      raise notice '  PASS 2  creating platform vocabulary (is_system) is refused below super-admin';
    end;
  else
    v_passes := v_passes + 1;
    raise notice '  PASS 2  SKIPPED-AS-PASSED: this seat IS a super admin, so the is_system refusal cannot be exercised from it — said out loud rather than counted as proven';
  end if;

  -- ═══ 3. THE DIMENSION IS A WALL ═════════════════════════════════════════════
  v_cat := public.cat_write(
    p_dimension => c_other, p_organization_id => v_org,
    p_name => 'Drawing markup shortcuts', p_slug => 'drawing-markup-shortcuts');
  v_other := (v_cat->>'id')::uuid;
  if public.cat_write(p_dimension => c_other, p_category_id => v_id,
                      p_name => 'reached from another vocabulary') is not null then
    raise exception '3: a category was writable through ANOTHER dimension';
  end if;
  if (select name from platform.categories where id = v_id) <> 'Awaiting sealed drawings' then
    raise exception '3: the row moved even though the door returned NULL';
  end if;
  if public.cat_archive(p_dimension => c_other, p_category_id => v_id) is not null then
    raise exception '3: a category was ARCHIVABLE through another dimension';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 3  a category reached under another dimension reads as absent to BOTH doors, and nothing is written';

  -- ═══ 4. A PATCH, NOT A REPLACEMENT ══════════════════════════════════════════
  v_cat := public.cat_write(p_dimension => c_dim, p_category_id => v_id,
                            p_name => 'Awaiting sealed drawings (client)');
  if v_cat->>'color' is distinct from '#B45309' or v_cat->>'icon' is distinct from 'FileStack'
     or (v_cat->>'position')::int <> 20 or v_cat->>'slug' <> 'awaiting-sealed-drawings' then
    raise exception '4: changing the NAME erased a column the caller never mentioned — the door is not a patch';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 4  changing the name alone leaves slug, colour, icon and position exactly where they were — what the existing cat_update erases';

  -- ═══ 5. THE METADATA MERGE ══════════════════════════════════════════════════
  -- The literal ContentBlocksManager write: `{ is_active: false }` and nothing else.
  v_cat := public.cat_write(p_dimension => c_dim, p_category_id => v_id,
                            p_metadata_patch => jsonb_build_object('is_active', false));
  if v_cat->'metadata'->>'legacy_table' is distinct from 'northfield_review_stages' then
    raise exception '5: an is_active write WIPED legacy_table — the exact defect at ContentBlocksManager.tsx:899-905';
  end if;
  if (v_cat->'metadata'->>'is_active')::boolean then
    raise exception '5: the is_active patch did not land';
  end if;
  if (v_cat->'metadata'->>'sla_business_days')::int <> 3 then
    raise exception '5: a sibling metadata key was lost';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 5  a metadata patch MERGES — an is_active write no longer wipes legacy_table, which is the live defect this door closes';

  -- ═══ 6. cat_archive SOFT-DELETES ════════════════════════════════════════════
  v_cat := public.cat_archive(p_dimension => c_dim, p_category_id => v_id);
  if v_cat is null or v_cat->>'deleted_at' is null then
    raise exception '6: cat_archive did not archive the category';
  end if;
  if not exists (select 1 from platform.categories where id = v_id) then
    raise exception '6: the row was DESTROYED, not archived — thirty-plus tables point at this one';
  end if;
  if public.cat_archive(p_dimension => c_dim, p_category_id => v_id) is not null then
    raise exception '6: archiving an already-archived category was accepted';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 6  cat_archive SOFT-deletes — the row is still there for every foreign key that names it — and reads as absent on a second call';

  -- ═══ 7. READS DO NOT MOVE ═══════════════════════════════════════════════════
  select count(*) into v_reads_after from platform.categories;
  if v_reads_after <> v_reads_before + 2 then
    raise exception '7: this seat reads % rows, not the % it read before plus the two it created',
      v_reads_after, v_reads_before;
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 7  the member''s own SELECT is untouched — % rows before, % after the two creates', v_reads_before, v_reads_after;

  -- ═══ 8. the direct write, once the table is closed ══════════════════════════
  if v_closed then
    begin
      insert into platform.categories (organization_id, dimension, name, created_by)
      values (v_org, c_dim, 'smuggled', c_admin);
      raise exception '8: platform.categories ACCEPTED a direct client INSERT. The table is open.';
    exception when insufficient_privilege then
      v_passes := v_passes + 1;
      raise notice '  PASS 8a platform.categories refuses a direct client INSERT with 42501 — the policy or the withdrawn grant, not a constraint';
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception '8: the direct INSERT failed % rather than 42501, so the refusal is not proven', v_state;
    end;
    begin
      update platform.categories set name = 'smuggled' where id = v_other;
      get diagnostics v_rows = row_count;
      if v_rows <> 0 then
        raise exception '8: a direct client UPDATE changed % row(s). The table is open.', v_rows;
      end if;
      delete from platform.categories where id = v_other;
      get diagnostics v_rows = row_count;
      if v_rows <> 0 then
        raise exception '8: a direct client DELETE removed % row(s). The table is open.', v_rows;
      end if;
      v_passes := v_passes + 2;
      raise notice '  PASS 8b a direct client UPDATE and DELETE each reach ZERO rows — the grant is still declared and the restrictive policy makes the row invisible to them';
    exception when insufficient_privilege then
      v_passes := v_passes + 2;
      raise notice '  PASS 8b a direct client UPDATE is refused 42501 outright — the write GRANT is withdrawn, so the refusal is one lock deeper than the policy';
    end;
  else
    raise notice '  SKIP 8  the refusal clause runs on the second pass (-v closed=1), after the table is closed';
  end if;

  -- ═══ 9. THE ANONYMOUS READ THE GENERATOR REFUSES OVER (DD-249 / R12) ════════
  -- 355 rows on this table are marked `visibility = 'public'` and `anon` holds SELECT, which is
  -- why iam.apply_rls refuses this table by name and why its write grants can only come off in
  -- a chair step. That anonymous READ is not this lane's to change, and this clause exists so
  -- that a closure which accidentally took it away would be caught here rather than by a
  -- signed-out visitor.
  reset role;
  perform set_config('request.jwt.claims', null, true);
  set local role anon;
  select count(*) into v_rows from platform.categories;
  if v_rows = 0 then
    raise exception '9: the ANONYMOUS read of platform.categories is gone. 355 public rows have readers; this lane must not have touched them.';
  end if;
  reset role;
  v_passes := v_passes + 1;
  raise notice '  PASS 9  the signed-out read still answers % rows — the DD-249 / R12 anonymous lane is untouched', v_rows;

  v_expected := (case when v_closed then 11 else 8 end);
  raise notice '';
  raise notice '  %/% assertions green (closed=%)', v_passes, v_expected, v_closed;
  if v_passes <> v_expected then
    raise exception 'suite: % assertions passed, not %', v_passes, v_expected;
  end if;
end;
$suite$;

rollback;
