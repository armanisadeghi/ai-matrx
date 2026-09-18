-- list_change_proposal_v1 — the render-leg row the DATABASE gate reads.
--
-- `content_ir.set_kind_activation` runs its render leg in SQL, so it cannot see
-- a compiled bridge: it looks for an active role='output' kind_component row and
-- refuses without one ("no active role='output' kind_component row"). Every
-- other compiled-and-active kind carries the same `source='bundled'` row
-- (page_brief, episode_title_options, …), so this is the convention, not an
-- exception.
--
-- `component_key` MUST resolve in
-- components/mardown-display/chat-markdown/block-registry/block-dispatch.tsx —
-- `pnpm check:shapes:components` is a blocking release gate precisely because a
-- dangling key changes nothing at runtime (the compiled bridge routes anyway)
-- while the registry claims coverage. `list_change_proposal` is the
-- SHAPE_BLOCK_DISPATCH entry registered in the same commit.

insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, is_default, is_active,
   organization_id, notes)
select d.id, 'web', 'output', 'list_change_proposal', 'bundled', true, true,
       '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       'ListChangeProposalBlock -> ListChangeProposalView (the ONE reviewer for this kind).'
  from content_ir.kind_definition d
 where d.kind = 'list_change_proposal_v1' and d.deleted_at is null
on conflict (kind_definition_id, platform, role) where (is_default and deleted_at is null)
do update set component_key = excluded.component_key,
              source = excluded.source,
              is_active = true;
