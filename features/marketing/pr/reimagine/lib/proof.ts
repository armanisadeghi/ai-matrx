/**
 * The Proof Ledger readers.
 *
 * `proof_required`, `missing_evidence`, `evidence_refs`, `contradictions`,
 * `facts`, `inferences` and `source_request.requirements` are all `jsonb[]`
 * with NO enforced element shape — the analyzer writes objects, older rows
 * and hand-entered rows write plain strings. A UI that assumed one shape
 * would render blank cells against half the real table, so every reader here
 * is tolerant by design and NEVER throws on an unexpected element.
 *
 * Accepted element shapes (first match wins per field):
 *   string                                     → the label
 *   { label | claim | requirement | title | text | name }   → label
 *   { detail | description | note | why | reason }          → detail
 *   { owner | owner_role | who | assignee }                 → owner
 *   { source | source_label | publisher | outlet }          → source
 *   { url | href | link | source_url }                      → url
 *   { satisfied: bool } | { status: "have"|"satisfied"|"in_hand"|"verified" }
 *
 * Anything unreadable becomes a single honest line rather than disappearing —
 * a silently dropped proof requirement is the one failure this file exists to
 * prevent.
 */

import type { Json } from "@/types/database.types";

export interface ProofItem {
  key: string;
  label: string;
  detail: string | null;
  owner: string | null;
  source: string | null;
  url: string | null;
  satisfied: boolean;
  /** True when the element could not be read as a known shape. */
  raw: boolean;
}

function isRecord(value: Json): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(
  record: { [key: string]: Json },
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

const SATISFIED_WORDS = new Set([
  "have",
  "satisfied",
  "in_hand",
  "in-hand",
  "verified",
  "done",
  "complete",
]);

function readSatisfied(
  record: { [key: string]: Json },
  fallback: boolean,
): boolean {
  const flag = record.satisfied ?? record.have ?? record.is_satisfied;
  if (typeof flag === "boolean") return flag;
  const status = record.status;
  if (typeof status === "string") return SATISFIED_WORDS.has(status.trim());
  return fallback;
}

/**
 * @param value  a `jsonb[]` column straight off the row
 * @param prefix stable key prefix so React keys survive re-order
 * @param defaultSatisfied `evidence_refs` are in hand by definition;
 *        `proof_required` / `missing_evidence` are not.
 */
export function readProofItems(
  value: Json,
  prefix: string,
  defaultSatisfied = false,
): ProofItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((element, index): ProofItem => {
    const key = `${prefix}-${index}`;
    if (typeof element === "string") {
      return {
        key,
        label: element,
        detail: null,
        owner: null,
        source: null,
        url: null,
        satisfied: defaultSatisfied,
        raw: false,
      };
    }
    if (isRecord(element)) {
      const label = pickString(element, [
        "label",
        "claim",
        "requirement",
        "title",
        "text",
        "name",
        "fact",
      ]);
      if (label) {
        return {
          key,
          label,
          detail: pickString(element, [
            "detail",
            "description",
            "note",
            "why",
            "reason",
          ]),
          owner: pickString(element, ["owner", "owner_role", "who", "assignee"]),
          source: pickString(element, [
            "source",
            "source_label",
            "publisher",
            "outlet",
          ]),
          url: pickString(element, ["url", "href", "link", "source_url"]),
          satisfied: readSatisfied(element, defaultSatisfied),
          raw: false,
        };
      }
    }
    // Unknown shape: show it rather than drop it.
    return {
      key,
      label: JSON.stringify(element),
      detail: "Unrecognised record shape — shown verbatim.",
      owner: null,
      source: null,
      url: null,
      satisfied: defaultSatisfied,
      raw: true,
    };
  });
}

export interface ProofLedgerSummary {
  inHand: ProofItem[];
  required: ProofItem[];
  missing: ProofItem[];
  contradictions: ProofItem[];
  /** Requirements met / total. Total 0 means "nothing was demanded yet". */
  met: number;
  total: number;
  /** 0–100. Returns null when nothing was demanded (never render 0%). */
  percent: number | null;
}

export function buildProofLedger(input: {
  id: string;
  evidenceRefs: Json;
  proofRequired: Json;
  missingEvidence: Json;
  contradictions: Json;
}): ProofLedgerSummary {
  const inHand = readProofItems(input.evidenceRefs, `${input.id}-ev`, true);
  const required = readProofItems(input.proofRequired, `${input.id}-req`);
  const missing = readProofItems(input.missingEvidence, `${input.id}-miss`);
  const contradictions = readProofItems(
    input.contradictions,
    `${input.id}-con`,
  );

  // A requirement counts as met when it is flagged satisfied OR no missing
  // item names it. `missing_evidence` is the analyzer's authority on gaps.
  const missingLabels = new Set(
    missing.map((item) => item.label.toLowerCase().trim()),
  );
  const total = required.length;
  const met = required.filter(
    (item) => item.satisfied || !missingLabels.has(item.label.toLowerCase().trim()),
  ).length;

  return {
    inHand,
    required,
    missing,
    contradictions,
    met,
    total,
    percent: total === 0 ? null : Math.round((met / total) * 100),
  };
}
