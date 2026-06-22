// features/war-room/utils/reportWarRoomError.ts
//
// The canonical War Room error funnel. Every recovery / catch in the feature
// routes through here so a failure is ALWAYS loud (console.error) — a recovery
// firing means a real bug got past the proactive layer (repo "loud recovery"
// doctrine) — and the user gets one consistent, friendly toast (or none, for
// silent background work).
//
// Usage:
//   reportWarRoomError("createTileTask", err);                  // default toast
//   reportWarRoomError("attachFileToTile", err, { toast: "…" }); // custom toast
//   reportWarRoomError("loadTileAttachments", err, { toast: false }); // log only

import { toast } from "sonner";

interface ReportWarRoomErrorOptions {
  /**
   * Toast behaviour:
   *   • string    — show this exact message via toast.error
   *   • undefined — show a sensible default derived from `scope`
   *   • false     — show NO toast (still logs loudly)
   */
  toast?: string | false;
}

/** Humanize a camelCase / PascalCase scope into a default toast message. */
function defaultToastForScope(scope: string): string {
  const words = scope
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? `Something went wrong (${words})` : "Something went wrong";
}

/**
 * Report a War Room failure: always logs loudly, and shows a toast unless
 * explicitly suppressed. The single error sink for the feature — never swallow
 * a catch silently; route it here.
 */
export function reportWarRoomError(
  scope: string,
  err: unknown,
  opts?: ReportWarRoomErrorOptions,
): void {
  // Always loud — a fired recovery is a real bug that slipped the proactive layer.
  console.error(`[war-room/${scope}]`, err);

  const message = opts?.toast;
  if (message === false) return;
  toast.error(typeof message === "string" ? message : defaultToastForScope(scope));
}
