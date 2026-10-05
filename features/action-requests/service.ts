import "server-only";

// features/action-requests/service.ts — THE `/q/<token>` PAGE'S ONLY DATA ACCESS.
//
// `platform.action_request` is the primitive behind one sentence: an agent asks
// the person it works for for ONE thing, that person gets a text with a one-tap
// link, they answer on a tiny page, and the agent's parked turn resumes by
// itself. This module is the app's whole half of it — three doors, all
// server-lane, and nothing else anywhere in the repo touches them.
//
// WHY THE SERVER IS THE CALLER, AND NOT THE BROWSER.
// --------------------------------------------------
// The three doors live on aidream's PUBLIC router, so a browser could reach
// them. It must not, for one reason: the `Authorization: Bearer <supabase
// access token>` header is the ONLY thing that separates a signed-in completion
// from a bearer one. aidream reads the person from its OWN validated token and
// refuses to take a user id from a body — there is no `viewer_user_id` field on
// any of these requests and there never may be. Forwarding that header is
// therefore a decision about identity, and a decision about identity belongs on
// the lane that holds the session cookie, not in a client bundle that can be
// edited by whoever is looking at it.
//
// 🚨 WHEN THERE IS A SESSION WE FORWARD IT; WHEN THERE IS NOT WE FORWARD
// NOTHING. Not an empty string, not `Bearer null`. aidream's anonymous context
// is precisely the state a link tapped from a text arrives in, and a malformed
// header would turn that into a refusal the person cannot act on.
//
// WHAT THIS MODULE DOES NOT DO. It does not decide what the page draws. `open`
// answers a WHOLE render spec — `render` — computed by aidream's kind registry,
// and `can_complete`, which is the entire session decision resolved against the
// kind's consequence class and the organization's own knob. Re-deriving either
// one from `kind` in TypeScript would be a second copy of that registry, and
// the day the two disagreed the disagreement would be a credential page that
// let somebody in. Every result type below is declared IN FULL so a server
// change shows up here as a type error rather than as a wrong screen.

import { AIDREAM_PRODUCTION_URL, ENDPOINTS } from "@/lib/api/endpoints";
import type {
  ActionRequestCompleteResult,
  ActionRequestOpen,
  ActionRequestRefusal,
  ActionRequestRemint,
} from "@ai-matrx/chat/action-requests/render-types";
import {
  buildMatrxRequestUrl,
  extractMatrxErrorCode,
  sendMatrxRequest,
} from "@ai-matrx/agents/matrx";

// The render spec and result types live with the ask in the chat package
// (`@ai-matrx/chat/action-requests/render-types`); these doors return them.


// ─────────────────────────────────────────────────────────────────────────────
// THE THREE DOORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `AIDREAM_PRODUCTION_URL` is THE ONE NAME for the aidream origin
 * (`lib/api/endpoints.ts`). A second variable name for this value — or a `??`
 * chain over one — is the failure that cost a verifier most of a round on
 * 2026-08-27; an env var is a VALUE, never a TOGGLE, and a new one fails
 * silently in production.
 */
function door(path: string): string {
  return buildMatrxRequestUrl(AIDREAM_PRODUCTION_URL, path);
}

function headersFor(accessToken: string | null): HeadersInit {
  const base: Record<string, string> = { "content-type": "application/json" };
  // 🚨 NOTHING WHEN THERE IS NOTHING. An `Authorization` header built from an
  // absent session is how a link-lane visitor becomes a refused one.
  if (accessToken) base.Authorization = `Bearer ${accessToken}`;
  return base;
}

/**
 * What the page draws. MUTATES NOTHING — a link preview, a carrier scanner and
 * a mail gateway can all fetch it and the row does not move.
 *
 * It is a POST and it is still a safe read: a token in a URL is a token in this
 * server's access log and in every proxy between here and it.
 */
