/**
 * Cloud Browser — typed shapes.
 *
 * These mirror the FROZEN/DRAFT program contracts so the frontend can be built
 * against fixtures now and swap to real reads at M1/M3 with no shape churn:
 *   - S1 (schema / metadata): browser.profile, browser.run, browser.handoff,
 *     browser.action_event, browser.control_request, browser.account_binding.
 *   - S4 (stream tickets / control leases): the mint envelope + controller state.
 *   - S6 (tool surface): the typed human_required / reason vocabulary.
 *   - NOTIFICATIONS.md (D-14): the four consent channels.
 *   - D-9: the human-visible telemetry surface (unmeasured is a first-class value).
 *
 * Literal string unions are copied verbatim from the contracts — a value not
 * listed here does not exist. Do not widen them locally.
 */

import type { PermissionLevel } from "@/utils/permissions/types";

// ── S1 §2 enums ──────────────────────────────────────────────────────────────

export type ProfileOwnerType = "user" | "organization";
export type ProfileOrgAccessMode = "all_members" | "restricted";
export type ProfileStatus =
  | "active"
  | "suspended"
  | "expired"
  | "deletion_pending"
  | "deleted";
export type CheckpointStatus = "none" | "current" | "stale" | "failed";

export type RunState =
  | "provisioning"
  | "agent_control"
  | "handoff_requested"
  | "human_control"
  | "resume_pending"
  | "stopping"
  | "stopped"
  | "failed"
  | "failed_persistence";

export type RunMode = "handoff_capable" | "automation_only";
export type ExecutionTarget = "browser_fleet" | "sandbox" | "local_surface";
export type ControllerKind = "none" | "agent" | "human" | "system";

/** S1 §2.8 — the human-required enum. One vocabulary, two surfaces (also S6). */
export type HandoffReason =
  | "credentials_missing"
  | "credentials_rejected"
  | "mfa_required"
  | "totp_unavailable"
  | "push_approval_required"
  | "webauthn_required"
  | "captcha_required"
  | "provider_consent_required"
  | "account_selection_required"
  | "sensitive_action_approval"
  | "payment_approval"
  | "destructive_change_approval"
  | "unrecognized_page"
  | "agent_requested"
  | "operator_requested";

export type HandoffState =
  | "requested"
  | "claimed"
  | "returned"
  | "cancelled"
  | "expired";

/** S1 §2.14 — account binding health. */
export type AccountHealthState =
  | "unknown"
  | "healthy"
  | "reauth_soon"
  | "reauth_required"
  | "credentials_rejected"
  | "mfa_required"
  | "locked"
  | "revoked"
  | "provider_policy_blocked"
  | "profile_unavailable";

/** S1 §2.10 — action ledger vocabulary (subset the timeline renders). */
export type ActionEventAction = string;
export type ActionActor = "agent" | "human" | "system";
export type ActionResultClass =
  | "ok"
  | "failed"
  | "timeout"
  | "conflict"
  | "blocked_by_human_control"
  | "refused_by_policy"
  | "suppressed"
  | "cancelled";

/** Platform share level — the canonical permission ladder. Say FULL for `admin` (S1 §2.17). */
export type ShareLevel = PermissionLevel;

// ── S1 §3 rows (safe, frontend-readable projections only) ────────────────────

export interface CloudBrowserProfile {
  id: string;
  ownerType: ProfileOwnerType;
  ownerUserId: string | null;
  organizationId: string | null;
  orgAccessMode: ProfileOrgAccessMode;
  displayName: string;
  isDefault: boolean;
  status: ProfileStatus;
  homeRegion: string;
  /** Safe checkpoint projection — the frontend NEVER reads profile_checkpoint. */
  checkpointStatus: CheckpointStatus;
  currentCheckpointRevision: number;
  currentCheckpointAt: string | null;
  currentCheckpointBytes: number | null;
  chromiumVersion: string | null;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  expiresAt: string | null;
  /** The caller's resolved level on this profile (never active-org-keyed). */
  accessLevel: ShareLevel;
  /** True only for the caller's own personal default. */
  isPersonalDefault: boolean;
}

export interface CloudBrowserRun {
  id: string;
  profileId: string;
  state: RunState;
  mode: RunMode;
  executionTarget: ExecutionTarget;
  controllerKind: ControllerKind;
  controllerUserId: string | null;
  controllerDisplayName: string | null;
  controllerRevision: number;
  /** Safe page facts (S1 §3.3 SAFE PAGE FACTS). */
  currentOrigin: string | null;
  currentUrl: string | null;
  currentTitle: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  errorCode: string | null;
  errorDetailSafe: string | null;
}

/** The agent's live play-by-play — discrete structured progress, NOT a token stream. */
export interface ProgressEvent {
  id: string;
  runId: string;
  sequence: number;
  occurredAt: string;
  actor: ActionActor;
  action: ActionEventAction;
  resultClass: ActionResultClass;
  /** One line of human-readable markdown describing the step. */
  summary: string;
  /** Safe origin/title the step touched (never a page value). */
  origin?: string | null;
}

export interface CloudBrowserHandoff {
  id: string;
  runId: string;
  profileId: string;
  reason: HandoffReason;
  state: HandoffState;
  message: string;
  origin: string | null;
  requestedAt: string;
  expiresAt: string | null;
  /** The agent asked for a NEW login it has no credential for (D-11). */
  captureRequest: CredentialCaptureRequest | null;
  /** What the person did with that card — status only, never a value. */
  captureOutcome: CredentialCaptureOutcome | null;
}

