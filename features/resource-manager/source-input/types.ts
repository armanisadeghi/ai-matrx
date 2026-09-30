/**
 * The one Source input — the props every host passes to `<SourceInput>`.
 *
 * Everything else the input works with — the wire contract (`SourceRef`,
 * `SourceSet`, …, `@ai-matrx/agents/sources`) and the runtime shapes
 * (`SourceDraft`, `SourceCardModel`, `SourceKindId`, …,
 * `@ai-matrx/agents/sources/runtime`) — lives in the package and is never
 * re-declared here (USI-7, "one core, many screens").
 *
 * Contract of record: common-docs `projects/unified-source-input/DESIGN.md`.
 */

import type { SourceAttachTo, SourceDelivery, SourceKindId } from "@ai-matrx/agents/sources/runtime";

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
