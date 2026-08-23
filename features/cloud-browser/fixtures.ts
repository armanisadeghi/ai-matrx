/**
 * Cloud Browser — FIXTURE data.
 *
 * The whole panel/share dialog/timeline are demoable standalone against these.
 * Real reads (Supabase branch DB for S1 shapes, Browser Manager for S4/S6) swap
 * in at M1/M3 behind `service.ts` — the shapes here are the contract shapes, so
 * nothing above `service.ts` changes when the source does.
 */

import type {
  AccountBinding,
  CloudBrowserConsent,
  CloudBrowserHandoff,
  CloudBrowserProfile,
  CloudBrowserRun,
  ControllerState,
  NotificationConsent,
  ProfileQuota,
  ProgressEvent,
  ScreenshotFrame,
  TelemetrySnapshot,
} from "./types";

const now = () => new Date().toISOString();
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const FIXTURE_ME = {
  userId: "u_arman",
  displayName: "Arman S.",
};

export const FIXTURE_PROFILES: CloudBrowserProfile[] = [
  {
    id: "bp_personal_default",
    ownerType: "user",
    ownerUserId: FIXTURE_ME.userId,
    organizationId: null,
    orgAccessMode: "restricted",
    displayName: "My Cloud Browser",
    isDefault: true,
    status: "active",
    homeRegion: "us-west-1",
    checkpointStatus: "current",
    currentCheckpointRevision: 42,
    currentCheckpointAt: minsAgo(6),
    currentCheckpointBytes: 88_400_000,
    chromiumVersion: "129.0.6668.90",
    lastStartedAt: minsAgo(18),
    lastStoppedAt: null,
    expiresAt: null,
    accessLevel: "admin",
    isPersonalDefault: true,
  },
  {
    id: "bp_org_infra",
    ownerType: "organization",
    ownerUserId: null,
    organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    orgAccessMode: "all_members",
    displayName: "AI Matrx — Infra accounts",
    isDefault: false,
    status: "active",
    homeRegion: "us-west-1",
    checkpointStatus: "current",
    currentCheckpointRevision: 17,
    currentCheckpointAt: minsAgo(52),
    currentCheckpointBytes: 61_000_000,
    chromiumVersion: "129.0.6668.90",
    lastStartedAt: minsAgo(52),
    lastStoppedAt: minsAgo(40),
    expiresAt: null,
    accessLevel: "editor",
    isPersonalDefault: false,
  },
  {
    id: "bp_shared_client",
    ownerType: "user",
    ownerUserId: "u_dana",
    organizationId: null,
    orgAccessMode: "restricted",
    displayName: "Client portal (shared by Dana R.)",
    isDefault: false,
    status: "active",
    homeRegion: "us-east-1",
    checkpointStatus: "stale",
    currentCheckpointRevision: 9,
    currentCheckpointAt: daysAgo(3),
    currentCheckpointBytes: 44_200_000,
    chromiumVersion: "128.0.6613.120",
    lastStartedAt: daysAgo(3),
    lastStoppedAt: daysAgo(3),
    expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    accessLevel: "viewer",
    isPersonalDefault: false,
  },
];

export const FIXTURE_QUOTAS: Record<string, ProfileQuota> = {
  bp_personal_default: { liveRuns: 1, maxLiveRuns: 3, storedProfiles: 2 },
  bp_org_infra: { liveRuns: 0, maxLiveRuns: 5, storedProfiles: 4 },
  bp_shared_client: { liveRuns: 0, maxLiveRuns: 1, storedProfiles: 1 },
};

export const FIXTURE_RUN: CloudBrowserRun = {
  id: "run_9f2c11ab",
  profileId: "bp_personal_default",
  state: "agent_control",
  mode: "handoff_capable",
  executionTarget: "browser_fleet",
  controllerKind: "agent",
  controllerUserId: null,
  controllerDisplayName: null,
  controllerRevision: 7,
  currentOrigin: "https://console.aws.amazon.com",
  currentUrl: "https://console.aws.amazon.com/billing/home",
  currentTitle: "Billing & Cost Management",
  startedAt: minsAgo(18),
  stoppedAt: null,
  errorCode: null,
  errorDetailSafe: null,
};

export const FIXTURE_PROGRESS: ProgressEvent[] = [
  { id: "e1", runId: FIXTURE_RUN.id, sequence: 1, occurredAt: minsAgo(18), actor: "agent", action: "run_start", resultClass: "ok", summary: "Started **My Cloud Browser** and restored the saved AWS session." },
  { id: "e2", runId: FIXTURE_RUN.id, sequence: 2, occurredAt: minsAgo(17), actor: "agent", action: "navigate", resultClass: "ok", summary: "Opened the AWS console.", origin: "https://console.aws.amazon.com" },
  { id: "e3", runId: FIXTURE_RUN.id, sequence: 3, occurredAt: minsAgo(17), actor: "agent", action: "click", resultClass: "ok", summary: "Went to **Billing & Cost Management**." },
  { id: "e4", runId: FIXTURE_RUN.id, sequence: 4, occurredAt: minsAgo(16), actor: "agent", action: "get_text", resultClass: "ok", summary: "Read this month's estimated charges." },
  { id: "e5", runId: FIXTURE_RUN.id, sequence: 5, occurredAt: minsAgo(15), actor: "agent", action: "navigate", resultClass: "ok", summary: "Opened the **Cost Explorer** report for the last 30 days.", origin: "https://console.aws.amazon.com" },
  { id: "e6", runId: FIXTURE_RUN.id, sequence: 6, occurredAt: minsAgo(2), actor: "agent", action: "credential_fill", resultClass: "ok", summary: "Re-entered the saved sign-in when the console asked to confirm the account." },
];

