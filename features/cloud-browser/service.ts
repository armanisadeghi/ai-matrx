/** Live Cloud Browser data and control-plane client. */
import { getJson, postJson } from "@/lib/python-client";
import { supabase } from "@/utils/supabase/client";
import { getResourceAccess } from "@/utils/permissions/access";
import type { Database, Json } from "@/types/database.types";
import type {
  AccountBinding,
  AccountHealthState,
  ActionActor,
  ActionResultClass,
  CheckpointStatus,
  CloudBrowserConsent,
  CloudBrowserHandoff,
  CloudBrowserProfile,
  CloudBrowserRun,
  ControllerKind,
  ControllerState,
  ExecutionTarget,
  HandoffReason,
  HandoffState,
  NotificationConsent,
  ProfileOrgAccessMode,
  ProfileOwnerType,
  ProfileQuota,
  ProfileStatus,
  ProgressEvent,
  RunMode,
  RunState,
  ScreenshotFrame,
  StreamMode,
  StreamTicketEnvelope,
  TelemetrySnapshot,
} from "./types";

type ProfileRow = Database["browser"]["Tables"]["profile"]["Row"];
type RunRow = Database["browser"]["Tables"]["run"]["Row"];
type EventRow = Database["browser"]["Tables"]["action_event"]["Row"];
type HandoffRow = Database["browser"]["Tables"]["handoff"]["Row"];
type BindingRow = Database["browser"]["Tables"]["account_binding"]["Row"];
const LIVE_STATES = [
  "provisioning",
  "agent_control",
  "handoff_requested",
  "human_control",
  "resume_pending",
  "stopping",
] as const;
const DEFAULT_CONSENT: CloudBrowserConsent = {
  unattendedLogin: false,
  sessionHealthChecks: false,
  totpDelegation: false,
  sensitiveActionsRequireHuman: true,
};
const DEFAULT_NOTIFICATIONS: NotificationConsent = {
  browser: true,
  email: false,
  sms: false,
  in_app: false,
  acknowledgedAt: null,
};

