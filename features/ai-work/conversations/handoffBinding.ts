// features/ai-work/conversations/handoffBinding.ts
//
// READING THE SEEDED-HANDOFF VERDICT OFF A BINDING.
//
// A conversation may now carry MORE THAN ONE provider binding: lane XT-05's
// `handoff` action mints a second `chat.coding_session` row on the same
// conversation so work can move from one coding tool to another. Until it
// landed, all 4,633 bound conversations in production had exactly one binding
// and one provider, which is why every screen was written as if `bindings[0]`
// were the whole truth.
//
// WHY THE VERDICT IS NOT IN THE `fidelity` COLUMN. That column's CHECK
// constraint is `native | event_mirror`, and for a handed-off session
// `event_mirror` is correct and unchanged — the receiving tool's own hooks
// mirror its turns. What the column cannot say is that this binding's HISTORY
// did not come from the tool now attached to it. The bridge stores that in
// `metadata.handoff` and returns it as `fidelity: "seeded"` on the wire; this
// module is the one reader of it, so no screen has to re-derive it.
//
// Tolerant by construction: every field is optional, an absent key renders as
// an explicit absence, and a row written before this contract simply has no
// handoff record — never a half-rendered one.

import type { Json } from "@/types/database.types";

/** The `matrx-handoff:` prefix the bridge mints for an unclaimed offer. It is
 *  self-describing on purpose: a reader must be able to tell from the value
 *  alone that no provider has produced this session id. */
export const HANDOFF_OFFER_PREFIX = "matrx-handoff:";

export type HandoffState = "offered" | "claimed" | "already_bound";

export interface HandoffRecord {
  /** Where this handoff stands, as the server recorded it. */
  state: HandoffState;
  /** The server's own sentence. Rendered verbatim — never paraphrased into a
   *  claim of native resume, which a seeded handoff can never be. */
  verdict: string | null;
  /** The tool whose work this conversation's history came from. */
  fromProvider: string | null;
  /** That tool's own session id. */
  fromProviderSessionId: string | null;
  /** When the handoff was offered / claimed, as ISO strings. */
  offeredAt: string | null;
  claimedAt: string | null;
  /** Set when the receiving session already had a binding of its own and that
   *  row was MOVED here rather than duplicated. */
  reboundFromConversationId: string | null;
}

function record(value: Json | null): Record<string, Json> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function text(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function state(value: Json | undefined): HandoffState | null {
  return value === "offered" || value === "claimed" || value === "already_bound"
    ? value
    : null;
}

/**
 * The seeded-handoff record on one binding, or null when this binding was not
 * produced by a handoff. A record with an unreadable `state` is treated as
 * absent rather than rendered half-known.
 */
export function handoffRecord(metadata: Json | null): HandoffRecord | null {
  const root = record(metadata);
  const handoff = root ? record(root.handoff ?? null) : null;
  if (!handoff) return null;
  const readState = state(handoff.state);
  if (!readState) return null;
  return {
    state: readState,
    verdict: text(handoff.verdict),
    fromProvider: text(handoff.from_provider),
    fromProviderSessionId: text(handoff.from_provider_session_id),
    offeredAt: text(handoff.offered_at),
    claimedAt: text(handoff.claimed_at),
    reboundFromConversationId: text(handoff.rebound_from_conversation_id),
  };
}

/** True when this binding is an offer no provider session has claimed yet. */
export function isUnclaimedOffer(providerSessionId: string | null): boolean {
  return Boolean(providerSessionId?.startsWith(HANDOFF_OFFER_PREFIX));
}

export interface BindingFidelityVerdict {
  label: string;
  detail: string;
  tone: "native" | "mirror" | "seeded" | "unknown";
}

/**
 * One binding's fidelity verdict, seeded handoffs included.
 *
 * `baseVerdict` is the existing column-only reading
 * (`fidelityVerdict(fidelity)`); this wraps it so a handed-off binding stops
 * being described as a plain event mirror of work it never observed. The
 * seeded wording never contains the word "resume" as a capability — the
 * receiving tool has none of the original session's provider-side state.
 */
export function bindingFidelityVerdict(
  base: { label: string; detail: string; tone: "native" | "mirror" | "unknown" },
  handoff: HandoffRecord | null,
  providerSessionId: string | null,
): BindingFidelityVerdict {
  if (!handoff) return base;
  const from = handoff.fromProvider ?? "another tool";
  if (isUnclaimedOffer(providerSessionId) || handoff.state === "offered") {
    return {
      label: "Seeded handoff offered",
      detail:
        handoff.verdict ??
        `This conversation has been offered to this tool, but no session of its own has picked it up yet. Its history came from ${from}, and a continuation here would be seeded from the stored transcript — never a native resume of that session.`,
      tone: "seeded",
    };
  }
  return {
    label: "Seeded handoff",
    detail:
      handoff.verdict ??
      `This tool continued a conversation whose history came from ${from}. The continuation was seeded from the stored transcript; this tool never had the original session's provider-side state, so it is not a native resume. Turns it produced from here on are mirrored like any other session of this tool.`,
    tone: "seeded",
  };
}
