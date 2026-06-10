/**
 * Surface manifest — Transcription Cleanup (`matrx-user/transcripts-cleanup`).
 *
 * The high-volume record → clean → refine page at `/transcripts/cleanup`.
 * Three containers: raw transcript, cleaned transcript, and a user-custom
 * output produced by ANY agent the user picks. Sessions live on the studio
 * data model (`studio_sessions` with `source='cleanup'`).
 *
 * Mapping intent: agents bound to this surface receive the raw transcript as
 * their primary input. `raw_transcript_text` doubles as baseline `content`
 * so name-matched agents that declare a `content` variable also work.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "session_id",
    label: "Cleanup session ID",
    description:
      "UUID of the active cleanup session (studio_sessions row). Empty before the first content is captured.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "session_title",
    label: "Session title",
    description: "Title of the active cleanup session.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
  },
  {
    name: "raw_transcript_text",
    label: "Raw transcript",
    description:
      "The full raw transcript as currently visible in the transcript container — recorded chunks plus any manual edits. The primary input for cleanup agents.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 320,
  },
  {
    name: "cleaned_transcript_text",
    label: "Cleaned transcript",
    description:
      "The AI-cleaned transcript currently visible in the Clean container (latest pass, including user edits). Empty before the first cleaning pass.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 330,
  },
  {
    name: "custom_output_text",
    label: "Custom output",
    description:
      "The user-custom container's current text — output of the user's chosen custom agent, including manual edits. Empty when no custom pass has run.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 340,
  },
];

export const transcriptsCleanupManifest: SurfaceManifest = {
  surfaceName: "matrx-user/transcripts-cleanup",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/** Type-safe scope builder for the cleanup page. */
export function createTranscriptsCleanupScope(values: {
  selection?: string;
  /** Baseline alias for the primary input — pass the raw transcript here too. */
  content?: string;
  context?: Record<string, unknown>;
  session_id?: string;
  session_title?: string;
  raw_transcript_text?: string;
  cleaned_transcript_text?: string;
  custom_output_text?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