export interface CloudBrowserSnapshot {
  activeProfileId: string;
  profiles: CloudBrowserProfile[];
  quotas: Record<string, ProfileQuota>;
  run: CloudBrowserRun | null;
  progress: ProgressEvent[];
  handoff: CloudBrowserHandoff | null;
  controller: ControllerState;
  bindings: AccountBinding[];
  telemetry: TelemetrySnapshot;
  consent: CloudBrowserConsent;
  notificationConsent: NotificationConsent;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("The Cloud Browser server returned an invalid response.");
  return Object.fromEntries(Object.entries(value));
}
function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string")
    throw new Error(`Cloud Browser response is missing ${field}.`);
  return value;
}
function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number")
    throw new Error(`Cloud Browser response is missing ${field}.`);
  return value;
}
function jsonObject(value: Json): Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
function profileOwnerType(value: string): ProfileOwnerType {
  if (value === "user" || value === "organization") return value;
  throw new Error(`Unknown browser profile owner type: ${value}`);
}
function profileOrgAccessMode(value: string): ProfileOrgAccessMode {
  if (value === "all_members" || value === "restricted") return value;
  throw new Error(`Unknown browser profile access mode: ${value}`);
}
function profileStatus(value: string): ProfileStatus {
  if (
    value === "active" ||
    value === "suspended" ||
    value === "expired" ||
    value === "deletion_pending" ||
    value === "deleted"
  )
    return value;
  throw new Error(`Unknown browser profile status: ${value}`);
}
function checkpointStatus(value: string): CheckpointStatus {
  if (
    value === "none" ||
    value === "current" ||
    value === "stale" ||
    value === "failed"
  )
    return value;
  throw new Error(`Unknown browser checkpoint status: ${value}`);
}
function runState(value: string): RunState {
  if (
    value === "provisioning" ||
    value === "agent_control" ||
    value === "handoff_requested" ||
    value === "human_control" ||
    value === "resume_pending" ||
    value === "stopping" ||
    value === "stopped" ||
    value === "failed" ||
    value === "failed_persistence"
  )
    return value;
  throw new Error(`Unknown browser run state: ${value}`);
}
function runMode(value: string): RunMode {
  if (value === "handoff_capable" || value === "automation_only") return value;
  throw new Error(`Unknown browser run mode: ${value}`);
}
function executionTarget(value: string): ExecutionTarget {
  if (
    value === "browser_fleet" ||
    value === "sandbox" ||
    value === "local_surface"
  )
    return value;
  throw new Error(`Unknown browser execution target: ${value}`);
}
function controllerKind(value: string): ControllerKind {
  if (
    value === "none" ||
    value === "agent" ||
    value === "human" ||
    value === "system"
  )
    return value;
  throw new Error(`Unknown browser controller: ${value}`);
}
function actionActor(value: string): ActionActor {
  if (value === "agent" || value === "human" || value === "system")
    return value;
  throw new Error(`Unknown browser action actor: ${value}`);
}
function actionResultClass(value: string): ActionResultClass {
  if (
    value === "ok" ||
    value === "failed" ||
    value === "timeout" ||
    value === "conflict" ||
    value === "blocked_by_human_control" ||
    value === "refused_by_policy" ||
    value === "suppressed" ||
    value === "cancelled"
  )
    return value;
  throw new Error(`Unknown browser action result: ${value}`);
}
function handoffReason(value: string): HandoffReason {
  if (
    value === "credentials_missing" ||
    value === "credentials_rejected" ||
    value === "mfa_required" ||
    value === "totp_unavailable" ||
    value === "push_approval_required" ||
    value === "webauthn_required" ||
    value === "captcha_required" ||
    value === "provider_consent_required" ||
    value === "account_selection_required" ||
    value === "sensitive_action_approval" ||
    value === "payment_approval" ||
    value === "destructive_change_approval" ||
    value === "unrecognized_page" ||
    value === "agent_requested" ||
    value === "operator_requested"
  )
    return value;
  throw new Error(`Unknown browser handoff reason: ${value}`);
}
function handoffState(value: string): HandoffState {
  if (
    value === "requested" ||
    value === "claimed" ||
    value === "returned" ||
    value === "cancelled" ||
    value === "expired"
  )
    return value;
  if (value === "returning") return "claimed";
  throw new Error(`Unknown browser handoff state: ${value}`);
}
function accountHealthState(value: string): AccountHealthState {
  if (
    value === "unknown" ||
    value === "healthy" ||
    value === "reauth_soon" ||
    value === "reauth_required" ||
    value === "credentials_rejected" ||
    value === "mfa_required" ||
    value === "locked" ||
    value === "revoked" ||
    value === "provider_policy_blocked" ||
    value === "profile_unavailable"
  )
    return value;
  throw new Error(`Unknown browser account health: ${value}`);
}
function cloudBrowserConsent(value: Json | undefined): CloudBrowserConsent {
  const item = jsonObject(value ?? {});
  return {
    unattendedLogin:
      typeof item.unattendedLogin === "boolean"
        ? item.unattendedLogin
        : DEFAULT_CONSENT.unattendedLogin,
    sessionHealthChecks:
      typeof item.sessionHealthChecks === "boolean"
        ? item.sessionHealthChecks
        : DEFAULT_CONSENT.sessionHealthChecks,
    totpDelegation:
      typeof item.totpDelegation === "boolean"
        ? item.totpDelegation
        : DEFAULT_CONSENT.totpDelegation,
    sensitiveActionsRequireHuman:
      typeof item.sensitiveActionsRequireHuman === "boolean"
        ? item.sensitiveActionsRequireHuman
        : DEFAULT_CONSENT.sensitiveActionsRequireHuman,
  };
}
function notificationConsent(value: Json | undefined): NotificationConsent {
  const item = jsonObject(value ?? {});
  return {
    browser:
      typeof item.browser === "boolean"
        ? item.browser
        : DEFAULT_NOTIFICATIONS.browser,
    email:
      typeof item.email === "boolean"
        ? item.email
        : DEFAULT_NOTIFICATIONS.email,
    sms: typeof item.sms === "boolean" ? item.sms : DEFAULT_NOTIFICATIONS.sms,
    in_app:
      typeof item.in_app === "boolean"
        ? item.in_app
        : DEFAULT_NOTIFICATIONS.in_app,
    acknowledgedAt:
      typeof item.acknowledgedAt === "string" ? item.acknowledgedAt : null,
  };
}
function mapProfile(
  row: ProfileRow,
  userId: string,
  accessLevel: CloudBrowserProfile["accessLevel"],
): CloudBrowserProfile {
  const mine = row.owner_user_id === userId;
  return {
    id: row.id,
    ownerType: profileOwnerType(row.owner_type),
    ownerUserId: row.owner_user_id,
    organizationId: row.organization_id,
    orgAccessMode: profileOrgAccessMode(row.org_access_mode),
    displayName: row.display_name,
    isDefault: row.is_default,
    status: profileStatus(row.status),
    homeRegion: row.home_region,
    checkpointStatus: checkpointStatus(row.checkpoint_status),
    currentCheckpointRevision: row.current_checkpoint_revision,
    currentCheckpointAt: row.current_checkpoint_at,
    currentCheckpointBytes: row.current_checkpoint_bytes,
    chromiumVersion: row.chromium_version,
    lastStartedAt: row.last_started_at,
    lastStoppedAt: row.last_stopped_at,
    expiresAt: row.expires_at,
    accessLevel,
    isPersonalDefault: mine && row.owner_type === "user" && row.is_default,
  };
}
function mapRun(row: RunRow): CloudBrowserRun {
  return {
    id: row.id,
    profileId: row.profile_id,
    state: runState(row.state),
    mode: runMode(row.mode),
    executionTarget: executionTarget(row.execution_target),
    controllerKind: controllerKind(row.controller_kind),
    controllerUserId: row.controller_user_id,
    controllerDisplayName: null,
    controllerRevision: row.controller_revision,
    currentOrigin: row.current_origin,
    currentUrl: row.current_url,
    currentTitle: null,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    errorCode: row.error_code,
    errorDetailSafe: row.error_detail_safe,
  };
}
function mapEvent(row: EventRow): ProgressEvent {
  return {
    id: row.id,
    runId: row.run_id,
    sequence: row.sequence,
    occurredAt: row.occurred_at,
    actor: actionActor(row.actor),
    action: row.action,
    resultClass: actionResultClass(row.result_class),
    summary: row.target_description
      ? `${row.action}: ${row.target_description}`
      : row.action,
    origin: row.origin,
  };
}
function mapHandoff(row: HandoffRow): CloudBrowserHandoff {
  return {
    id: row.id,
    runId: row.run_id,
    profileId: row.profile_id,
    reason: handoffReason(row.reason),
    state: handoffState(row.state),
    message:
      row.instructions_safe ??
      "The browser needs your input before it can continue.",
    origin: row.origin,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
  };
}
function mapBinding(row: BindingRow): AccountBinding {
  return {
    id: row.id,
    profileId: row.profile_id,
    normalizedOrigin: row.normalized_origin,
    accountLabel: row.account_label ?? row.account_key,
    healthState: accountHealthState(row.health_state),
    nextCheckAt: row.next_check_at,
    lastCheckedAt: row.last_checked_at,
  };
}
async function userId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw error ?? new Error("Sign in to use Cloud Browser.");
  return data.user.id;
}
async function startRun(profileId?: string): Promise<string> {
  const { data } = await postJson<unknown>("/browser-manager/runs", {
    profile_id: profileId || null,
    mode: "handoff_capable",
    execution_target: "browser_fleet",
    activation_key: crypto.randomUUID(),
  });
  return requiredText(record(record(data).run).run_id, "run id");
}

