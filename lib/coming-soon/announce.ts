// lib/coming-soon/announce.ts
//
// The one way to tell a user an advertised action isn't live yet.
//
// Rides the existing global confirm host (single OK button) — no new overlay,
// no new singleton, no new dialog component. `window.alert` is banned; this is
// the sanctioned replacement for the "not built yet" case specifically.

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { getComingSoon } from "./registry";

const STAGE_LINE: Record<string, string> = {
  planned: "On the roadmap — not started yet.",
  building: "Being built right now.",
  blocked: "Built, but not switched on yet.",
};

/**
 * Announce a registered Coming Soon promise.
 *
 * Throws in development when the id is unregistered — a coming-soon that isn't
 * in the registry is an untracked promise, which is exactly what this system
 * exists to prevent.
 */
export async function announceComingSoon(id: string): Promise<void> {
  const entry = getComingSoon(id);

  if (!entry) {
    const message =
      `[coming-soon] "${id}" is not in lib/coming-soon/registry.ts. ` +
      "Every Coming Soon shown to a user must be declared there so it can be " +
      "tracked and reviewed. Add the entry, then call announceComingSoon again.";
    if (process.env.NODE_ENV !== "production") throw new Error(message);
    console.error(message);
    return;
  }

  const stageLine = STAGE_LINE[entry.stage] ?? "";
  const description = [entry.promise, stageLine].filter(Boolean).join("\n\n");

  await confirm({
    title: `${entry.label} — coming soon`,
    description,
    confirmLabel: "Got it",
    cancelLabel: null, // acknowledge-only — nothing to cancel
  });
}
