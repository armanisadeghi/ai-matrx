// features/education/onboard/types.ts
//
// Types for the Universal Ingest / Study Kit flow (P9). Ingest normalizes ANY
// input to `NormalizedIngest`; the kit orchestrator fans it out through the
// converter contract (`features/education/convert`).

import type { SourceRef, TargetKind } from "@/features/education/convert/types";

/** The raw input the user handed us at the front door. */
export type IngestInputKind = "paste" | "file" | "url" | "youtube";

export interface RawIngestInput {
  kind: IngestInputKind;
  /** For `file`. */
  file?: File;
  /** For `paste`. */
  text?: string;
  /** For `url` / `youtube`. */
  url?: string;
  /** Optional user-supplied title override. */
  title?: string;
}

/**
 * A normalized source: extracted text + a durable `cld_files` anchor every
 * generated artifact links back to. Ingest owns getting here; generators never
 * see raw files.
 */
export interface NormalizedIngest {
  text: string;
  title: string;
  ref: SourceRef;
  /** Diagnostics for the UI ("12 pages · 8,431 chars · native"). */
  meta: {
    pages?: number;
    chars: number;
    extractionMethod?: string;
    truncated?: boolean;
    inputKind: IngestInputKind;
  };
}

/** A stage in the ingest progress stream (for the hero UI). */
export interface IngestProgress {
  phase: "uploading" | "extracting" | "scraping" | "transcribing" | "ready";
  message: string;
  /**
   * 0..1 when the step can be measured honestly (bytes uploaded, pages
   * extracted). Omitted for genuinely unmeasurable steps (a transcription the
   * backend does not report progress for) — the UI then shows motion + elapsed
   * time rather than inventing a percentage.
   */
  ratio?: number;
  /** The measured detail behind `ratio` — "34.2 MB of 78.0 MB", "page 12 of 340". */
  detail?: string;
}

/** One target's live state in the kit fan-out. */
export interface KitTargetState {
  targetKind: TargetKind;
  label: string;
  status: "pending" | "running" | "success" | "error";
  /** Populated on success. */
  href?: string;
  title?: string;
  detail?: string;
  artifactId?: string;
  resourceType?: string;
  /**
   * The artifact row exists but its content is still being produced elsewhere
   * (streamed targets — audio). `status` is 'success' because the generator
   * succeeded at STARTING the work; this flag stops the board presenting it as
   * a finished artifact. Mirrors `ConvertResult.pending`.
   */
  stillGenerating?: boolean;
  /** Populated on error. */
  error?: string;
  /** Live streaming request id (for token-level preview), when available. */
  requestId?: string;
  /** Epoch ms this target started running — powers the honest elapsed clock. */
  startedAt?: number;
  /** Epoch ms this target settled (success or error). */
  finishedAt?: number;
  /**
   * Live COVERAGE progress for a segmented generation (`convert/coverage.ts`).
   * A big artifact is deliberately many agent calls, and a single spinner for a
   * three-minute fan-out is the "we are wasting your time" state this flow was
   * built to kill: this is what lets the board say "section 3 of 8 -
   * Measurements, 24 items so far".
   */
  coverage?: {
    done: number;
    total: number;
    label: string;
    items: number;
  };
}