export async function listProfiles(): Promise<CloudBrowserProfile[]> {
  const me = await userId();
  const { data, error } = await supabase
    .schema("browser")
    .from("profile")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return Promise.all(
    data.map(async (row) => {
      const access = await getResourceAccess("browser_profile", row.id);
      const level =
        access.level === "admin"
          ? "admin"
          : access.level === "edit"
            ? "editor"
            : "viewer";
      return mapProfile(row, me, level);
    }),
  );
}

export async function loadSnapshot(
  requestedProfileId = "",
): Promise<CloudBrowserSnapshot> {
  const me = await userId();
  let profiles = await listProfiles();
  let selected =
    profiles.find((item) => item.id === requestedProfileId) ??
    profiles.find((item) => item.isPersonalDefault) ??
    profiles[0];
  if (!selected) {
    await startRun();
    profiles = await listProfiles();
    selected = profiles.find((item) => item.isPersonalDefault) ?? profiles[0];
  }
  if (!selected)
    throw new Error("Cloud Browser could not create your browser profile.");
  const runQuery = await supabase
    .schema("browser")
    .from("run")
    .select("*")
    .eq("profile_id", selected.id)
    .in("state", [...LIVE_STATES])
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (runQuery.error) throw runQuery.error;
  let activeRow = runQuery.data[0] ?? null;
  if (!runQuery.data.length) {
    const openedId = await startRun(selected.id);
    const opened = await supabase
      .schema("browser")
      .from("run")
      .select("*")
      .eq("id", openedId)
      .single();
    if (opened.error) throw opened.error;
    activeRow = opened.data;
  }
  const activeRun = activeRow ? mapRun(activeRow) : null;
  const eventsPromise = activeRun
    ? supabase
        .schema("browser")
        .from("action_event")
        .select("*")
        .eq("run_id", activeRun.id)
        .order("sequence")
        .limit(200)
    : Promise.resolve({ data: [] as EventRow[], error: null });
  const handoffPromise = activeRun
    ? supabase
        .schema("browser")
        .from("handoff")
        .select("*")
        .eq("run_id", activeRun.id)
        .in("state", ["requested", "claimed", "returning"])
        .order("requested_at", { ascending: false })
        .limit(1)
    : Promise.resolve({ data: [] as HandoffRow[], error: null });
  const [events, handoffs, bindings, allRuns, profileMetadata] =
    await Promise.all([
      eventsPromise,
      handoffPromise,
      supabase
        .schema("browser")
        .from("account_binding")
        .select("*")
        .eq("profile_id", selected.id)
        .is("deleted_at", null),
      supabase
        .schema("browser")
        .from("run")
        .select("id")
        .in("state", [...LIVE_STATES])
        .is("deleted_at", null),
      supabase
        .schema("browser")
        .from("profile")
        .select("metadata")
        .eq("id", selected.id)
        .single(),
    ]);
  if (events.error) throw events.error;
  if (handoffs.error) throw handoffs.error;
  if (bindings.error) throw bindings.error;
  if (allRuns.error) throw allRuns.error;
  if (profileMetadata.error) throw profileMetadata.error;
  const metadata = jsonObject(profileMetadata.data.metadata);
  const consent = cloudBrowserConsent(metadata.cloud_browser_consent);
  const savedNotificationConsent = notificationConsent(
    metadata.cloud_browser_notification_consent,
  );
  const quotas = Object.fromEntries(
    profiles.map((item) => [
      item.id,
      {
        liveRuns: item.id === selected.id && activeRun ? 1 : 0,
        maxLiveRuns: 1,
        storedProfiles: profiles.length,
        maxStoredProfiles: 5,
      } satisfies ProfileQuota,
    ]),
  );
  const controller: ControllerState = activeRun
    ? {
        kind: activeRun.controllerKind,
        displayName: activeRun.controllerKind === "agent" ? "Agent" : null,
        isMe: activeRun.controllerUserId === me,
        controlRevision: activeRun.controllerRevision,
        streamActive: activeRun.state === "human_control",
        pendingRequestFrom: null,
      }
    : {
        kind: "none",
        displayName: null,
        isMe: false,
        controlRevision: 0,
        streamActive: false,
        pendingRequestFrom: null,
      };
  return {
    activeProfileId: selected.id,
    profiles,
    quotas,
    run: activeRun,
    progress: events.data.map(mapEvent),
    handoff: handoffs.data[0] ? mapHandoff(handoffs.data[0]) : null,
    controller,
    bindings: bindings.data.map(mapBinding),
    telemetry: {
      capturedAt: new Date().toISOString(),
      metrics: [
        {
          key: "live_runs",
          label: "Live browsers",
          value: allRuns.data.length,
          measured: true,
        },
      ],
    },
    consent,
    notificationConsent: savedNotificationConsent,
  };
}

