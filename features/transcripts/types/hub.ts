/** Discriminated union for the /transcripts "All" hub list. */

export type TranscriptHubKind =
  | "processor"
  | "session"
  | "cleanup"
  | "unsorted";

export interface TranscriptHubItemBase {
  id: string;
  kind: TranscriptHubKind;
  title: string;
  updatedAt: string;
  createdAt: string;
}

/** `transcripts` table — the Processor workspace. */
export interface ProcessorHubItem extends TranscriptHubItemBase {
  kind: "processor";
  description: string;
  sourceType: string;
  folderName: string;
  tags: string[];
  durationSeconds: number | null;
  wordCount: number | null;
  isDraft: boolean;
}

/** `studio_sessions` where source ≠ cleanup (Studio + Scribe share this). */
export interface SessionHubItem extends TranscriptHubItemBase {
  kind: "session";
  status: string;
  durationMs: number;
  transcriptId: string | null;
  /** Active (non-detached) recordings in the session. Null until metrics load. */
  recordingCount: number | null;
  /** Characters of the cleaned transcript (raw fallback). Null until metrics load. */
  charCount: number | null;
}

/** `studio_sessions` where source = cleanup. */
export interface CleanupHubItem extends TranscriptHubItemBase {
  kind: "cleanup";
  status: string;
  durationMs: number;
  transcriptId: string | null;
  /** Active (non-detached) recordings in the session. Null until metrics load. */
  recordingCount: number | null;
  /** Characters of the cleaned transcript (raw fallback). Null until metrics load. */
  charCount: number | null;
}

/** Detached `studio_recording_segments` (Scribe unsorted pool). */
export interface UnsortedHubItem extends TranscriptHubItemBase {
  kind: "unsorted";
  segmentIndex: number;
  durationMs: number | null;
}

export type TranscriptHubItem =
  | ProcessorHubItem
  | SessionHubItem
  | CleanupHubItem
  | UnsortedHubItem;

export type HubSectionId = TranscriptHubKind;

export interface HubPageResult<T extends TranscriptHubItem> {
  items: T[];
  hasMore: boolean;
}
