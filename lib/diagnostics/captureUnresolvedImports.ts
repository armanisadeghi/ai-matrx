/**
 * captureUnresolvedImports — the error-queue half of THE UNRESOLVED-IMPORT
 * RULE (Law 4, 2026-10-01).
 *
 * Stored component code (DB tool displays, applet slots and apps, emit
 * renderers, kind components) is compiled in-page against an allowlisted
 * scope. When the code names something that scope cannot supply, the
 * component still renders with a visible stand-in in that spot
 * (`createUnresolvedImportStandIn`), and the compiler hands the list here
 * with its ORIGIN — `tool:<name>`, `applet:<id>`, `emit:<ref>`, … — so the
 * row in the error queue says which stored component to fix and which import.
 *
 * ONCE PER PAGE SESSION per (origin, identifier, path) — the same key as the
 * store's message signature. Several callers compile in a per-mount `useMemo`
 * (public renderer, template preview, slot renderer, custom shell), so every
 * re-mount re-runs this; without the latch each one bumped the count and the
 * unseen badge for a gap that was already filed. And never synchronously:
 * those compiles run INSIDE render, and `captureError` emits to the store's
 * subscribers, so the capture is deferred to a macrotask. Red tier (default)
 * on purpose: it persists to `public.system_error`, where whoever owns that
 * stored component sees it. Capture never breaks the compile.
 */
import { captureError } from "./errorCaptureStore";
import type { UnresolvedImport } from "@ai-matrx/code-runtime";

/** Keys already filed this page session — see the header. */
const filedThisSession = new Set<string>();

function filingKey(origin: string, entry: UnresolvedImport): string {
  return `${origin}\u0000${entry.identifier}\u0000${entry.importPath ?? ""}`;
}

/** Test seam: forget what this page session already filed. */
export function resetUnresolvedImportCaptures(): void {
  filedThisSession.clear();
}

export function captureUnresolvedImports(
  origin: string,
  unresolved: readonly UnresolvedImport[],
): void {
  const fresh = unresolved.filter((entry) => {
    const key = filingKey(origin, entry);
    if (filedThisSession.has(key)) return false;
    filedThisSession.add(key);
    return true;
  });
  if (fresh.length === 0) return;
  // Deferred: callers compile during render, and captureError notifies the
  // store's subscribers (a setState in another component mid-render).
  setTimeout(() => {
    for (const entry of fresh) {
      try {
        const what =
          entry.identifier === "*"
            ? `allowed import path "${entry.importPath}" is not in the sandbox allowlist`
            : entry.importPath
              ? `"${entry.identifier}" from "${entry.importPath}" could not be resolved`
              : `"${entry.identifier}" is used but never imported or defined`;
        captureError({
          source: "sandbox-unresolved-import",
          relation: origin,
          code: "unresolved_import",
          message: `${origin}: ${what}`,
          details: entry.importPath ?? undefined,
          raw: {
            origin,
            identifier: entry.identifier,
            importPath: entry.importPath,
          },
        });
      } catch {
        // Capture never breaks the caller.
      }
    }
  }, 0);
}
