-- ============================================================================
-- ui_surface.supports_dictionary — declares which surfaces auto-include the
-- Custom Dictionary in their assembled context.
--
-- When true, the Python backend's agent-run prep resolves the user's stored
-- dictionary selection (user_surface_state, feature='dictionary') for the
-- surface and injects the merged dictionary into the request config. This is
-- the surface-registry-driven auto-inclusion the dictionary feature rides on.
--
-- Seeded true for the live transcription / TTS surfaces. New transcription/TTS
-- surfaces should set this in their own integration migration.
-- ============================================================================

ALTER TABLE public.ui_surface
    ADD COLUMN IF NOT EXISTS supports_dictionary boolean NOT NULL DEFAULT false;

UPDATE public.ui_surface
SET supports_dictionary = true
WHERE name IN (
    'matrx-user/transcripts-cleanup',
    'matrx-user/transcript-scribe',
    'matrx-user/transcript-scribe-live',
    'matrx-user/transcript-studio',
    'matrx-user/transcripts'
);

NOTIFY pgrst, 'reload schema';