export async function mintStreamTicket(
  runId: string,
  mode: StreamMode,
): Promise<StreamTicketEnvelope> {
  const { data } = await postJson<unknown>(
    `/browser-manager/runs/${runId}/stream-ticket`,
    { mode },
  );
  const value = record(data);
  const control = value.control === null ? null : record(value.control);
  const media = record(value.media);
  const viewport = record(value.viewport);
  const envelope = {
    ticket: requiredText(value.ticket, "stream ticket"),
    expiresAt: requiredNumber(value.expires_at, "ticket expiry"),
    endpoint: requiredText(value.endpoint, "stream endpoint"),
    protocol: "selkies_webrtc",
    streamSessionId: requiredText(value.stream_session_id, "stream session"),
    mode,
    control: control
      ? {
          controlRevision: requiredNumber(
            control.control_revision,
            "control revision",
          ),
          leaseExpiresAt: requiredNumber(
            control.lease_expires_at,
            "lease expiry",
          ),
          renewIntervalSeconds: requiredNumber(
            control.renew_interval_seconds,
            "renew interval",
          ),
        }
      : null,
    media: {
      video: media.video === true,
      audio: media.audio === true,
      clipboard: media.clipboard === true,
    },
    viewport: {
      width: requiredNumber(viewport.width, "viewport width"),
      height: requiredNumber(viewport.height, "viewport height"),
    },
  } satisfies StreamTicketEnvelope;
  await claimStreamTicket(envelope);
  return envelope;
}
async function streamRequest(
  ticket: StreamTicketEnvelope,
  operation: "claim" | "renew",
): Promise<void> {
  const endpoint = new URL(operation, ticket.endpoint);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "stream.aimatrx.com"
  ) {
    throw new Error(
      "The Cloud Browser server returned an invalid stream address.",
    );
  }
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken)
    throw error ?? new Error("Sign in to use Cloud Browser.");
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body:
      operation === "claim" ? JSON.stringify({ ticket: ticket.ticket }) : "{}",
  });
  if (!response.ok)
    throw new Error(`The live browser connection failed (${response.status}).`);
}
export async function claimStreamTicket(
  ticket: StreamTicketEnvelope,
): Promise<void> {
  await streamRequest(ticket, "claim");
}
export async function renewStreamTicket(
  ticket: StreamTicketEnvelope,
): Promise<void> {
  await streamRequest(ticket, "renew");
}
export async function takeControl(
  runId: string,
  me: { userId: string; displayName: string },
): Promise<ControllerState> {
  const { data } = await postJson<unknown>(
    `/browser-manager/runs/${runId}/claim-control`,
    {},
  );
  const value = record(data);
  return {
    kind: controllerKind(requiredText(value.controller_kind, "controller")),
    displayName: me.displayName,
    isMe: true,
    controlRevision: requiredNumber(
      value.controller_revision,
      "control revision",
    ),
    streamActive: true,
    pendingRequestFrom: null,
  };
}
export async function returnControl(runId: string): Promise<ControllerState> {
  const { data } = await postJson<unknown>(
    `/browser-manager/runs/${runId}/release-control`,
    {},
  );
  const value = record(data);
  return {
    kind: controllerKind(requiredText(value.controller_kind, "controller")),
    displayName: "Agent",
    isMe: false,
    controlRevision: 0,
    streamActive: false,
    pendingRequestFrom: null,
  };
}

