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
  return (
    pick(presented, "emitted") ??
    // ANY node's last presented result, not just the one the caller named.
    // W33's live check: the caller CAN name the wrong node (a definition's
    // `nodes` array is layout order, so the box was pointed at a mid-graph
    // transform), and a ruling that reached the screen must never be invisible
    // here because of a step-resolution mistake upstream.
    pick(lastResultPayload(emissions), "emitted") ??
    pick(output ?? null, "output")
  );
}

/** The last payload ANY node presented that carries a result key. */
function lastResultPayload(
  emissions: readonly WorkflowRunEmission[],
): Record<string, unknown> | null {
  for (let index = emissions.length - 1; index >= 0; index -= 1) {
    const payload = asRecord(emissions[index].payload);
    if (payload && RESULT_KEYS.some((key) => key in payload)) return payload;
  }
  return null;
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
  const carrier =
    (nodeId ? lastPresentedPayload(emissions, nodeId) : null) ??
    lastResultPayload(emissions) ??
    output ??
    null;
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

/* ────────────────────────────────────────────────────────────────────────────
 * THE PREVIEW LINE — one sentence of the deliverable, for a list of runs.
 *
 * Wall W36 (2026-09-12): a Recent-runs row said "Completed · 4m · $0.21" and
 * nothing else, so choosing which of five runs held the answer meant opening
 * all five. A row that carries the first line of what the run produced is the
 * difference between a log and a record (Linear's issue rows, Vercel's
 * deployment rows — both lead with the content, never only the metadata).
 *
 * The rule is the same one `readPresentedResult` follows: what the run
 * PRESENTED last is what the reader ended on, so that payload is the preview.
 * The three result keys win when they are there; otherwise the first readable
 * sentence in the payload does, identifiers and machine keys skipped — never a
 * JSON dump, and never an invented summary.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Keys that carry machinery, never something a person reads as an answer. */
const UNREADABLE_KEY = /(^_|^__|_id$|^id$|_ids$|^ids$|_key$|^key$|^kind$|slug|^status$|^usage$|^cost|^model$|^order$|_at$)/i;

/** A string only counts as a preview when it reads as a sentence, not a flag. */
const MIN_PREVIEW_CHARS = 24;

/**
 * The keys a payload puts its ANSWER under. Searched before anything else, so
 * a deliverable whose first field happens to be a list of rule names previews
 * as its finding rather than as "No Petting the Raging Child" (run cef6ae07,
 * where `stop_doing[0].rule_name` sits four keys above `headline_finding`).
 */
const ANSWER_KEY =
  /(headline|finding|summary|verdict|conclusion|answer|advice|ruling|words|letter|^value$|^text$|^body$|^message$|^content$|^markdown$|first_thing)/i;

function firstAnswerString(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstAnswerString(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  // This level's own answer key wins over anything nested below it.
  for (const [key, child] of Object.entries(record)) {
    if (!ANSWER_KEY.test(key)) continue;
    const text = firstReadableString(child, depth + 1);
    if (text) return text;
  }
  for (const [key, child] of Object.entries(record)) {
    if (UNREADABLE_KEY.test(key)) continue;
    const found = firstAnswerString(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function firstReadableString(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length >= MIN_PREVIEW_CHARS ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstReadableString(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const [key, child] of Object.entries(record)) {
    if (UNREADABLE_KEY.test(key)) continue;
    const found = firstReadableString(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Collapse to ONE line, cut on a word boundary, ellipsis only when cut. */
export function previewLine(text: string, maxLength = 140): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLength) return oneLine;
  const cut = oneLine.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The first line of what a run handed over, from the payload its terminal step
 * presented (or its stored output). `null` when the payload carries nothing a
 * person would read — a row then says what it knows and no more, rather than
 * printing keys or JSON at a reader.
 */
export function presentedPreview(
  payload: unknown,
  maxLength = 140,
): string | null {
  const record = asRecord(payload);
  const viaResultKey = pick(record, "emitted")?.text ?? null;
  const text =
    viaResultKey ?? firstAnswerString(record) ?? firstReadableString(record);
  return text === null ? null : previewLine(text, maxLength);
}
