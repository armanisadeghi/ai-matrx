/**
 * `apply_keyword_meaning` — the human APPROVES an agent's proposal about what a
 * keyword means to a site, and the proposal is replayed through the ordinary
 * human write path.
 *
 * P12 (Arman, 2026-08-22): "an agent can make all the suggestions they want,
 * but when the system runs again the next day, the new agent is not going to
 * see the suggestions that have not been approved." Until this handler runs,
 * the proposal exists ONLY as this ledger row — no matcher, no worth row, no
 * stamp, no guidelines text. That is what makes the rule structural rather
 * than a convention someone has to remember.
 *
 * Rejection needs no handler: `dismissAssist(assist, note)` already records the
 * reason durably, and `seo.keyword_meaning_suggest` refuses any payload whose
 * hash a human already decided — so a rejected suggestion is never re-proposed
 * verbatim, the same rule the rejected keyword edges use.
 *
 * IT OPENS NO NEW WRITE PATH — see `suggestions/apply.ts` for the routing table.
 */

import { applyKeywordMeaningProposal } from "@/features/marketing/seo/value-system/suggestions/apply";
import {
  registerAssistAction,
  type AssistActionResult,
} from "../assist-action-registry";

registerAssistAction({
  kind: "apply_keyword_meaning",
  description:
    "Approve an agent's keyword-meaning proposal (matcher / worth / stamp / guidelines) by replaying it through the ordinary human write path.",
  handler: async (assist): Promise<AssistActionResult> => {
    const action = assist.action;
    if (action.kind !== "apply_keyword_meaning") {
      return { ok: false, error: "apply_keyword_meaning: wrong action payload" };
    }
    try {
      const outcome = await applyKeywordMeaningProposal(
        action.siteId,
        action.proposal,
      );
      return {
        ok: true,
        result: {
          receipt: outcome.receipt,
          proposal: action.proposal.proposal,
          payload_hash: action.payloadHash,
          ...outcome.detail,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not apply this suggestion.",
      };
    }
  },
});
