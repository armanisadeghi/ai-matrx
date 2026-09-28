/**
 * How the AI gets a Source — THE one source of truth for delivery.
 *
 * The frozen contract (`SourceRef.delivery`, `@ai-matrx/agents/sources`) has
 * two values and a default: absent / "direct" = the text is handed to the AI
 * with the request; "context" = nothing is sent up front and the AI opens the
 * Source while it works. The server (aidream `source_resolution.py`) reads
 * exactly this field and nothing else — `promote` / `exclude` are NOT read on
 * the Source path.
 *
 * Every screen that shows or changes delivery (the Source card, "Review what
 * goes in", the planner) reads it through `sourceDelivery` and says it with
 * `DELIVERY_WORDS`, so a card can never say one thing while the review and the
 * request say another (V1-A: the card said "Nothing is copied in" — chat's
 * attachment editor's wording — while the review said "Include the text" and
 * the request carried the text).
 */

import type { SourceRef } from "@ai-matrx/agents/sources";

export type SourceDelivery = "direct" | "context";

/** The delivery a pointer asks for — absent means the contract default, "direct". */
export function sourceDelivery(ref: Pick<SourceRef, "delivery"> | null | undefined): SourceDelivery {
  return ref?.delivery === "context" ? "context" : "direct";
}

/**
 * The patch that sets a delivery. "direct" is the default, so it clears the
 * field (the wire stays minimal, exactly as the review has always written it).
 * Looking a Source up sends no text, so parts and a size limit no longer apply.
 */
export function deliveryPatch(
  delivery: SourceDelivery,
): Pick<SourceRef, "delivery" | "include_segments" | "max_chars"> {
  return delivery === "context"
    ? { delivery: "context", include_segments: undefined, max_chars: undefined }
    : { delivery: undefined };
}

export interface DeliveryWords {
  /** The choice's name on a control. */
  label: string;
  /** One sentence under the control: what happens, in plain words. */
  hint: string;
  /** The short phrase a summary line uses. */
  summary: string;
}

export const DELIVERY_WORDS: Record<SourceDelivery, DeliveryWords> = {
  direct: {
    label: "Include the text",
    hint: "The text is handed to the AI with your request, so it reads all of it before it starts.",
    summary: "Text included",
  },
  context: {
    label: "Let the AI look it up",
    hint: "Nothing is sent up front. The AI opens this Source and reads the parts it needs while it works — best for very large Sources.",
    summary: "Looked up when needed",
  },
};

/** The choices, in the order every control shows them. */
export const DELIVERY_CHOICES: ReadonlyArray<{ value: SourceDelivery } & DeliveryWords> = (
  ["direct", "context"] as const
).map((value) => ({ value, ...DELIVERY_WORDS[value] }));
