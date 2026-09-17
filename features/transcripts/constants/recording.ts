/**
 * Recording constants for the transcripts feature.
 *
 * 🚨 The ceilings are NOT here. `RECORDING_LIMITS` used to re-export
 * `AUDIO_LIMITS.MAX_DURATION_SECONDS` / `MAX_FILE_SIZE_BYTES` and made a stale
 * 60-minute / 100 MB constant look like a limit this feature owned. They are
 * now knob rows under `media.transcription`, resolved through
 * `features/audio/limits.ts` — `recordingLimits()` for the live browser
 * capture lane, `uploadLimits()` for a file the person hands us. The two are
 * deliberately different numbers and are named differently.
 *
 * What remains is the measured encoder bitrate used to PROJECT a recording's
 * size from its elapsed time, which is a property of webm/opus rather than a
 * product opinion (see the comment on it in `features/audio/constants.ts`).
 */

import { AUDIO_CONSTANTS, RECORDING_ERROR_CODES } from '@/features/audio/constants';
export type { RecordingStatus } from '@/features/audio/constants';

/** Projection input only — not a limit. See the module header. */
export const ESTIMATED_BYTES_PER_SECOND = AUDIO_CONSTANTS.ESTIMATED_BYTES_PER_SECOND;

export const RECORDING_ERRORS = RECORDING_ERROR_CODES;
