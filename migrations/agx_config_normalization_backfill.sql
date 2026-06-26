-- agx_config_normalization_backfill.sql
--
-- Data backfill for the agent config storage normalization (DDL applied in
-- agx_config_normalization_matrx_actions_ui_gates.sql). Idempotent: re-running
-- matches zero rows once settings is clean.
--
-- Moves OUT of settings (both agx_agent and agx_version):
--   * output_apply  → matrx_actions column (full rebrand; key never read again)
--   * file_urls / image_urls / youtube_videos / tools(boolean) → ui_gates column
--   * model_id (duplicate of the model_id column)      → dropped
--   * internal_tools (no backend consumer; junk)        → dropped
--   * tools(boolean) (UI flag colliding with tools[] col) → moved to ui_gates, dropped from settings
--
-- DELIBERATELY KEPT in settings (verified server-consumed, NOT legacy):
--   * output_format — a real UnifiedConfig field (image/google output format).
--   * metadata      — the single row holds live extraction-label config.
--   * voice_id / realtime_tools / tts_voice / multi_speaker / audio_format / response_format — model params.
--
-- agx_agent is updated inside a DO block with app.skip_version_snapshot so the
-- scrub does NOT spawn 580 spurious versions; agx_version rows (the snapshots)
-- are transformed in place with the identical logic, keeping both byte-aligned.

-- ── agx_agent (suppress snapshot trigger during the scrub) ───────────────────
DO $$
BEGIN
  PERFORM set_config('app.skip_version_snapshot', 'true', true);

  UPDATE public.agx_agent a SET
    matrx_actions = CASE
      WHEN jsonb_typeof(a.settings -> 'output_apply') = 'object' THEN a.settings -> 'output_apply'
      ELSE a.matrx_actions END,
    ui_gates = a.ui_gates
      || (CASE WHEN a.settings ? 'file_urls'      THEN jsonb_build_object('file_urls',      a.settings -> 'file_urls')      ELSE '{}'::jsonb END)
      || (CASE WHEN a.settings ? 'image_urls'     THEN jsonb_build_object('image_urls',     a.settings -> 'image_urls')     ELSE '{}'::jsonb END)
      || (CASE WHEN a.settings ? 'youtube_videos' THEN jsonb_build_object('youtube_videos', a.settings -> 'youtube_videos') ELSE '{}'::jsonb END)
      || (CASE WHEN jsonb_typeof(a.settings -> 'tools') = 'boolean' THEN jsonb_build_object('tools', a.settings -> 'tools') ELSE '{}'::jsonb END),
    settings = (a.settings
                  - 'output_apply' - 'file_urls' - 'image_urls' - 'youtube_videos'
                  - 'model_id' - 'internal_tools'
                  - (CASE WHEN jsonb_typeof(a.settings -> 'tools') = 'boolean' THEN 'tools' ELSE '' END))
  WHERE a.settings ?| ARRAY['output_apply','file_urls','image_urls','youtube_videos','model_id','internal_tools','tools'];
END $$;

-- ── agx_version (snapshots — same transform, no snapshot trigger here) ────────
UPDATE public.agx_version v SET
  matrx_actions = CASE
    WHEN jsonb_typeof(v.settings -> 'output_apply') = 'object' THEN v.settings -> 'output_apply'
    ELSE v.matrx_actions END,
  ui_gates = COALESCE(v.ui_gates, '{}'::jsonb)
    || (CASE WHEN v.settings ? 'file_urls'      THEN jsonb_build_object('file_urls',      v.settings -> 'file_urls')      ELSE '{}'::jsonb END)
    || (CASE WHEN v.settings ? 'image_urls'     THEN jsonb_build_object('image_urls',     v.settings -> 'image_urls')     ELSE '{}'::jsonb END)
    || (CASE WHEN v.settings ? 'youtube_videos' THEN jsonb_build_object('youtube_videos', v.settings -> 'youtube_videos') ELSE '{}'::jsonb END)
    || (CASE WHEN jsonb_typeof(v.settings -> 'tools') = 'boolean' THEN jsonb_build_object('tools', v.settings -> 'tools') ELSE '{}'::jsonb END),
  settings = (v.settings
                - 'output_apply' - 'file_urls' - 'image_urls' - 'youtube_videos'
                - 'model_id' - 'internal_tools'
                - (CASE WHEN jsonb_typeof(v.settings -> 'tools') = 'boolean' THEN 'tools' ELSE '' END))
WHERE v.settings IS NOT NULL
  AND v.settings ?| ARRAY['output_apply','file_urls','image_urls','youtube_videos','model_id','internal_tools','tools'];
