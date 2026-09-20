/**
 * `approval_proposal` — a row waiting in THE platform approval queue
 * (`features/approvals/`).
 *
 * 🚨 THIS HANDLER APPLIES NOTHING, ON PURPOSE. Every other assist action
 * executes the change from the chip; this one cannot, because the review body
 * (the Gmail card, the cell diff) is what the person is authorizing, and
 * approving from a collapsed chip with that body off screen would defeat the
 * review. So accepting takes them to the queue, with this row named.
 *
 * The producer policy for the `approval.` prefix also keeps
 * `presentation_enabled` false, so these rows do not compete for the ambient
 * chip slots at all (`migrations/platform_approval_queue.sql` §3). This handler
 * is the honest answer for the paths that reach an assist directly anyway — the
 * manager, a deep link, a history view.
 */

import {
  registerAssistAction,
  type AssistActionResult,
} from "../assist-action-registry";

registerAssistAction({
  kind: "approval_proposal",
  description:
    "Open THE approval queue at this proposal. Never applies the change — the queue's review body is the authorization.",
  handler: async (assist, ctx): Promise<AssistActionResult> => {
    if (assist.action.kind !== "approval_proposal") {
      return { ok: false, error: "approval_proposal: wrong action payload" };
    }
    const href = `/approvals?item=${encodeURIComponent(assist.id)}`;
    ctx.navigate(href);
    return { ok: true, result: { href, applied: false } };
  },
});
