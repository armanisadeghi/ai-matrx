/** Loaded-document evidence shared by every error capture and overlay diagnostics. */
export function getNextBuildId(): string | null {
  if (typeof window === "undefined") return null;
  const nextData: unknown = Reflect.get(window, "__NEXT_DATA__");
  if (typeof nextData !== "object" || nextData === null) return null;
  const buildId: unknown = Reflect.get(nextData, "buildId");
  return typeof buildId === "string" ? buildId : null;
}

export function collectLoadedScripts(): string[] {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll("script[src]"))
    .map((s) => (s as HTMLScriptElement).src)
    .filter(Boolean);
}

export function collectDeploymentIds(
  scripts: string[],
  configuredId: string | null,
): {
  ids: string[];
  someMissingDpl: boolean;
  mismatch: boolean;
  inconsistency: boolean;
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
  // A loaded script's dpl that doesn't match this build's configured id is an
  // observed deployment-id inconsistency. It does not establish why it arose.
  const mismatch =
    configuredId !== null && list.some((id) => id !== configuredId);
  const inconsistency =
    list.length > 1 || (list.length >= 1 && sawNone) || mismatch;
  return { ids: list, someMissingDpl: sawNone, mismatch, inconsistency };
}

let pageSessionId: string | null = null;

/** Snapshot at capture time; never substitutes the latest server deployment. */
export function collectBrowserProvenance() {
  if (typeof window === "undefined") return null;
  try {
    pageSessionId ??= crypto.randomUUID();
    const configuredDeploymentId =
      process.env.NEXT_PUBLIC_DEPLOYMENT_ID || null;
    const observed = collectDeploymentIds(
      collectLoadedScripts(),
      configuredDeploymentId,
    );
    return {
      pageSessionId,
      pageStartedAt: performance.timeOrigin,
      pageAgeMs: Math.round(performance.now()),
      origin: window.location.origin,
      online: navigator.onLine,
      visibility: document.visibilityState,
      nextBuildId: getNextBuildId(),
      configuredDeploymentId,
      deploymentIdsOnPage: observed.ids,
      someScriptsMissingDpl: observed.someMissingDpl,
      deploymentIdMismatch: observed.mismatch,
      deploymentIdInconsistency: observed.inconsistency,
    };
  } catch {
    // Diagnostics must not prevent the original error from being captured.
    return null;
  }
}

export type BrowserProvenance = ReturnType<typeof collectBrowserProvenance>;
