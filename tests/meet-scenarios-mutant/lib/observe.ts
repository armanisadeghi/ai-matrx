/**
 * OBSERVE — what a person in the meeting can SEE, read through the stable
 * observation contract (HARNESS-CONTRACT.md in common-docs meet/duplicates).
 *
 * Scenarios assert ONLY on an `Observation`, never on markup. When the page
 * carries the contract (`[data-meet-root]`), every field comes from it. When it
 * does not (today's product), `source` is "fallback" and the fields are read
 * from visible text and accessible names — a best-effort reading recorded as
 * such in the baseline. A skin rebuild changes markup; it never changes this.
 */
import type { CDPSession, Page } from "@playwright/test";

/**
 * Pages that must never receive a user activation. Playwright's page.evaluate runs with
 * userGesture: true in Chromium, so every observation would silently "click" the page and unlock
 * autoplay. These pages are read through CDP Runtime.evaluate with userGesture: false instead.
 */
export const NO_GESTURE = new WeakMap<Page, CDPSession>();

/** Evaluate `fn(arg)` in the page; no user activation for pages in NO_GESTURE. */
export async function evaluateIn<A, R>(page: Page, fn: (arg: A) => R, arg: A): Promise<R> {
  const cdp = NO_GESTURE.get(page);
  if (!cdp) return (page.evaluate as (f: unknown, a: unknown) => Promise<R>).call(page, fn, arg);
  const res = (await cdp.send("Runtime.evaluate", {
    expression: `(() => { var __name = (f) => f; return (${fn.toString()})(${JSON.stringify(arg)}); })()`,
    returnByValue: true,
    awaitPromise: true,
    userGesture: false,
  })) as { result: { value?: R }; exceptionDetails?: { text: string; exception?: { description?: string } } };
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  return res.result.value as R;
}

export type CallPhase =
  | "resolving"
  | "not-found"
  | "expired"
  | "ended"
  | "guest-name"
  | "prejoin"
  | "waiting-for-host"
  | "knocking"
  | "denied"
  | "knock-expired"
  | "joining"
  | "in-call"
  | "reconnecting"
  | "disconnected"
  | "displaced"
  | "left"
  | "removed"
  | "unknown";

export interface ParticipantView {
  name: string;
  connection: string | null;
  role: string | null;
  self: boolean;
}

export interface Observation {
  source: "contract" | "fallback";
  phase: CallPhase;
  role: string | null;
  connection: string | null;
  hostPresent: boolean | null;
  recording: boolean | null;
  audioBlocked: boolean | null;
  lobbyCount: number | null;
  camera: string | null;
  microphone: string | null;
  notices: string[];
  participants: ParticipantView[];
  /** Visible text, trimmed — the evidence when an assertion fails. */
  text: string;
}

