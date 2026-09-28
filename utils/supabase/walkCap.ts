// utils/supabase/walkCap.ts — THE LIVE-DATABASE WALK CAP (development only).
//
// WHY (2026-09-26): the live database ran out of memory, and 70% of its time
// that day came from coding-agent browser walks. The ONE shared preview server
// (`pnpm preview:start`, port 3001) gives each agent session its own host,
// `<label>.localhost:3001`, and 15–26 of those hosts — 40–69 signed-in
// sessions per 30 minutes, all admin@admin.com — were hitting production at
// once. Arman approved: "cap concurrent agent browser walks against
// production, default 4, the rest on the clone".
//
// THE RULE. A preview host that carried a signed-in request within
// `ops.agent_walks.activity_window_minutes` is an active walk. A signed-in
// request from a host that is NOT already an active walk evicts the least
// recently used active host when the cap is full. The evicted host receives an
// SSE notice, unloads into a script-free parked page, and can only return via
// its explicit Resume form. Signed-out requests (the login page, assets)
// always pass.
//
// WHERE IT RUNS. Only in `next dev` (NODE_ENV === "development") AND only when
// the server is configured against production (`NEXT_PUBLIC_SUPABASE_URL` host
// is db.matrxserver.com). `utils/supabase/middleware.ts` reaches this module
// through a dynamic import inside a `process.env.NODE_ENV === "development"`
// branch, which a production build inlines to `false` and drops — Vercel never
// even loads this file. The function re-checks both conditions itself.
//
// NEVER BLOCKS ON ITS OWN FAILURE. A missing knob, an unreachable register or
// a missing key screams in the dev-server log with the remedy and the gate
// FAILS OPEN (Law 4: nothing fails silently; validation offers, never blocks
// on a fault of its own).

export const WALK_CAP_FEATURE = "ops.agent_walks";
export const WALK_CAP_HEADER = "x-matrx-walk-cap";
export const PRODUCTION_DB_HOST = "db.matrxserver.com";
const CAP_KEY = "production_concurrent_cap";
const WINDOW_KEY = "activity_window_minutes";
const SEED_FILE = "migrations/ops_agent_walks_production_cap_2026_09_26.sql";
const KNOB_TTL_MS = 60_000;
const CLONE_PORT = 3002;

export interface WalkKnobs {
  cap: number;
  windowMinutes: number;
}

export interface ActiveWalk {
  host: string;
  idleMs: number;
}

export type WalkDecision =
  | { verdict: "admit"; newlyAdmitted: boolean; active: ActiveWalk[]; evicted: string[] }
  | { verdict: "parked"; active: ActiveWalk[]; evicted: string[] }
  | { verdict: "refuse"; active: ActiveWalk[]; evicted: string[] };

export type WalkRequestKind = "background" | "document" | "activity" | "resume";

export interface WalkRegistry {
  admitted: Map<string, number>;
  evicted: Set<string>;
}

/**
 * The admission rule. `registry` maps an admitted preview host to the last
 * time of a real document navigation or explicit user interaction; background
 * requests do not refresh it. It tombstones expired/evicted hosts so they can
 * never reclaim automatically. Deterministic: the clock is an argument.
 */
