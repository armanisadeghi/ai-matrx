-- edu_fc_detail_image_columns.sql
--
-- Flashcard images P0 (common-docs/systems/education/flashcard-images/VISION_AND_PLAN.md §2.1).
-- Mirrors the audio precedent (audio_file_id) on education.fc_detail:
--   * image_file_id — stored platform file (upload / generated / fetched-and-stored),
--     born public via public_media_scope(); render via <InlineMediaRef/>.
--   * image_url     — hotlinked web image (Arman's 2026-08-17 ruling: agents source
--     expert images from the open web; hotlinked images are not stored). Always a
--     durable public URL from the source site, never one of our signed URLs.
-- Exactly one of the two is set on an image detail row. Alt text rides the
-- existing `text` column; provenance + trust judgment ride `metadata`
-- (source, page_url, domain, credit, judgment{...}, verification{...}).
--
-- New detail kinds front_image / back_image join the fc_detail_kind dimension
-- (kind has no CHECK constraint by design — growing vocabulary, db-rules §5).
-- generation_status gains 'image_ready' beside 'audio_ready'.
--
-- Additive + idempotent.

alter table education.fc_detail
  add column if not exists image_file_id uuid,
  add column if not exists image_url text;

alter table education.fc_detail
  drop constraint if exists fc_detail_generation_status_check;

alter table education.fc_detail
  add constraint fc_detail_generation_status_check
  check (generation_status in ('pending','text_ready','audio_ready','image_ready','failed'));

insert into platform.categories (organization_id, dimension, name, slug, is_system, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.dim, v.name, v.name, true, 'public'::platform.visibility
from (values
  ('fc_detail_kind','front_image'),('fc_detail_kind','back_image')
) v(dim,name)
where not exists (
  select 1 from platform.categories c
  where c.dimension = v.dim and c.name = v.name and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
);
