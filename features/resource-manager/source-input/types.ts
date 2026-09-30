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
import type { SourceDelivery } from "./delivery";

/** Every tile a host can allow: the Add new doors, plus "existing" (Use existing + search). */
export type SourceTileId =
  | "upload"
  | "paste"
  | "web"
  | "youtube"
  | "audio"
  | "image"
  | "topic"
  | "existing";

/**
 * What a picked Source is while the person chooses: the tile it came through,
 * or — for something they already had — "files", "notes", "your_sources"
 * (a Source screen) or "records" (any other registry kind).
 */
export type SourceKindId = SourceTileId | "your_sources" | "files" | "notes" | "records";

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
  /**
   * How a reused Source was captured (`processed_documents.source_kind`), so
   * the card and the review say "Transcript" or "Web page" — never "Document".
   */
  sourceKind?: string;
  /** The stored file behind it, when it is one (the form chooser reads its family). */
  fileId?: string;
  /** Every stand-in announces itself: a reader fallback, a door notice. */
  notes?: string[];
  /** The person asked to wait for the clean version before anything runs. */
  waitForClean?: boolean;
  /**
   * What the person handed over, kept ONLY while the Source is still landing
   * (or failed) so a reload or a failure never loses it: the pasted text, the
   * link, or an already-uploaded recording's file. Never file bytes. Cleared
   * the moment the Source settles.
   */
  input?: SourceIntakeInput;
}

/** The input behind a Source that is still landing — enough to land it again. */
export interface SourceIntakeInput {
  /** Pasted text (paste). */
  text?: string;
  /** The name the person typed for pasted text. */
  name?: string;
  /** A web page or YouTube link (web, youtube). */
  url?: string;
  /** A recording that already finished uploading (audio) — transcribe from here. */
  fileId?: string;
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
  /** Which tiles appear ("existing" = Use existing + search). Omitted = every tile. */
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
  /**
   * How the AI may get the Sources on this surface. Omitted = both. A host
   * whose generator needs the text up front (flashcards) passes `["direct"]`:
   * the card and the review never offer "Let the AI look it up", and a Source
   * already set to it is switched back with a note on its card.
   */
  deliveries?: readonly SourceDelivery[];
  className?: string;
}