/**
 * ONE field the agent identified on the login form. Field NAMES, labels and
 * selectors only — 🚨 there is deliberately no shape here a credential value
 * could ride in on, in either direction.
 */
export interface CredentialCaptureField {
  fieldKey: string;
  selector: string;
  label: string;
  secret: boolean;
  step: number;
}

/**
 * The D-11 capture card's spec, written by the aidream executor onto
 * `browser.handoff.metadata.capture_request` (`credential_login
 * action="capture"`). Mirrors matrx-extend's `CaptureCredentialRequest`.
 */
export interface CredentialCaptureRequest {
  handoffId: string;
  displayName: string;
  description: string | null;
  providerKey: string | null;
  loginUrl: string;
  host: string;
  submitSelector: string | null;
  uriMatchMode: "host" | "domain" | "exact" | "never";
  branch: "known" | "unknown";
  guidance: string;
  /** The card must never write a vault item past this moment. */
  expiresAt: string;
  fields: CredentialCaptureField[];
}

export interface CredentialCaptureOutcome {
  status: "captured" | "cancelled" | "expired";
  credentialItemId: string | null;
  recordedAt: string | null;
}

export interface AccountBinding {
  id: string;
  profileId: string;
  normalizedOrigin: string;
  accountLabel: string;
  healthState: AccountHealthState;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
}

// ── S4 — stream ticket / control-lease envelope (the mint response) ──────────

export type StreamMode = "control" | "view";

export interface StreamTicketEnvelope {
  /** Masked in UI, memory-only — never rendered raw (S4 §3.3). */
  ticket: string;
  expiresAt: number;
  /** DATA — the client never constructs it (S4 §2.1). */
  endpoint: string;
  protocol: string;
  streamSessionId: string;
  mode: StreamMode;
  control: {
    controlRevision: number;
    leaseExpiresAt: number;
    renewIntervalSeconds: number;
  } | null;
  media: {
    video: boolean;
    audio: boolean;
    clipboard: boolean;
  };
  viewport: { width: number; height: number };
}

/** Who is driving, for the visible controller banner (S4 §5, §9). */
export interface ControllerState {
  kind: ControllerKind;
  displayName: string | null;
  isMe: boolean;
  controlRevision: number;
  /** Present while a takeover stream is live. */
  streamActive: boolean;
  /** A pending "Request control" from another user, if any. */
  pendingRequestFrom?: { userId: string; displayName: string } | null;
}

// ── D-9 telemetry ─────────────────────────────────────────────────────────

/** A single measured (or explicitly unmeasured) number the human can see. */
export interface TelemetryMetric {
  key: string;
  label: string;
  /** null value + measured:false renders as "not yet measured", never as 0. */
  value: number | null;
  unit?: string;
  measured: boolean;
  hint?: string;
}

export interface TelemetrySnapshot {
  capturedAt: string;
  metrics: TelemetryMetric[];
}

// ── D-14 notification consent ────────────────────────────────────────────────

export type NotificationChannel = "browser" | "email" | "sms" | "in_app";

/**
 * The four channels, as the consent surface renders them.
 *
 * 🚨 Every value here is DERIVED from a canonical store — never persisted as an
 * object. `useHandoffNotificationPreferences` composes it; the four switches
 * used to live in `browser.profile.metadata` JSONB, a parallel preference store
 * no other surface and no sender ever read.
 */
export interface NotificationConsent {
  /**
   * The in-app assist. ALWAYS `true` and not togglable — NOTIFICATIONS.md §2:
   * the assist is how the app shows its own pending state, so it is never a
   * preference. It shipped as an off-by-default switch.
   */
  in_app: true;
  /** `users.user_preferences` → `messaging.showDesktopNotifications`. */
  browser: boolean;
  /** Opt-in. `users.user_email_preferences.browser_handoff_notifications`. */
  email: boolean;
  /** Opt-in + enrolment-gated. `sms_notification_preferences.system_alerts`. */
  sms: boolean;
  /** Set once the user has answered the front-and-centre prompt. */
  acknowledgedAt: string | null;
}

// ── Account settings / consent toggles (WS-8 scope) ──────────────────────────

export interface CloudBrowserConsent {
  unattendedLogin: boolean;
  sessionHealthChecks: boolean;
  totpDelegation: boolean;
  /** Always-on floor: sensitive actions still stop for a human. */
  sensitiveActionsRequireHuman: boolean;
}

// ── Quota (profile selector) ─────────────────────────────────────────────────

export interface ProfileQuota {
  liveRuns: number;
  /** REAL and enforced by the control plane: one live run per profile. */
  maxLiveRuns: number;
  /** How many browsers this person has. There is deliberately NO maximum —
   *  D-28, Arman: *"they can have as many as they want."* The field this
   *  replaced (`maxStoredProfiles`) was an inline literal enforced by nothing
   *  and rendered to the user as a cap. Do not add it back; a real cap would be
   *  a `platform.feature_knob`, read at runtime. */
  storedProfiles: number;
}

// ── Screenshot session (D-8 / D-21) ──────────────────────────────────────────

export interface ScreenshotFrame {
  id: string;
  capturedAt: string;
  /** A durable file_id or fixture data-URL — never a persisted signed URL. */
  fileId: string;
  previewUrl: string;
  /** S1 §2.15 — only `redacted` frames are safe to render at any access level. */
  privacyClass: "redacted" | "sensitive" | "operator_only";
}
