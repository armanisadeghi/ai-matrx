/**
 * `server_action` — accepting the assist performs a durable, named domain
 * write on aidream, and the user gets the server's own receipt.
 *
 * WHY THIS KIND EXISTS. Assists doctrine #2 is "See + Act or it doesn't
 * ship": a chip may only exist where the AI can read real state AND take a
 * real action. The other three kinds move the user (`navigate`), pre-fill a
 * conversation (`launch_agent`), or write one value into the current page
 * (`surface_write`) — none of them can make a server-side change in one
 * click. An assist whose entire value IS that change (the first one:
 * "these 250 URLs are your store's checkout links, not pages — reclassify
 * them") had nowhere to land without it.
 *
 * THE ALLOW-LIST IS THE POINT. `platform.assists` rows are written by
 * background producers and live in the database for weeks. If this handler
 * POSTed whatever `endpoint` a row happened to carry, one bad or stale row
 * would become an arbitrary authenticated request against the user's own
 * server. Every endpoint a chip may call is named here, in code, reviewed
 * like any other capability — adding one is a single line.
 */

import {
  registerAssistAction,
  type AssistActionResult,
} from "../assist-action-registry";

/**
 * Bare aidream paths a `server_action` chip may call. Bare, never `/api/...`
 * — `callApi` owns the public prefix, and an aidream router mounted at
 * `/api/...` is a runtime 404 that still appears in the OpenAPI document.
 */
export const ALLOWED_SERVER_ACTION_ENDPOINTS: ReadonlySet<string> = new Set([
  // Machine-endpoint family sweep: accept "these URLs are machine addresses,
  // not pages" and write the site rule. aidream
  // services/endpoint_family_sweep/apply.py.
  "/seo/endpoint-families/apply",
]);

registerAssistAction({
  kind: "server_action",
  description:
    "POST an allow-listed aidream endpoint that performs a durable domain write.",
  handler: async (assist, ctx): Promise<AssistActionResult> => {
    const action = assist.action;
    if (action.kind !== "server_action") {
      return { ok: false, error: "server_action: wrong action payload" };
    }
    if (!ALLOWED_SERVER_ACTION_ENDPOINTS.has(action.endpoint)) {
      // Loud, not silent: a chip pointing somewhere unexpected is either a
      // stale ledger row or something worse, and both are worth seeing.
      return {
        ok: false,
        error: `This action points at an unrecognised address (${action.endpoint}) and was not run.`,
      };
    }
    const outcome = await ctx.callServer(action.endpoint, action.body ?? null);
    if (!outcome.ok) {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, result: outcome.data };
  },
});
