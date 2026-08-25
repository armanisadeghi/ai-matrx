/**
 * Matrx Envelope — reference-fence serializer + reader (the missing authoring
 * primitive named in the backend handoff).
 *
 * ONE in-content encoding for a reference: a ```matrx fence carrying the two-key
 * Kind Directive shell `{"__kind":"directive_v1_reference_<noun>","items":[…]}`.
 * This module is the
 * single FE home for PRODUCING that fence (authoring) and READING it back
 * (round-trip + display) — used by the picklist variable path today, by table /
 * secret authoring later. Never hand-assemble a fence string elsewhere.
 *
 * `readPicklistSelection` normalizes a stored picklist value (fence string, or a
 * multi-select array of fence strings + "Other" free text) into `{refs, otherText,
 * labels}`. The fence is the ONLY encoding — the legacy `picklist_ref` envelope and
 * its `legacyTranslate.ts` dual-read seam were retired 2026-07-08 after every stored
 * value was backfilled to fences.
 */

import {
  type DecodedDirective,
  tryDecodeDirective,
} from "@/features/content-ir/directives/decode";
import { buildDirectiveSlug, buildKindDirective } from "@/features/content-ir/directives/grammar";
import type {
  ReferenceItem,
  ReferenceType,
} from "@/features/matrx-envelope/envelope";

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
 * Serialize a reference directive as the canonical ```matrx fence string
 * (verbatim-persistable). Items are the FLAT canonical shape typed per the
 * reference noun (`structured_list_item`, `table_cell`, …).
 *
 * THE ONE PLACE THE CLIENT MINTS A FENCE. Every copy-shortcut builder in this
 * feature funnels here, so the wire shape is decided once: the two-key Kind
 * Directive shell with `__kind` FIRST
 * (`{"__kind":"directive_v1_reference_<noun>","items":[…]}`). The retired 4-key
 * shell is never emitted again — it is only ever READ, by the decoder's shim.
 *
 * `type` is passed as a NOUN and the slug is BUILT by the grammar, so a fence
 * whose slug could not be parsed back is unmintable: an unknown noun throws
 * here rather than shipping a string nothing can route.
 */
export function buildReferenceFence(args: {
  type: ReferenceType | string;
  items: ReferenceItem[];
}): string {
  const shell = buildKindDirective(
    buildDirectiveSlug("reference", args.type),
    args.items,
  );
  return `${FENCE_OPEN}\n${JSON.stringify(shell, null, 2)}\n${FENCE_CLOSE}`;
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
  return buildReferenceFence({ type: "structured_list_item", items });
}

// ── Parse (round-trip) ───────────────────────────────────────────────────────

/**
 * Every Kind Directive embedded in a host string (each ```matrx fence that
 * decodes). Stored 4-key fences decode here too — that is the decoder's shim
 * doing its one job — so a value saved in 2025 reads back identically.
 */
function extractDirectives(text: string): DecodedDirective[] {
  const out: DecodedDirective[] = [];
  if (!text) return out;

  if (text.includes(FENCE_OPEN)) {
    for (const match of text.matchAll(matrxFenceRe())) {
      const decoded = tryDecodeDirective(tryParseJson(match[1]));
      if (decoded) out.push(decoded);
    }
    return out;
  }

  // Tolerant: a bare shell JSON with no fence wrapper.
  const decoded = tryDecodeDirective(tryParseJson(text.trim()));
  if (decoded) out.push(decoded);
  return out;
}

/**
 * Parse the first `reference` directive from a fence string (with or without
 * the ``` wrapper). Returns `null` when nothing decodes — never throws.
 */
export function parseReferenceFence(
  value: string,
): { directive: DecodedDirective; items: ReferenceItem[] } | null {
  const directive = extractDirectives(value).find(
    (d) => d.directiveClass === "reference",
  );
  if (!directive) return null;
  return { directive, items: directive.items as unknown as ReferenceItem[] };
}

// ── Dual-read (migration bridge) ─────────────────────────────────────────────

export interface PicklistRefRead {
  list_id?: string;
  item_id: string;
  label: string;
}

export interface PicklistSelectionRead {
  /** Ordered picklist-item refs read from the ```matrx fence(s). */
  refs: PicklistRefRead[];
  /** Ordered free-text ("Other") entries that are not picklist items. */
  otherText: string[];
  /** `refs` labels, non-empty — convenience for display. */
  labels: string[];
}

function refsFromItems(items: unknown, into: PicklistRefRead[]): void {
  if (!Array.isArray(items)) return;
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
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
 * Normalize a stored picklist value into `{ refs, otherText, labels }` — a
 * ```matrx reference fence string, or a multi-select array of fence strings +
 * "Other" free-text entries. The single read-site every picklist display /
 * round-trip caller uses.
 */
export function readPicklistSelection(value: unknown): PicklistSelectionRead {
  const refs: PicklistRefRead[] = [];
  const otherText: string[] = [];

  // Multi array: fence-string elements + "Other" free-text strings.
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim()) {
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
    const directives = extractDirectives(value);
    for (const d of directives) {
      if (d.directiveClass === "reference") refsFromItems(d.items, refs);
    }
    if (directives.length === 0) {
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
