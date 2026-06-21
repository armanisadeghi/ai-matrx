/**
 * overlayDiagnostics — collect the state that ACTUALLY matters when an overlay
 * fails to render.
 *
 * The first version of the error payload dumped the entire Redux store: huge,
 * and useless for the failure that actually happens here — a `next/dynamic`
 * CHUNK LOAD failure. For that, the high-signal data is not "every slice", it's:
 *
 *   - Deploy/skew forensics: the build id, and the set of `?dpl=` deployment ids
 *     across already-loaded scripts. A *mix* of dpl values (or a chunk requested
 *     with NO dpl while the page's scripts have one) is the smoking gun for the
 *     skew-routing failure that hangs the import.
 *   - Network forensics: which `_next/static/chunks/*.js` resource-timing
 *     entries failed / are pending / never completed (the hanging chunk).
 *   - Connection state: online flag, effective connection type.
 *   - ONLY the overlay-relevant slices: `overlays` (the open instances + their
 *     data), `windowManager` (window registry + global hide flag), `appContext`
 *     (what the user is working on), and a redacted `user` summary.
 *
 * Everything is captured at error time, sanitized, and grouped into named
 * sections so an admin (or an LLM) reads the cause in seconds.
 */

export interface OverlayDiagnostics {
  deploy: {
    nodeEnv: string | undefined;
    nextBuildId: string | null;
    /** The deployment id THIS build believes it is (NEXT_PUBLIC_DEPLOYMENT_ID). */
    configuredDeploymentId: string | null;
    /** Distinct `?dpl=` values seen across loaded <script> tags. */
    deploymentIdsOnPage: string[];
    /** True if any _next script carries no `?dpl=` while others/this build do. */
    someScriptsMissingDpl: boolean;
    /** True if a loaded script's dpl differs from this build's configured id. */
    deploymentIdMismatch: boolean;
    /** True if scripts disagree on dpl, or some have none — skew suspect. */
    deploymentSkewSuspected: boolean;
    /** ms since the document started loading (stale tab = higher skew odds). */
    pageAgeMs: number | null;
  };
  network: {
    online: boolean | null;
    effectiveType: string | null;
    downlinkMbps: number | null;
    rttMs: number | null;
    /** Chunk resource-timing entries that look failed/pending. */
    failedOrPendingChunks: ChunkTiming[];
    chunkCount: number;
  };
  loadedScripts: string[];
  overlayState: {
    overlays: unknown;
    windows: Record<
      string,
      { state?: unknown; overlayId?: unknown; title?: unknown }
    >;
    globallyHidden: unknown;
  };
  appContext: unknown;
  user: {
    id: unknown;
    isAdmin: unknown;
    adminLevel: unknown;
    authReady: unknown;
  };
  page: {
    url: string;
    route: string;
    referrer: string;
    userAgent: string;
    viewport: string;
    devicePixelRatio: number | null;
  };
}

interface ChunkTiming {
  name: string;
  status: number | null;
  durationMs: number;
  transferSize: number | null;
  initiatorType: string;
  completed: boolean;
}

function getNextBuildId(): string | null {
  if (typeof window === "undefined") return null;
  const data = (window as unknown as { __NEXT_DATA__?: { buildId?: string } })
    .__NEXT_DATA__;
  return data?.buildId ?? null;
}

function collectLoadedScripts(): string[] {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll("script[src]"))
    .map((s) => (s as HTMLScriptElement).src)
    .filter(Boolean);
}

function collectDeploymentIds(
  scripts: string[],
  configuredId: string | null,
): {
  ids: string[];
  someMissingDpl: boolean;
  mismatch: boolean;
  skew: boolean;
} {
  const ids = new Set<string>();
  let sawNone = false;
  for (const src of scripts) {
    // Only chunk/static assets carry dpl meaningfully.
    if (!src.includes("/_next/")) continue;
    try {
      const u = new URL(src);
      const dpl = u.searchParams.get("dpl");
      if (dpl) ids.add(dpl);
      else sawNone = true;
    } catch {
      /* ignore unparseable */
    }
  }
  const list = Array.from(ids);
  // A loaded script's dpl that doesn't match this build's configured id means
  // the page is assembled from >1 deployment — definitive skew.
  const mismatch =
    configuredId !== null && list.some((id) => id !== configuredId);
  // Skew suspected when: scripts disagree (>1 dpl), a mix of dpl-tagged and
  // untagged _next assets, or a dpl mismatches this build.
  const skew = list.length > 1 || (list.length >= 1 && sawNone) || mismatch;
  return { ids: list, someMissingDpl: sawNone, mismatch, skew };
}

