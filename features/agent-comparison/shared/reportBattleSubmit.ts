/**
 * The ONE sentence every mode shows after Submit all: how many runs started,
 * how many failed, and — never silently — when the battle could not be saved.
 */

import { toast } from "@/lib/toast";
import type { BattleSubmitResult } from "./battlePersistence";

export function reportBattleSubmit(res: BattleSubmitResult): void {
  // Closing the organization picker means "not now": nothing ran, nothing to say.
  if (res.cancelled) return;
  const held = res.needsFollowUp ?? 0;
  // Every column waits for a typed follow-up and the shared composer says so.
  if (res.followUpInline && held > 0 && res.launched === 0 && res.failed === 0) return;
  const parts: string[] = [];
  if (res.launched > 0) parts.push(`${res.launched} launched`);
  if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
  // Per-column modes have no shared composer line: the toast names the held ones.
  if (held > 0 && !res.followUpInline) parts.push(`${held} need a follow-up`);
  if (res.failed > 0) parts.push(`${res.failed} failed`);
  if (res.failed > 0) {
    toast.error(parts.join(" · "));
  } else {
    toast.success(parts.join(" · ") || "Nothing to run");
  }
  if (res.persistError) {
    toast.warning("The runs started, but this battle could not be saved", {
      description: `${res.persistError} It has no link yet; use Save battle to try again.`,
    });
  }
}
