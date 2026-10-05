-- lane: FINISH-THE-SWITCH
-- lock: platform
--
-- FTS-4 a/4 — TAGS ARE A PLATFORM TABLE (Arman 2026-10-02, custom-data DECISIONS.md:302: tags are used by
-- most users, so they must NOT live in custom data / scopes).
-- This file ADDS only: platform.tag (built by THE sanctioned builder, so it is canonical, RLS'd and registered
-- as the entity token `tag`), its live-name uniqueness, and the registry rows that let every kind of item be
-- filed under a tag (platform.association_types, copied from the rows that file under a scope today —
-- container_side/conveys_max too, so the reach of a tag is exactly the reach of the scope it replaces).
-- Archive is the builder's `deleted_at` (delete means archive; the client has no hard delete).
-- Access is the same as the scopes' own: the organization's members read, any member creates, the creator
-- (or an editor) changes — the `entity` variant with visibility `internal`.

set local statement_timeout = '120s';

select platform.create_entity_table(
  p_schema => 'platform', p_table => 'tag', p_token => 'tag', p_label => 'Tag',
  p_fields => array[
    'name text NOT NULL',
    'slug text NOT NULL',
    'color text'
  ],
  p_variant => 'entity', p_versioned => false, p_soft_delete => true, p_visibility => 'internal',
  p_category => false, p_listed => false, p_org_default => false, p_gin_jsonb => false,
  p_data_class => 'organization', p_default_list_scope => 'organization');

-- One live tag per name-slug in an organization (an archived tag frees its name).
create unique index if not exists tag_org_slug_live_uq
  on platform.tag (organization_id, slug) where deleted_at is null;
create index if not exists tag_org_name_idx on platform.tag (organization_id, lower(name)) where deleted_at is null;

alter table platform.tag add constraint tag_name_not_blank check (btrim(name) <> '' and btrim(slug) <> '');

-- Every kind of thing that can be filed under a scope can be filed under a tag, on the same terms.
insert into platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes, allows_loops)
select a.source_type, 'tag', a.label, a.container_side, a.conveys_max, true,
       'FTS-4 2026-10-04: a tag is a platform table row, not a scope (Arman 2026-10-02).', false
  from platform.association_types a
 where a.target_type = 'scope' and a.is_active and a.source_type not in ('scope', 'hr_employee')
on conflict do nothing;