export async function saveAndFillHumanLogin(input: {
  runId: string;
  profileId: string;
  pageUrl: string;
  displayName: string;
  username: string;
  password: string;
}): Promise<void> {
  const usernameSelector =
    "input[autocomplete='username'], input[type='email'], input[name*='user' i]";
  const passwordSelector = "input[type='password']";
  const submitSelector = "button[type='submit'], input[type='submit']";
  const fields = [
    {
      field_key: "username",
      selector: usernameSelector,
      label: "Username or email",
      secret: false,
      step: 0,
      clear_first: true,
    },
    {
      field_key: "password",
      selector: passwordSelector,
      label: "Password",
      secret: true,
      step: 0,
      clear_first: true,
    },
  ];
  const { data: captured } = await postJson<unknown>(
    "/api/vault/browser-login/capture",
    {
      display_name: input.displayName,
      login_url: input.pageUrl,
      description: "Saved from the private Cloud Browser sign-in window.",
      fields,
      submit_selector: submitSelector,
      uri_match_mode: "host",
      field_values: { username: input.username, password: input.password },
      run_id: input.runId,
      profile_id: input.profileId,
    },
  );
  const receipt = record(captured);
  if (receipt.proceed !== true)
    throw new Error("The sign-in information could not be saved.");

  await postJson<unknown>(`/browser-manager/runs/${input.runId}/human-login`, {
    fields: [
      { selector: usernameSelector, value: input.username },
      { selector: passwordSelector, value: input.password },
    ],
    submit_selector: submitSelector,
  });

  if (receipt.propose_recipe === true) {
    const origin = new URL(input.pageUrl).origin;
    await postJson<unknown>("/api/vault/browser-login/recipe-proposal", {
      normalized_origin: origin,
      field_map: fields.map(({ field_key, selector, step, clear_first }) => ({
        field_key,
        selector,
        step,
        clear_first,
      })),
      submit: { selector: submitSelector },
      notes: "Captured from a user-completed Cloud Browser sign-in.",
      human_confirmed: true,
    });
  }
}