export const FIXTURE_HANDOFF: CloudBrowserHandoff = {
  id: "ho_b7c1e0f2",
  runId: FIXTURE_RUN.id,
  profileId: "bp_personal_default",
  reason: "mfa_required",
  state: "requested",
  message:
    "This site is asking for a verification code. It needs the person who owns this browser to complete that step — work will continue automatically afterward.",
  origin: "https://signin.aws.amazon.com",
  requestedAt: minsAgo(1),
  expiresAt: new Date(Date.now() + 29 * 60_000).toISOString(),
  captureRequest: null,
  captureOutcome: null,
};

export const FIXTURE_CONTROLLER_AGENT: ControllerState = {
  kind: "agent",
  displayName: null,
  isMe: false,
  controlRevision: 7,
  streamActive: false,
  pendingRequestFrom: null,
};

export const FIXTURE_CONTROLLER_ME: ControllerState = {
  kind: "human",
  displayName: FIXTURE_ME.displayName,
  isMe: true,
  controlRevision: 8,
  streamActive: true,
  pendingRequestFrom: null,
};

export const FIXTURE_CONTROLLER_OTHER: ControllerState = {
  kind: "human",
  displayName: "Dana R.",
  isMe: false,
  controlRevision: 8,
  streamActive: true,
  pendingRequestFrom: null,
};

export const FIXTURE_ACCOUNT_BINDINGS: AccountBinding[] = [
  { id: "ab_aws", profileId: "bp_personal_default", normalizedOrigin: "console.aws.amazon.com", accountLabel: "aws-root@titaniumsuccess", healthState: "reauth_soon", nextCheckAt: minsAgo(-30), lastCheckedAt: minsAgo(90) },
  { id: "ab_cf", profileId: "bp_personal_default", normalizedOrigin: "dash.cloudflare.com", accountLabel: "arman@titaniumsuccess.com", healthState: "healthy", nextCheckAt: minsAgo(-120), lastCheckedAt: minsAgo(30) },
  { id: "ab_vercel", profileId: "bp_personal_default", normalizedOrigin: "vercel.com", accountLabel: "aimatrx", healthState: "reauth_required", nextCheckAt: null, lastCheckedAt: minsAgo(220) },
];

export const FIXTURE_TELEMETRY: TelemetrySnapshot = {
  capturedAt: now(),
  metrics: [
    { key: "live_runs", label: "Live browsers right now", value: 1, unit: "", measured: true },
    { key: "runs_24h", label: "Runs in the last 24h", value: 6, unit: "", measured: true },
    { key: "agent_minutes_24h", label: "Agent-driving minutes (24h)", value: 47, unit: "min", measured: true },
    { key: "human_minutes_24h", label: "Human-takeover minutes (24h)", value: 4, unit: "min", measured: true },
    { key: "screenshots_24h", label: "Screenshots served (24h)", value: 22, unit: "", measured: true },
    { key: "checkpoint_bytes", label: "Saved profile size", value: 88_400_000, unit: "bytes", measured: true },
    { key: "worker_cpu", label: "Worker CPU", value: null, measured: false, hint: "Per-worker CPU is not wired to the panel yet." },
    { key: "worker_mem", label: "Worker memory", value: null, measured: false, hint: "Per-worker memory is not wired to the panel yet." },
    { key: "est_cost_24h", label: "Estimated cost (24h)", value: null, unit: "USD", measured: false, hint: "Cost metering lands with the WS-1 usage rollup." },
  ],
};

export const FIXTURE_CONSENT: CloudBrowserConsent = {
  unattendedLogin: true,
  sessionHealthChecks: true,
  totpDelegation: false,
  sensitiveActionsRequireHuman: true,
};

export const FIXTURE_NOTIFICATION_CONSENT: NotificationConsent = {
  // `in_app` is `true` by TYPE — the assist is not a preference (§2).
  in_app: true,
  browser: true,
  email: false,
  sms: false,
  acknowledgedAt: null,
};

let frameSeq = 0;
/** A tiny inline SVG data-URL so screenshots render with no network. */
export function makeFixtureFrame(): ScreenshotFrame {
  frameSeq += 1;
  const t = new Date().toLocaleTimeString();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'>
    <rect width='320' height='200' fill='#0f172a'/>
    <rect x='0' y='0' width='320' height='28' fill='#1e293b'/>
    <circle cx='14' cy='14' r='5' fill='#ef4444'/><circle cx='30' cy='14' r='5' fill='#f59e0b'/><circle cx='46' cy='14' r='5' fill='#22c55e'/>
    <text x='70' y='18' fill='#94a3b8' font-family='sans-serif' font-size='11'>console.aws.amazon.com</text>
    <text x='16' y='70' fill='#e2e8f0' font-family='sans-serif' font-size='16'>Billing &amp; Cost Management</text>
    <text x='16' y='100' fill='#64748b' font-family='sans-serif' font-size='12'>frame ${frameSeq} · ${t}</text>
    <rect x='16' y='120' width='288' height='10' rx='4' fill='#334155'/>
    <rect x='16' y='140' width='220' height='10' rx='4' fill='#334155'/>
  </svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return {
    id: `frame_${frameSeq}`,
    capturedAt: now(),
    fileId: `file_shot_${frameSeq}`,
    previewUrl: url,
    privacyClass: "redacted",
  };
}
