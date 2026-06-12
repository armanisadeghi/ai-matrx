-- Per-episode cast metadata for variable-host podcasts (1–20 speakers).
--
-- speakers: jsonb array of {"name": "...", "voice": "..."} in turn-priority
-- order — voice is a Gemini prebuilt voice name (1–2 hosts, Google TTS) or an
-- ElevenLabs voice_id (3+ hosts, dialogue TTS). Written by the aidream podcast
-- pipeline at persist time; read by transcripts and public episode pages to
-- label speakers. host_count is the requested cast size.

alter table public.pc_episodes
  add column if not exists host_count integer,
  add column if not exists speakers jsonb;

alter table public.pc_studio_runs
  add column if not exists host_count integer,
  add column if not exists speakers jsonb;

comment on column public.pc_episodes.speakers is
  'Cast in turn-priority order: [{"name","voice"}] — Gemini voice names (<=2 hosts) or ElevenLabs voice_ids (3+).';
comment on column public.pc_studio_runs.speakers is
  'Cast in turn-priority order: [{"name","voice"}] — mirrors pc_episodes.speakers for live runs.';
