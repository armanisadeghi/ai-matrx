-- Access ladder T-10 (2026-09-26): "Children inherit their parent" (common-docs/policies/access-ladder.md).
--
-- 1. A component carries no level of its own. 35 active components still carried a registry
--    default_visibility. None of them has a `visibility` column, so the value decided nothing
--    except in platform.entity_row_access_attrs' last fallback arm (tables with no owner column),
--    which only feeds the child's own direct-grant arm; for the one table where the value moved
--    (docproc.processed_document_pages, internal -> NULL -> 'personal') there are 0 direct grants,
--    memberships, reachability rows, scope assignments or entity_grants on that token. No policy
--    reads this column for a component, so no RLS is regenerated.
--
-- 2. Register the composition parent for parentless components whose FK makes the parent
--    unambiguous AND whose parent is an Organization-class table. Each of these tables already
--    runs hand-written policies that defer to exactly this parent, so this is registry truth only:
--    no policy changes. Parents that are still Private/Confidential today (kg_chunks, kg_entities,
--    assignment.session, users.user_feedback, files.webhooks) are deliberately NOT registered
--    here: registering would move the child INTO a strict class, which needs Arman; they follow
--    once T-8 reclassifies their parents.

update platform.entity_types
   set default_visibility = null
 where is_active
   and is_component
   and rls_variant = 'component'
   and default_visibility is not null;

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
select v.child, v.parent, v.fk, 'composition',
       'Access ladder T-10 (2026-09-26): registered so the child''s inheritance is computable; its live policies already defer to this parent.'
  from (values
    ('structure',                   'file',                 'file_id'),
    ('studio_cleaned_segments',     'studio_session',       'session_id'),
    ('studio_concept_items',        'studio_session',       'session_id'),
    ('studio_module_segments',      'studio_session',       'session_id'),
    ('studio_raw_segments',         'studio_session',       'session_id'),
    ('udt_dataset_template_fields', 'udt_dataset_template', 'template_id')
  ) as v(child, parent, fk)
 where not exists (select 1 from platform.entity_relationships r
                    where r.child_type = v.child and r.kind = 'composition');

do $$
declare n int;
begin
  select count(*) into n from platform.entity_types
   where is_active and is_component and default_visibility is not null;
  if n <> 0 then raise exception 'T-10: % components still carry default_visibility', n; end if;

  select count(*) into n from platform.entity_relationships
   where kind = 'composition' and child_type in ('structure','studio_cleaned_segments','studio_concept_items',
         'studio_module_segments','studio_raw_segments','udt_dataset_template_fields');
  if n <> 6 then raise exception 'T-10: expected 6 composition edges, found %', n; end if;
end $$;
