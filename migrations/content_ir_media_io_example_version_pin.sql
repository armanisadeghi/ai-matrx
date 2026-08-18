-- Re-pins the four media workflow-I/O canonical examples to their definition's
-- CURRENT schema version.
--
-- WHY (two reasons, one fix):
--   1. The podcast_episode example now carries the media-identity fields
--      (audio_file_id / image_file_ids / video_file_ids / official_video_file_id),
--      which only exist from the current version's schema. Pinned to
--      kind_version 1 — a closed schema without them — the recompute trigger
--      correctly failed it after content_ir_media_io_examples_real_media.sql.
--   2. The shape doctor reports `stale-example` for any canonical example
--      pinned below its definition's current version; all four had drifted as
--      the media-identity re-seeds bumped the definitions.
--
-- validation_status is re-derived by the `kind_example_recompute_validation`
-- trigger on write — never written by hand here.
update content_ir.kind_example e
   set kind_version = kd.version
  from content_ir.kind_definition kd
 where kd.id = e.kind_definition_id
   and kd.kind in ('podcast_episode', 'generated_image_set',
                   'generated_video_set', 'generated_audio')
   and kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
   and e.is_canonical
   and e.deleted_at is null
   and e.kind_version is distinct from kd.version;
