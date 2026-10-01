/**
 * captureUnresolvedImports — the error-queue half of THE UNRESOLVED-IMPORT
 * RULE (Law 4, 2026-10-01).
 *
 * Stored component code (DB tool displays, agent-app slots and apps, emit
 * renderers, kind components) is compiled in-page against an allowlisted
 * scope. When the code names something that scope cannot supply, the
 * component still renders with a visible stand-in in that spot
 * (`createUnresolvedImportStandIn`), and the compiler hands the list here
 * with its ORIGIN — `tool:<name>`, `agent-app:<id>`, `emit:<ref>`, … — so the
 * row in the error queue says which stored component to fix and which import.
 *
 * One capture per (origin, identifier, path): the store dedupes on message,
 * so a re-compile of the same body counts up instead of adding rows. Red tier
 * (default) on purpose: it persists to `public.system_error`, where whoever
 * owns that stored component sees it. Capture never breaks the compile.
 */
import { captureError } from "./errorCaptureStore";
import type { UnresolvedImport } from "@/features/agent-apps/utils/patch-scope-identifiers";

export function captureUnresolvedImports(
  origin: string,
  unresolved: readonly UnresolvedImport[],
): void {
  for (const entry of unresolved) {
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
        raw: { origin, identifier: entry.identifier, importPath: entry.importPath },
      });
    } catch {
      // Capture never breaks the caller.
    }
  }
}