/** Runs in the page. Contract first; visible-text fallback otherwise. */
function readInPage(): Observation {
  const visible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim();
  const bool = (v: string | null | undefined): boolean | null =>
    v === "true" ? true : v === "false" ? false : null;

  const root = document.querySelector("[data-meet-root]");
  if (root) {
    const a = (n: string) => root.getAttribute(`data-meet-${n}`);
    const lobby = a("lobby-count");
    // The core's phase vocabulary (CORE-DESIGN §3.1) -> the harness names.
    const raw = a("phase") ?? "unknown";
    const conn = a("connection");
    const named: Record<string, CallPhase> = {
      resolving: "resolving", unsupported: "unknown", prejoin: "prejoin", joining: "joining", guest_name: "guest-name",
      "waiting:host_not_started": "waiting-for-host", "waiting:knocking": "knocking",
      denied: "denied", knock_expired: "knock-expired", in_call: "in-call",
      disconnected: "disconnected", left: "left", removed: "removed", superseded: "displaced",
      inactive: "left", ended: "ended", record: "ended",
    };
    let phase: CallPhase = named[raw] ?? (raw as CallPhase);
    if (raw === "refused:not_found") phase = "not-found";
    else if (raw === "refused:expired") phase = "expired";
    else if (raw === "refused:ended") phase = "ended";
    if (phase === "prejoin" && document.querySelector("#meet-guest-name")) phase = "guest-name";
    if (phase === "in-call" && conn !== null && conn !== "stable") phase = "reconnecting";
    const device = (v: string | null) =>
      v === null ? null : /denied|blocked/.test(v) ? "blocked" : /none|revoked/.test(v) ? "missing" : v;
    return {
      source: "contract",
      phase,
      role: a("role"),
      connection: conn === "server_unreachable" ? "server-unreachable" : conn,
      hostPresent: bool(a("host-present")),
      recording: bool(a("recording")),
      audioBlocked: bool(a("audio-blocked")),
      lobbyCount: lobby === null ? null : Number(lobby),
      camera: device(a("camera")),
      microphone: device(a("microphone")),
      notices: Array.from(document.querySelectorAll("[data-meet-notice]"))
        .filter(visible)
        .map((n) => n.getAttribute("data-meet-notice") ?? ""),
      participants: Array.from(document.querySelectorAll("[data-meet-participant]")).map((p) => ({
        name: p.getAttribute("data-meet-participant-name") ?? "",
        connection: p.getAttribute("data-meet-participant-connection"),
        role: p.getAttribute("data-meet-participant-role"),
        self: p.getAttribute("data-meet-participant-self") === "true",
      })),
      text: text.slice(0, 600),
    };
  }

  // ---- fallback: today's product, read as a person reads it ----
  const buttons = Array.from(document.querySelectorAll("button")).filter(visible);
  const names = buttons.map((b) => (b.getAttribute("aria-label") ?? b.innerText ?? "").trim());
  const hasButton = (re: RegExp) => names.some((n) => re.test(n));
  const has = (re: RegExp) => re.test(text);
  const inCallControls = hasButton(/^Leave$/) && hasButton(/^(Mute|Unmute)\b/);

  let phase: CallPhase = "unknown";
  if (has(/This meeting did not open/i)) phase = /ended|over/i.test(text) ? "ended" : "not-found";
  else if (has(/Meeting record/i) && !inCallControls) phase = "ended";
  else if (has(/did not admit you/i)) phase = "denied";
  else if (has(/No one responded|request (has )?expired|timed out/i) && !inCallControls) phase = "knock-expired";
  else if (has(/joined (from|on) another (tab|device)/i)) phase = "displaced";
  else if (has(/You were disconnected|You('ve| have) been disconnected|lost (your )?connection/i) && !inCallControls) phase = "disconnected";
  else if (has(/Waiting for the host to let you in/i)) phase = "knocking";
  else if (has(/Waiting for the host to (join|start)/i)) phase = "waiting-for-host";
  else if (has(/Reconnecting/i) && inCallControls) phase = "reconnecting";
  else if (inCallControls) phase = "in-call";
  else if (document.querySelector("#meet-guest-name")) phase = "guest-name";
  else if (has(/Joining…/)) phase = "joining";
  else if (has(/Ready to join\?/i)) phase = "prejoin";
  else if (has(/You left the meeting|You have left/i)) phase = "left";
  else if (has(/removed from (the|this) meeting/i)) phase = "removed";
  else if (text.length < 40) phase = "resolving";

  const peopleLabel = names.find((n) => /^People\b/.test(n)) ?? "";
  const waitingMatch = peopleLabel.match(/(\d+)\s+waiting/);
  const headerText = (document.querySelector("header")?.textContent ?? "") + " " +
    Array.from(document.querySelectorAll('[role="status"]')).map((s) => s.textContent ?? "").join(" ");

  const tiles = Array.from(document.querySelectorAll(".mx-meet__tile-name")).filter(visible);
  const participants: ParticipantView[] = tiles.map((t) => {
    const tile = t.closest("[class*='mx-meet__tile']")?.parentElement ?? t.parentElement;
    const q = tile?.querySelector("[title^='Connection ']")?.getAttribute("title") ?? null;
    return {
      name: (t.textContent ?? "").replace(/\b(Host|Co-host|Guest|AI)\b/g, "").trim(),
      connection: q === null ? null : q.replace("Connection ", ""),
      role: /\bHost\b/.test(t.textContent ?? "") ? "host" : null,
      self: /\(You\)|\bYou\b/.test(t.textContent ?? ""),
    };
  });

  return {
    source: "fallback",
    phase,
    role: inCallControls ? (hasButton(/End meeting for everyone|Lock meeting|Unlock meeting/) ? "host" : "participant") : null,
    connection: phase === "reconnecting" ? "reconnecting" : has(/You('re| are) offline|No internet/i) ? "offline" : null,
    hostPresent: has(/host (is not here|isn't here|is away|has left|left the meeting)|Waiting for the host to (join|start)/i) ? false : null,
    recording: /\bRecording\b/.test(headerText) ? true : inCallControls ? false : null,
    audioBlocked: hasButton(/enable (sound|audio)|turn on sound|allow (sound|audio)|click to (hear|enable)/i) ? true : null,
    lobbyCount: waitingMatch ? Number(waitingMatch[1]) : inCallControls && peopleLabel ? 0 : null,
    camera: has(/camera[^.]{0,40}(blocked|denied)/i) ? "blocked" : null,
    microphone: has(/(microphone|mic)[^.]{0,40}(blocked|denied)/i) ? "blocked" : null,
    notices: Array.from(document.querySelectorAll('[role="status"], [role="alert"], [role="alertdialog"]'))
      .filter(visible)
      .map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 0)
      .slice(0, 12),
    participants,
    text: text.slice(0, 600),
  };
}

export async function observe(page: Page): Promise<Observation> {
  try {
    return await evaluateIn(page, readInPage as (a: null) => Observation, null);
  } catch (error) {
    return {
      source: "fallback",
      phase: "unknown",
      role: null,
      connection: null,
      hostPresent: null,
      recording: null,
      audioBlocked: null,
      lobbyCount: null,
      camera: null,
      microphone: null,
      notices: [],
      participants: [],
      text: `(page unreadable: ${(error as Error).message.slice(0, 120)})`,
    };
  }
}

/** One line for evidence: "phase=in-call role=host src=fallback | <text…>". */
export function summarize(o: Observation): string {
  const bits = [`phase=${o.phase}`, `src=${o.source}`];
  if (o.role) bits.push(`role=${o.role}`);
  if (o.connection) bits.push(`conn=${o.connection}`);
  if (o.lobbyCount !== null) bits.push(`lobby=${o.lobbyCount}`);
  if (o.recording !== null) bits.push(`rec=${o.recording}`);
  if (o.participants.length) bits.push(`people=[${o.participants.map((p) => p.name + (p.connection ? `:${p.connection}` : "")).join(", ")}]`);
  if (o.notices.length) bits.push(`notices=${JSON.stringify(o.notices.slice(0, 4))}`);
  return `${bits.join(" ")} | ${o.text.slice(0, 220)}`;
}
