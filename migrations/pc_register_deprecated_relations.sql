-- pc_register_deprecated_relations
-- 2026-06-28 — Record the 5 podcast schema moves in platform.deprecated_relations
-- (mirror of scripts/dead-relations.json) so the clean-cut guards track them.
insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
values
 ('public.pc_shows','podcast.pc_shows',null,'moved to podcast schema 2026-06-28 (clean cut)'),
 ('public.pc_episodes','podcast.pc_episodes',null,'moved to podcast schema 2026-06-28 (clean cut)'),
 ('public.pc_articles','podcast.pc_articles',null,'moved to podcast schema 2026-06-28 (clean cut)'),
 ('public.pc_studio_runs','podcast.pc_studio_runs',null,'moved to podcast schema 2026-06-28 (clean cut)'),
 ('public.pc_studio_run_assets','podcast.pc_studio_run_assets',null,'moved to podcast schema 2026-06-28 (clean cut)')
on conflict (old_ref) do update set new_ref=excluded.new_ref, reason=excluded.reason;
