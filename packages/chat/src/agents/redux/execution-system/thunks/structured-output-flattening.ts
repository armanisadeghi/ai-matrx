import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
/**
 * THE FLATTENING DISEASE — detection, in one place.
 *
 * Arman, 2026-09-08, on the mandate page's "Refine with AI": coding agents
 * keep taking a job whose product is a registered `__kind` (a structured
 * shape with its own component, its own parts, its own actions) and running
 * it with `expect: "text"`, then pasting whatever string came back into a
 * textarea. The shape's component never renders, the parts the person needed
 * (a charge, the questions, the criteria) are lost, the back-and-forth the
 * job was designed for is impossible, and the system said NOTHING. "The
 * system cannot function if you take structured responses and spit them out
 * as text — and it should be screaming."
 *
 * This module is the scream's judgment. Two independent signals, both routed
 * through `runHeadlessAgentJson`:
 *
 *  1. DECLARED — the run is a mandate and the mandate declares a structured
 *     `output_kind`. Known BEFORE the model answers; the call site was wrong
 *     the moment it was written.
 *  2. HARVESTED — the run settled with a value carrying `__kind`, whatever
 *     the caller expected. Evidence-based; covers the `agentId` path too.
 *
 * The scream is loud and NON-BLOCKING (`captureError` + `console.error` with
 * the remedy): the run still resolves so the person is not punished for the
 * call site's defect, but the Error Inspector and the console name the file
 * that did it and what to do instead. "Scream, never block."
 */

/**
 * Output kinds that ARE prose. `null` (undeclared) counts as prose because a
 * job that declares nothing has not promised a shape; `"json"` does NOT — it
 * is a promise of structure, and flattening it is the same defect.
 * `"markdown"` is a value the catalogue actually carries and is prose by
 * definition (a text run renders it through the ONE markdown pipeline).
 */
export const PROSE_OUTPUT_KINDS: ReadonlySet<string> = new Set([
  "text",
  "markdown",
]);

/** True when a declared output kind promises a SHAPE, not prose. */
export function isStructuredOutputKind(
  outputKind: string | null | undefined,
): outputKind is string {
  if (typeof outputKind !== "string") return false;
  const trimmed = outputKind.trim();
  if (!trimmed) return false;
  return !PROSE_OUTPUT_KINDS.has(trimmed);
}

/** The `__kind` a harvested value carries, when it is a shape. */
export function harvestedKindOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = (value as Record<string, unknown>).__kind;
  return typeof kind === "string" && kind.trim() ? kind : null;
}

export interface FlatteningVerdict {
  /** Which signal fired. */
  signal: "declared" | "harvested";
  kind: string;
  message: string;
}

/**
 * THE remedy sentence — shared verbatim with the static guard
 * (`scripts/check-flattened-shapes.ts`, `pnpm check:flattened-shapes`) so the
 * console, the Error Inspector and the CI report all say the same thing.
 */
export const FLATTENING_REMEDY =
  "Remedy: do NOT run a shaped job headless-for-text. Give the run a requestId and let the ONE pipeline render it — open the conversation in the agent run window (`useOpenAgentRunWindow` with `mandateKey`, so the person can keep talking) or float it with `useOpenLiveRunWindow`; read the fields you need from the extracted object (`expect: \"json\"` / `selectFirstExtractedObject`), never from the answer string; and if the page must receive one field, declare a surface write target and let the kind component apply it. See features/content-ir/FEATURE.md § No bespoke stream renderers.";

/**
 * Judge a run BEFORE it launches, from what the mandate declares.
 * Returns null when there is nothing to scream about.
 */
export function judgeDeclaredFlattening(args: {
  expect: "json" | "text";
  mandateKey: AnyMandateKey | null | undefined;
  outputKind: string | null | undefined;
  surfaceKey: string;
}): FlatteningVerdict | null {
  if (args.expect !== "text") return null;
  if (!args.mandateKey) return null;
  if (!isStructuredOutputKind(args.outputKind)) return null;
  return {
    signal: "declared",
    kind: args.outputKind,
    message:
      `[flattening] "${args.surfaceKey}" ran mandate "${args.mandateKey}" with expect:"text", but that job declares output_kind "${args.outputKind}" — a registered shape with its own component. The structured answer is being flattened into a string and rendered by hand. ` +
      FLATTENING_REMEDY,
  };
}

/**
 * The prose an answer carries OUTSIDE its embedded structured regions (fenced
 * code blocks and tag-wrapped bodies such as `<artifact>`). An answer that is
 * real prose with a shape embedded in it — the Fact Checker's three markdown
 * sections plus one fenced `fact_check_report` — is a MARKDOWN answer, and
 * asking for it as text is correct: the embedded kind still renders through
 * the one pipeline. Only an answer that IS the shape is flattening.
 */
export function proseOutsideEmbeddedShapes(answerText: string): string {
  const trimmed = answerText.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return ""; // the whole answer is a bare JSON value — the shape itself
    } catch {
      // not a bare JSON answer; measure its prose below
    }
  }
  return answerText
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/<([a-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Below this much surrounding prose, an answer is the shape itself, not prose that embeds one. */
const MIN_PROSE_AROUND_SHAPE = 40;

/**
 * Judge a run AFTER it settled, from what actually came back.
 * Returns null when there is nothing to scream about.
 */
export function judgeHarvestedFlattening(args: {
  expect: "json" | "text";
  harvested: unknown;
  agentRef: string;
  surfaceKey: string;
  /** The answer text, when known: prose around an embedded shape is not flattening. */
  answerText?: string;
}): FlatteningVerdict | null {
  if (args.expect !== "text") return null;
  const kind = harvestedKindOf(args.harvested);
  if (!kind) return null;
  if (
    typeof args.answerText === "string" &&
    proseOutsideEmbeddedShapes(args.answerText).length >= MIN_PROSE_AROUND_SHAPE
  ) {
    return null;
  }
  return {
    signal: "harvested",
    kind,
    message:
      `[flattening] "${args.surfaceKey}" asked "${args.agentRef}" for text, and the answer is a "${kind}" shape. Resolving it as a string discards the kind component, its parts and its actions. ` +
      FLATTENING_REMEDY,
  };
}
