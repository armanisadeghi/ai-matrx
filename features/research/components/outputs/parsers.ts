/**
 * features/research/components/outputs/parsers.ts
 *
 * Pure coercers for the Outputs Studio's structured generators. Each takes the
 * raw value `useLiveAgentRun` extracted from the stream and either returns the
 * feature's shape or THROWS with a message precise enough to debug from — and
 * "the run produced nothing" vs "the run produced the wrong shape" are
 * different bugs, so they never share a sentence (the `noJson` failure message
 * covers the nothing case at the call site).
 *
 * Pure and side-effect free so they are directly unit-testable (D15 — the
 * research cluster's parsers previously lived inline in JSX with zero tests).
 */

export interface PresentationDeck {
  title?: string;
  theme?: Record<string, unknown>;
  slides?: Array<Record<string, unknown>>;
}

/** Narrow a run result to a renderable `presentation_deck` envelope. */
export function coercePresentationDeck(value: unknown): PresentationDeck {
  const candidate = value as PresentationDeck | null;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !Array.isArray(candidate.slides) ||
    candidate.slides.length === 0
  ) {
    const shape =
      candidate && typeof candidate === "object"
        ? `keys: ${Object.keys(candidate).join(", ") || "(none)"}`
        : `type: ${typeof candidate}`;
    throw new Error(
      `The slides generator returned something that isn't a deck (${shape}). Try again.`,
    );
  }
  return candidate;
}

/** Narrow a run result to a usable `seo_package` value. `title` is the ONE
 *  key the card hard-requires (it names the persisted asset). */
export function coerceSeoPackage(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { title?: unknown }).title !== "string"
  ) {
    throw new Error(
      "The SEO generator didn't return a valid package. Try again.",
    );
  }
  return value as Record<string, unknown>;
}
