-- Register every source-lineage pair the education converter can emit.
--
-- `recordSourceLineage` is the ONE writer of a converted artifact's `source`
-- edge: artifact --source--> origin, where the artifact is whatever a generator
-- produced (fc_set | study_media | note | assessment) and the origin is the
-- durable ingest anchor FILE or the origin ENTITY of an entity-sourced convert.
-- Only two of those pairs were ever registered (fc_set->file, study_media->file,
-- added ad hoc from the Relationship Manager on 2026-07-11), so the moment the
-- notes / quiz / practice-test generators shipped, EVERY kit run built on
-- /education/start threw 23514 "Unknown association type: note -> file" and
-- "assessment -> file" and the artifacts landed with no traceable lineage.
--
-- These edges are PROVENANCE, not permission (Arman, 2026-08-17): container_side
-- is 'none', so no access is conveyed in either direction; conveys_max matches
-- the two pre-existing lineage rows so the family is uniform.
--
-- Applied live via Supabase MCP apply_migration on 2026-08-20.
insert into platform.association_types
  (source_type, target_type, container_side, conveys_max, is_active, notes)
select a.token, b.token, 'none', 'editor'::permission_level, true,
       'Education converter source-lineage (registered 2026-08-20): a generated '
       || a.token || ' traces back to the ' || b.token
       || ' it was made from. Provenance only — container_side=none conveys no access.'
from (values ('fc_set'),('study_media'),('note'),('assessment')) as a(token)
cross join (values ('file'),('fc_set'),('study_media'),('note'),('assessment')) as b(token)
where not exists (
  select 1 from platform.association_types t
  where t.source_type = a.token and t.target_type = b.token
);