function collectChunkTimings(): {
  failedOrPending: ChunkTiming[];
  total: number;
} {
  if (typeof performance === "undefined" || !performance.getEntriesByType) {
    return { failedOrPending: [], total: 0 };
  }
  const entries = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  const chunks = entries.filter(
    (e) => e.name.includes("/_next/static/") && e.name.includes(".js"),
  );
  const failedOrPending: ChunkTiming[] = [];
  for (const e of chunks) {
    const status =
      typeof (e as unknown as { responseStatus?: number }).responseStatus ===
      "number"
        ? (e as unknown as { responseStatus: number }).responseStatus
        : null;
    const completed = e.responseEnd > 0;
    const transferSize =
      typeof e.transferSize === "number" ? e.transferSize : null;
    // Flag: HTTP error, never completed, or completed with zero bytes (a
    // 200-but-empty / blocked response — a known skew failure shape).
    const looksFailed =
      (status !== null && status >= 400) ||
      !completed ||
      (completed && transferSize === 0 && (e.encodedBodySize ?? 0) === 0);
    if (looksFailed) {
      failedOrPending.push({
        name: e.name,
        status,
        durationMs: Math.round(e.duration),
        transferSize,
        initiatorType: e.initiatorType,
        completed,
      });
    }
  }
  return { failedOrPending, total: chunks.length };
}

function collectConnection(): {
  online: boolean | null;
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
} {
  if (typeof navigator === "undefined") {
    return { online: null, effectiveType: null, downlink: null, rtt: null };
  }
  const conn = (
    navigator as unknown as {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number };
    }
  ).connection;
  return {
    online: typeof navigator.onLine === "boolean" ? navigator.onLine : null,
    effectiveType: conn?.effectiveType ?? null,
    downlink: typeof conn?.downlink === "number" ? conn.downlink : null,
    rtt: typeof conn?.rtt === "number" ? conn.rtt : null,
  };
}

function pageAgeMs(): number | null {
  if (typeof performance === "undefined") return null;
  try {
    return Math.round(performance.now());
  } catch {
    return null;
  }
}

/**
 * Build the diagnostics from live browser state + a (possibly null) Redux
 * snapshot. `reduxState` is read lazily by the caller; we only touch the
 * overlay-relevant slices, never the whole tree.
 */
export function collectOverlayDiagnostics(
  reduxState: unknown,
): OverlayDiagnostics {
  const scripts = collectLoadedScripts();
  const configuredDeploymentId = process.env.NEXT_PUBLIC_DEPLOYMENT_ID || null;
  const { ids, someMissingDpl, mismatch, skew } = collectDeploymentIds(
    scripts,
    configuredDeploymentId,
  );
  const { failedOrPending, total } = collectChunkTimings();
  const conn = collectConnection();

  const s = (reduxState ?? {}) as Record<string, unknown>;
  const overlays = (s.overlays as Record<string, unknown>) ?? null;
  const wm = (s.windowManager as Record<string, unknown>) ?? {};
  const wmWindows =
    (wm.windows as Record<string, Record<string, unknown>>) ?? {};
  const user = (s.userAuth as Record<string, unknown>) ?? {};

  // Trim window entries to the fields that matter (state/title/overlayId),
  // dropping geometry noise.
  const windows: Record<
    string,
    { state?: unknown; overlayId?: unknown; title?: unknown }
  > = {};
  for (const [id, w] of Object.entries(wmWindows)) {
    windows[id] = {
      state: w?.state,
      overlayId: w?.overlayId,
      title: w?.title,
    };
  }

  return {
    deploy: {
      nodeEnv: process.env.NODE_ENV,
      nextBuildId: getNextBuildId(),
      configuredDeploymentId,
      deploymentIdsOnPage: ids,
      someScriptsMissingDpl: someMissingDpl,
      deploymentIdMismatch: mismatch,
      deploymentSkewSuspected: skew,
      pageAgeMs: pageAgeMs(),
    },
    network: {
      online: conn.online,
      effectiveType: conn.effectiveType,
      downlinkMbps: conn.downlink,
      rttMs: conn.rtt,
      failedOrPendingChunks: failedOrPending,
      chunkCount: total,
    },
    loadedScripts: scripts,
    overlayState: {
      overlays,
      windows,
      globallyHidden: wm.globallyHidden ?? wm.hidden ?? null,
    },
    appContext: s.appContext ?? null,
    user: {
      id: user.id,
      isAdmin: user.isAdmin,
      adminLevel: user.adminLevel,
      authReady: user.authReady,
    },
    page: {
      url: typeof window !== "undefined" ? window.location.href : "",
      route: typeof window !== "undefined" ? window.location.pathname : "",
      referrer: typeof document !== "undefined" ? document.referrer : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      viewport:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight}`
          : "",
      devicePixelRatio:
        typeof window !== "undefined" ? window.devicePixelRatio : null,
    },
  };
}
