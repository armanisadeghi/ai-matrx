/**
 * overlayErrorReport
 *
 * Turns an overlay render/chunk failure into (a) a short human-readable
 * summary and (b) an exhaustive, xml-structured "Copy for AI" payload that an
 * admin can hand straight to an LLM to debug. The whole point: when an overlay
 * silently fails to render in production (almost always a `next/dynamic` chunk
 * load failure — see the OverlayController FEATURE notes), the admin gets SO
 * much context that the fix is obvious.
 *
 * The AI payload is built with the shared {@link buildAgentPayload} envelope so
 * it matches every other "Copy for AI" surface in the app. Data is sanitized
 * through {@link safeStringify} first because we dump live Redux state, which
 * can contain circular refs, functions, Errors, etc.
 */

import {
  buildAgentPayload,
  type AgentPayloadInput,
} from "@/components/agent-copy/buildAgentPayload";

export interface OverlayErrorContext {
  /** Module path of the failed dynamic import, if we could derive it. */
  modulePath: string | null;
  /** The thrown error. */
  error: unknown;
  /** React component stack from componentDidCatch, if available. */
  componentStack: string | null;
  /** Whether the current user is an admin (gates the full state dump). */
  isAdmin: boolean;
  /**
   * Live Redux state. Only included in the payload for admins. Passed lazily
   * (a getter) so we never read the store for non-admins.
   */
  getReduxState: () => unknown;
}

/** A `JSON.stringify` that never throws: handles circular refs, Errors, BigInt, etc. */
export function safeStringify(value: unknown, space = 2): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === "bigint") return `${val.toString()}n`;
        if (val instanceof Error) {
          return {
            __error: true,
            name: val.name,
            message: val.message,
            stack: val.stack,
          };
        }
        if (typeof val === "function")
          return `[Function ${val.name || "anonymous"}]`;
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      },
      space,
    );
  } catch (err) {
    return `[Unserializable: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

/** Normalize an unknown thrown value into a structured, inspectable shape. */
export function normalizeError(error: unknown): {
  name: string;
  message: string;
  stack: string | null;
  isChunkLoadError: boolean;
} {
  const name =
    error instanceof Error
      ? error.name
      : typeof error === "string"
        ? "Error"
        : "UnknownError";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : safeStringify(error, 0);
  const stack = error instanceof Error && error.stack ? error.stack : null;
  // ChunkLoadError is the signature failure here — a dynamic import whose JS
  // chunk 404s or stalls (stale deploy / cache / fragmented chunk graph).
  const haystack = `${name} ${message} ${stack ?? ""}`;
  const isChunkLoadError =
    name === "ChunkLoadError" ||
    /Loading( CSS)? chunk [\w-]+ failed/i.test(haystack) ||
    /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
      haystack,
    );
  return { name, message, stack, isChunkLoadError };
}

function liveContext(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return {
    url: window.location.href,
    route: window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

/** Short, human-readable failure summary (the plain "Copy" button payload). */
export function buildOverlayErrorHuman(ctx: OverlayErrorContext): string {
  const e = normalizeError(ctx.error);
  const live = liveContext();
  const lines = [
    `Overlay failed to render`,
    `Module: ${ctx.modulePath ?? "unknown"}`,
    `Error: ${e.name}: ${e.message}`,
    e.isChunkLoadError
      ? `Likely cause: dynamic chunk failed to load (stale build / cache / fragmented chunk graph). A hard reload usually recovers it.`
      : null,
    live.route ? `Route: ${live.route}` : null,
    live.url ? `URL: ${live.url}` : null,
    `At: ${new Date().toISOString()}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * The exhaustive AI payload. For admins it embeds the full live Redux state so
 * an LLM has everything: the error, the component stack, the failing module,
 * page/route/browser context, and the complete app state at failure time.
 */
export function buildOverlayErrorAgentPayload(
  ctx: OverlayErrorContext,
): string {
  const e = normalizeError(ctx.error);

  // Pre-sanitize everything we embed so buildAgentPayload's JSON.stringify
  // can never throw on circular Redux state.
  const reduxState = ctx.isAdmin
    ? JSON.parse(safeStringify(ctx.getReduxState()))
    : "[redacted — admin only]";

  const data = {
    error: {
      name: e.name,
      message: e.message,
      stack: e.stack,
      isChunkLoadError: e.isChunkLoadError,
    },
    failedModule: ctx.modulePath,
    componentStack: ctx.componentStack,
    build: {
      // Useful to spot deploy skew (the #1 chunk-load cause).
      nodeEnv: process.env.NODE_ENV,
      buildId:
        (typeof window !== "undefined" &&
          (window as unknown as { __NEXT_DATA__?: { buildId?: string } })
            .__NEXT_DATA__?.buildId) ||
        null,
    },
    reduxState,
  };

  const input: AgentPayloadInput = {
    kind: "overlay-render-error",
    location: "AI Matrx — Overlay Controller (render failure)",
    description: `An overlay (${ctx.modulePath ?? "unknown module"}) threw while rendering. ${
      e.isChunkLoadError
        ? "This is a dynamic-import chunk load failure."
        : "This is a runtime render error."
    }`,
    data,
    attributes: {
      module: ctx.modulePath ?? undefined,
      errorName: e.name,
      chunkLoadError: e.isChunkLoadError,
      adminDump: ctx.isAdmin,
    },
    context: liveContext(),
  };

  return buildAgentPayload(input);
}
