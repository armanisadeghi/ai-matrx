/**
 * Matrx Envelope — reference-fence serializer + reader (the missing authoring
 * primitive named in the backend handoff).
 *
 * ONE in-content encoding for a reference: a ```matrx fenced envelope with
 * `kind:"reference"` (see docs/protocol/MATRX_REFERENCES.md). This module is the
 * single FE home for PRODUCING that fence (authoring) and READING it back
 * (round-trip + display) — used by the picklist variable path today, by table /
 * secret authoring later. Never hand-assemble a fence string elsewhere.
 *
 * `readPicklistSelection` is the dual-read bridge for the migration: it accepts
 * BOTH the new ```matrx fence string AND the legacy `picklist_ref` envelope
 * (object or array) so already-saved values keep rendering until the backend
 * drops the parallel-encoding allowlist.
 */

import {
  MATRX_VERSION,
  isMatrxEnvelope,
  type MatrxEnvelope,
  type ReferenceItem,
} from "@/features/matrx-envelope/envelope";
import {
  isPicklistRef,
  type PicklistRefEnvelope,
} from "@/features/agents/types/agent-definition.types";

const FENCE_OPEN = "```matrx";
const FENCE_CLOSE = "```";

/**
 * Fresh global regex each call — a shared global regex carries `lastIndex`
 * state that would corrupt interleaved `matchAll` / `replace` calls.
 */
const matrxFenceRe = (): RegExp => /```matrx[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Build (authoring) ────────────────────────────────────────────────────────

/**
 * Serialize a `kind:"reference"` envelope as the canonical ```matrx fence string
 * (verbatim-persistable). Items are typed per the reference `type`
 * (`picklist_item`, `dataset_cell`, …). The four-key shell is fixed.
 */
export function buildReferenceFence(args: {
  type: string;
  items: ReferenceItem[];
}): string {
  const envelope: MatrxEnvelope<ReferenceItem> = {
    matrx_version: MATRX_VERSION,
    kind: "reference",
    type: args.type,
    items: args.items,
  };
  return `${FENCE_OPEN}\n${JSON.stringify(envelope, null, 2)}\n${FENCE_CLOSE}`;
}

/**
 * Convenience builder for a picklist selection: one `picklist_item` reference
 * fence carrying N items (`ref:{ list_id, item_id }`, `display:{ label }`).
 * `purpose` is always `substitute` (the model resolves it to the item's hidden
 * description on the wire). `slot` is the optional `{{slot}}` it fills.
 */
export function buildPicklistItemFence(args: {
  listId: string;
  slot?: string;
  selections: Array<{ itemId: string; label: string }>;
}): string {
  const { listId, slot, selections } = args;
  const items: ReferenceItem[] = selections.map((s) => {
    const item: ReferenceItem = {
      purpose: "substitute",
      ref: { list_id: listId, item_id: s.itemId },
    };
    if (slot) item.slot = slot;
    if (s.label) item.display = { label: s.label };
    return item;
  });
  return buildReferenceFence({ type: "picklist_item", items });
}

// ── Parse (round-trip) ───────────────────────────────────────────────────────

/** Every Matrx envelope embedded in a host string (each ```matrx fence that parses). */
function extractMatrxEnvelopes(text: string): MatrxEnvelope[] {
  const out: MatrxEnvelope[] = [];
  if (!text) return out;

  if (text.includes(FENCE_OPEN)) {
    for (const match of text.matchAll(matrxFenceRe())) {
      const parsed = tryParseJson(match[1]);
      if (parsed && isMatrxEnvelope(parsed)) out.push(parsed);
    }
    return out;
  }

  // Tolerant: a bare envelope JSON with no fence wrapper.
  const parsed = tryParseJson(text.trim());
  if (parsed && isMatrxEnvelope(parsed)) out.push(parsed);
  return out;
}

/**
 * Parse the first `reference` envelope from a fence string (with or without the
 * ``` wrapper). Returns `null` when nothing parses — never throws.
 */
export function parseReferenceFence(
  value: string,
): { envelope: MatrxEnvelope; items: ReferenceItem[] } | null {
  const envelope = extractMatrxEnvelopes(value).find(
    (e) => e.kind === "reference",
  );
  if (!envelope) return null;
  const items = Array.isArray(envelope.items)
    ? (envelope.items as unknown as ReferenceItem[])
    : [];
  return { envelope, items };
}

// ── Dual-read (migration bridge) ─────────────────────────────────────────────

export interface PicklistRefRead {
  list_id?: string;
  item_id: string;
  label: string;
}

export interface PicklistSelectionRead {
  /** Ordered picklist-item refs (from a fence OR a legacy `picklist_ref`). */
  refs: PicklistRefRead[];
  /** Ordered free-text ("Other") entries that are not picklist items. */
  otherText: string[];
  /** `refs` labels, non-empty — convenience for display. */
  labels: string[];
}

function refFromEnvelope(env: PicklistRefEnvelope): PicklistRefRead {
  return { list_id: env.list_id, item_id: env.list_item_id, label: env.label };
}

function refsFromItems(items: unknown, into: PicklistRefRead[]): void {
  if (!Array.isArray(items)) return;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as ReferenceItem;
    const ref = item.ref as Record<string, unknown> | undefined;
    const itemId =
      ref && typeof ref.item_id === "string" ? ref.item_id : undefined;
    if (!itemId) continue;
    const listId =
      ref && typeof ref.list_id === "string" ? ref.list_id : undefined;
    const label =
      item.display && typeof item.display.label === "string"
        ? item.display.label
        : "";
    into.push({ list_id: listId, item_id: itemId, label });
  }
}

function finalize(
  refs: PicklistRefRead[],
  otherText: string[],
): PicklistSelectionRead {
  return { refs, otherText, labels: refs.map((r) => r.label).filter(Boolean) };
}

/**
 * Normalize a stored picklist value into `{ refs, otherText, labels }`, reading
 * BOTH the new ```matrx reference fence string AND the legacy `picklist_ref`
 * envelope (single object or multi array). The single bridge every picklist
 * display / round-trip read-site calls during the migration.
 */
export function readPicklistSelection(value: unknown): PicklistSelectionRead {
  const refs: PicklistRefRead[] = [];
  const otherText: string[] = [];

  // Legacy single envelope.
  if (isPicklistRef(value)) {
    refs.push(refFromEnvelope(value));
    return finalize(refs, otherText);
  }

  // Legacy multi array: envelopes + "Other" free-text strings (tolerate a fence
  // string element too, for any half-migrated value).
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (isPicklistRef(entry)) {
        refs.push(refFromEnvelope(entry));
      } else if (typeof entry === "string" && entry.trim()) {
        const sub = readPicklistSelection(entry);
        if (sub.refs.length) {
          refs.push(...sub.refs);
          otherText.push(...sub.otherText);
        } else {
          otherText.push(entry.trim());
        }
      }
    }
    return finalize(refs, otherText);
  }

  // New string form: zero+ ```matrx fences with residual "Other" lines, OR pure
  // free text with no fence.
  if (typeof value === "string" && value.trim()) {
    const envelopes = extractMatrxEnvelopes(value);
    for (const env of envelopes) {
      if (env.kind === "reference") refsFromItems(env.items, refs);
    }
    if (envelopes.length === 0) {
      otherText.push(value.trim()); // pure free text — preserve as one entry
    } else {
      const residual = value.replace(matrxFenceRe(), "").trim();
      for (const line of residual.split("\n")) {
        const t = line.trim();
        if (t) otherText.push(t);
      }
    }
    return finalize(refs, otherText);
  }

  return finalize(refs, otherText);
}
