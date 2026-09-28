/**
 * The one Source input — local types.
 *
 * The wire shapes (`SourceRef`, `SourceSet`, `SourceManifest`, …) are the
 * frozen v1 contract in `@ai-matrx/agents/sources` and are never re-declared
 * here. What lives here is only what the INPUT needs on top of them: a
 * `SourceDraft` (one picked Source while the person is still choosing) and the
 * props every host passes to `<SourceInput>`.
 *
 * Contract of record: common-docs `projects/unified-source-input/DESIGN.md`.
 */

import type {
  SourceManifestEntry,
  SourceRef,
} from "@ai-matrx/agents/sources";

/** Every tile the input can show. ONE registry: `sourceKinds.ts`. */
export type SourceKindId =
  | "your_sources"
  | "files"
  | "notes"
  | "records"
  | "upload"
  | "paste"
  | "web"
  | "youtube"
  | "audio"
  | "image"
  | "topic";

/**
 * One picked Source while the person is still choosing. JSON only — it is
 * persisted as a draft so a refresh never loses a pick.
 *
 * `ref` is null only while a NEW Source is still landing (reading a page,
 * transcribing, uploading); it becomes the pointer the moment the door
 * answers. Nothing is ever sent to the server as a blob.
 */
export interface SourceDraft {
  kind: SourceKindId;
  /** What the person sees: a file name, a page title, the first line of a paste. */
  label: string;
  ref: SourceRef | null;
  /** Where it came from, in plain words (a web address, "Pasted text"). */
  origin?: string;
  /** The Source screen id when known (a landed Source) — every card opens. */
  processedDocumentId?: string;
  /** The stored file behind it, when it is one (the form chooser reads its family). */
  fileId?: string;
  /** Every stand-in announces itself: a reader fallback, a door notice. */
  notes?: string[];
  /** The person asked to wait for the clean version before anything runs. */
  waitForClean?: boolean;
}

/** One card: the draft, its lifecycle, and what the server measured. */
export interface SourceCardModel {
  id: string;
  draft: SourceDraft;
  status: "pending" | "resolving" | "ready" | "error";
  /** A sentence with its remedy — never a code. */
  error: string | null;
  /** The server's measurement (sizes, forms, parts, state). Null until read. */
  manifest: SourceManifestEntry | null;
}

/** The entity the Sources are being used for — passed to the door as `attach_to`. */
export interface SourceAttachTo {
  entityType: string;
  entityId: string;
  label?: string;
}

export interface SourceInputProps {
  /**
   * Stable key for this input on this surface ("flashcards:new"). The picks
   * are held and persisted under it — two inputs never share picks.
   */
  surfaceKey: string;
  /** Which tiles appear. Omitted = every kind. */
  kinds?: readonly SourceKindId[];
  /** Most Sources the person may pick. Omitted = no limit. */
  max?: number;
  /** The host needs at least one Source (or a topic) before it can run. */
  required?: boolean;
  /** The form each new Source starts on ("clean" | "raw"). Omitted = the server's choice. */
  defaultForm?: string;
  /** The heading above the input. */
  title?: string;
  /** The thing being made — new Sources are filed against it and kept. */
  attachTo?: SourceAttachTo;
  /** What the Sources are for, in the person's words ("your flashcard deck"). */
  purpose?: string;
  /** The model that will read them — its context window sets the review budget. */
  targetModelId?: string;
  className?: string;
}
