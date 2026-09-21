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

// ─────────────────────────────────────────────────────────────────────────────
// THE RENDER SPEC — aidream's, carried whole
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The form a request draws. THE SERVER'S OWN WORD, and note that it is NOT the
 * kind key: the kind is `credential_capture` and the form it renders is
 * `credential` (aidream `services/action_requests/kinds.py`).
 */
export type ActionRequestForm =
  | "approve"
  | "choose_one"
  | "confirm_details"
  | "upload_file"
  | "pick_time"
  | "credential"
  | "browser_takeover"
  | "one_time_code";

/**
 * What EVERY render spec carries. Verified against the live doors on
 * 2026-09-20: a render is exactly `__kind`, `form`, `title`, and whichever of
 * `subtitle` / `footnote` / `note` and the form-specific keys that form builds.
 * It does NOT carry the consequence class, `requires_session` or `can_complete`
 * — those are top-level on the open answer, where they belong, because they are
 * facts about THIS request and this viewer rather than about the form.
 */
interface RenderCommon {
  __kind: "action_request.render";
  form: ActionRequestForm;
  title: string;
  subtitle?: string | null;
  footnote?: string | null;
  note?: string | null;
}

export interface ApproveRender extends RenderCommon {
  form: "approve";
  choices: { value: "yes" | "no"; label: string; tone: "primary" | "ghost" }[];
  consequence_note?: string | null;
}

export interface ChooseOneRender extends RenderCommon {
  form: "choose_one";
  choices: { value: string; label: string; detail?: string | null; tone: "outline" }[];
}

export interface ConfirmDetailsRender extends RenderCommon {
  form: "confirm_details";
  rows: { label: string; value: string; editable: boolean; key: string }[];
  submit_label: string;
}

export interface UploadFileRender extends RenderCommon {
  form: "upload_file";
  accept: string[];
  max_files: number;
  submit_label: string;
}

export interface PickTimeRender extends RenderCommon {
  form: "pick_time";
  /** ISO-8601 instants, in the order the agent offered them. */
  options: string[];
  timezone?: string | null;
  duration_minutes?: number | null;
  submit_label: string;
}

export interface CredentialRender extends RenderCommon {
  form: "credential";
  origin: string;
  site_name: string;
  fields: { key: string; label: string; secret: boolean }[];
  allow_authenticator_secret: boolean;
  submit_label: string;
}

export interface BrowserTakeoverRender extends RenderCommon {
  form: "browser_takeover";
  origin: string;
  site_name: string;
  run_id: string;
  submit_label: string;
  detail?: string | null;
}

export interface OneTimeCodeRender extends RenderCommon {
  form: "one_time_code";
  origin: string;
  submit_label: string;
}

export type ActionRequestRender =
  | ApproveRender
  | ChooseOneRender
  | ConfirmDetailsRender
  | UploadFileRender
  | PickTimeRender
  | CredentialRender
  | BrowserTakeoverRender
  | OneTimeCodeRender;

// ─────────────────────────────────────────────────────────────────────────────
// OPEN
// ─────────────────────────────────────────────────────────────────────────────

/** The request behind a link, ready to be answered. */
export interface ActionRequestReady {
  state: "ready";
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  render: ActionRequestRender;
  organization_id: string;
  subject_user_id: string;
  viewer_is_subject: boolean;
  link_expires_at: string | null;
  session_ttl_minutes: number | null;
  remint_count: number;
  requires_session: boolean;
  bearer_allowed: boolean;
  /**
   * THE WHOLE SESSION DECISION, already made. `false` means: draw the ask and a
   * sign-in, and no form. Never a disabled-looking form — a screen is absent or
   * honest.
   */
  can_complete: boolean;
  /** Present only when `can_complete` is false. The server's own sentence. */
  sign_in_reason?: string;
}

/** A re-tap after success. Not an error: somebody already answered. */
export interface ActionRequestDone {
  state: "done";
  message: string;
  completed_at?: string | null;
  next?: string | null;
  request_id?: string | null;
}

/** A session that belongs to somebody else. Refused BY NAME, never downgraded. */
export interface ActionRequestWrongPerson {
  state: "wrong_person";
  message: string;
}

/**
 * Unknown, expired, withdrawn, superseded — ONE sentence for all four,
 * deliberately, so the link cannot be used to learn that anything is there.
 */
export interface ActionRequestUnavailable {
  state: "unavailable";
  message: string;
}

export type ActionRequestOpen =
  | ActionRequestReady
  | ActionRequestDone
  | ActionRequestWrongPerson
  | ActionRequestUnavailable;

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE
// ─────────────────────────────────────────────────────────────────────────────

/** A refusal with a remedy. Every one of these reaches a person's screen. */
export interface ActionRequestRefusal {
  code: string;
  message: string;
  remedy?: string | null;
}

export type ActionRequestCompleteResult =
  /** The door answered. `answer.state` says what happened. */
  | { outcome: "answer"; answer: ActionRequestOpen }
  /** HTTP 409 — the thing being answered has moved, or the answer was refused. */
  | { outcome: "refused"; refusal: ActionRequestRefusal };

// ─────────────────────────────────────────────────────────────────────────────
// REMINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Text me a new link." The server's own states, verbatim — `too_soon` and
 * `too_many` are rate limits enforced in the database, and each carries the
 * sentence the person reads.
 */
export interface ActionRequestRemint {
  state:
    | "sent"
    | "done"
    | "withdrawn"
    | "superseded"
    | "too_many"
    | "too_soon"
    | "unavailable";
  message: string;
  request_id?: string | null;
}

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
  return `${AIDREAM_PRODUCTION_URL}${path}`;
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
  const response = await fetch(door(ENDPOINTS.actionRequests.open), {
    method: "POST",
    headers: headersFor(accessToken),
    body: JSON.stringify({ token }),
    cache: "no-store",
  });
  if (!response.ok) {
    // NOTHING FAILS SILENTLY. A server that refused is not a dead link, and
    // saying "this link is no longer active" here would tell the person their
    // link is wrong when it is ours that is.
    throw new Error(
      `POST ${ENDPOINTS.actionRequests.open} answered ${response.status}: ${await safeBody(response)}`,
    );
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
  const response = await fetch(door(ENDPOINTS.actionRequests.complete), {
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
  const response = await fetch(door(ENDPOINTS.actionRequests.remint), {
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
    code: body?.code ?? "refused",
    message: body?.message ?? GENERIC_REFUSAL,
    remedy: body?.remedy ?? null,
  };
}

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
