// features/masterwork/coherence/types.ts
//
// THE COHERENCE PARTNER, client side — the questions only the Expert can settle.
//
// Cures D11 · UNPARTNERED CAPTURE (common-docs/operations/agent-failure-diseases.md).
// Arman, 2026-08-19: "why didn't these get caught in the previous step? … there was
// no one working with me in the previous step. It's like this very basic setup where
// there is no room for proper conversation."
//
// The server half is aidream `services/distillation/coherence.py`; the vocabulary,
// the states and the storage key below MIRROR it and must stay byte-identical.
// Nothing here writes a rule — a tension is a QUESTION, and the Expert's answer to
// it is what changes a rule, through the normal review verbs.

import type { Rulebook } from "../types";

/** The closed vocabulary. Mirrors `coherence.TENSION_KINDS`. */
export const TENSION_KINDS = ["contradiction", "vagueness", "overlap"] as const;
export type TensionKind = (typeof TENSION_KINDS)[number];

/** How it reads to the Expert, in their language. Never the machine's word. */
/**
 * 🚨 `contradiction` reads as "Two positions", never "Two rules disagree"
 * (2026-09-12, Arman's expertise mandate). Dissent is an asset the system is
 * built to RETAIN, not a defect queue: the old wording framed the Expert's own
 * divergence as a problem on their page, one line above buttons that could
 * settle it. The card's outcome for it keeps both rules and records the
 * condition between them.
 */
export const TENSION_LABELS: Record<TensionKind, string> = {
  contradiction: "Two positions",
  vagueness: "A rule leaves a number open",
  overlap: "Two rules cover the same ground",
};

/**
 * Final outcomes. Mirrors `coherence.SETTLED_STATES`. All three mean the same
 * thing operationally: never ask this again.
 * - `answered`  — they settled it, and their words are kept verbatim.
 * - `accepted`  — "both are right" / "it depends", with nothing more to add.
 * - `dismissed` — "that isn't a real problem."
 */
export const SETTLED_STATES = ["answered", "accepted", "dismissed"] as const;

/**
 * Closed because the rules it is ABOUT were removed — not settled (nobody
 * answered it), but just as final. Mirrors `coherence.MOOT_STATE`: every
 * rule-removing server write closes the tensions it orphans this way.
 *
 * Why it exists (2026-09-12, Rulebook "Montessori Parenting Adviser"): a repair
 * removed 123 duplicate rules and four open questions were left pointing at
 * ids that no longer existed. This card could not show them; the page header
 * counted them anyway and told the Expert four questions were waiting.
 */
export const MOOT_STATE = "moot";

/** Every final state: settled by the Expert, or moot. Never asked again. */
export const CLOSED_STATES = [...SETTLED_STATES, MOOT_STATE] as const;
export type TensionState =
  | "open"
  | (typeof SETTLED_STATES)[number]
  | typeof MOOT_STATE;

export interface Tension {
  id: string;
  kind: TensionKind;
  /** Ids of the Expert's own rules this is about — always real, gated server-side. */
  rule_ids: string[];
  /** ONE plain-language sentence, answerable in one sentence. */
  question: string;
  /** ONE sentence on what goes wrong downstream if nobody settles it. */
  why: string;
  /** 2-4 concrete answers they can just pick. */
  options: string[];
  /**
   * The partner's own suggestion. 🚨 NEVER rendered on a `contradiction`: on
   * that kind it reads as "keep this one", which is the consensus collapse the
   * mandate forbids. `contradictionGuidance` is what that kind shows instead.
   */
  recommendation: string;
  confidence: number;
  state: TensionState;
  detected_at: string;
  rulebook_version: number;
  /** The Expert's own words when they settled it — never a rewrite. */
  answer?: string;
  answered_at?: string;
  conversation_id?: string;
  /** Set only with `state: "moot"` — names the rules that went and the write. */
  moot_reason?: string;
  moot_at?: string;
}