export async function openActionRequest(
  token: string,
  accessToken: string | null,
): Promise<ActionRequestOpen> {
  const response = await sendMatrxRequest(door(ENDPOINTS.actionRequests.open), {
    method: "POST",
    headers: headersFor(accessToken),
    body: JSON.stringify({ token }),
    cache: "no-store",
  });
  if (!response.ok) {
    // NOTHING FAILS SILENTLY — and nothing 500s either. The server console gets
    // the whole refusal; the person gets one sentence and a way to try again.
    // A throw here renders Next's error boundary with a 500 status, which is
    // what a person tapping a link from a text actually met on 2026-09-21.
    console.error(
      `[/q] POST ${ENDPOINTS.actionRequests.open} answered ${response.status}: ${await safeBody(response)}`,
    );
    return { state: "unreachable", message: UNREACHABLE_SENTENCE };
  }
  return (await response.json()) as ActionRequestOpen;
}

/**
 * The answer. `field_values` (a credential kind's typed values) travels INSTEAD
 * of `result`, never beside it.
 *
 * `origin` is what the page believes it is signing into, echoed back for a
 * second check against the server-derived origin on the row. It is advisory:
 * the row's value is the authority.
 */
export async function completeActionRequest(args: {
  token: string;
  accessToken: string | null;
  result?: Record<string, unknown> | null;
  fieldValues?: Record<string, string> | null;
  authenticatorSecret?: string | null;
  origin?: string | null;
}): Promise<ActionRequestCompleteResult> {
  const response = await sendMatrxRequest(door(ENDPOINTS.actionRequests.complete), {
    method: "POST",
    headers: headersFor(args.accessToken),
    body: JSON.stringify({
      token: args.token,
      ...(args.result ? { result: args.result } : {}),
      ...(args.fieldValues ? { field_values: args.fieldValues } : {}),
      ...(args.authenticatorSecret
        ? { authenticator_secret: args.authenticatorSecret }
        : {}),
      ...(args.origin ? { origin: args.origin } : {}),
    }),
    cache: "no-store",
  });

  if (response.status === 409) {
    return { outcome: "refused", refusal: await refusalFrom(response) };
  }
  if (!response.ok) {
    throw new Error(
      `POST ${ENDPOINTS.actionRequests.complete} answered ${response.status}: ${await safeBody(response)}`,
    );
  }
  return { outcome: "answer", answer: (await response.json()) as ActionRequestOpen };
}

/**
 * "Text me a new link." No sign-in and no agent turn — the parked call is
 * untouched, so the agent on the other end never learns a link was re-sent.
 */
export async function remintActionRequest(
  token: string,
  accessToken: string | null,
): Promise<ActionRequestRemint> {
  const response = await sendMatrxRequest(door(ENDPOINTS.actionRequests.remint), {
    method: "POST",
    headers: headersFor(accessToken),
    body: JSON.stringify({ token }),
    cache: "no-store",
  });
  if (response.status === 409) {
    return { state: "unavailable", message: (await refusalFrom(response)).message };
  }
  if (!response.ok) {
    throw new Error(
      `POST ${ENDPOINTS.actionRequests.remint} answered ${response.status}: ${await safeBody(response)}`,
    );
  }
  return (await response.json()) as ActionRequestRemint;
}

/**
 * A 409's body, read as aidream actually sends it.
 *
 * 🚨 IT IS FLAT, NOT NESTED UNDER `detail`. The routers raise
 * `HTTPException(409, detail={code, message, remedy})`, but aidream's own
 * `register_error_handlers` unwraps that detail before it reaches the wire, so
 * what arrives is `{code, message, user_message, remedy, error, request_id}`.
 * Verified against the live door on 2026-09-20; reading `detail.message` here
 * returned nothing and printed the generic sentence over the real one, which is
 * exactly the failure "carry the server's sentences verbatim" exists to stop.
 */
async function refusalFrom(response: Response): Promise<ActionRequestRefusal> {
  const body = (await response.json().catch(() => null)) as Partial<
    ActionRequestRefusal
  > | null;
  return {
    code: extractMatrxErrorCode(body) ?? "refused",
    message: body?.message ?? GENERIC_REFUSAL,
    remedy: body?.remedy ?? null,
  };
}

/**
 * The one sentence for "our side could not answer". It says the link is FINE,
 * because it is: the failure is ours. Never "this link is no longer active".
 */
export const UNREACHABLE_SENTENCE =
  "We could not reach your agent just now. Your link is still good — try again in a moment.";

/** The one sentence for a refusal that arrived without one of its own. */
const GENERIC_REFUSAL =
  "That could not be recorded, and the server did not say why. Nothing changed, so trying again is safe.";

async function safeBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "<unreadable body>";
  }
}
