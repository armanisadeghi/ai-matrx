"use client";

/**
 * THE INSTRUMENT — a read-only snapshot of the component resolver's own state,
 * on the page, in production.
 *
 * WHY THIS EXISTS. Between 2026-09-13 and 2026-09-14, four lanes chased one
 * live defect: on `/shapes/<kind>/instances` a reader was handed the platform's
 * bundled component while their organization's authored one was already in the
 * browser. Every lane reasoned from tests and server logs because nobody could
 * see what the resolver actually held at the moment of the wrong render, and
 * three of the resulting fixes were proven by a clean-root test and disproven
 * by production. The missing thing was never analysis, it was an instrument.
 *
 * So: with `?matrxKindDebug=1` on any page (or once per tab, after the flag has
 * been used once), `window.__matrxKindRegistryDebug(kind?)` answers with what
 * the resolver holds RIGHT NOW — which tier answered, whether a body is bound,
 * whether the kind's read was refused, whether the warm list has landed, and
 * the repaint counter the render seam keys on.
 *
 * Rules it keeps:
 *  - READ-ONLY. It resolves, counts and copies; it never fetches, ingests,
 *    clears a verdict or mutates a registry. Calling it cannot change a render.
 *  - NEVER THROWS. Every field is guarded; a field it cannot read comes back
 *    `null` rather than taking the page down.
 *  - NO PAYLOADS. Component bodies are reported as LENGTHS, never as text, and
 *    no kind instance value is read at all — this is registry state, not data.
 *  - OFF BY DEFAULT. No flag, no global: `window.__matrxKindRegistryDebug` is
 *    simply absent, so nothing ships an always-on hook into a reader's page.
 */

import type { ComponentRegistry } from "./component-registry";

/** Query flag that arms the snapshot: `?matrxKindDebug=1`. */
export const KIND_REGISTRY_DEBUG_FLAG = "matrxKindDebug";

/** The global the flag installs. Named once, here. */
export const KIND_REGISTRY_DEBUG_GLOBAL = "__matrxKindRegistryDebug";

/**
 * Per-TAB latch. Client navigation drops the query string, and the interesting
 * reads are often two routes in; `sessionStorage` keeps the instrument armed
 * for the tab that asked for it and for no one else.
 */
const DEBUG_LATCH_KEY = "matrx:kind-registry-debug";

function armed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = new URLSearchParams(window.location.search).get(
      KIND_REGISTRY_DEBUG_FLAG,
    );
    if (flag !== null && flag !== "0" && flag !== "false") {
      try {
        window.sessionStorage.setItem(DEBUG_LATCH_KEY, "1");
      } catch {
        /* private mode — the flag still arms THIS page */
      }
      return true;
    }
    return window.sessionStorage.getItem(DEBUG_LATCH_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Install the snapshot global when the flag is armed. Idempotent, and a no-op
 * on the server and on every un-flagged page.
 */
export function installKindRegistryDebug(registry: ComponentRegistry): void {
  if (!armed()) return;
  const host = window as unknown as Record<string, unknown>;
  if (typeof host[KIND_REGISTRY_DEBUG_GLOBAL] === "function") return;
  host[KIND_REGISTRY_DEBUG_GLOBAL] = (kind?: string) => {
    try {
      return registry.debugSnapshot(kind ?? null);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
}