/** `platform.rulebook.metadata.coherence` — derived, disposable, never `rules`. */
const METADATA_KEY = "coherence";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseTension(raw: unknown): Tension | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const kind = String(rec.kind ?? "");
  const ruleIds = Array.isArray(rec.rule_ids)
    ? rec.rule_ids.filter((r): r is string => typeof r === "string" && r.length > 0)
    : [];
  const question = typeof rec.question === "string" ? rec.question.trim() : "";
  if (!TENSION_KINDS.includes(kind as TensionKind) || !ruleIds.length || !question) {
    return null;
  }
  return {
    id: String(rec.id ?? ""),
    kind: kind as TensionKind,
    rule_ids: ruleIds,
    question,
    why: typeof rec.why === "string" ? rec.why : "",
    options: Array.isArray(rec.options)
      ? rec.options.filter((o): o is string => typeof o === "string" && o.length > 0)
      : [],
    recommendation: typeof rec.recommendation === "string" ? rec.recommendation : "",
    confidence: typeof rec.confidence === "number" ? rec.confidence : 0,
    state: (CLOSED_STATES as readonly string[]).includes(String(rec.state))
      ? (rec.state as TensionState)
      : "open",
    detected_at: typeof rec.detected_at === "string" ? rec.detected_at : "",
    rulebook_version:
      typeof rec.rulebook_version === "number" ? rec.rulebook_version : 0,
    ...(typeof rec.answer === "string" ? { answer: rec.answer } : {}),
    ...(typeof rec.answered_at === "string" ? { answered_at: rec.answered_at } : {}),
    ...(typeof rec.conversation_id === "string"
      ? { conversation_id: rec.conversation_id }
      : {}),
    ...(typeof rec.moot_reason === "string"
      ? { moot_reason: rec.moot_reason }
      : {}),
    ...(typeof rec.moot_at === "string" ? { moot_at: rec.moot_at } : {}),
  };
}

/** Every tension on the Rulebook, open and settled. Tolerant read. */
export function allTensions(rulebook: Pick<Rulebook, "metadata">): Tension[] {
  const block = asRecord(asRecord(rulebook.metadata)?.[METADATA_KEY]);
  const raw = block?.tensions;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = parseTension(entry);
    return parsed ? [parsed] : [];
  });
}

/**
 * 🚨 THE ONE PREDICATE for "an open question" on the client, most confident
 * first — what the panel lists AND what any headline may count. Mirrors the
 * server's `coherence.askable_tensions`, deliberately duplicated rather than
 * fetched because the page already holds the Rulebook.
 *
 * A question is open when it is `state: "open"` AND every rule it is about is
 * still live. Never count `state === "open"` anywhere else: on 2026-09-12
 * `journey.ts` did exactly that and printed "4 questions only you can settle
 * are still open." one line above this panel showing none of them, because a
 * repair had removed the rules those four were about.
 *
 * A retired rule is dropped here rather than closed server-side on purpose —
 * un-retiring is one click, and the question comes back with it.
 */
export function openTensions(
  rulebook: Pick<Rulebook, "metadata" | "rules">,
): Tension[] {
  const liveIds = new Set(
    rulebook.rules.filter((rule) => !rule.retired).map((rule) => rule.id),
  );
  return allTensions(rulebook)
    .filter(
      (t) => t.state === "open" && t.rule_ids.every((id) => liveIds.has(id)),
    )
    .sort((a, b) => b.confidence - a.confidence);
}

/** How many open questions there are. THE number a headline prints. */
export function openTensionCount(
  rulebook: Pick<Rulebook, "metadata" | "rules">,
): number {
  return openTensions(rulebook).length;
}

/**
 * The ones the EXPERT ruled on — never the moot ones. Nobody answered those,
 * and counting a machine's bookkeeping as "you already settled this" would put
 * words in her mouth. Mirrors the server's `settled_tensions`.
 */
export function settledTensions(
  rulebook: Pick<Rulebook, "metadata">,
): Tension[] {
  return allTensions(rulebook).filter((t) =>
    (SETTLED_STATES as readonly string[]).includes(t.state),
  );
}

/** Closed because their rules were removed. Kept for the Record, never asked. */
export function mootTensions(
  rulebook: Pick<Rulebook, "metadata">,
): Tension[] {
  return allTensions(rulebook).filter((t) => t.state === MOOT_STATE);
}

/**
 * What a `contradiction` shows in place of a recommendation: what the Expert's
 * answer DOES, never which rule to keep. Both positions survive either way.
 */
export const CONTRADICTION_GUIDANCE =
  "Both of these can stand. If they apply in different situations, say when " +
  "each one applies — we keep both rules and record the line between them.";