export function decideWalkAdmission(
  registry: WalkRegistry,
  host: string,
  now: number,
  knobs: WalkKnobs,
  kind: WalkRequestKind = "document",
): WalkDecision {
  const windowMs = knobs.windowMinutes * 60_000;
  const evicted: string[] = [];
  for (const [seenHost, lastSeen] of registry.admitted) {
    if (now - lastSeen > windowMs) {
      registry.admitted.delete(seenHost);
      registry.evicted.add(seenHost);
      evicted.push(seenHost);
    }
  }
  const active = (): ActiveWalk[] =>
    [...registry.admitted.entries()]
      .map(([h, lastSeen]) => ({ host: h, idleMs: now - lastSeen }))
      .sort((a, b) => a.idleMs - b.idleMs);

  if (knobs.cap <= 0) {
    for (const seenHost of [...registry.admitted.keys()]) {
      registry.admitted.delete(seenHost);
      registry.evicted.add(seenHost);
      evicted.push(seenHost);
    }
    return { verdict: "refuse", active: active(), evicted };
  }
  if (registry.evicted.has(host) && kind !== "resume") {
    return { verdict: "parked", active: active(), evicted: [] };
  }

  const existing = registry.admitted.has(host);
  if (existing && (kind === "document" || kind === "activity" || kind === "resume")) {
    registry.admitted.set(host, now);
  }

  // A newly admitted host always gets a slot. Break timestamp ties by map
  // insertion order so LRU eviction is deterministic and testable.
  const evictOldest = () => {
    const oldest = [...registry.admitted.entries()].reduce<string | null>(
      (candidate, [candidateHost, seen]) =>
        candidate === null || seen < (registry.admitted.get(candidate) ?? Infinity)
          ? candidateHost
          : candidate,
      null,
    );
    if (!oldest) return;
    registry.admitted.delete(oldest);
    registry.evicted.add(oldest);
    evicted.push(oldest);
  };
  if (!existing) {
    while (registry.admitted.size >= knobs.cap) evictOldest();
    registry.evicted.delete(host);
    registry.admitted.set(host, now);
    return { verdict: "admit", newlyAdmitted: true, active: active(), evicted };
  }
  while (registry.admitted.size > knobs.cap) evictOldest();
  if (!registry.admitted.has(host)) {
    return { verdict: "parked", active: active(), evicted };
  }
  return { verdict: "admit", newlyAdmitted: false, active: active(), evicted };
}

interface KnobReaderDeps {
  fetchImpl: typeof fetch;
  restUrl: string;
  apiKey: string | undefined;
  now: () => number;
  log: (line: string) => void;
}

/**
 * ONE PostgREST read of both `ops.agent_walks` knobs, cached 60 s, with
 * concurrent callers sharing the in-flight request. Returns null (after a
 * loud log line naming the remedy) when either knob is missing or the read
 * fails — the caller fails open on null.
 */
