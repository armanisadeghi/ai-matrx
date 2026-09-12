/**
 * THE PRESENTED RESULT of a run's terminal step.
 *
 * ── THE DEFECT THIS CLOSES (Expert Book Challenge wall W33, 2026-09-12) ────
 * A surface that wants "what did this run actually produce" reached for the
 * terminal node's STORED output (`node_completed.output`) and nothing else.
 * That is the wrong place whenever the terminal step is `output.to_frontend`.
 *
 * The engine's to_frontend node, by design, EMITS the presented shape as a
 * `node_emitted` event and then returns its INPUT unchanged as its output, so
 * routing downstream is unaffected (aidream
 * `packages/matrx-graph/matrx_graph/nodes/output/to_frontend.py`). A desk
 * whose final step restructures its inputs into `{ruling, verdict_pack}`
 * therefore has a ruling on the wire and no ruling in `output`.
 *
 * Live proof: Verification Desk run cdd2eb12-60a0-4d74-8e88-da38e94e257a
 * completed with `ruling.verdict = "NOT REAL"` in its emitted payload, while
 * every reader of the stored output saw nothing and offered the Expert no
 * Audition door.
 *
 * So: the PRESENTED payload wins, the stored output is the fallback, and the
 * three recognised result keys stay exactly what they were. Pure module — no
 * React, no Redux; the emissions it reads are the ones the run adapter already
 * folds from live SSE and from durable replay alike.
 */

import type { WorkflowRunEmission } from "@/features/workflow-runtime/redux/workflow-runs.slice";

/**
 * The keys a terminal step declares its work under. `deliverable` when the
 * work is separable from the reasoning (generate), `ruling` when they are one
 * document (edit); `report` is the pre-2026-08-26 key, still read so older
 * runs keep their door.
 */
export const RESULT_KEYS = ["deliverable", "ruling", "report"] as const;
export type ResultKey = (typeof RESULT_KEYS)[number];

/**
 * How an object-shaped result becomes the text a reader (or the Audition)
 * judges — the ruling's own verdict, then its headline, then its reasoning,
 * in that order, because that is the order a person reads a ruling in.
 * Nothing else is invented: a shape carrying none of these is NOT presentable
 * as text and says so rather than dumping JSON at the reader.
 */
const TEXT_FIELDS = [
  "verdict",
  "headline",
  "reasoning",
  "text",
  "content",
  "body",
  "markdown",
  "summary",
] as const;

export interface PresentedResult {
  /** Which of the three keys carried it. */
  key: ResultKey;
  /** The value exactly as the step produced it — string OR object. */
  value: unknown;
  /** That value as text, for surfaces that need one (the Audition candidate). */
  text: string;
  /** Where it was read from. `emitted` = the presented payload. */
  source: "emitted" | "output";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The presentable text of one result value, or null when there is none. */
export function resultText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  const record = asRecord(value);
  if (!record) return null;
  const parts: string[] = [];
  for (const field of TEXT_FIELDS) {
    const part = record[field];
    if (typeof part === "string" && part.trim()) parts.push(part.trim());
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function pick(
  carrier: Record<string, unknown> | null,
  source: PresentedResult["source"],
): PresentedResult | null {
  if (!carrier) return null;
  for (const key of RESULT_KEYS) {
    if (!(key in carrier)) continue;
    const text = resultText(carrier[key]);
    if (text === null) continue;
    return { key, value: carrier[key], text, source };
  }
  return null;
}

/**
 * The LAST payload the given node presented — the one on screen. Later
 * emissions supersede earlier ones (a node that emits twice is showing its
 * second thought), so this walks backwards.
 */
export function lastPresentedPayload(
  emissions: readonly WorkflowRunEmission[],
  nodeId: string,
): Record<string, unknown> | null {
  for (let index = emissions.length - 1; index >= 0; index -= 1) {
    const emission = emissions[index];
    if (emission.nodeId !== nodeId) continue;
    const payload = asRecord(emission.payload);
    if (payload) return payload;
  }
  return null;
}

/**
 * What the terminal step actually handed the reader: the PRESENTED payload
 * first, the stored output second, null when neither carries a result key.
 */
export function readPresentedResult(args: {
  nodeId: string | null | undefined;
  emissions: readonly WorkflowRunEmission[];
  output: Record<string, unknown> | null | undefined;
}): PresentedResult | null {
  const { nodeId, emissions, output } = args;
  const presented = nodeId ? lastPresentedPayload(emissions, nodeId) : null;
  return pick(presented, "emitted") ?? pick(output ?? null, "output");
}

/**
 * WHY there is nothing to judge — said out loud, never swallowed and never
 * replaced by a filler sentence about where runs land. One honest line, naming
 * the specific reason, for a run that is over and produced no readable result.
 */
export function absentResultReason(args: {
  nodeId: string | null | undefined;
  emissions: readonly WorkflowRunEmission[];
  output: Record<string, unknown> | null | undefined;
}): string {
  const { nodeId, emissions, output } = args;
  const presented = nodeId ? lastPresentedPayload(emissions, nodeId) : null;
  const carrier = presented ?? output ?? null;
  if (!carrier) {
    return "This run's final step recorded nothing, so there is nothing for the Audition to judge.";
  }
  const present = RESULT_KEYS.filter((key) => key in carrier);
  if (present.length > 0) {
    return `This run's final step returned ${present.join(" and ")} with no readable text in it, so there is nothing for the Audition to judge.`;
  }
  const keys = Object.keys(carrier).slice(0, 4);
  return keys.length > 0
    ? `This Masterwork's final step returned no ruling, deliverable or report — it returned ${keys.join(", ")} — so there is nothing for the Audition to judge yet.`
    : "This Masterwork's final step returned no ruling, deliverable or report, so there is nothing for the Audition to judge yet.";
}
