/**
 * Render-path tracing for /war-room/[id] → Stage → Agent tab →
 * AgentAssistantMessage. Filter DevTools console on `[Track War Room]`.
 *
 * **Development:** always on.
 *
 * **Production:** off by default. Opt in with either:
 *   - `?war-room-trace=1` on the URL (persists for the browser tab via sessionStorage)
 *   - `localStorage.setItem('war-room:render-path-trace', '1')` then reload
 *
 * Disable on prod: `?war-room-trace=0` or
 * `localStorage.removeItem('war-room:render-path-trace')`.
 */

const PREFIX = "[Track War Room]";
const STORAGE_KEY = "war-room:render-path-trace";
const QUERY_PARAM = "war-room-trace";

function isWarRoomRenderPathTraceEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);
    const qp = params.get(QUERY_PARAM);
    if (qp === "1" || qp === "true") {
      sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (qp === "0" || qp === "false") {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
  } catch {
    // sessionStorage blocked — fall through
  }

  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return true;
    if (localStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    return false;
  }

  return false;
}

export function traceWarRoomRenderPath(
  step: number,
  file: string,
  label: string,
  detail?: Record<string, unknown>,
): void {
  if (!isWarRoomRenderPathTraceEnabled()) return;
  const line = `${PREFIX} ${step}, ${file} — ${label}`;
  if (detail) {
    console.log(line, detail);
  } else {
    console.log(line);
  }
}

/** Surface keys used by the tile Agent tab (ExperimentalAgentScreen). */
export function isWarRoomTileAgentSurface(surfaceKey?: string): boolean {
  return !!surfaceKey?.startsWith("studio-assistant-experimental:");
}
