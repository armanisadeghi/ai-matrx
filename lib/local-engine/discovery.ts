/**
 * Matrx Local engine discovery — find the user's desktop engine on localhost.
 *
 * The Matrx Local desktop app (Tauri + Python engine) binds 127.0.0.1 on the
 * first free port in 22140–22159 (see matrx-local app/preflight.py). This
 * module is the PRODUCTION home of the port-scan canon that previously lived
 * only in the (dev) local-tools demo (`app/(dev)/demos/local-tools/_lib`) —
 * production code imports from here, never from a demo.
 *
 * Consumers:
 *   - `resolveBackendForConversation` (features/agents/.../resolve-base-url.ts)
 *     reads the SYNC cache via `getCachedLocalEngine()` to route a
 *     local-pc-bound conversation's AI stream directly at the engine
 *     ("local-runtime" channel) instead of through the aidream local-proxy.
 *   - Execute/resume thunks WARM the cache with
 *     `discoverLocalEngine()` before resolving the backend (the resolver is
 *     pure/synchronous, so discovery must happen upstream).
 *
 * Caching: a successful discovery is trusted for POSITIVE_TTL_MS; a full-scan
 * miss is trusted for NEGATIVE_TTL_MS (so every turn doesn't burn a 20-port
 * scan while the app is closed). A cached engine is re-verified with a single
 * /health probe when its TTL lapses. Failures are LOUD (console.warn) — a
 * local-pc-bound conversation silently falling back to the proxy path is
 * exactly the failure mode we refuse to hide.
 */

export const LOCAL_ENGINE_PORT_START = 22140;
export const LOCAL_ENGINE_PORT_COUNT = 20;

const HEALTH_TIMEOUT_MS = 1_500;
const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 15_000;

const LOG = "[local-engine]";

export interface LocalEngineInfo {
  /** e.g. "http://127.0.0.1:22140" — no trailing slash. */
  baseUrl: string;
  port: number;
  version: string | null;
  /** Explicit execution contracts supported by this engine build. */
  capabilities: string[];
  /** Epoch ms of the successful health check. */
  discoveredAt: number;
}

interface HealthBody {
  status?: string;
  version?: string;
  capabilities?: unknown;
}

let cached: LocalEngineInfo | null = null;
let lastMissAt: number | null = null;
let inflight: Promise<LocalEngineInfo | null> | null = null;

async function probePort(port: number): Promise<LocalEngineInfo | null> {
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as HealthBody;
    return {
      baseUrl,
      port,
      version: body.version ?? null,
      capabilities: Array.isArray(body.capabilities)
        ? body.capabilities.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      discoveredAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function scan(): Promise<LocalEngineInfo | null> {
  const probes = Array.from({ length: LOCAL_ENGINE_PORT_COUNT }, (_, i) =>
    probePort(LOCAL_ENGINE_PORT_START + i),
  );
  const results = await Promise.all(probes);
  // Lowest responding port wins — matches the engine's own port-assignment
  // order (it takes the first free port in the range).
  return results.find((r): r is LocalEngineInfo => r !== null) ?? null;
}

/**
 * SYNC read of the discovery cache. Returns the engine only while its
 * positive TTL is fresh — a stale entry returns `null` so the pure resolver
 * never routes a stream at an engine nobody has verified recently.
 */
export function getCachedLocalEngine(): LocalEngineInfo | null {
  if (cached && Date.now() - cached.discoveredAt < POSITIVE_TTL_MS) {
    return cached;
  }
  return null;
}

/** Reachability is insufficient: saved-agent routing requires definition parity. */
export function supportsLocalAgentExecution(engine: LocalEngineInfo): boolean {
  return engine.capabilities.includes("agent_execution_v1");
}

/**
 * Discover (or re-verify) the local engine. Coalesces concurrent callers,
 * honors the negative-result cooldown, and refreshes a stale positive cache
 * with a single-port re-probe before falling back to a full scan.
 */
export async function discoverLocalEngine(options?: {
  force?: boolean;
}): Promise<LocalEngineInfo | null> {
  const force = options?.force ?? false;

  if (!force) {
    const fresh = getCachedLocalEngine();
    if (fresh) return fresh;
    if (lastMissAt !== null && Date.now() - lastMissAt < NEGATIVE_TTL_MS) {
      return null;
    }
  }
  if (inflight) return inflight;

  inflight = (async () => {
    // Stale positive cache → cheap single-port recheck first.
    if (cached) {
      const recheck = await probePort(cached.port);
      if (recheck) {
        cached = recheck;
        lastMissAt = null;
        return recheck;
      }
      console.warn(
        `${LOG} engine on port ${cached.port} stopped responding — rescanning ${LOCAL_ENGINE_PORT_START}–${LOCAL_ENGINE_PORT_START + LOCAL_ENGINE_PORT_COUNT - 1}.`,
      );
      cached = null;
    }
    const found = await scan();
    if (found) {
      cached = found;
      lastMissAt = null;
      console.info(
        `${LOG} Matrx Local engine discovered at ${found.baseUrl} (version ${found.version ?? "unknown"}).`,
      );
    } else {
      lastMissAt = Date.now();
    }
    return found;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Test-only: reset the module cache. */
export function __resetLocalEngineCacheForTests(): void {
  cached = null;
  lastMissAt = null;
  inflight = null;
}
