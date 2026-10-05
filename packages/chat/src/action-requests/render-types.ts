// packages/chat/src/action-requests/render-types.ts — THE ASK'S RENDER CONTRACT.
//
// What aidream's `open` / `complete` / `remint` doors answer for one
// `platform.action_request`, declared IN FULL so a server change shows up as a
// type error rather than a wrong screen. Types only: the chat's answer form
// (`./components/ActionRequestAnswerForm`) draws them, and the `/q/<token>`
// page's server doors (matrx-frontend `features/action-requests/service.ts`)
// return them.

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
  | "one_time_code"
  | "vault_item"
  | "approve_spend"
  | "questions";

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

/**
 * One typed box on a credential or vault form. `prefill` is what the person
 * already told the agent (a username) — the server carries it on a
 * `secret: false` box only, and the form never prefills a secret box even if
 * one arrives.
 */
export interface CaptureField {
  key: string;
  label: string;
  secret: boolean;
  prefill?: string | null;
}

export interface CredentialRender extends RenderCommon {
  form: "credential";
  origin: string;
  site_name: string;
  fields: CaptureField[];
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
  /**
   * WHERE the code comes from, when the server actually knows. Nothing detects
   * it today, so `unknown` is what arrives and the footnote says "the code this
   * site just asked you for" rather than sending people to an app they may not
   * be using. The page never re-derives this — the sentence is already written.
   */
  challenge_kind: "authenticator_app" | "text_message" | "email" | "unknown";
  /** The challenge's own step, in seconds. What "about thirty seconds" means. */
  period_seconds: number;
}

/**
 * "Save this in your vault" — kind `vault_capture`. A list of fields and
 * nothing else: no origin line and no origin echo, because nothing is being
 * signed into, and no authenticator box, because the kind does not store one.
 */
export interface VaultItemRender extends RenderCommon {
  form: "vault_item";
  fields: CaptureField[];
  submit_label: string;
}

/**
 * "Approve up to $X?" — kind `approve_spend`, minted only by the paid tools'
 * spend gate (aidream `services/action_requests/spend_ask.py`), never by an
 * agent. A NUMBER, not a yes/no: the person may edit the amount before
 * approving, and the result carries it as `approved_amount_usd`. Its
 * consequence class is `money`, so the server answers `can_complete: false`
 * to anyone not signed in as the subject, whatever any knob says — the page
 * draws the sign-in reason instead of this form.
 */
export interface ApproveSpendRender extends RenderCommon {
  form: "approve_spend";
  /** The price-book estimate, full precision (can be under a cent). */
  estimate_usd: number;
  /** The SUGGESTED amount, already rounded to cents by the server. */
  amount_usd: number;
  amount_editable: boolean;
  what_it_buys?: string | null;
  /** The organization's effective guardrail headroom at ask time, when a
   *  guardrail applies. An approval above it is capped, never raised. */
  guardrail_cap_usd?: number | null;
  covers: "provider" | "provider_and_model";
  scope: { tool: string; action: string; site_id?: string | null };
  consequence_note?: string | null;
  choices: { value: "yes" | "no"; label: string; tone: "primary" | "ghost" }[];
}

/**
 * 1–4 questions answered together — the shape the retired client-only `user`
 * tool asked, now stored server-side (aidream `kinds.QuestionsPayload`). The
 * form is the chat package's wizard (`QuestionsAskForm`), on both doors.
 */
export interface QuestionsRender extends RenderCommon {
  form: "questions";
  questions: QuestionSpec[];
  submit_label: string;
}

export interface QuestionSpec {
  type: "confirm" | "choice" | "choice_many" | "text" | "notify";
  question?: string;
  header?: string;
  context?: string;
  options?: { label: string; description?: string; preview?: string }[];
  allow_other?: boolean;
  message?: string;
  actions?: string[];
  level?: "info" | "success" | "warning" | "error";
}

export type ActionRequestRender =
  | QuestionsRender
  | ApproveRender
  | ApproveSpendRender
  | ChooseOneRender
  | ConfirmDetailsRender
  | UploadFileRender
  | PickTimeRender
  | CredentialRender
  | BrowserTakeoverRender
  | OneTimeCodeRender
  | VaultItemRender;

// ─────────────────────────────────────────────────────────────────────────────
// OPEN
// ─────────────────────────────────────────────────────────────────────────────

/** The request behind a link, ready to be answered. */
export interface ActionRequestReady {
  state: "ready";
  id: string;
  kind: string;
  // `payload` is deliberately ABSENT. aidream drops it before answering: the
  // page draws the render spec, and since 2026-09-21 the payload also carries
  // the fencing token that proves a code belongs to the browser hold it was
  // minted for. A token that reaches a browser is a token somebody can forward.
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

/**
 * OUR SIDE COULD NOT ANSWER. Deliberately NOT folded into `unavailable`: that
 * sentence tells the person their link is dead, and on 2026-09-21 it would have
 * been a lie — every signed-in tap of `/q/<token>` was refused by aidream's
 * organization gate (`400 organization_required`) on a link that was perfectly
 * good. A person who is told their link expired re-mints a new one and meets
 * the identical refusal, forever.
 *
 * 🚨 AND IT IS NOT A THROW. A throw here is Next's error boundary, which is an
 * HTTP **500** on a page somebody opened from a text message. The state is
 * carried instead, so the screen says one honest sentence with something to do.
 */
export interface ActionRequestUnreachable {
  state: "unreachable";
  message: string;
}

export type ActionRequestOpen =
  | ActionRequestReady
  | ActionRequestDone
  | ActionRequestWrongPerson
  | ActionRequestUnavailable
  | ActionRequestUnreachable;

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
    /**
     * 🚨 THE RE-MINT RAN AND THE LINK DID NOT REACH A PHONE. Until 2026-09-21
     * the server answered `sent` whatever happened — `notify` creates a row per
     * channel and returns their ids, including rows written
     * `status='skipped' error_code='deep_link_not_live'`, and the page said
     * "New link on its way — check your messages." while nothing was texted.
     * `message` now carries the real reason, verbatim.
     */
    | "not_sent"
    | "done"
    | "withdrawn"
    | "superseded"
    | "too_many"
    | "too_soon"
    | "unavailable";
  message: string;
  /** Channels the message is really on its way through. Empty is honest. */
  channels?: string[];
  /** Every channel that refused, with the server's own reason code. */
  skipped?: { channel: string; reason: string }[];
  request_id?: string | null;
}
