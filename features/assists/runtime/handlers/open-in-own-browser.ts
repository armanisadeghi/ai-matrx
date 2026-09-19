/**
 * `open_in_own_browser` — accepting the assist hands this workspace's queued
 * pages to the person's own signed-in Chrome, through the Matrx extension.
 *
 * The handler stays thin on purpose: the whole capability is one bound context
 * call (`ctx.handToOwnBrowser`), exactly like `navigate` is one `ctx.navigate`.
 * The bridge itself lives in `lib/extension-bridge/handToOwnBrowser.ts`.
 *
 * 🚨 NOT HAVING THE EXTENSION IS NOT A FAILURE. It is the normal state of a
 * browser that has never added it, and the remedy is one click. Returning
 * `ok: false` would toast it in the runner's red failure path and capture it as
 * an error, which would be this screen telling a person something is broken
 * when nothing is. It comes back `ok: true` carrying the outcome, and the card
 * says what to do next.
 */

import {
  registerAssistAction,
  type AssistActionResult,
} from "../assist-action-registry";

registerAssistAction({
  kind: "open_in_own_browser",
  description:
    "Hand the organization's queued capture pages to the person's own Chrome via the Matrx extension.",
  handler: async (assist, ctx): Promise<AssistActionResult> => {
    if (assist.action.kind !== "open_in_own_browser") {
      return { ok: false, error: "open_in_own_browser: wrong action payload" };
    }
    const outcome = await ctx.handToOwnBrowser({
      organizationId: assist.action.organizationId,
      handoffId: assist.action.handoffId,
      url: assist.action.url,
    });

    if (outcome.kind === "refused") {
      // A real refusal — not signed in over there, not a member of this
      // workspace, or the extension went away mid-call. Its own sentence is
      // written for a person; the runner surfaces it.
      return { ok: false, error: outcome.sentence };
    }

    return { ok: true, result: outcome };
  },
});
