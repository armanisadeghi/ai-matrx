/**
 * openRequest — THE one place an "open this in the canvas" request is allowed
 * to end without the canvas showing it.
 *
 * Why this file exists (live defect, production chat route, 2026-09-14):
 * a reviewer asked the chat agent to create a markdown document and *"open it
 * as a document artifact in the canvas"*. The agent said «Created and opened
 * as a document artifact: Canvas Hijack Check». Nothing opened. No canvas tab
 * by that name ever existed and no failure was ever shown — the screen simply
 * carried on showing what it had been showing.
 *
 * The class this closes is NOT that one tool. It is the shape every
 * open-in-canvas call site shared: a bare `return` when the request could not
 * be honoured. Missing content, an unknown type, an artifact that never
 * persisted, a route where the canvas is not reachable at all — each one was a
 * different function quietly doing nothing.
 *
 * LAW 4 — nothing fails silently: *every stand-in announces itself with a
 * remedy; a screen is absent or honest, never dead.* So a dropped request is
 * never a bare `return`. It is `return reportCanvasOpenDrop({...})`, which
 * says what was asked for, why it cannot be shown, and what to do instead —
 * and which feeds the admin Error Inspector through `lib/toast`'s
 * `toast.error` capture, so a drop nobody reports is still on the record.
 *
 * The helper returns `false` so a guard reads as one line:
 *
 *   if (!canvasType) return reportCanvasOpenDrop({ reason: "no-content" });
 */

import { toast } from "@/lib/toast";

export type CanvasOpenDropReason =
  /** No canvas surface is mounted on this route (or one is suppressing it). */
  | "canvas-unavailable"
  /** The caller had nothing to show — no type, no data, no target. */
  | "no-content"
  /** A type the canvas has no renderer for. */
  | "unknown-type"
  /** The artifact could not be saved, so there is no id to open by pointer. */
  | "not-persisted"
  /** A toggle/switch request naming something the canvas does not hold. */
  | "nothing-to-show";

export interface CanvasOpenDrop {
  reason: CanvasOpenDropReason;
  /** What the person asked to see, in their words ("Canvas Hijack Check"). */
  requested?: string | null;
  /** Machine detail for the record — an id, a type, a persistence error. */
  detail?: string | null;
}

const COPY: Record<
  CanvasOpenDropReason,
  { headline: string; remedy: string }
> = {
  "canvas-unavailable": {
    headline: "The canvas isn't available on this screen",
    remedy:
      "Open it from a chat or an artifact page — this view has no canvas to show it in.",
  },
  "no-content": {
    headline: "There was nothing to open in the canvas",
    remedy:
      "The content never arrived. Re-run the step that produced it, or open the item from its own page.",
  },
  "unknown-type": {
    headline: "The canvas can't display that kind of item",
    remedy: "Open it from its own page instead, or report this type.",
  },
  "not-persisted": {
    headline: "Canvas requires a saved artifact",
    remedy: "The artifact could not be saved, so there is nothing to open yet.",
  },
  "nothing-to-show": {
    headline: "Nothing to show in the canvas yet",
    remedy: "Create or attach something first, then open the canvas.",
  },
};

/**
 * `CanvasContent.metadata.title` is deliberately `string | ReactNode`. A drop
 * report only ever needs the plain-string half, and it must NOT reach for
 * `CanvasBody`'s `titleToString` to get it — that module is the whole renderer
 * graph and this one is imported by the cheap always-mounted hooks.
 */
export function titleForDrop(title: unknown): string | null {
  return typeof title === "string" && title.trim() ? title : null;
}

/** Build the sentence a person reads. Exported so guards can assert on it. */
export function canvasOpenDropMessage(drop: CanvasOpenDrop): {
  headline: string;
  description: string;
} {
  const copy = COPY[drop.reason];
  const named = drop.requested?.trim();
  const headline = named ? `${copy.headline}: "${named}"` : copy.headline;
  const description = drop.detail?.trim()
    ? `${copy.remedy} (${drop.detail.trim()})`
    : copy.remedy;
  return { headline, description };
}

/**
 * Announce a dropped open-in-canvas request. ALWAYS returns `false` so a call
 * site can `return reportCanvasOpenDrop(...)` in place of a silent `return`.
 */
export function reportCanvasOpenDrop(drop: CanvasOpenDrop): false {
  const { headline, description } = canvasOpenDropMessage(drop);
  toast.error(headline, { description });
  return false;
}