export function createWalkKnobReader(
  deps: KnobReaderDeps,
): () => Promise<WalkKnobs | null> {
  let cached: { at: number; knobs: WalkKnobs | null } | null = null;
  let inFlight: Promise<WalkKnobs | null> | null = null;

  const scream = (why: string) => {
    deps.log(
      `[walk-cap] ============================================================\n` +
        `[walk-cap] ${why}\n` +
        `[walk-cap] FAILING OPEN: every agent walk is admitted against the live database until this is fixed.\n` +
        `[walk-cap] Remedy: seed the knobs with \`pnpm db:apply ${SEED_FILE} --target production\`, and make sure\n` +
        `[walk-cap] SUPABASE_SECRET_KEY is in .env.local. Retrying in ${KNOB_TTL_MS / 1000}s.\n` +
        `[walk-cap] ============================================================`,
    );
  };

  async function load(): Promise<WalkKnobs | null> {
    if (!deps.apiKey) {
      scream("SUPABASE_SECRET_KEY is not set, so the walk-cap knobs cannot be read.");
      return null;
    }
    const url =
      `${deps.restUrl.replace(/\/$/, "")}/rest/v1/feature_knob?` +
      `feature=eq.${WALK_CAP_FEATURE}&archived_at=is.null&select=key,value`;
    let rows: Array<{ key: string; value: unknown }>;
    try {
      const res = await deps.fetchImpl(url, {
        headers: {
          apikey: deps.apiKey,
          "Accept-Profile": "platform",
        },
        cache: "no-store",
      });
      if (!res.ok) {
        scream(`Reading platform.feature_knob for ${WALK_CAP_FEATURE} failed: HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 600));
        return null;
      }
      rows = (await res.json()) as Array<{ key: string; value: unknown }>;
    } catch (error) {
      scream(`Reading platform.feature_knob for ${WALK_CAP_FEATURE} threw: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    for (const key of [CAP_KEY, WINDOW_KEY]) {
      const value = byKey.get(key);
      if (typeof value !== "number" || !Number.isFinite(value)) {
        scream(`Missing feature knob: ${WALK_CAP_FEATURE} ${key} (got ${JSON.stringify(value)}).`);
        return null;
      }
    }
    return {
      cap: byKey.get(CAP_KEY) as number,
      windowMinutes: byKey.get(WINDOW_KEY) as number,
    };
  }

  return async () => {
    if (cached && deps.now() - cached.at < KNOB_TTL_MS) return cached.knobs;
    if (inFlight) return inFlight;
    inFlight = load()
      .then((knobs) => {
        cached = { at: deps.now(), knobs };
        return knobs;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s ago`;
}

function refusalPage(host: string, active: ActiveWalk[], knobs: WalkKnobs): string {
  const list = active.length
    ? active.map((w) => `<li><code>${escapeHtml(w.host)}</code> — last signed-in request ${ago(w.idleMs)}</li>`).join("")
    : "<li>(none — the cap is 0, so no agent walk may sign in against production)</li>";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live-database walk cap</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 16px;color:#1a1a1a;background:#fff}
code{background:#f1f1f1;padding:1px 5px;border-radius:4px}
@media (prefers-color-scheme:dark){body{color:#eee;background:#141414}code{background:#2a2a2a}}
</style></head><body>
<h1>This preview is over the live-database walk cap</h1>
<p>${active.length} agent sessions are already signed in against production (the cap is ${knobs.cap}):</p>
<ul>${list}</ul>
<p>Wait until one of them goes idle for ${knobs.windowMinutes} minutes, then reload this page.</p>
<p>The clone preview (<code>pnpm preview:start --clone</code>, port ${CLONE_PORT}, a copy of production for walks) is not built yet: it needs a second development server, and this machine allows exactly one. Until it exists, waiting is the only path.</p>
<p><small>Host refused: <code>${escapeHtml(host)}</code>. Knobs: <code>${WALK_CAP_FEATURE}.${CAP_KEY}</code> and <code>${WALK_CAP_FEATURE}.${WINDOW_KEY}</code>. This check runs only in local development against the live database.</small></p>
</body></html>`;
}

export interface WalkCapGateInput {
  host: string | null;
  env: { NODE_ENV?: string; NEXT_PUBLIC_SUPABASE_URL?: string };
  readKnobs: () => Promise<WalkKnobs | null>;
  registry: WalkRegistry;
  now: number;
  log: (line: string) => void;
  kind?: WalkRequestKind;
}

function pointsAtProduction(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).host === PRODUCTION_DB_HOST;
  } catch {
    return false;
  }
}

/**
 * Decide one SIGNED-IN request. Returns the 503 refusal, or null to let the
 * request through. Callers must only call this for a signed-in request.
 */
export async function walkCapGate(input: WalkCapGateInput): Promise<Response | null> {
  if (input.env.NODE_ENV !== "development") return null;
  if (!pointsAtProduction(input.env.NEXT_PUBLIC_SUPABASE_URL)) return null;
  const host = input.host ?? "(no host header)";

  const knobs = await input.readKnobs();
  if (!knobs) return null; // already screamed; fail open

  const decision = decideWalkAdmission(input.registry, host, input.now, knobs, input.kind);
  const count = decision.active.length;
  if (decision.evicted.length) {
    input.log(`[walk-cap] EVICTED ${decision.evicted.join(", ")} to admit ${host}`);
  }
  if (decision.verdict === "admit") {
    if (decision.newlyAdmitted) {
      input.log(`[walk-cap] ADMITTED ${host} — ${count}/${knobs.cap} live-database walks active`);
    }
    return null;
  }
  if (decision.verdict === "parked") {
    return new Response("Walk evicted; resume explicitly to reclaim a production preview slot.", {
      status: 409,
      headers: { "cache-control": "no-store", [WALK_CAP_HEADER]: "evicted" },
    });
  }
  input.log(
    `[walk-cap] REFUSED ${host} — ${count}/${knobs.cap} live-database walks already active: ` +
      decision.active.map((w) => `${w.host} (${ago(w.idleMs)})`).join(", "),
  );
  return new Response(refusalPage(host, decision.active, knobs), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      [WALK_CAP_HEADER]: "refused",
    },
  });
}

// ─── Process-wide state (survives HMR via globalThis) ──────────────────────

interface WalkCapGlobal {
  registry: WalkRegistry;
  readKnobs: () => Promise<WalkKnobs | null>;
  listeners: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>;
  idleTimer?: ReturnType<typeof setTimeout>;
}

const GLOBAL_KEY = "__matrxWalkCap";

/** Test-only seam for endpoint integration coverage; never called by app code. */
export function setWalkCapTestState(state: WalkCapGlobal | undefined): void {
  const globalState = globalThis as unknown as Record<string, WalkCapGlobal | undefined>;
  if (globalState[GLOBAL_KEY]?.idleTimer) clearTimeout(globalState[GLOBAL_KEY].idleTimer);
  globalState[GLOBAL_KEY] = state;
}

function processState(): WalkCapGlobal {
  const g = globalThis as unknown as Record<string, WalkCapGlobal | undefined>;
  let state = g[GLOBAL_KEY];
  if (!state) {
    state = {
      registry: { admitted: new Map(), evicted: new Set() },
      listeners: new Map(),
      // The service-role (secret) key is used HERE ONLY because
      // platform.feature_knob has no anon read policy and the proxy has no
      // user-scoped client handy before the session pass. This whole module
      // is reachable only from `next dev` (see header); the key never leaves
      // the local dev server process.
      readKnobs: createWalkKnobReader({
        fetchImpl: fetch,
        restUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        apiKey: process.env.SUPABASE_SECRET_KEY?.trim(),
        now: Date.now,
        log: (line) => console.error(line),
      }),
    };
    g[GLOBAL_KEY] = state;
  }
  // HMR from the former Map-only implementation keeps useful admission order
  // while adding tombstones/listeners without throwing active walks away.
  if ((state.registry as unknown) instanceof Map) {
    state.registry = { admitted: state.registry as unknown as Map<string, number>, evicted: new Set() };
  }
  if (!state.listeners) state.listeners = new Map();
  return state;
}

/** One process timer, always aimed at the earliest current inactivity deadline. */
function scheduleIdleExpiry(state: WalkCapGlobal, knobs: WalkKnobs, now = Date.now()): void {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = undefined;
  if (knobs.cap <= 0 || state.registry.admitted.size === 0) return;

  const windowMs = knobs.windowMinutes * 60_000;
  const earliestDeadline = Math.min(...[...state.registry.admitted.values()].map((seen) => seen + windowMs + 1));
  const delay = Math.max(0, earliestDeadline - now);
  state.idleTimer = setTimeout(() => {
    state.idleTimer = undefined;
    const expired: string[] = [];
    const current = Date.now();
    for (const [host, lastSeen] of state.registry.admitted) {
      if (current - lastSeen > windowMs) {
        state.registry.admitted.delete(host);
        state.registry.evicted.add(host);
        expired.push(host);
      }
    }
    notifyEvicted(expired);
    if (expired.length) console.log(`[walk-cap] IDLE EVICTED ${expired.join(", ")}`);
    scheduleIdleExpiry(state, knobs, current);
  }, delay);
  (state.idleTimer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
}

/** Test-only seam for timer behavior; production callers use the gate wrapper. */
export function scheduleWalkIdleExpiryForTest(knobs: WalkKnobs): void {
  scheduleIdleExpiry(processState(), knobs);
}

/** The proxy's entry point: gate one signed-in request with process-wide state. */
export async function walkCapGateForRequest(
  host: string | null,
  kind: WalkRequestKind,
): Promise<Response | null> {
  if (process.env.NODE_ENV !== "development" || !pointsAtProduction(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return null;
  }
  const state = processState();
  const before = new Set(state.registry.evicted);
  const response = await walkCapGate({
    host,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    },
    readKnobs: state.readKnobs,
    registry: state.registry,
    now: Date.now(),
    log: (line) => console.log(line),
    kind,
  });
  notifyEvicted([...state.registry.evicted].filter((candidate) => !before.has(candidate)));
  const knobs = await state.readKnobs();
  if (knobs) scheduleIdleExpiry(state, knobs);
  return response;
}

const encoder = new TextEncoder();

function isDevProductionLocalhost(host: string | null): boolean {
  return process.env.NODE_ENV === "development" &&
    pointsAtProduction(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(host && (host === "localhost" || host.startsWith("localhost:") || host.includes(".localhost:")));
}

function parkedPage(returnTo: string): string {
  const safe = escapeHtml(returnTo);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview paused</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 16px;color:#1a1a1a;background:#fff}button{font:inherit;padding:9px 14px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer}@media (prefers-color-scheme:dark){body{color:#eee;background:#141414}}</style></head><body><main><h1>This preview was paused</h1><p>This preview was paused because it was idle or its slot was needed by another session. This tab has stopped loading the app and its live database activity.</p><form method="post" action="/__dev-walk"><input type="hidden" name="returnTo" value="${safe}"><button type="submit">Resume this preview</button></form></main></body></html>`;
}

function safeReturnTo(value: string | null): string {
  if (!value || value.startsWith("\\") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "http://walk-cap.localhost");
    if (url.origin !== "http://walk-cap.localhost" || url.pathname === "/__dev-walk") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function isSameOrigin(origin: string | null, host: string, protocol: string): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && parsed.protocol === protocol;
  } catch {
    return false;
  }
}

function notifyEvicted(hosts: string[]): void {
  const state = processState();
  for (const host of hosts) {
    for (const controller of state.listeners.get(host) ?? []) {
      try {
        controller.enqueue(encoder.encode("event: evicted\ndata: {}\n\n"));
        controller.close();
      } catch {
        // A tab can close between the listener snapshot and eviction.
      }
    }
    state.listeners.delete(host);
  }
}

/** Development-only proxy endpoint; it never admits or refreshes via SSE status. */
export async function walkCapDevEndpoint(request: Request): Promise<Response | null> {
  const host = request.headers.get("host");
  if (!isDevProductionLocalhost(host)) return null;
  const state = processState();
  const url = new URL(request.url);
  const normalizedHost = host as string;
  const requestOrigin = `${url.protocol}//${normalizedHost}`;
  if (request.method === "GET" && url.searchParams.get("parked") === "1") {
    return new Response(parkedPage(safeReturnTo(url.searchParams.get("returnTo"))), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (request.method === "GET" && url.searchParams.get("stream") === "1") {
    const knobs = await state.readKnobs();
    if (knobs) scheduleIdleExpiry(state, knobs);
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
        const set = state.listeners.get(normalizedHost) ?? new Set();
        set.add(controller);
        state.listeners.set(normalizedHost, set);
        const event = state.registry.evicted.has(normalizedHost) ? "evicted" : "state";
        controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
      },
      cancel() {
        const listeners = state.listeners.get(normalizedHost);
        if (controllerRef) listeners?.delete(controllerRef);
        if (listeners?.size === 0) state.listeners.delete(normalizedHost);
      },
    });
    request.signal.addEventListener("abort", () => {
      const listeners = state.listeners.get(normalizedHost);
      if (controllerRef) listeners?.delete(controllerRef);
      if (listeners?.size === 0) state.listeners.delete(normalizedHost);
    }, { once: true });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
  }
  if (request.method === "POST") {
    if (url.searchParams.get("activity") === "1") {
      const origin = request.headers.get("origin");
      if (!isSameOrigin(origin, normalizedHost, url.protocol)) return new Response("same-origin required", { status: 403 });
      if (state.registry.evicted.has(normalizedHost)) {
        return new Response("Walk evicted; resume explicitly to reclaim a production preview slot.", {
          status: 409,
          headers: { "cache-control": "no-store", [WALK_CAP_HEADER]: "evicted" },
        });
      }
      // A signed-out/login tab can mount the monitor before its first admitted
      // document request. Its clicks are a no-op, never an implicit admission.
      if (!state.registry.admitted.has(normalizedHost)) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      const response = await walkCapGateForRequest(normalizedHost, "activity");
      return response ?? new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }
    const origin = request.headers.get("origin");
    if (!isSameOrigin(origin, normalizedHost, url.protocol)) return new Response("same-origin required", { status: 403 });
    if (!state.registry.evicted.has(normalizedHost)) {
      return new Response("Only an evicted preview may resume here.", { status: 409, headers: { "cache-control": "no-store" } });
    }
    const form = await request.formData();
    const returnTo = safeReturnTo(typeof form.get("returnTo") === "string" ? form.get("returnTo") as string : null);
    const before = new Set(state.registry.evicted);
    const response = await walkCapGateForRequest(normalizedHost, "resume");
    if (response) return response.status === 409 ? new Response(parkedPage(returnTo), { status: 409, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }) : response;
    notifyEvicted([...state.registry.evicted].filter((candidate) => !before.has(candidate)));
    return Response.redirect(new URL(returnTo, requestOrigin), 303);
  }
  return new Response("not found", { status: 404 });
}

/** Explicit user activity only; background proxy traffic never calls this. */
export async function recordWalkActivity(host: string | null): Promise<Response | null> {
  return walkCapGateForRequest(host, "activity");
}
