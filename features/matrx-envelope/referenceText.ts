/**
 * Matrx Envelope — plain-text ↔ fence helpers for surfaces that carry PROSE
 * with embedded ```matrx fences but do NOT run the markdown pipeline
 * (direct messages, notifications, list previews, tooltips).
 *
 * The markdown pipeline (content-splitter-v2 → BlockRenderer → MatrxEnvelopeBlock)
 * already does this for chat/agent content. These helpers are the lightweight
 * equivalent for a raw string:
 *
 *   splitMatrxFences(text)   → ordered [text | envelope] segments (render with
 *                              `<TextWithReferences>`, never hand-rolled)
 *   summarizeMatrxText(text) → a one-line plain-text summary with each fence
 *                              collapsed to its human label ("Note: Hosting")
 *   buildFencesFromAttachments(refs) → the fence string(s) an authoring surface
 *                              appends to a message it is about to send
 *
 * Fail-safe by the protocol rule (docs/protocol/MATRX_REFERENCES.md): the gate
 * is `matrx_version` presence; anything that does not parse stays verbatim text.
 */

import {
  isMatrxEnvelope,
  type MatrxEnvelope,
  type ReferenceItem,
} from "@/features/matrx-envelope/envelope";
import { buildReferenceFence } from "@/features/matrx-envelope/referenceFence";
import {
  referenceCellSummary,
  referenceTypeLabel,
} from "@/features/scopes/utils/referenceCell";

/** Fresh global regex each call — a shared one carries `lastIndex` state. */
const matrxFenceRe = (): RegExp => /```matrx[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

export type MatrxTextSegment =
  | { kind: "text"; text: string }
  | { kind: "envelope"; envelope: MatrxEnvelope };

function tryParseEnvelope(raw: string): MatrxEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isMatrxEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Split a plain-text string into ordered text / envelope segments. A ```matrx
 * fence whose body is not a valid envelope is kept as literal text (never
 * dropped, never thrown) — same fail-safe contract as MatrxEnvelopeBlock.
 */
export function splitMatrxFences(text: string): MatrxTextSegment[] {
  if (!text) return [];
  if (!text.includes("```matrx")) return [{ kind: "text", text }];

  const segments: MatrxTextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(matrxFenceRe())) {
    const start = match.index ?? 0;
    const envelope = tryParseEnvelope(match[1] ?? "");
    if (!envelope) continue; // leave the raw fence inside the surrounding text
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({ kind: "envelope", envelope });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}

/** True when the string carries at least one parseable ```matrx envelope. */
export function hasMatrxFence(text: string | null | undefined): boolean {
  if (!text) return false;
  return splitMatrxFences(text).some((s) => s.kind === "envelope");
}

function envelopeSummary(envelope: MatrxEnvelope): string {
  const type = String(envelope.type);
  const items = Array.isArray(envelope.items)
    ? (envelope.items as unknown as ReferenceItem[])
    : [];
  if (envelope.kind !== "reference" || items.length === 0) {
    return `${referenceTypeLabel(type)}`;
  }
  return referenceCellSummary({ type, items });
}

/**
 * One-line plain-text summary of prose + fences, for the surfaces that CANNOT
 * render JSX (conversation-list previews, notification titles, search hits).
 * Each fence collapses to its display label — never raw envelope JSON.
 */
export function summarizeMatrxText(text: string | null | undefined): string {
  if (!text) return "";
  return splitMatrxFences(text)
    .map((s) => (s.kind === "text" ? s.text : envelopeSummary(s.envelope)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Authoring ────────────────────────────────────────────────────────────────

/** One picked reference, before it is serialized into a fence. */
export interface AttachedReference {
  type: string;
  item: ReferenceItem;
}

/**
 * Serialize picked references into canonical fences — one fence per `type`
 * (the envelope carries a single `type`), in first-pick order. This is what an
 * authoring surface appends to the message body so the user never types, sees,
 * or pastes envelope JSON.
 */
export function buildFencesFromAttachments(
  refs: AttachedReference[],
): string {
  if (refs.length === 0) return "";
  const order: string[] = [];
  const byType = new Map<string, ReferenceItem[]>();
  for (const ref of refs) {
    const existing = byType.get(ref.type);
    if (existing) {
      existing.push(ref.item);
    } else {
      order.push(ref.type);
      byType.set(ref.type, [ref.item]);
    }
  }
  return order
    .map((type) =>
      buildReferenceFence({ type, items: byType.get(type) ?? [] }),
    )
    .join("\n");
}

/** Message body + attached references, joined the canonical way. */
export function composeTextWithAttachments(
  text: string,
  refs: AttachedReference[],
): string {
  const fences = buildFencesFromAttachments(refs);
  const body = text.trim();
  if (!fences) return body;
  return body ? `${body}\n${fences}` : fences;
}
