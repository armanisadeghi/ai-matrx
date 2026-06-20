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
  type ReferenceType,
} from "@/features/matrx-envelope/envelope";
import {
  isLegacyPicklistRef,
  translateLegacyPicklistRef,
  translateLegacyReferenceItem,
} from "@/features/matrx-envelope/legacyTranslate";

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
 * (verbatim-persistable). Items are the FLAT canonical shape typed per the
 * reference `type` (`picklist_item`, `table_cell`, …). The four-key shell is fixed.
 */
export function buildReferenceFence(args: {
  type: ReferenceType | string;
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
 * fence carrying N FLAT items (`{ list_id, item_id, label? }`). The model
 * resolves each to the item's hidden description on the wire. There is no
 * `purpose` / `slot` / `ref` / `display` — intent is decided by position; the
 * variable-map key the fence is bound to IS the slot.
 */
export function buildPicklistItemFence(args: {
  listId: string;
  selections: Array<{ itemId: string; label: string }>;
}): string {
  const { listId, selections } = args;
  const items: ReferenceItem[] = selections.map((s) => {
    const item: { list_id: string; item_id: string; label?: string } = {
      list_id: listId,
      item_id: s.itemId,
    };
    if (s.label) item.label = s.label;
    return item as ReferenceItem;
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

function refsFromItems(items: unknown, into: PicklistRefRead[]): void {
  if (!Array.isArray(items)) return;
  for (const raw of items) {
    // Route every item through the loud translation layer — a flat canonical
    // item passes through, a legacy nested item is flattened + screamed once.
    const flat = translateLegacyReferenceItem(raw, "picklist_item");
    if (!flat) continue;
    const o = flat as unknown as Record<string, unknown>;
    const itemId = typeof o.item_id === "string" ? o.item_id : undefined;
    if (!itemId) continue;
    const listId = typeof o.list_id === "string" ? o.list_id : undefined;
    const label = typeof o.label === "string" ? o.label : "";
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

  // Legacy single envelope (loud-translated to flat).
  if (isLegacyPicklistRef(value)) {
    const flat = translateLegacyPicklistRef(value);
    refs.push({ list_id: flat.list_id, item_id: flat.item_id, label: flat.label ?? "" });
    return finalize(refs, otherText);
  }

  // Legacy multi array: envelopes + "Other" free-text strings (tolerate a fence
  // string element too, for any half-migrated value).
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (isLegacyPicklistRef(entry)) {
        const flat = translateLegacyPicklistRef(entry);
        refs.push({ list_id: flat.list_id, item_id: flat.item_id, label: flat.label ?? "" });
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
