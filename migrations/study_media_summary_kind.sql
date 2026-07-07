-- study_media_summary_kind.sql
--
-- P9 Universal Ingest: the grounded "study summary" is a first-class study-media
-- artifact (it already carries trust + visibility + versioning + source lineage
-- on education.study_media). Widen the media_kind CHECK to admit 'summary'.
-- Additive + idempotent: existing 'audio'/'mind_map' rows are unaffected.

alter table education.study_media
  drop constraint if exists study_media_media_kind_check;

alter table education.study_media
  add constraint study_media_media_kind_check
  check (media_kind = any (array['audio'::text, 'mind_map'::text, 'summary'::text]));
