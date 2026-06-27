/**
 * Audio Transcription Error Logger
 *
 * Logs transcription errors to the canonical `public.system_error` log (the
 * per-feature `audio_transcription_errors` table was graveyarded in the 2026 DB
 * canonicalization — no duplicate error tables). `kind='audio_transcription'`;
 * transcription-specific fields go in `context`.
 * Server-side: direct insert via admin client (service-role; system_error is
 * service-role-only). Client-side: POST to /api/audio/log-error.
 */

import { createAdminClient } from '@/utils/supabase/adminClient';

export interface TranscriptionErrorLog {
  userId: string;
  errorCode: string;
  errorMessage: string;
  fileSizeBytes: number;
  chunkIndex?: number;
  attemptNumber: number;
  apiRoute: string;
  metadata?: Record<string, unknown>;
}

/**
 * Server-side error logging — call from API routes.
 * Fails silently to avoid cascading errors during transcription.
 */
export async function logTranscriptionError(entry: TranscriptionErrorLog): Promise<void> {
  try {
    const supabase = createAdminClient();

    await supabase.from('system_error').insert({
      kind: 'audio_transcription',
      source_app: 'matrx-frontend',
      user_id: entry.userId,
      route: entry.apiRoute,
      error_type: entry.errorCode,
      error_text: entry.errorMessage.slice(0, 2000),
      context: {
        file_size_bytes: entry.fileSizeBytes,
        chunk_index: entry.chunkIndex ?? null,
        attempt_number: entry.attemptNumber,
        ...(entry.metadata ?? {}),
      },
    });
  } catch (err) {
    console.error('[audioErrorLogger] Failed to log transcription error:', err);
  }
}
