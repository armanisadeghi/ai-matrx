/**
 * Cloud Browser — service layer (FIXTURE-backed).
 *
 * This is the ONE seam between the UI and the data source. Today every call
 * resolves fixtures after a short delay so the panel/share/timeline are fully
 * demoable with no backend. At M1/M3 each method's body swaps to the real path
 * WITHOUT changing its signature or return shape:
 *
 *   listProfiles()        → supabase browser.profile (branch DB, WS-1)  [direct read]
 *   getRun()/getProgress()→ browser.run + browser.action_event          [direct read]
 *   getTelemetry()        → WS-1 usage rollup                           [direct read]
 *   mintStreamTicket()    → POST /browser-manager/runs/{id}/stream-ticket (S4)
 *   takeControl()/return()→ POST .../control-requests, .../release-control (S4 §5)
 *
 * Per repo doctrine: reads/writes that Postgres can answer go DIRECT to Supabase
 * (RLS), never through a Next.js API hop; only stream-ticket mint + control-lease
 * writes go to Browser Manager (they need live lease CAS the browser can't do).
 */

import {
  FIXTURE_ACCOUNT_BINDINGS,
  FIXTURE_CONSENT,
  FIXTURE_CONTROLLER_AGENT,
  FIXTURE_HANDOFF,
  FIXTURE_NOTIFICATION_CONSENT,
  FIXTURE_PROFILES,
  FIXTURE_PROGRESS,
  FIXTURE_QUOTAS,
  FIXTURE_RUN,
  FIXTURE_TELEMETRY,
  makeFixtureFrame,
} from "./fixtures";
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
  StreamTicketEnvelope,
  TelemetrySnapshot,
} from "./types";

const delay = (ms = 220) => new Promise<void>((r) => setTimeout(r, ms));

export interface CloudBrowserSnapshot {
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

/** One batched load for the panel — mirrors the eventual set of direct reads. */
export async function loadSnapshot(activeProfileId: string): Promise<CloudBrowserSnapshot> {
  await delay();
  const run = activeProfileId === FIXTURE_RUN.profileId ? FIXTURE_RUN : null;
  return {
    profiles: FIXTURE_PROFILES,
    quotas: FIXTURE_QUOTAS,
    run,
    progress: run ? FIXTURE_PROGRESS : [],
    handoff: run ? FIXTURE_HANDOFF : null,
    controller: FIXTURE_CONTROLLER_AGENT,
    bindings: FIXTURE_ACCOUNT_BINDINGS.filter((b) => b.profileId === activeProfileId),
    telemetry: FIXTURE_TELEMETRY,
    consent: FIXTURE_CONSENT,
    notificationConsent: FIXTURE_NOTIFICATION_CONSENT,
  };
}

export async function listProfiles(): Promise<CloudBrowserProfile[]> {
  await delay(120);
  return FIXTURE_PROFILES;
}

/** S4 §2.1 mint — control ticket. Fixture returns a masked, contract-shaped envelope. */
export async function mintStreamTicket(
  runId: string,
  mode: "control" | "view",
): Promise<StreamTicketEnvelope> {
  await delay(180);
  return {
    ticket: "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.FIXTURE.ticket",
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    endpoint: `wss://stream.aimatrx.com/stream/fixture_${runId}/signal`,
    protocol: "selkies_webrtc",
    streamSessionId: `fixture_${runId}`,
    mode,
    control:
      mode === "control"
        ? { controlRevision: 8, leaseExpiresAt: Math.floor(Date.now() / 1000) + 60, renewIntervalSeconds: 20 }
        : null,
    media: { video: true, audio: false, clipboard: false },
    viewport: { width: 1280, height: 800 },
  };
}

/** S4 §5.5 — request/take control. Fixture flips controller to the caller. */
export async function takeControl(_runId: string, me: { userId: string; displayName: string }): Promise<ControllerState> {
  await delay(160);
  return {
    kind: "human",
    displayName: me.displayName,
    isMe: true,
    controlRevision: FIXTURE_CONTROLLER_AGENT.controlRevision + 1,
    streamActive: true,
    pendingRequestFrom: null,
  };
}

/** S4 §2.5 — release control. Fixture returns the run to the agent. */
export async function returnControl(_runId: string): Promise<ControllerState> {
  await delay(140);
  return { ...FIXTURE_CONTROLLER_AGENT, controlRevision: FIXTURE_CONTROLLER_AGENT.controlRevision + 2 };
}

/** D-8 tier 2 — a single screenshot on request (fixture generates one locally). */
export async function requestScreenshot(_runId: string): Promise<ScreenshotFrame> {
  await delay(90);
  return makeFixtureFrame();
}

export async function getTelemetry(): Promise<TelemetrySnapshot> {
  await delay(120);
  return { ...FIXTURE_TELEMETRY, capturedAt: new Date().toISOString() };
}

export async function saveConsent(next: CloudBrowserConsent): Promise<CloudBrowserConsent> {
  await delay(90);
  return next;
}

export async function saveNotificationConsent(next: NotificationConsent): Promise<NotificationConsent> {
  await delay(90);
  return { ...next, acknowledgedAt: new Date().toISOString() };
}

/** D-20 — begin deletion; the durable workflow keeps 30 days of history. */
export async function startDeletion(_profileId: string): Promise<{ ok: true }> {
  await delay(160);
  return { ok: true };
}
