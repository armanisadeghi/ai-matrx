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
// request from a host that is NOT already an active walk, while the active
// walks already number `ops.agent_walks.production_concurrent_cap`, gets an
// honest 503 page naming the walks in progress and sending the agent to the
// clone preview (`pnpm preview:start --clone`). Already-admitted hosts keep
// walking; signed-out requests (the login page, assets) always pass.
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
  | { verdict: "admit"; newlyAdmitted: boolean; active: ActiveWalk[] }
  | { verdict: "refuse"; active: ActiveWalk[] };

/**
 * The admission rule. `registry` maps an admitted preview host to the last
 * time a signed-in request arrived from it; this prunes hosts idle past the
 * window, then admits (and records) or refuses `host`. Deterministic: the
 * clock is an argument.
 */
export function decideWalkAdmission(
  registry: Map<string, number>,
  host: string,
  now: number,
  knobs: WalkKnobs,
): WalkDecision {
  const windowMs = knobs.windowMinutes * 60_000;
  for (const [seenHost, lastSeen] of registry) {
    if (now - lastSeen > windowMs) registry.delete(seenHost);
  }
  const active = (): ActiveWalk[] =>
    [...registry.entries()]
      .map(([h, lastSeen]) => ({ host: h, idleMs: now - lastSeen }))
      .sort((a, b) => a.idleMs - b.idleMs);

  if (knobs.cap <= 0) return { verdict: "refuse", active: active() };

  if (registry.has(host)) {
    registry.set(host, now);
    return { verdict: "admit", newlyAdmitted: false, active: active() };
  }
  if (registry.size >= knobs.cap) {
    return { verdict: "refuse", active: active() };
  }
  registry.set(host, now);
  return { verdict: "admit", newlyAdmitted: true, active: active() };
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
    : "<li>(none — the cap is 0, so every walk goes to the clone)</li>";
  const cloneHost = host.replace(/:\d+$/, `:${CLONE_PORT}`);
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
<p>Start your walk against the clone instead: <code>pnpm preview:start --clone</code> (port ${CLONE_PORT}), then open <code>http://${escapeHtml(cloneHost)}</code> and sign in with <code>pnpm dev-login --clone</code>.</p>
<p>Or wait until one of them goes idle for ${knobs.windowMinutes} minutes, then reload this page.</p>
<p><small>Host refused: <code>${escapeHtml(host)}</code>. Knobs: <code>${WALK_CAP_FEATURE}.${CAP_KEY}</code> and <code>${WALK_CAP_FEATURE}.${WINDOW_KEY}</code>. This check runs only in local development against the live database.</small></p>
</body></html>`;
}

export interface WalkCapGateInput {
  host: string | null;
  env: { NODE_ENV?: string; NEXT_PUBLIC_SUPABASE_URL?: string };
  readKnobs: () => Promise<WalkKnobs | null>;
  registry: Map<string, number>;
  now: number;
  log: (line: string) => void;
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

  const decision = decideWalkAdmission(input.registry, host, input.now, knobs);
  const count = decision.active.length;
  if (decision.verdict === "admit") {
    if (decision.newlyAdmitted) {
      input.log(`[walk-cap] ADMITTED ${host} — ${count}/${knobs.cap} live-database walks active`);
    }
    return null;
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
  registry: Map<string, number>;
  readKnobs: () => Promise<WalkKnobs | null>;
}

const GLOBAL_KEY = "__matrxWalkCap";

function processState(): WalkCapGlobal {
  const g = globalThis as unknown as Record<string, WalkCapGlobal | undefined>;
  let state = g[GLOBAL_KEY];
  if (!state) {
    state = {
      registry: new Map(),
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
  return state;
}

/** The proxy's entry point: gate one signed-in request with process-wide state. */
export async function walkCapGateForRequest(host: string | null): Promise<Response | null> {
  const state = processState();
  return walkCapGate({
    host,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    },
    readKnobs: state.readKnobs,
    registry: state.registry,
    now: Date.now(),
    log: (line) => console.log(line),
  });
}
