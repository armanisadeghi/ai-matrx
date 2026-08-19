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
export const TENSION_LABELS: Record<TensionKind, string> = {
  contradiction: "Two rules disagree",
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
export type TensionState = "open" | (typeof SETTLED_STATES)[number];

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
  recommendation: string;
  confidence: number;
  state: TensionState;
  detected_at: string;
  rulebook_version: number;
  /** The Expert's own words when they settled it — never a rewrite. */
  answer?: string;
  answered_at?: string;
  conversation_id?: string;
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
    state: (SETTLED_STATES as readonly string[]).includes(String(rec.state))
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
 * The questions still waiting, most confident first.
 *
 * A tension whose rules no longer all exist is dropped — the Expert resolved it
 * by editing, and asking about a rule that is gone is worse than asking nothing.
 * Same rule as the server's `open_tensions`, deliberately duplicated rather than
 * fetched, because the page already holds the Rulebook.
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

export function settledTensions(
  rulebook: Pick<Rulebook, "metadata">,
): Tension[] {
  return allTensions(rulebook).filter((t) => t.state !== "open");
}
