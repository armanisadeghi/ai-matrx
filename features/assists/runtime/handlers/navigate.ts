/**
 * `navigate` — accepting the assist takes the user to the place where the
 * thing happens (a savior page, a fix surface, a wizard).
 */

import {
  registerAssistAction,
  type AssistActionResult,
} from "../assist-action-registry";

registerAssistAction({
  kind: "navigate",
  description: "Client-side navigate to the assist's href.",
  handler: async (assist, ctx): Promise<AssistActionResult> => {
    if (assist.action.kind !== "navigate") {
      return { ok: false, error: "navigate: wrong action payload" };
    }
    ctx.navigate(assist.action.href);
    return { ok: true, result: { href: assist.action.href } };
  },
});
