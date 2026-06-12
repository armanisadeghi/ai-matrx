/**
 * lib/api/log-api-target.ts
 *
 * ONE place that logs the *final, resolved* destination of every outbound
 * backend call — at the last moment, after every layer of server-address
 * resolution has run and the URL can no longer change before `fetch()`.
 *
 * Why this exists:
 *   We have several independent resolution layers — `selectResolvedBaseUrl`
 *   (apiConfigSlice), the EC2 / sandbox override channel in
 *   `resolve-base-url.ts`, per-call `forceBaseUrl` / `baseUrlOverride`, and
 *   the env-var fallback in `python-client.ts`. A bug in any one of them can
 *   silently send traffic to the wrong host (or to the sandbox URL, which is
 *   reserved for a single rare case). This logger makes the actual target of
 *   EVERY call visible in the console so misrouting is impossible to miss.
 *
 * Call this immediately before the `fetch()` / `resilientFetch()` /
 * `XMLHttpRequest.open()` that uses the URL — never earlier.
 */

export interface ApiTargetLogContext {
  /** Short label of the call site, e.g. "callApi", "python-client.postJson". */
  source: string;
  /** HTTP method when known. */
  method?: string;
  /**
   * Resolution channel when the call site knows it — "global" / "override" /
   * "ec2-dedicated" / "force" / "env-fallback". Surfaces sandbox routing.
   */
  channel?: string;
  /** The active server environment key from apiConfigSlice, when available. */
  activeServer?: string;
  /** Anything else worth seeing (conversationId, requestId, etc.). */
  [extra: string]: unknown;
}

/**
 * Hosts that should almost never appear as an API target. If a resolved URL
 * points at one of these, the log is escalated to a hard `console.error` so it
 * stands out — the sandbox server is reserved for a single, rare case.
 */
const SUSPECT_HOST_FRAGMENTS = ["sandbox"] as const;

function looksSuspect(url: string): boolean {
  const lower = url.toLowerCase();
  return SUSPECT_HOST_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Log the final resolved target URL for an outbound backend call.
 *
 * Normal calls log at `console.info` with a green tag. Calls whose host looks
 * like a sandbox/override target log at `console.error` with a red tag so they
 * are impossible to miss while hunting a misrouting bug.
 */
export function logApiTarget(url: string, context: ApiTargetLogContext): void {
  const { source, method, channel, activeServer, ...extra } = context;

  let origin = url;
  try {
    origin = new URL(url).origin;
  } catch {
    /* relative or malformed — log the raw string */
  }

  const suspect = looksSuspect(url);
  const tag = suspect ? "🚨 API TARGET (SANDBOX?)" : "📡 API TARGET";
  const style = suspect
    ? "font-weight:bold;color:#fff;background:#c0392b;padding:1px 4px;border-radius:3px;"
    : "font-weight:bold;color:#fff;background:#16a085;padding:1px 4px;border-radius:3px;";

  const meta: Record<string, unknown> = {
    origin,
    fullUrl: url,
    source,
  };
  if (method) meta.method = method;
  if (channel) meta.channel = channel;
  if (activeServer) meta.activeServer = activeServer;
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) meta[k] = v;
  }

  const log = suspect ? console.error : console.info;
  log(
    `%c${tag}%c ${method ? method + " " : ""}${url}`,
    style,
    "color:inherit;",
    meta,
  );
}