export interface SavedLoginChoice {
  itemId: string;
  displayName: string;
}

export async function getSavedLoginChoices(
  pageUrl: string,
): Promise<SavedLoginChoice[]> {
  const { data } = await postJson<unknown>("/api/vault/browser-login/matches", {
    page_url: pageUrl,
  });
  const value = record(data);
  if (!Array.isArray(value.matches)) return [];
  return value.matches.map((entry) => {
    const item = record(entry);
    return {
      itemId: requiredText(item.item_id, "saved sign-in id"),
      displayName: requiredText(item.display_name, "saved sign-in name"),
    };
  });
}

export async function fillSavedLogin(input: {
  runId: string;
  pageUrl: string;
  itemId: string;
}): Promise<void> {
  await postJson<unknown>(`/browser-manager/runs/${input.runId}/saved-login`, {
    item_id: input.itemId,
    page_url: input.pageUrl,
  });
}

export async function fillAuthenticatorCode(input: {
  runId: string;
  pageUrl: string;
  itemId: string;
}): Promise<void> {
  await postJson<unknown>(
    `/browser-manager/runs/${input.runId}/authenticator`,
    {
      item_id: input.itemId,
      page_url: input.pageUrl,
      code_selector:
        "#mfacode, input[autocomplete='one-time-code'], input[inputmode='numeric'], input[name*='code' i]",
      submit_selector:
        "#submitMfa_button, button[type='submit'], input[type='submit']",
    },
  );
}
export async function requestScreenshot(
  runId: string,
): Promise<ScreenshotFrame> {
  const { data } = await postJson<unknown>(
    `/browser-manager/runs/${runId}/screenshot`,
    {},
  );
  const value = record(data);
  return {
    id: requiredText(value.id, "capture id"),
    capturedAt: requiredText(value.captured_at, "capture time"),
    fileId: requiredText(value.file_id, "file id"),
    previewUrl: requiredText(value.preview_url, "preview"),
    privacyClass: "redacted",
  };
}
export async function getTelemetry(): Promise<TelemetrySnapshot> {
  const { data } = await getJson<unknown>("/browser-manager/ops/snapshot");
  const value = record(data);
  return {
    capturedAt: new Date().toISOString(),
    metrics: [
      {
        key: "live_runs",
        label: "Live browsers",
        value: requiredNumber(value.live_run_count, "live count"),
        measured: true,
      },
    ],
  };
}
async function mergeMetadata(
  profileId: string,
  key: string,
  value: Json,
): Promise<void> {
  const current = await supabase
    .schema("browser")
    .from("profile")
    .select("metadata, version")
    .eq("id", profileId)
    .single();
  if (current.error) throw current.error;
  const metadata = { ...jsonObject(current.data.metadata), [key]: value };
  const updated = await supabase
    .schema("browser")
    .from("profile")
    .update({ metadata })
    .eq("id", profileId)
    .eq("version", current.data.version)
    .select("id")
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data)
    throw new Error("The browser profile changed. Reload and try again.");
}
export async function saveConsent(
  profileId: string,
  next: CloudBrowserConsent,
): Promise<CloudBrowserConsent> {
  await mergeMetadata(profileId, "cloud_browser_consent", next);
  return next;
}
export async function saveNotificationConsent(
  profileId: string,
  next: NotificationConsent,
): Promise<NotificationConsent> {
  const saved = { ...next, acknowledgedAt: new Date().toISOString() };
  await mergeMetadata(profileId, "cloud_browser_notification_consent", saved);
  return saved;
}
export async function startDeletion(profileId: string): Promise<{ ok: true }> {
  const { error } = await supabase
    .schema("browser")
    .from("profile")
    .update({ status: "deletion_pending" })
    .eq("id", profileId);
  if (error) throw error;
  return { ok: true };
}
