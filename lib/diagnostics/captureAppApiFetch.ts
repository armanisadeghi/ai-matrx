/**
 * captureAppApiFetch.ts — failed calls to our own Next.js API routes reach the
 * Error Inspector.
 *
 * `callApi` already captures every Python-backend failure (captureApiError)
 * and the Supabase client is wrapped (supabaseErrorCapture). Same-origin
 * `/api/*` routes were the gap: a screen that failed on one showed its
 * sentence while the request behind it was nowhere, so the error's
 * Copy-for-AI could not name it (RC-B12 round 2). This wraps `window.fetch`
 * once and captures a non-2xx or network failure on a same-origin `/api/`
 * path — method, path, status, and the route's own error sentence.
 *
 * A request cancelled because the page is leaving is not captured (see
 * `pageIsLeaving`); a network failure while the page stays is.
 *
 * Tier: orange by rule (`app-api-http`), client-only. Capture never breaks the
 * caller: the original response is returned untouched and every capture step
 * is wrapped.
 */
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { pageIsLeaving } from "@ai-matrx/chat/agents/redux/execution-system/utils/page-leaving";

let installed = false;

// When the page is leaving (reload, navigation, the error screen's Reload) the
// browser cancels every request still in flight, and fetch reports each as a
// plain "Failed to fetch" — not a failure of the route: Vercel answered all of
// them 200 on 2026-10-03, while the inspector recorded three orange rows after
// a reload out of a crash. ONE detector for every capture site:
// `pageIsLeaving` (the live stream's transport sink uses it too).

function appApiPath(input: RequestInfo | URL): string | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return url.pathname.startsWith("/api/") ? url.pathname : null;
  } catch {
    return null;
  }
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "object" && "method" in input && typeof input.method === "string") {
    return input.method.toUpperCase();
  }
  return "GET";
}

async function sentenceOf(response: Response): Promise<string | undefined> {
  try {
    const text = (await response.clone().text()).slice(0, 2000);
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      for (const key of ["user_message", "error", "message", "detail"]) {
        const v = body[key];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (v && typeof v === "object" && typeof (v as { message?: unknown }).message === "string") {
          return (v as { message: string }).message;
        }
      }
    } catch {
      // not JSON — fall through to the raw text
    }
    return text.trim().slice(0, 300) || undefined;
  } catch {
    return undefined;
  }
}

export function installAppApiFetchCapture(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = appApiPath(input);
    if (!path) return original(input, init);
    const method = methodOf(input, init);
    let response: Response;
    try {
      response = await original(input, init);
    } catch (error) {
      try {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        if (!aborted && !pageIsLeaving()) {
          captureError({
            source: "app-api-http",
            relation: path,
            status: 0,
            message: `${method} ${path} did not reach the server: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      } catch {
        // capture never breaks the caller
      }
      throw error;
    }
    if (!response.ok) {
      void sentenceOf(response).then((said) => {
        try {
          captureError({
            source: "app-api-http",
            relation: path,
            status: response.status,
            message: said
              ? `${method} ${path} → ${response.status}: ${said}`
              : `${method} ${path} → ${response.status}`,
            ...(said ? { userMessage: said } : {}),
          });
        } catch {
          // capture never breaks the caller
        }
      });
    }
    return response;
  };
}
